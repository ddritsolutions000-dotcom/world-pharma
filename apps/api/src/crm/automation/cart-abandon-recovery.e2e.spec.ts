import { INestApplication } from '@nestjs/common';
import {
  ConversionEventKind,
  CrmAutomationKind,
  OrganizationKind,
  OrganizationStatus,
  OutboxStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../../app/app.module';
import { PrismaService } from '../../app/prisma.service';
import { ProblemFilter } from '../../common/problem.filter';
import { PolicyCache } from '../../policy/cache';
import { emptyPolicyDocument } from '../../policy/empty-pack';
import { AnalyticsIngestService } from '../../analytics/analytics-ingest.service';
import { utcDayStart } from '../../analytics/analytics-query';
import { applyTestIsolation } from '../../test/isolate-runtime';
import { enableCrmPack } from '../../test/enable-crm-pack';
import { CRM_CART_ABANDON_RECOVERY_EVENT } from './cart-abandon-recovery.config';
import { CrmAutomationSchedulerService } from './crm-automation-scheduler.service';
import { CampaignSendSchedulerService } from '../marketing/campaign-send-scheduler.service';

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

function assertNoClinicalPayload(body: unknown) {
  const raw = JSON.stringify(body).toLowerCase();
  for (const token of [
    'diagnosis',
    'lab_result',
    'prescription_version',
    'consult_note',
    'health_timeline',
    'break_glass',
  ]) {
    expect(raw.includes(token)).toBe(false);
  }
}

async function seedStaleCheckoutSession(
  prisma: PrismaService,
  input: {
    suffix: string;
    customerPersonId: string;
    countryId: string;
    expiresAt: Date;
  },
) {
  const vendor = await prisma.organization.create({
    data: {
      id: uuidv7(),
      countryId: input.countryId,
      kind: OrganizationKind.VENDOR,
      legalName: `Cart Abandon Vendor ${input.suffix}`,
      displayName: `Cart Abandon Vendor ${input.suffix}`,
      status: OrganizationStatus.ACTIVE,
    },
  });
  const cartId = uuidv7();
  await prisma.cart.create({
    data: {
      id: cartId,
      customerPersonId: input.customerPersonId,
      countryId: input.countryId,
      sellerOrgId: vendor.id,
      status: 'ACTIVE',
    },
  });
  const sessionId = uuidv7();
  await prisma.checkoutSession.create({
    data: {
      id: sessionId,
      customerPersonId: input.customerPersonId,
      countryId: input.countryId,
      cartId,
      sellerOrgId: vendor.id,
      status: 'EXPIRED',
      idempotencyKey: `cart-abandon-${input.suffix}`,
      expiresAt: input.expiresAt,
    },
  });
  return { sessionId, cartId };
}

describe('R12-B abandoned-cart CRM recovery (e2e)', () => {
  jest.setTimeout(240_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let ingest: AnalyticsIngestService;
  let automationScheduler: CrmAutomationSchedulerService;
  let campaignScheduler: CampaignSendSchedulerService;
  let countryId: string;
  const metricDate = utcDayStart(new Date('2026-08-15T12:00:00.000Z'));
  const dayStart = metricDate;
  const expiresAt = new Date(dayStart.getTime() + 43_200_000);

  beforeAll(async () => {
    applyTestIsolation();
    process.env['NODE_ENV'] = 'test';
    delete process.env['CRM_AUTOMATION_SCHEDULER_ENABLED'];
    delete process.env['CRM_CAMPAIGN_SEND_SCHEDULER_ENABLED'];
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
    ingest = app.get(AnalyticsIngestService);
    automationScheduler = app.get(CrmAutomationSchedulerService);
    campaignScheduler = app.get(CampaignSendSchedulerService);

    const enabledDoc = emptyPolicyDocument();
    enabledDoc.analytics = { enabled: true, retention_days: 30 };
    await prisma.policyPack.updateMany({
      where: { country: { isoAlpha2: 'XX' }, status: 'PUBLISHED' },
      data: { document: enabledDoc as never },
    });
    await app.get(PolicyCache).invalidate('XX');
    await enableCrmPack(prisma, 'XX', app.get(PolicyCache));
    countryId = (await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'XX' } })).id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('records CART_ABANDONED and enqueues CRM recovery outbox on ingest', async () => {
    const suffix = Date.now().toString(36);
    const customer = await signIn(app, `cart-abandon-hook-${suffix}@example.com`);
    await prisma.person.update({
      where: { id: customer.personId },
      data: { primaryCountryId: countryId },
    });
    const { sessionId } = await seedStaleCheckoutSession(prisma, {
      suffix,
      customerPersonId: customer.personId,
      countryId,
      expiresAt,
    });

    await ingest.ingestCountryDay(countryId, metricDate);

    const conversion = await prisma.conversionEvent.findFirst({
      where: {
        countryId,
        eventKind: ConversionEventKind.CART_ABANDONED,
        sourceKey: sessionId,
      },
    });
    expect(conversion).not.toBeNull();

    const outbox = await prisma.outboxEvent.findFirst({
      where: {
        type: CRM_CART_ABANDON_RECOVERY_EVENT,
        aggregateId: sessionId,
      },
    });
    expect(outbox).not.toBeNull();
    expect(outbox?.status).toBe(OutboxStatus.PUBLISHED);
    assertNoClinicalPayload(outbox?.payload);
  });

  it('sends in-app recovery reminder when marketing consent is on', async () => {
    const suffix = Date.now().toString(36);
    const customer = await signIn(app, `cart-abandon-send-${suffix}@example.com`);
    await prisma.person.update({
      where: { id: customer.personId },
      data: { primaryCountryId: countryId },
    });
    await request(app.getHttpServer())
      .patch('/api/v1/me/marketing-preferences?country_code=XX')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ marketing_allowed: true });

    const { sessionId } = await seedStaleCheckoutSession(prisma, {
      suffix,
      customerPersonId: customer.personId,
      countryId,
      expiresAt: new Date(expiresAt.getTime() + 1000),
    });

    await ingest.ingestCountryDay(countryId, metricDate);

    const run = await prisma.crmAutomationRun.findFirst({
      where: {
        personId: customer.personId,
        sourceId: sessionId,
        automationKind: CrmAutomationKind.CART_ABANDON_RECOVERY,
      },
    });
    expect(run?.status).toBe('SENT');

    const inbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(inbox.status).toBe(200);
    const messages = inbox.body.data ?? inbox.body;
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(messages).toLowerCase()).toContain('cart');
    assertNoClinicalPayload(messages);

    const reminderOutbox = await prisma.outboxEvent.findFirst({
      where: {
        type: 'CRM_AUTOMATION_REMINDER',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(reminderOutbox).not.toBeNull();
    expect((reminderOutbox?.payload as Record<string, unknown>)?.source_id).toBe(sessionId);
  });

  it('skips recovery when marketing consent is off', async () => {
    const suffix = Date.now().toString(36);
    const customer = await signIn(app, `cart-abandon-noconsent-${suffix}@example.com`);
    await prisma.person.update({
      where: { id: customer.personId },
      data: { primaryCountryId: countryId },
    });

    const { sessionId } = await seedStaleCheckoutSession(prisma, {
      suffix,
      customerPersonId: customer.personId,
      countryId,
      expiresAt: new Date(expiresAt.getTime() + 2000),
    });

    await ingest.ingestCountryDay(countryId, metricDate);

    const run = await prisma.crmAutomationRun.findFirst({
      where: {
        personId: customer.personId,
        sourceId: sessionId,
        automationKind: CrmAutomationKind.CART_ABANDON_RECOVERY,
      },
    });
    expect(run).toBeNull();

    const inbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set('Authorization', `Bearer ${customer.token}`);
    expect((inbox.body.data ?? inbox.body).length ?? 0).toBe(0);
  });

  it('skips recovery when customer opts out of marketing', async () => {
    const suffix = Date.now().toString(36);
    const customer = await signIn(app, `cart-abandon-sup-${suffix}@example.com`);
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

    const { sessionId } = await seedStaleCheckoutSession(prisma, {
      suffix,
      customerPersonId: customer.personId,
      countryId,
      expiresAt: new Date(expiresAt.getTime() + 3000),
    });

    await ingest.ingestCountryDay(countryId, metricDate);

    const run = await prisma.crmAutomationRun.findFirst({
      where: {
        personId: customer.personId,
        sourceId: sessionId,
        automationKind: CrmAutomationKind.CART_ABANDON_RECOVERY,
      },
    });
    expect(run).toBeNull();
  });

  it('does not recover checkout sessions that already have orders', async () => {
    const suffix = Date.now().toString(36);
    const customer = await signIn(app, `cart-abandon-paid-${suffix}@example.com`);
    await prisma.person.update({
      where: { id: customer.personId },
      data: { primaryCountryId: countryId },
    });
    await request(app.getHttpServer())
      .patch('/api/v1/me/marketing-preferences?country_code=XX')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ marketing_allowed: true });

    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.VENDOR,
        legalName: `Paid Vendor ${suffix}`,
        displayName: `Paid Vendor ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId,
        kind: 'VENDOR_WAREHOUSE',
        name: 'Paid WH',
        timezone: 'UTC',
      },
    });
    const cartId = uuidv7();
    await prisma.cart.create({
      data: {
        id: cartId,
        customerPersonId: customer.personId,
        countryId,
        sellerOrgId: vendor.id,
      },
    });
    const sessionId = uuidv7();
    await prisma.checkoutSession.create({
      data: {
        id: sessionId,
        customerPersonId: customer.personId,
        countryId,
        cartId,
        sellerOrgId: vendor.id,
        status: 'PAID',
        idempotencyKey: `cart-paid-${suffix}`,
        expiresAt,
      },
    });
    const quote = await prisma.checkoutQuote.create({
      data: {
        id: uuidv7(),
        sessionId,
        fingerprint: 'paid',
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
        checkoutSessionId: sessionId,
        checkoutQuoteId: quote.id,
        customerPersonId: customer.personId,
        countryId,
        method: 'CARD',
        status: 'CAPTURED',
        amountMinor: 100n,
        capturedMinor: 100n,
        currency: 'XXX',
        idempotencyKey: `cart-paid-pay-${suffix}`,
      },
    });
    await prisma.order.create({
      data: {
        id: uuidv7(),
        orderNumber: `PAID-${suffix}`,
        customerPersonId: customer.personId,
        sellerOrgId: vendor.id,
        countryId,
        checkoutSessionId: sessionId,
        checkoutQuoteId: quote.id,
        paymentIntentId: paymentIntent.id,
        fulfillingLocationId: location.id,
        status: 'CONFIRMED',
        currency: 'XXX',
        goodsMinor: 100n,
        totalMinor: 100n,
      },
    });

    await ingest.ingestCountryDay(countryId, metricDate);

    const conversion = await prisma.conversionEvent.findFirst({
      where: { sourceKey: sessionId, eventKind: ConversionEventKind.CART_ABANDONED },
    });
    expect(conversion).toBeNull();

    const run = await prisma.crmAutomationRun.findFirst({
      where: { sourceId: sessionId, automationKind: CrmAutomationKind.CART_ABANDON_RECOVERY },
    });
    expect(run).toBeNull();
  });

  it('skips recovery when marketing consent is for a different country', async () => {
    const suffix = Date.now().toString(36);
    let other = await prisma.country.findUnique({ where: { isoAlpha2: 'YY' } });
    if (!other) {
      other = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'YY',
          isoAlpha3: 'YYY',
          nameI18n: { en: 'Other country' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
          dataResidencyMode: 'shared',
        },
      });
    }
    const customer = await signIn(app, `cart-abandon-wrong-${suffix}@example.com`);
    await prisma.person.update({
      where: { id: customer.personId },
      data: { primaryCountryId: countryId },
    });
    await request(app.getHttpServer())
      .patch('/api/v1/me/marketing-preferences?country_code=YY')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ marketing_allowed: true });

    const { sessionId } = await seedStaleCheckoutSession(prisma, {
      suffix,
      customerPersonId: customer.personId,
      countryId,
      expiresAt: new Date(expiresAt.getTime() + 5000),
    });

    await ingest.ingestCountryDay(countryId, metricDate);

    const run = await prisma.crmAutomationRun.findFirst({
      where: {
        personId: customer.personId,
        sourceId: sessionId,
        automationKind: CrmAutomationKind.CART_ABANDON_RECOVERY,
      },
    });
    expect(run).toBeNull();
  });

  it('replayed ingest does not duplicate recovery reminders', async () => {
    const suffix = Date.now().toString(36);
    const customer = await signIn(app, `cart-abandon-idem-${suffix}@example.com`);
    await prisma.person.update({
      where: { id: customer.personId },
      data: { primaryCountryId: countryId },
    });
    await request(app.getHttpServer())
      .patch('/api/v1/me/marketing-preferences?country_code=XX')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ marketing_allowed: true });

    const { sessionId } = await seedStaleCheckoutSession(prisma, {
      suffix,
      customerPersonId: customer.personId,
      countryId,
      expiresAt: new Date(expiresAt.getTime() + 4000),
    });

    await ingest.ingestCountryDay(countryId, metricDate);
    await ingest.ingestCountryDay(countryId, metricDate);

    const runs = await prisma.crmAutomationRun.findMany({
      where: {
        personId: customer.personId,
        sourceId: sessionId,
        automationKind: CrmAutomationKind.CART_ABANDON_RECOVERY,
      },
    });
    expect(runs.length).toBe(1);

    const inbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set('Authorization', `Bearer ${customer.token}`);
    const cartMessages = (inbox.body.data ?? inbox.body).filter(
      (row: { reference_id?: string }) => row.reference_id === sessionId,
    );
    expect(cartMessages.length).toBe(1);
  });

  it('existing CRM automation and campaign schedulers remain healthy', async () => {
    const automationTick = await automationScheduler.tickOnce();
    expect(['completed', 'skipped']).toContain(automationTick.status);

    const campaignTick = await campaignScheduler.tickOnce();
    expect(['completed', 'skipped']).toContain(campaignTick.status);
  });
});
