import { INestApplication } from '@nestjs/common';
import { PolicyPackStatus } from '@prisma/client';
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
    'person_id',
    'customer_email',
  ]) {
    expect(raw.includes(token)).toBe(false);
  }
}

describe('R13-F admin analytics shell (e2e)', () => {
  jest.setTimeout(240_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let ingest: AnalyticsIngestService;
  let countryAId: string;
  let countryBId: string;
  let catalogItemId: string;
  let adminToken: string;
  let supportToken: string;
  const metricDate = utcDayStart(new Date('2026-08-20T12:00:00.000Z'));

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

    const enabledDoc = emptyPolicyDocument();
    enabledDoc.analytics = { enabled: true, retention_days: 30 };

    let countryA = await prisma.country.findUnique({ where: { isoAlpha2: 'TR' } });
    if (!countryA) {
      countryA = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'TR',
          isoAlpha3: 'TRR',
          nameI18n: { en: 'R13F Analytics A' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
          dataResidencyMode: 'shared',
        },
      });
    }
    await prisma.policyPack.updateMany({
      where: { countryId: countryA.id, status: PolicyPackStatus.PUBLISHED },
      data: { document: enabledDoc as never },
    });
    countryAId = countryA.id;
    await app.get(PolicyCache).invalidate('TR');

    let countryB = await prisma.country.findUnique({ where: { isoAlpha2: 'DE' } });
    if (!countryB) {
      countryB = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'DE',
          isoAlpha3: 'DEU',
          nameI18n: { en: 'R13F Analytics B' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
          dataResidencyMode: 'shared',
        },
      });
    }
    const disabledDoc = emptyPolicyDocument();
    disabledDoc.analytics = { enabled: false, retention_days: 365 };
    await prisma.policyPack.updateMany({
      where: { countryId: countryB.id, status: PolicyPackStatus.PUBLISHED },
      data: { document: disabledDoc as never },
    });
    countryBId = countryB.id;
    await app.get(PolicyCache).invalidate('DE');

    catalogItemId = uuidv7();
    const slug = `r13f-item-${Date.now()}`;
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
            title: 'R13F SKU',
          },
        },
      },
    });

    await prisma.analyticsDailyCountryMetric.upsert({
      where: { countryId_metricDate: { countryId: countryAId, metricDate } },
      create: {
        id: uuidv7(),
        countryId: countryAId,
        metricDate,
        orderPaidCount: 7,
        orderGmvMinor: BigInt(21_000),
        checkoutStartedCount: 14,
        productViewCount: 55,
      },
      update: {
        orderPaidCount: 7,
        orderGmvMinor: BigInt(21_000),
        checkoutStartedCount: 14,
        productViewCount: 55,
      },
    });
    await prisma.analyticsDailyProductMetric.upsert({
      where: {
        countryId_catalogItemId_metricDate: { countryId: countryAId, catalogItemId, metricDate },
      },
      create: {
        id: uuidv7(),
        countryId: countryAId,
        catalogItemId,
        metricDate,
        viewCount: 20,
        addToCartCount: 6,
        purchaseCount: 2,
      },
      update: { viewCount: 20, addToCartCount: 6, purchaseCount: 2 },
    });
    await prisma.analyticsDailyMarketingMetric.upsert({
      where: { countryId_metricDate: { countryId: countryAId, metricDate } },
      create: {
        id: uuidv7(),
        countryId: countryAId,
        metricDate,
        campaignSendCount: 11,
        marketingOptInCount: 44,
      },
      update: { campaignSendCount: 11, marketingOptInCount: 44 },
    });

    const admin = await signIn(app, `r13f-admin-${Date.now()}@example.com`, 'admin');
    adminToken = admin.token;
    await grantPlatformRole(prisma, admin.personId, 'company_operations');

    const support = await signIn(app, `r13f-support-${Date.now()}@example.com`, 'admin');
    supportToken = support.token;
    await grantPlatformRole(prisma, support.personId, 'company_support');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('denies analytics without admin audience', async () => {
    const customer = await signIn(app, `r13f-customer-${Date.now()}@example.com`, 'customer');
    await request(app.getHttpServer())
      .get('/api/v1/admin/analytics/overview')
      .query({ country_code: 'TR' })
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(403);
  });

  it('denies analytics for support role without analytics:read', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/analytics/overview')
      .query({ country_code: 'TR' })
      .set('Authorization', `Bearer ${supportToken}`)
      .expect(403);
  });

  it('denies analytics when analytics.enabled is false', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/analytics/overview')
      .query({ country_code: 'DE' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
  });

  it('rejects malformed country scope', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/analytics/overview')
      .query({ country_code: 'T' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('serves overview commerce and marketing without PHI fields', async () => {
    const from = '2026-08-01';
    const to = '2026-08-31';

    const overview = await request(app.getHttpServer())
      .get('/api/v1/admin/analytics/overview')
      .query({ country_code: 'TR', from, to })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assertNoSensitivePayload(overview.body);
    expect(overview.body.country_code).toBe('TR');
    expect(overview.body.totals.order_paid_count).toBeGreaterThanOrEqual(7);

    const commerce = await request(app.getHttpServer())
      .get('/api/v1/admin/analytics/commerce')
      .query({ country_code: 'TR', from, to, catalog_item_id: catalogItemId })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assertNoSensitivePayload(commerce.body);
    expect(commerce.body.items.length).toBeGreaterThanOrEqual(1);
    expect(commerce.body.items[0].catalog_item_id).toBe(catalogItemId);

    const marketing = await request(app.getHttpServer())
      .get('/api/v1/admin/analytics/marketing')
      .query({ country_code: 'TR', from, to })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assertNoSensitivePayload(marketing.body);
    expect(marketing.body.daily.length).toBeGreaterThanOrEqual(1);
  });

  it('isolates country analytics reads', async () => {
    const otherDate = utcDayStart(new Date('2026-08-21T12:00:00.000Z'));
    await prisma.analyticsDailyCountryMetric.upsert({
      where: { countryId_metricDate: { countryId: countryBId, metricDate: otherDate } },
      create: {
        id: uuidv7(),
        countryId: countryBId,
        metricDate: otherDate,
        orderPaidCount: 99,
      },
      update: { orderPaidCount: 99 },
    });

    const tr = await request(app.getHttpServer())
      .get('/api/v1/admin/analytics/overview')
      .query({ country_code: 'TR', from: '2026-08-01', to: '2026-08-31' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const deDisabled = await request(app.getHttpServer())
      .get('/api/v1/admin/analytics/overview')
      .query({ country_code: 'DE', from: '2026-08-01', to: '2026-08-31' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);

    expect(deDisabled.status).toBe(403);
    expect(tr.body.totals.order_paid_count).toBeGreaterThanOrEqual(7);
    expect(tr.body.totals.order_paid_count).not.toBe(99);
  });

  it('returns empty commerce rows for unknown catalog filter', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/admin/analytics/commerce')
      .query({
        country_code: 'TR',
        from: '2026-08-01',
        to: '2026-08-31',
        catalog_item_id: uuidv7(),
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(response.body.items).toEqual([]);
  });

  it('ingest remains deterministic for admin read path', async () => {
    const first = await ingest.ingestCountryDay(countryAId, metricDate);
    const second = await ingest.ingestCountryDay(countryAId, metricDate);
    expect(first.conversion.checkoutStartedCount).toBe(second.conversion.checkoutStartedCount);
  });
});
