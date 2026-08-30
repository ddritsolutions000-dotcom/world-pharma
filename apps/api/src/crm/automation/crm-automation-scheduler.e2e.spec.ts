import { INestApplication } from '@nestjs/common';
import {
  LocationKind,
  OrderStatus,
  OrganizationKind,
  OrganizationStatus,
  OutboxStatus,
  PaymentIntentStatus,
  PolicyPackStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../../app/app.module';
import { PrismaService } from '../../app/prisma.service';
import { ProblemFilter } from '../../common/problem.filter';
import { PolicyCache } from '../../policy/cache';
import { emptyPolicyDocument } from '../../policy/empty-pack';
import { applyTestIsolation } from '../../test/isolate-runtime';
import { nextPolicyPackVersion } from '../../test/next-policy-pack-version';
import {
  CRM_AUTOMATION_DAILY_EVALUATE_EVENT,
  automationEvaluateOccurrenceKey,
  isCrmAutomationSchedulerEnabled,
  utcDayStart,
} from './crm-automation-scheduler.config';
import { CrmAutomationSchedulerService } from './crm-automation-scheduler.service';

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

async function seedPaidOrder(
  prisma: PrismaService,
  input: {
    suffix: string;
    customerPersonId: string;
    countryId: string;
    createdAt: Date;
  },
) {
  const vendor = await prisma.organization.create({
    data: {
      id: uuidv7(),
      countryId: input.countryId,
      kind: OrganizationKind.VENDOR,
      legalName: `CRM Sched Vendor ${input.suffix}`,
      displayName: `CRM Sched Vendor ${input.suffix}`,
      status: OrganizationStatus.ACTIVE,
    },
  });
  const location = await prisma.location.create({
    data: {
      id: uuidv7(),
      organizationId: vendor.id,
      countryId: input.countryId,
      kind: LocationKind.VENDOR_WAREHOUSE,
      name: 'CRM Sched WH',
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
      idempotencyKey: `crm-sched-co-${input.suffix}`,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const quote = await prisma.checkoutQuote.create({
    data: {
      id: uuidv7(),
      sessionId: checkout.id,
      fingerprint: 'crm-sched',
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
      idempotencyKey: `crm-sched-pay-${input.suffix}`,
    },
  });
  const orderId = uuidv7();
  await prisma.order.create({
    data: {
      id: orderId,
      orderNumber: `CRM-SCHED-${orderId.slice(0, 12)}`,
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
          sku: `CRM-SCHED-SKU-${input.suffix}`,
          title: 'Daily Wellness Pack',
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

function crmEnabledDocument(reorderDays = 1) {
  const doc = emptyPolicyDocument();
  doc.crm = {
    enabled: true,
    marketing: { enabled: true, channels: ['in_app'], medicine_advertising: false },
    automation: { enabled: true, reorder_reminder_days: reorderDays },
  };
  return doc;
}

async function publishCountryPack(
  prisma: PrismaService,
  policyCache: PolicyCache,
  isoAlpha2: string,
  isoAlpha3: string,
  document: ReturnType<typeof emptyPolicyDocument>,
) {
  let country = await prisma.country.findUnique({ where: { isoAlpha2 } });
  if (!country) {
    country = await prisma.country.create({
      data: {
        id: uuidv7(),
        isoAlpha2,
        isoAlpha3,
        nameI18n: { en: `CRM scheduler ${isoAlpha2}` },
        status: 'ACTIVE',
        defaultLocale: 'en',
        defaultCurrency: 'XXX',
        defaultTimezone: 'UTC',
        dataResidencyMode: 'shared',
      },
    });
  }
  await prisma.policyPack.create({
    data: {
      id: uuidv7(),
      countryId: country.id,
      version: await nextPolicyPackVersion(prisma, country.id),
      status: PolicyPackStatus.PUBLISHED,
      document: document as never,
      checksum: `crm-sched-${isoAlpha2}-${Date.now()}`,
      publishedAt: new Date(),
    },
  });
  const pack = await prisma.policyPack.findFirst({
    where: { countryId: country.id, status: PolicyPackStatus.PUBLISHED },
    orderBy: { publishedAt: 'desc' },
  });
  if (pack) {
    await prisma.country.update({
      where: { id: country.id },
      data: { publishedPolicyPackId: pack.id },
    });
  }
  await policyCache.invalidate(isoAlpha2);
  return country;
}

describe('R12-G CRM automation scheduler (e2e)', () => {
  jest.setTimeout(180_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let scheduler: CrmAutomationSchedulerService;
  let countryEnabledId: string;
  let countryDisabledId: string;

  beforeAll(async () => {
    applyTestIsolation();
    process.env['NODE_ENV'] = 'test';
    delete process.env['CRM_AUTOMATION_SCHEDULER_ENABLED'];
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
    scheduler = app.get(CrmAutomationSchedulerService);
    const policyCache = app.get(PolicyCache);

    const enabled = await publishCountryPack(prisma, policyCache, 'C1', 'C11', crmEnabledDocument(1));
    countryEnabledId = enabled.id;

    const disabledDoc = emptyPolicyDocument();
    disabledDoc.crm = {
      enabled: true,
      marketing: { enabled: true, channels: ['in_app'], medicine_advertising: false },
      automation: { enabled: false, reorder_reminder_days: 30 },
    };
    const disabled = await publishCountryPack(prisma, policyCache, 'C2', 'C22', disabledDoc);
    countryDisabledId = disabled.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  const suiteSalt = Math.floor(Date.now() / 1000) % 12;

  function runDateForTest(index: number) {
    return utcDayStart(new Date(Date.UTC(2098, suiteSalt, index + 1, 12, 0, 0)));
  }

  it('is fail-closed by default (scheduler env flag off)', () => {
    expect(isCrmAutomationSchedulerEnabled()).toBe(false);
  });

  it('runs daily CRM evaluation via outbox without manual admin POST', async () => {
    const suffix = Date.now().toString(36);
    const runDate = runDateForTest(1);
    const runDateKey = runDate.toISOString().slice(0, 10);
    const customer = await signIn(app, `crm-sched-cust-${suffix}@example.com`);
    await prisma.person.update({
      where: { id: customer.personId },
      data: { primaryCountryId: countryEnabledId },
    });
    await request(app.getHttpServer())
      .patch('/api/v1/me/marketing-preferences?country_code=C1')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ marketing_allowed: true });

    const orderId = await seedPaidOrder(prisma, {
      suffix,
      customerPersonId: customer.personId,
      countryId: countryEnabledId,
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    });

    const outcome = await scheduler.tickOnce(runDate);
    expect(outcome.status).toBe('completed');
    expect(outcome.run_date).toBe(runDateKey);
    expect(outcome.countries_processed).toBeGreaterThanOrEqual(1);

    const runs = await prisma.crmAutomationRun.findMany({
      where: { countryId: countryEnabledId, personId: customer.personId, sourceId: orderId },
    });
    expect(runs.length).toBe(1);

    const inbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(inbox.status).toBe(200);
    const messages = inbox.body.data ?? inbox.body;
    expect(messages.some((row: { title: string }) => row.title.toLowerCase().includes('reorder'))).toBe(true);

    const outbox = await prisma.outboxEvent.findFirst({
      where: {
        type: CRM_AUTOMATION_DAILY_EVALUATE_EVENT,
        occurrenceKey: automationEvaluateOccurrenceKey(runDateKey),
      },
    });
    expect(outbox?.status).toBe(OutboxStatus.PUBLISHED);
    expect(JSON.stringify(outbox?.payload)).not.toMatch(/diagnosis|prescription|lab_result/i);
  });

  it('skips countries with CRM automation disabled in policy', async () => {
    const suffix = Date.now().toString(36);
    const runDate = runDateForTest(2);
    const customer = await signIn(app, `crm-sched-disabled-${suffix}@example.com`);
    await prisma.person.update({
      where: { id: customer.personId },
      data: { primaryCountryId: countryDisabledId },
    });
    await request(app.getHttpServer())
      .patch('/api/v1/me/marketing-preferences?country_code=C2')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ marketing_allowed: true });

    await seedPaidOrder(prisma, {
      suffix,
      customerPersonId: customer.personId,
      countryId: countryDisabledId,
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    });

    await scheduler.tickOnce(runDate);

    const runs = await prisma.crmAutomationRun.findMany({
      where: { countryId: countryDisabledId, personId: customer.personId },
    });
    expect(runs.length).toBe(0);
  });

  it('skips duplicate scheduler ticks for the same run date (idempotent replay)', async () => {
    const runDate = runDateForTest(3);
    const completed = await scheduler.tickOnce(runDate);
    expect(completed.status).toBe('completed');

    const skipped = await scheduler.tickOnce(runDate);
    expect(skipped.status).toBe('skipped');
    expect(skipped.reason).toBe('already_completed');
  });

  it('does not duplicate automation runs when scheduler day is replayed after first send', async () => {
    const suffix = Date.now().toString(36);
    const runDate = runDateForTest(4);
    const customer = await signIn(app, `crm-sched-dup-${suffix}@example.com`);
    await prisma.person.update({
      where: { id: customer.personId },
      data: { primaryCountryId: countryEnabledId },
    });
    await request(app.getHttpServer())
      .patch('/api/v1/me/marketing-preferences?country_code=C1')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ marketing_allowed: true });

    const orderId = await seedPaidOrder(prisma, {
      suffix,
      customerPersonId: customer.personId,
      countryId: countryEnabledId,
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    });

    await scheduler.tickOnce(runDate);
    const firstRuns = await prisma.crmAutomationRun.count({
      where: { countryId: countryEnabledId, personId: customer.personId, sourceId: orderId },
    });
    expect(firstRuns).toBe(1);

    const agentEmail = `crm-sched-manual-${suffix}@example.com`;
    const agentSeed = await signIn(app, agentEmail);
    await grantRole(prisma, agentSeed.personId, 'company_operations');
    const agent = await signIn(app, agentEmail, 'admin');
    const manual = await request(app.getHttpServer())
      .post('/api/v1/admin/crm/automation/evaluate')
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ country_code: 'C1' });
    expect(manual.status).toBe(201);

    const afterManual = await prisma.crmAutomationRun.count({
      where: { countryId: countryEnabledId, personId: customer.personId, sourceId: orderId },
    });
    expect(afterManual).toBe(1);
  });

  it('manual admin evaluation still works alongside scheduler kernel', async () => {
    const suffix = Date.now().toString(36);
    const customer = await signIn(app, `crm-sched-admin-${suffix}@example.com`);
    await prisma.person.update({
      where: { id: customer.personId },
      data: { primaryCountryId: countryEnabledId },
    });
    await request(app.getHttpServer())
      .patch('/api/v1/me/marketing-preferences?country_code=C1')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ marketing_allowed: true });

    await seedPaidOrder(prisma, {
      suffix,
      customerPersonId: customer.personId,
      countryId: countryEnabledId,
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    });

    const agentEmail = `crm-sched-agent-${suffix}@example.com`;
    const agentSeed = await signIn(app, agentEmail);
    await grantRole(prisma, agentSeed.personId, 'company_operations');
    const agent = await signIn(app, agentEmail, 'admin');

    const evaluate = await request(app.getHttpServer())
      .post('/api/v1/admin/crm/automation/evaluate')
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ country_code: 'C1' });
    expect(evaluate.status).toBe(201);
    expect(evaluate.body.sent_count).toBeGreaterThanOrEqual(1);
  });
});
