import { INestApplication } from '@nestjs/common';
import {
  LocationKind,
  OrderStatus,
  OrganizationKind,
  OrganizationStatus,
  PaymentIntentStatus,
  RefillRequestStatus,
  RxSubscriptionStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../../app/app.module';
import { PrismaService } from '../../app/prisma.service';
import { ProblemFilter } from '../../common/problem.filter';
import { applyTestIsolation } from '../../test/isolate-runtime';
import { enableCrmPack } from '../../test/enable-crm-pack';
import { PolicyCache } from '../../policy/cache';
import { assertMarketingCopySafe } from './automation-copy';
import { AutomationRunService } from './automation-run.service';

async function signIn(
  app: INestApplication,
  email: string,
  audience: 'admin' | 'customer' = 'customer',
) {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

async function grantRole(prisma: PrismaService, personId: string, roleCode: string) {
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
  await prisma.membership.create({
    data: {
      id: uuidv7(),
      personId,
      roleId: role.id,
      scope: 'platform',
      status: 'ACTIVE',
    },
  });
}

function assertNoClinicalPayload(body: unknown) {
  const raw = JSON.stringify(body).toLowerCase();
  const forbidden = [
    'diagnosis',
    'dosage',
    'prescription_version',
    'eligibility_snapshot',
    'consult_note',
    'lab_result',
    'break_glass',
  ];
  for (const token of forbidden) {
    expect(raw.includes(token)).toBe(false);
  }
}

async function seedPaidOrder(
  prisma: PrismaService,
  input: {
    suffix: string;
    customerPersonId: string;
    countryId: string;
    createdAt: Date;
    productTitle?: string;
  },
) {
  const vendor = await prisma.organization.create({
    data: {
      id: uuidv7(),
      countryId: input.countryId,
      kind: OrganizationKind.VENDOR,
      legalName: `R12G Vendor ${input.suffix}`,
      displayName: `R12G Vendor ${input.suffix}`,
      status: OrganizationStatus.ACTIVE,
    },
  });
  const location = await prisma.location.create({
    data: {
      id: uuidv7(),
      organizationId: vendor.id,
      countryId: input.countryId,
      kind: LocationKind.VENDOR_WAREHOUSE,
      name: 'R12G WH',
      timezone: 'UTC',
    },
  });
  const cart = await prisma.cart.create({
    data: {
      id: uuidv7(),
      customerPersonId: input.customerPersonId,
      countryId: input.countryId,
      sellerOrgId: vendor.id,
    },
  });
  const checkout = await prisma.checkoutSession.create({
    data: {
      id: uuidv7(),
      customerPersonId: input.customerPersonId,
      countryId: input.countryId,
      cartId: cart.id,
      sellerOrgId: vendor.id,
      status: 'READY_FOR_PAYMENT',
      idempotencyKey: `r12g-co-${input.suffix}-${input.customerPersonId}`,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const quote = await prisma.checkoutQuote.create({
    data: {
      id: uuidv7(),
      sessionId: checkout.id,
      fingerprint: 'r12g',
      currency: 'XXX',
      sellMinor: 100n,
      totalMinor: 100n,
      payload: {},
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const paymentIntent = await prisma.paymentIntent.create({
    data: {
      id: uuidv7(),
      checkoutSessionId: checkout.id,
      checkoutQuoteId: quote.id,
      customerPersonId: input.customerPersonId,
      countryId: input.countryId,
      method: 'CARD',
      status: PaymentIntentStatus.CAPTURED,
      amountMinor: 100n,
      capturedMinor: 100n,
      currency: 'XXX',
      idempotencyKey: `r12g-pay-${input.suffix}-${input.customerPersonId}`,
    },
  });
  const orderId = uuidv7();
  await prisma.order.create({
    data: {
      id: orderId,
      orderNumber: `R12G-${orderId.slice(0, 12)}`,
      customerPersonId: input.customerPersonId,
      sellerOrgId: vendor.id,
      countryId: input.countryId,
      checkoutSessionId: checkout.id,
      checkoutQuoteId: quote.id,
      paymentIntentId: paymentIntent.id,
      fulfillingLocationId: location.id,
      status: OrderStatus.CONFIRMED,
      currency: 'XXX',
      goodsMinor: 100n,
      totalMinor: 100n,
      createdAt: input.createdAt,
      items: {
        create: {
          id: uuidv7(),
          offerId: uuidv7(),
          variantId: uuidv7(),
          sku: `R12G-SKU-${input.suffix}`,
          title: input.productTitle ?? 'Daily Wellness Pack',
          qty: 1,
          unitMinor: 100n,
          lineMinor: 100n,
          currency: 'XXX',
        },
      },
    },
  });
  return orderId;
}

describe('R12-G refill/reorder marketing hooks (e2e)', () => {
  jest.setTimeout(180_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let countryId: string;

  beforeAll(async () => {
    applyTestIsolation();
    process.env['NODE_ENV'] = 'test';
    process.env['AUTH_DEV_REVEAL_OTP'] = 'true';
    process.env['JWT_ACCESS_SECRET'] =
      process.env['JWT_ACCESS_SECRET'] ?? 'test-access-secret-must-be-32-chars-min';
    process.env['OTP_PEPPER'] =
      process.env['OTP_PEPPER'] ?? 'test-otp-pepper-must-be-32-chars-minx';
    if (!process.env['REDIS_URL']) {
      throw new Error('REDIS_URL is required');
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ProblemFilter());
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    prisma = app.get(PrismaService);
    const country = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'XX' } });
    countryId = country.id;
    await enableCrmPack(prisma, 'XX', app.get(PolicyCache));
  });

  afterAll(async () => {
    await app.close();
  });

  it('unauthenticated automation admin returns 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/admin/crm/automation-runs?country_code=XX');
    expect(res.status).toBe(401);
  });

  it('unauthorized admin without crm:write cannot evaluate', async () => {
    const suffix = Date.now().toString(36);
    const support = await signIn(app, `r12g-support-${suffix}@example.com`, 'admin');
    await grantRole(prisma, support.personId, 'company_support');
    const agent = await signIn(app, `r12g-support-${suffix}@example.com`, 'admin');
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/crm/automation/evaluate')
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ country_code: 'XX' });
    expect(res.status).toBe(403);
  });

  it('rejects clinical marketing copy', () => {
    expect(() => assertMarketingCopySafe('Hello', 'Your diagnosis is ready')).toThrow();
  });

  it('consent off skips reminder; consent on sends; duplicate evaluate is idempotent', async () => {
    const suffix = Date.now().toString(36);
    const customer = await signIn(app, `r12g-cust-${suffix}@example.com`);
    await prisma.person.update({
      where: { id: customer.personId },
      data: { primaryCountryId: countryId },
    });

    const agentEmail = `r12g-agent-${suffix}@example.com`;
    const seeded = await signIn(app, agentEmail);
    await grantRole(prisma, seeded.personId, 'company_operations');
    const agent = await signIn(app, agentEmail, 'admin');

    const oldDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const orderId = await seedPaidOrder(prisma, {
      suffix,
      customerPersonId: customer.personId,
      countryId,
      createdAt: oldDate,
    });

    const evaluateOff = await request(app.getHttpServer())
      .post('/api/v1/admin/crm/automation/evaluate')
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ country_code: 'XX' });
    expect(evaluateOff.status).toBe(201);
    expect(evaluateOff.body.skipped_count).toBeGreaterThanOrEqual(1);

    const inboxOff = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(inboxOff.status).toBe(200);
    const inboxCountOff = (inboxOff.body.data ?? inboxOff.body).length ?? 0;
    expect(inboxCountOff).toBe(0);

    const runsOff = await request(app.getHttpServer())
      .get(`/api/v1/admin/crm/automation-runs?country_code=XX&person_id=${customer.personId}`)
      .set('Authorization', `Bearer ${agent.token}`);
    expect(runsOff.status).toBe(200);
    expect(runsOff.body.data.some((row: { source_id: string }) => row.source_id === orderId)).toBe(false);

    await request(app.getHttpServer())
      .patch('/api/v1/me/marketing-preferences?country_code=XX')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ marketing_allowed: true });

    const evaluateOn = await request(app.getHttpServer())
      .post('/api/v1/admin/crm/automation/evaluate')
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ country_code: 'XX' });
    expect(evaluateOn.status).toBe(201);
    expect(evaluateOn.body.sent_count).toBeGreaterThanOrEqual(1);

    const inboxOn = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(inboxOn.status).toBe(200);
    const messages = inboxOn.body.data ?? inboxOn.body;
    expect(messages.length).toBeGreaterThanOrEqual(1);
    assertNoClinicalPayload(messages);
    expect(JSON.stringify(messages).toLowerCase()).toContain('daily wellness pack');

    const outbox = await prisma.outboxEvent.findFirst({
      where: { type: 'CRM_AUTOMATION_REMINDER' },
      orderBy: { createdAt: 'desc' },
    });
    expect(outbox).toBeTruthy();
    assertNoClinicalPayload(outbox?.payload);

    const evaluateDup = await request(app.getHttpServer())
      .post('/api/v1/admin/crm/automation/evaluate')
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ country_code: 'XX' });
    expect(evaluateDup.status).toBe(201);
    const runRows = await prisma.crmAutomationRun.findMany({
      where: { personId: customer.personId, sourceId: orderId },
    });
    expect(runRows.length).toBe(1);
  });

  it('suppression blocks marketing reminder', async () => {
    const suffix = Date.now().toString(36);
    const customer = await signIn(app, `r12g-sup-${suffix}@example.com`);
    await prisma.person.update({
      where: { id: customer.personId },
      data: { primaryCountryId: countryId },
    });
    await request(app.getHttpServer())
      .patch('/api/v1/me/marketing-preferences?country_code=XX')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ marketing_allowed: true });
    await request(app.getHttpServer())
      .patch('/api/v1/me/marketing-preferences?country_code=XX')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ marketing_allowed: false });

    const agentEmail = `r12g-sup-agent-${suffix}@example.com`;
    const seeded = await signIn(app, agentEmail);
    await grantRole(prisma, seeded.personId, 'company_operations');
    const agent = await signIn(app, agentEmail, 'admin');

    await seedPaidOrder(prisma, {
      suffix: `sup-${suffix}`,
      customerPersonId: customer.personId,
      countryId,
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    });

    const evaluate = await request(app.getHttpServer())
      .post('/api/v1/admin/crm/automation/evaluate')
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ country_code: 'XX' });
    expect(evaluate.status).toBe(201);

    const runs = await request(app.getHttpServer())
      .get(`/api/v1/admin/crm/automation-runs?country_code=XX&person_id=${customer.personId}`)
      .set('Authorization', `Bearer ${agent.token}`);
    expect(runs.status).toBe(200);
    expect(runs.body.data.length).toBe(0);

    const inbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(inbox.status).toBe(200);
    expect((inbox.body.data ?? inbox.body).length ?? 0).toBe(0);
  });

  it('wrong country evaluate skips foreign orders safely', async () => {
    const suffix = Date.now().toString(36);
    let other = await prisma.country.findUnique({ where: { isoAlpha2: 'YY' } });
    if (!other) {
      other = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'YY',
          isoAlpha3: 'YYY',
          nameI18n: { en: 'Other' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
          dataResidencyMode: 'shared',
        },
      });
    }
    const customer = await signIn(app, `r12g-wrong-${suffix}@example.com`);
    await prisma.person.update({
      where: { id: customer.personId },
      data: { primaryCountryId: countryId },
    });
    await request(app.getHttpServer())
      .patch('/api/v1/me/marketing-preferences?country_code=XX')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ marketing_allowed: true });

    await seedPaidOrder(prisma, {
      suffix: `xx-${suffix}`,
      customerPersonId: customer.personId,
      countryId,
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    });

    const agentEmail = `r12g-wrong-agent-${suffix}@example.com`;
    const seeded = await signIn(app, agentEmail);
    await grantRole(prisma, seeded.personId, 'company_operations');
    const agent = await signIn(app, agentEmail, 'admin');

    const evaluateYy = await request(app.getHttpServer())
      .post('/api/v1/admin/crm/automation/evaluate')
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ country_code: 'YY' });
    expect([403, 201]).toContain(evaluateYy.status);
    if (evaluateYy.status === 201) {
      expect(evaluateYy.body.sent_count).toBe(0);
    }

    const runs = await prisma.crmAutomationRun.findMany({
      where: { personId: customer.personId },
    });
    expect(runs.length).toBe(0);
  });

  it('too-recent order is not eligible; refill metadata unchanged; refill API stable', async () => {
    const suffix = Date.now().toString(36);
    const customer = await signIn(app, `r12g-refill-${suffix}@example.com`);
    await prisma.person.update({
      where: { id: customer.personId },
      data: { primaryCountryId: countryId },
    });
    await request(app.getHttpServer())
      .patch('/api/v1/me/marketing-preferences?country_code=XX')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ marketing_allowed: true });

    await seedPaidOrder(prisma, {
      suffix: `recent-${suffix}`,
      customerPersonId: customer.personId,
      countryId,
      createdAt: new Date(),
    });

    const refillId = uuidv7();
    const prescriptionId = uuidv7();
    await prisma.refillRequest.create({
      data: {
        id: refillId,
        prescriptionId,
        prescriptionVersionId: uuidv7(),
        customerPersonId: customer.personId,
        countryId,
        status: RefillRequestStatus.REQUESTED,
        idempotencyKey: `r12g-refill-${suffix}`,
      },
    });
    await prisma.rxSubscription.create({
      data: {
        id: uuidv7(),
        prescriptionId: uuidv7(),
        customerPersonId: customer.personId,
        countryId,
        status: RxSubscriptionStatus.ACTIVE,
        autoExecuteEnabled: false,
      },
    });

    const beforeRefill = await request(app.getHttpServer())
      .get('/api/v1/customer/refill-requests')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(beforeRefill.status).toBe(200);

    const agentEmail = `r12g-refill-agent-${suffix}@example.com`;
    const seeded = await signIn(app, agentEmail);
    await grantRole(prisma, seeded.personId, 'company_operations');
    const agent = await signIn(app, agentEmail, 'admin');

    const evaluate = await request(app.getHttpServer())
      .post('/api/v1/admin/crm/automation/evaluate')
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ country_code: 'XX' });
    expect(evaluate.status).toBe(201);

    const afterRefill = await request(app.getHttpServer())
      .get('/api/v1/customer/refill-requests')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(afterRefill.status).toBe(200);
    expect(afterRefill.body).toEqual(beforeRefill.body);

    const refillRow = await prisma.refillRequest.findUniqueOrThrow({ where: { id: refillId } });
    expect(refillRow.status).toBe(RefillRequestStatus.REQUESTED);
    expect(refillRow.prescriptionId).toBe(prescriptionId);

    const orderCount = await prisma.order.count({
      where: { customerPersonId: customer.personId, countryId },
    });
    expect(orderCount).toBe(1);

    const runs = await prisma.crmAutomationRun.findMany({
      where: { personId: customer.personId, automationKind: 'REORDER_REMINDER' },
    });
    expect(runs.length).toBe(0);
  });

  it('360 includes refill and subscription metadata slices without clinical fields', async () => {
    const suffix = Date.now().toString(36);
    const customer = await signIn(app, `r12g-360-${suffix}@example.com`);
    await prisma.person.update({
      where: { id: customer.personId },
      data: { primaryCountryId: countryId },
    });
    await seedPaidOrder(prisma, {
      suffix: `360-${suffix}`,
      customerPersonId: customer.personId,
      countryId,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    });
    await prisma.refillRequest.create({
      data: {
        id: uuidv7(),
        prescriptionId: uuidv7(),
        prescriptionVersionId: uuidv7(),
        customerPersonId: customer.personId,
        countryId,
        status: RefillRequestStatus.REQUESTED,
        idempotencyKey: `r12g-360-refill-${suffix}`,
      },
    });
    await prisma.rxSubscription.create({
      data: {
        id: uuidv7(),
        prescriptionId: uuidv7(),
        customerPersonId: customer.personId,
        countryId,
        status: RxSubscriptionStatus.ACTIVE,
        autoExecuteEnabled: false,
      },
    });

    const agentEmail = `r12g-360-agent-${suffix}@example.com`;
    const seeded = await signIn(app, agentEmail);
    await grantRole(prisma, seeded.personId, 'company_support');
    const agent = await signIn(app, agentEmail, 'admin');

    const view = await request(app.getHttpServer())
      .get(`/api/v1/admin/crm/customers/${customer.personId}?country_code=XX`)
      .set('Authorization', `Bearer ${agent.token}`);
    expect(view.status).toBe(200);
    expect(view.body.refill_requests?.length).toBeGreaterThanOrEqual(1);
    expect(view.body.rx_subscriptions?.length).toBeGreaterThanOrEqual(1);
    assertNoClinicalPayload(view.body);
  });

  it('cross-customer automation run listing is isolated by person filter', async () => {
    const suffix = Date.now().toString(36);
    const customerA = await signIn(app, `r12g-iso-a-${suffix}@example.com`);
    const customerB = await signIn(app, `r12g-iso-b-${suffix}@example.com`);
    await prisma.person.updateMany({
      where: { id: { in: [customerA.personId, customerB.personId] } },
      data: { primaryCountryId: countryId },
    });
    for (const customer of [customerA, customerB]) {
      await request(app.getHttpServer())
        .patch('/api/v1/me/marketing-preferences?country_code=XX')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ marketing_allowed: true });
      await seedPaidOrder(prisma, {
        suffix: `${customer.personId.slice(0, 8)}-${suffix}`,
        customerPersonId: customer.personId,
        countryId,
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      });
    }

    const agentEmail = `r12g-iso-agent-${suffix}@example.com`;
    const seeded = await signIn(app, agentEmail);
    await grantRole(prisma, seeded.personId, 'company_operations');
    const agent = await signIn(app, agentEmail, 'admin');

    await request(app.getHttpServer())
      .post('/api/v1/admin/crm/automation/evaluate')
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ country_code: 'XX' });

    const runsA = await request(app.getHttpServer())
      .get(`/api/v1/admin/crm/automation-runs?country_code=XX&person_id=${customerA.personId}`)
      .set('Authorization', `Bearer ${agent.token}`);
    expect(runsA.status).toBe(200);
    expect(runsA.body.data.every((row: { person_id: string }) => row.person_id === customerA.personId)).toBe(
      true,
    );
    expect(runsA.body.data.some((row: { person_id: string }) => row.person_id === customerB.personId)).toBe(
      false,
    );
  });

  it('direct clinical copy attempt via automation service returns 400', async () => {
    const automation = app.get(AutomationRunService);
    const country = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'XX' } });
    await expect(
      automation.attemptRun({
        automationKind: 'REORDER_REMINDER',
        sourceId: uuidv7(),
        personId: uuidv7(),
        countryId: country.id,
        countryCode: 'XX',
        title: 'Bad',
        body: 'Your diagnosis needs attention',
        referenceType: 'reorder_reminder',
      }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });
});
