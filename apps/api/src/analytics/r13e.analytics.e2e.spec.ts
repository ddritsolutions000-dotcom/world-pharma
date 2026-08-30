import { INestApplication } from '@nestjs/common';
import {
  ConversionEventKind,
  PersonalizationEventKind,
  PolicyPackStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { PolicyCache } from '../policy/cache';
import { ProblemFilter } from '../common/problem.filter';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { applyTestIsolation } from '../test/isolate-runtime';
import { AnalyticsIngestService } from './analytics-ingest.service';
import { AnalyticsPurgeService } from './analytics-purge.service';
import { utcDayStart } from './analytics-query';

async function signIn(app: INestApplication, email: string, audience: 'admin' | 'customer' = 'customer') {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

async function grantPlatformRole(prisma: PrismaService, personId: string, roleCode: string) {
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  await prisma.membership.create({
    data: {
      id: uuidv7(),
      personId,
      roleId: role!.id,
      scope: 'platform',
      status: 'ACTIVE',
    },
  });
}

function assertNoSensitivePayload(body: unknown) {
  const raw = JSON.stringify(body).toLowerCase();
  for (const token of [
    'diagnosis',
    'lab_result',
    'prescription_version',
    'consult_note',
    'health_timeline',
    'break_glass',
    'symptom',
    'patients like you',
  ]) {
    expect(raw.includes(token)).toBe(false);
  }
}

describe('R13-E analytics foundation (e2e)', () => {
  jest.setTimeout(240_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let ingest: AnalyticsIngestService;
  let purge: AnalyticsPurgeService;
  let countryId: string;
  let countryBId: string;
  let catalogItemId: string;
  let adminToken: string;
  let customerToken: string;
  let customerPersonId: string;
  const metricDate = utcDayStart(new Date('2026-08-15T12:00:00.000Z'));
  const dayStart = metricDate;
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

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
    ingest = app.get(AnalyticsIngestService);
    purge = app.get(AnalyticsPurgeService);

    const xxCountry = await prisma.country.findUnique({ where: { isoAlpha2: 'XX' } });
    if (xxCountry) {
      await prisma.policyPack.updateMany({
        where: { countryId: xxCountry.id, status: PolicyPackStatus.PUBLISHED },
        data: { document: emptyPolicyDocument() as never },
      });
      await app.get(PolicyCache).invalidate('XX');
    }

    const enabledDoc = emptyPolicyDocument();
    enabledDoc.analytics = { enabled: true, retention_days: 30 };
    enabledDoc.crm.personalization = { retention_days: 7 };

    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'TR' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'TR',
          isoAlpha3: 'TRR',
          nameI18n: { en: 'Analytics test A' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
          dataResidencyMode: 'shared',
        },
      });
      const pack = await prisma.policyPack.create({
        data: {
          id: uuidv7(),
          countryId: country.id,
          version: 99_001,
          status: PolicyPackStatus.PUBLISHED,
          document: enabledDoc as never,
          checksum: 'r13e-test',
          publishedAt: new Date(),
        },
      });
      await prisma.country.update({
        where: { id: country.id },
        data: { publishedPolicyPackId: pack.id },
      });
    } else {
      await prisma.policyPack.updateMany({
        where: { countryId: country.id, status: PolicyPackStatus.PUBLISHED },
        data: { document: enabledDoc as never },
      });
    }
    countryId = country.id;
    await app.get(PolicyCache).invalidate('TR');

    let countryB = await prisma.country.findUnique({ where: { isoAlpha2: 'DE' } });
    if (!countryB) {
      countryB = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'DE',
          isoAlpha3: 'DEU',
          nameI18n: { en: 'Analytics test B' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
          dataResidencyMode: 'shared',
        },
      });
    }
    countryBId = countryB.id;

    catalogItemId = uuidv7();
    const slug = `r13e-item-${Date.now()}`;
    const existingItem = await prisma.catalogItem.findUnique({ where: { slug } });
    if (existingItem) {
      catalogItemId = existingItem.id;
    } else {
      await prisma.catalogItem.create({
        data: {
          id: catalogItemId,
          slug,
          kind: 'OTC',
          status: 'PUBLISHED',
          translations: {
            create: {
              id: uuidv7(),
              locale: 'en',
              title: 'Analytics SKU',
            },
          },
        },
      });
    }

    const admin = await signIn(app, `r13e-admin-${Date.now()}@example.com`, 'admin');
    adminToken = admin.token;
    await grantPlatformRole(prisma, admin.personId, 'company_operations');

    const customer = await signIn(app, `r13e-customer-${Date.now()}@example.com`, 'customer');
    customerToken = customer.token;
    customerPersonId = customer.personId;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('records conversion hooks idempotently', async () => {
    const orderId = uuidv7();
    const conversion = app.get(
      (await import('../crm/conversion-event.service')).ConversionEventService,
    );
    await conversion.recordHook({
      countryCode: 'TR',
      personId: customerPersonId,
      orderId,
      eventKind: ConversionEventKind.ORDER_PAID,
      source: 'order_paid',
      sourceKey: orderId,
      metadata: { total_minor: '1500', currency: 'XXX' },
      occurredAt: new Date(dayStart.getTime() + 3_600_000),
    });
    await conversion.recordHook({
      countryCode: 'TR',
      personId: customerPersonId,
      orderId,
      eventKind: ConversionEventKind.ORDER_PAID,
      source: 'order_paid',
      sourceKey: orderId,
      metadata: { total_minor: '1500', currency: 'XXX' },
      occurredAt: new Date(dayStart.getTime() + 3_600_000),
    });
    const rows = await prisma.conversionEvent.findMany({
      where: { countryId, sourceKey: orderId, eventKind: ConversionEventKind.ORDER_PAID },
    });
    expect(rows).toHaveLength(1);
  });

  it('rejects clinical metadata on conversion hooks', async () => {
    const conversion = app.get(
      (await import('../crm/conversion-event.service')).ConversionEventService,
    );
    await expect(
      conversion.recordHook({
        countryCode: 'TR',
        eventKind: ConversionEventKind.CHECKOUT_STARTED,
        source: 'checkout_session',
        sourceKey: uuidv7(),
        metadata: { diagnosis: 'hidden' },
      }),
    ).rejects.toThrow();
  });

  it('builds deterministic country rollups with tenant isolation', async () => {
    const sessionId = uuidv7();
    await prisma.conversionEvent.create({
      data: {
        id: uuidv7(),
        countryId,
        personId: customerPersonId,
        eventKind: ConversionEventKind.CHECKOUT_STARTED,
        source: 'checkout_session',
        sourceKey: sessionId,
        sessionId,
        occurredAt: new Date(dayStart.getTime() + 7_200_000),
        metadata: {},
      },
    });
    await prisma.conversionEvent.create({
      data: {
        id: uuidv7(),
        countryId: countryBId,
        eventKind: ConversionEventKind.CHECKOUT_STARTED,
        source: 'checkout_session',
        sourceKey: uuidv7(),
        occurredAt: new Date(dayStart.getTime() + 7_200_000),
        metadata: {},
      },
    });
    await prisma.personalizationEvent.create({
      data: {
        id: uuidv7(),
        countryId,
        personId: customerPersonId,
        eventKind: PersonalizationEventKind.PRODUCT_VIEWED,
        catalogItemId,
        source: 'pdp',
        sourceKey: `${catalogItemId}:view`,
        occurredAt: new Date(dayStart.getTime() + 10_800_000),
        metadata: {},
      },
    });

    const first = await ingest.ingestCountryDay(countryId, metricDate);
    const second = await ingest.ingestCountryDay(countryId, metricDate);
    expect(first.conversion.checkoutStartedCount).toBeGreaterThanOrEqual(1);
    expect(second.conversion.checkoutStartedCount).toBe(first.conversion.checkoutStartedCount);
    expect(first.personalization_views).toBe(second.personalization_views);

    const countryMetric = await prisma.analyticsDailyCountryMetric.findUnique({
      where: { countryId_metricDate: { countryId, metricDate } },
    });
    expect(countryMetric?.checkoutStartedCount).toBe(first.conversion.checkoutStartedCount);
    expect(countryMetric?.productViewCount).toBeGreaterThanOrEqual(1);

    const productMetric = await prisma.analyticsDailyProductMetric.findUnique({
      where: {
        countryId_catalogItemId_metricDate: { countryId, catalogItemId, metricDate },
      },
    });
    expect(productMetric?.viewCount).toBeGreaterThanOrEqual(1);

    const otherCountryMetric = await prisma.analyticsDailyCountryMetric.findUnique({
      where: { countryId_metricDate: { countryId: countryBId, metricDate } },
    });
    expect(otherCountryMetric).toBeNull();
  });

  it('purges rollup and personalization rows within country boundaries', async () => {
    const oldDate = utcDayStart(new Date('2019-06-01T00:00:00.000Z'));
    await prisma.analyticsDailyCountryMetric.upsert({
      where: { countryId_metricDate: { countryId, metricDate: oldDate } },
      create: {
        id: uuidv7(),
        countryId,
        metricDate: oldDate,
        orderPaidCount: 1,
      },
      update: { orderPaidCount: 1 },
    });
    const otherOldDate = utcDayStart(new Date('2019-06-02T00:00:00.000Z'));
    await prisma.analyticsDailyCountryMetric.upsert({
      where: { countryId_metricDate: { countryId: countryBId, metricDate: otherOldDate } },
      create: {
        id: uuidv7(),
        countryId: countryBId,
        metricDate: otherOldDate,
        orderPaidCount: 9,
      },
      update: { orderPaidCount: 9 },
    });
    await prisma.personalizationEvent.create({
      data: {
        id: uuidv7(),
        countryId,
        personId: customerPersonId,
        eventKind: PersonalizationEventKind.PRODUCT_VIEWED,
        catalogItemId,
        source: 'purge-test',
        sourceKey: uuidv7(),
        occurredAt: new Date('2019-01-01T00:00:00.000Z'),
        metadata: {},
      },
    });

    const result = await purge.purgeCountry(countryId, 'TR');
    expect(result.rollup_deleted).toBeGreaterThanOrEqual(1);
    expect(result.personalization_deleted).toBeGreaterThanOrEqual(1);

    const keptOther = await prisma.analyticsDailyCountryMetric.findUnique({
      where: { countryId_metricDate: { countryId: countryBId, metricDate: otherOldDate } },
    });
    expect(keptOther?.orderPaidCount).toBe(9);
  });

  it('denies admin analytics when disabled or unauthorized', async () => {
    const disabled = emptyPolicyDocument();
    disabled.analytics = { enabled: false, retention_days: 365 };
    await prisma.policyPack.updateMany({
      where: { countryId: countryBId, status: PolicyPackStatus.PUBLISHED },
      data: { document: disabled as never },
    });
    await app.get(PolicyCache).invalidate('DE');

    await request(app.getHttpServer())
      .get('/api/v1/admin/analytics/overview')
      .query({ country_code: 'DE' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);

    const customerOnly = await signIn(app, `r13e-customer2-${Date.now()}@example.com`, 'customer');
    await request(app.getHttpServer())
      .get('/api/v1/admin/analytics/overview')
      .query({ country_code: 'TR' })
      .set('Authorization', `Bearer ${customerOnly.token}`)
      .expect(403);
  });

  it('serves admin overview without clinical payloads', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/admin/analytics/overview')
      .query({ country_code: 'TR', from: '2026-08-01', to: '2026-08-31' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assertNoSensitivePayload(response.body);
    expect(response.body.country_code).toBe('TR');
    expect(response.body.totals).toBeDefined();
  });

  it('records CART_ABANDONED during ingest for stale checkout sessions', async () => {
    const sellerOrgId = uuidv7();
    await prisma.organization.create({
      data: {
        id: sellerOrgId,
        countryId,
        kind: 'VENDOR',
        legalName: 'R13E Vendor',
        displayName: 'R13E Vendor',
        status: 'ACTIVE',
      },
    });
    const cartId = uuidv7();
    await prisma.cart.create({
      data: {
        id: cartId,
        customerPersonId,
        countryId,
        sellerOrgId,
        status: 'ACTIVE',
      },
    });
    const sessionId = uuidv7();
    await prisma.checkoutSession.create({
      data: {
        id: sessionId,
        customerPersonId,
        countryId,
        cartId,
        sellerOrgId,
        status: 'EXPIRED',
        idempotencyKey: `r13e-abandon-${sessionId}`,
        expiresAt: new Date(dayStart.getTime() + 43_200_000),
      },
    });
    await ingest.ingestCountryDay(countryId, metricDate);
    const abandoned = await prisma.conversionEvent.findFirst({
      where: {
        countryId,
        eventKind: ConversionEventKind.CART_ABANDONED,
        sourceKey: sessionId,
      },
    });
    expect(abandoned).not.toBeNull();
  });
});
