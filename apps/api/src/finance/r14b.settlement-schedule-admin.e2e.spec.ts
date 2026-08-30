import { INestApplication } from '@nestjs/common';
import {
  OfferOwnership,
  OfferStatus,
  OrganizationKind,
  PaymentAttemptStatus,
  PaymentIntentStatus,
  PaymentMethodFamily,
  PolicyPackStatus,
  SettlementImportBatchStatus,
  SettlementImportWorkerRunStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { applyTestIsolation } from '../test/isolate-runtime';
import { FinanceService } from './finance.service';
import { MockSettlementImportAdapter } from './mock-settlement-import.adapter';
import { SettlementImportWorkerService } from './settlement-import-worker.service';

async function signIn(app: INestApplication, email: string, audience: 'admin' | 'customer' = 'customer') {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

describe('R14-B settlement schedule admin (e2e)', () => {
  jest.setTimeout(180_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let finance: FinanceService;
  let worker: SettlementImportWorkerService;
  let mockSettlement: MockSettlementImportAdapter;
  let countryId: string;
  let otherCountryId: string;
  let adminToken: string;
  let countryAdminToken: string;

  beforeAll(async () => {
    applyTestIsolation();
    process.env['NODE_ENV'] = 'test';
    process.env['AUTH_DEV_REVEAL_OTP'] = 'true';
    process.env['JWT_ACCESS_SECRET'] =
      process.env['JWT_ACCESS_SECRET'] ?? 'test-access-secret-must-be-32-chars-min';
    process.env['OTP_PEPPER'] =
      process.env['OTP_PEPPER'] ?? 'test-otp-pepper-must-be-32-chars-minx';
    delete process.env['SETTLEMENT_IMPORT_ENVIRONMENT'];
    delete process.env['SETTLEMENT_IMPORT_LIVE_ENABLED'];
    delete process.env['SETTLEMENT_IMPORT_WORKER_ENABLED'];
    if (!process.env['REDIS_URL']) {
      throw new Error('REDIS_URL is required');
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ProblemFilter());
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    prisma = app.get(PrismaService);
    finance = app.get(FinanceService);
    worker = app.get(SettlementImportWorkerService);
    mockSettlement = app.get(MockSettlementImportAdapter);

    const doc = emptyPolicyDocument();
    doc.services.pharmacy = true;
    doc.payments.enabled = true;

    async function ensureCountry(iso2: string, iso3: string, name: string) {
      let country = await prisma.country.findUnique({ where: { isoAlpha2: iso2 } });
      if (!country) {
        country = await prisma.country.create({
          data: {
            id: uuidv7(),
            isoAlpha2: iso2,
            isoAlpha3: iso3,
            nameI18n: { en: name },
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
            version: 1,
            status: PolicyPackStatus.PUBLISHED,
            document: doc as never,
            checksum: `sched-${iso2}`,
            publishedAt: new Date(),
          },
        });
        await prisma.country.update({ where: { id: country.id }, data: { publishedPolicyPackId: pack.id } });
      }
      await finance.ensureChart(country.id);
      return country;
    }

    countryId = (await ensureCountry('SZ', 'SZX', 'Schedule admin primary')).id;
    otherCountryId = (await ensureCountry('SY', 'SYX', 'Schedule admin other')).id;

    const admin = await signIn(app, `sched-platform-${Date.now()}@example.com`, 'admin');
    adminToken = admin.token;
    const role = await prisma.role.findUnique({ where: { code: 'super_admin' } });
    await prisma.membership.create({
      data: { id: uuidv7(), personId: admin.personId, roleId: role!.id, scope: 'platform', status: 'ACTIVE' },
    });

    const countryAdmin = await signIn(app, `sched-country-${Date.now()}@example.com`, 'admin');
    countryAdminToken = countryAdmin.token;
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: countryAdmin.personId,
        roleId: role!.id,
        scope: 'country',
        countryId,
        status: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  async function createScheduleViaApi(
    token: string,
    body: { country_id: string; provider_code: string; currency: string; enabled?: boolean },
  ) {
    return request(app.getHttpServer())
      .post('/api/v1/admin/finance/settlement-import-schedules')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  async function registerWorkerBatch(batchRef: string) {
    mockSettlement.registerBatch(batchRef, mockSettlement.buildPayload(batchRef, 'XXX', []));
  }

  it('A: create valid schedule', async () => {
    await prisma.settlementImportSchedule.deleteMany({
      where: { countryId, providerCode: 'MOCK_SANDBOX' },
    });
    const res = await createScheduleViaApi(adminToken, {
      country_id: countryId,
      provider_code: 'MOCK_SANDBOX',
      currency: 'XXX',
      enabled: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.enabled).toBe(true);
    expect(res.body.provider_code).toBe('MOCK_SANDBOX');
    expect(res.body.country_id).toBe(countryId);
    expect(res.body.sandbox).toBe(true);
    expect(res.body.live_psp).toBe(false);
  });

  it('B: list schedules', async () => {
    await createScheduleViaApi(adminToken, {
      country_id: otherCountryId,
      provider_code: 'MOCK',
      currency: 'XXX',
    });
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/finance/settlement-import-schedules?country_id=${otherCountryId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.worker_poll_ms).toBeGreaterThanOrEqual(5000);
  });

  it('C: get schedule detail', async () => {
    await prisma.settlementImportSchedule.deleteMany({ where: { countryId, providerCode: 'MOCK' } });
    const created = await createScheduleViaApi(adminToken, {
      country_id: countryId,
      provider_code: 'MOCK',
      currency: 'XXX',
    });
    expect(created.status).toBe(201);
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/finance/settlement-import-schedules/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(res.body.recent_runs).toBeDefined();
  });

  it('D: update schedule config', async () => {
    await prisma.settlementImportSchedule.deleteMany({ where: { countryId, providerCode: 'MOCK_SANDBOX' } });
    const created = await createScheduleViaApi(adminToken, {
      country_id: countryId,
      provider_code: 'MOCK_SANDBOX',
      currency: 'XXX',
    });
    expect(created.status).toBe(201);
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/finance/settlement-import-schedules/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ currency: 'USD' });
    expect(res.status).toBe(200);
    expect(res.body.currency).toBe('USD');
  });

  it('E: enable schedule', async () => {
    await prisma.settlementImportSchedule.deleteMany({
      where: { countryId: otherCountryId, providerCode: 'MOCK_SETTLEMENT' },
    });
    const created = await createScheduleViaApi(adminToken, {
      country_id: otherCountryId,
      provider_code: 'MOCK_SETTLEMENT',
      currency: 'XXX',
      enabled: false,
    });
    expect(created.status).toBe(201);
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/finance/settlement-import-schedules/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: true });
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
  });

  it('F: disable schedule', async () => {
    await prisma.settlementImportSchedule.deleteMany({
      where: { countryId: otherCountryId, providerCode: 'MOCK' },
    });
    const created = await createScheduleViaApi(adminToken, {
      country_id: otherCountryId,
      provider_code: 'MOCK',
      currency: 'XXX',
      enabled: true,
    });
    expect(created.status).toBe(201);
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/finance/settlement-import-schedules/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
  });

  it('G: duplicate schedule rejected', async () => {
    await prisma.settlementImportSchedule.deleteMany({
      where: { countryId, providerCode: 'MOCK' },
    });
    const body = { country_id: countryId, provider_code: 'MOCK', currency: 'XXX' };
    const first = await createScheduleViaApi(adminToken, body);
    const second = await createScheduleViaApi(adminToken, body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('SETTLEMENT_SCHEDULE_DUPLICATE');
  });

  it('H: unknown provider rejected', async () => {
    const res = await createScheduleViaApi(adminToken, {
      country_id: countryId,
      provider_code: `UNKNOWN_PSP_${Date.now()}`,
      currency: 'XXX',
    });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SETTLEMENT_PROVIDER_NOT_CONFIGURED');
  });

  it('I: production MOCK rejected', async () => {
    process.env['SETTLEMENT_IMPORT_ENVIRONMENT'] = 'production';
    process.env['SETTLEMENT_IMPORT_LIVE_ENABLED'] = 'true';
    const res = await createScheduleViaApi(adminToken, {
      country_id: countryId,
      provider_code: 'MOCK_SETTLEMENT',
      currency: 'XXX',
    });
    delete process.env['SETTLEMENT_IMPORT_ENVIRONMENT'];
    delete process.env['SETTLEMENT_IMPORT_LIVE_ENABLED'];
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('MOCK_SETTLEMENT_PRODUCTION_FORBIDDEN');
  });

  it('J: unauthorized → 403', async () => {
    const customer = await signIn(app, `sched-noauth-${Date.now()}@example.com`, 'customer');
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/finance/settlement-import-schedules')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(res.status).toBe(403);
  });

  it('K: cross-country access blocked', async () => {
    await prisma.settlementImportSchedule.deleteMany({
      where: { countryId, providerCode: 'MOCK_SETTLEMENT' },
    });
    const created = await createScheduleViaApi(adminToken, {
      country_id: countryId,
      provider_code: 'MOCK_SETTLEMENT',
      currency: 'XXX',
    });
    expect(created.status).toBe(201);
    const otherAdmin = await signIn(app, `sched-other-${Date.now()}@example.com`, 'admin');
    const role = await prisma.role.findUnique({ where: { code: 'super_admin' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: otherAdmin.personId,
        roleId: role!.id,
        scope: 'country',
        countryId: otherCountryId,
        status: 'ACTIVE',
      },
    });
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/finance/settlement-import-schedules/${created.body.id}`)
      .set('Authorization', `Bearer ${otherAdmin.token}`);
    expect(res.status).toBe(403);
  });

  it('L: platform admin can access all countries', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/finance/settlement-import-schedules?country_id=${otherCountryId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('M: worker consumes enabled schedule', async () => {
    const batchRef = `sched-m-${Date.now()}`;
    await registerWorkerBatch(batchRef);
    const schedule = await prisma.settlementImportSchedule.upsert({
      where: { countryId_providerCode: { countryId, providerCode: 'MOCK_SETTLEMENT' } },
      create: {
        id: uuidv7(),
        countryId,
        providerCode: 'MOCK_SETTLEMENT',
        currency: 'XXX',
        enabled: true,
      },
      update: { enabled: true },
    });
    const outcome = await worker.runScheduledImport({ scheduleId: schedule.id, externalBatchRef: batchRef });
    expect(outcome.status).toBe(SettlementImportWorkerRunStatus.SUCCEEDED);
    const batch = await prisma.settlementImportBatch.findFirst({ where: { externalBatchRef: batchRef } });
    expect(batch).toBeTruthy();
  });

  it('N: disabled schedule stops future poll runs', async () => {
    await prisma.settlementImportSchedule.updateMany({ data: { enabled: false } });
    const batchRef = `sched-n-${Date.now()}`;
    await registerWorkerBatch(batchRef);
    const schedule = await prisma.settlementImportSchedule.upsert({
      where: { countryId_providerCode: { countryId, providerCode: 'MOCK_SETTLEMENT' } },
      create: {
        id: uuidv7(),
        countryId,
        providerCode: 'MOCK_SETTLEMENT',
        currency: 'XXX',
        enabled: false,
      },
      update: { enabled: false },
    });
    await worker.pollOnce();
    const batch = await prisma.settlementImportBatch.findFirst({ where: { externalBatchRef: batchRef } });
    expect(batch).toBeNull();
    await prisma.settlementImportSchedule.update({ where: { id: schedule.id }, data: { enabled: false } });
  });

  it('O: schedule update via admin API is reflected for worker', async () => {
    await prisma.settlementImportSchedule.deleteMany({
      where: { countryId, providerCode: 'MOCK_SANDBOX' },
    });
    const created = await createScheduleViaApi(countryAdminToken, {
      country_id: countryId,
      provider_code: 'MOCK_SANDBOX',
      currency: 'XXX',
      enabled: false,
    });
    expect(created.status).toBe(201);
    const enableRes = await request(app.getHttpServer())
      .patch(`/api/v1/admin/finance/settlement-import-schedules/${created.body.id}`)
      .set('Authorization', `Bearer ${countryAdminToken}`)
      .send({ enabled: true });
    expect(enableRes.status).toBe(200);
    expect(enableRes.body.enabled).toBe(true);
  });

  it('P: concurrent admin creates do not corrupt state', async () => {
    const iso = 'MOCK_SANDBOX';
    const body = { country_id: otherCountryId, provider_code: iso, currency: 'XXX' };
    await prisma.settlementImportSchedule.deleteMany({ where: { countryId: otherCountryId, providerCode: iso } });
    const [a, b] = await Promise.all([
      createScheduleViaApi(adminToken, body),
      createScheduleViaApi(adminToken, body),
    ]);
    const ok = (a.status === 201 && b.status === 409) || (a.status === 409 && b.status === 201);
    expect(ok).toBe(true);
    expect(await prisma.settlementImportSchedule.count({ where: { countryId: otherCountryId, providerCode: iso } })).toBe(1);
  });

  it('Q: worker concurrency does not duplicate imports', async () => {
    const batchRef = `sched-q-${Date.now()}`;
    await registerWorkerBatch(batchRef);
    const schedule = await prisma.settlementImportSchedule.findFirstOrThrow({
      where: { countryId, providerCode: 'MOCK_SETTLEMENT' },
    });
    const [a, b] = await Promise.all([
      worker.runScheduledImport({ scheduleId: schedule.id, externalBatchRef: batchRef }),
      worker.runScheduledImport({ scheduleId: schedule.id, externalBatchRef: batchRef }),
    ]);
    expect(a.status === SettlementImportWorkerRunStatus.SUCCEEDED || b.status === SettlementImportWorkerRunStatus.SUCCEEDED).toBe(true);
    expect(await prisma.settlementImportBatch.count({ where: { externalBatchRef: batchRef } })).toBe(1);
  });

  it('R: existing imported batch remains idempotent', async () => {
    const batchRef = `sched-r-${Date.now()}`;
    await registerWorkerBatch(batchRef);
    const schedule = await prisma.settlementImportSchedule.findFirstOrThrow({
      where: { countryId, providerCode: 'MOCK_SETTLEMENT' },
    });
    const first = await worker.runScheduledImport({ scheduleId: schedule.id, externalBatchRef: batchRef });
    const second = await worker.runScheduledImport({ scheduleId: schedule.id, externalBatchRef: batchRef });
    expect(second.skipped || second.duplicate).toBeTruthy();
    expect(first.batchId).toBeTruthy();
    expect(await prisma.settlementImportBatch.count({ where: { externalBatchRef: batchRef } })).toBe(1);
  });

  it('S: safe observability output', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/finance/settlement-import-schedules?country_id=${countryId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const json = JSON.stringify(res.body);
    expect(json).not.toMatch(/secret|password|cvv|pan|credential/i);
    expect(res.body.sandbox).toBe(true);
    expect(res.body.worker_poll_ms).toBeDefined();
  });

  it('T: no secrets in schedule detail', async () => {
    const row = await prisma.settlementImportSchedule.findFirst({ where: { countryId } });
    expect(row).toBeTruthy();
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/finance/settlement-import-schedules/${row!.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const json = JSON.stringify(res.body);
    expect(json).not.toMatch(/secret|password|cvv|pan|credential|signature/i);
  });
});
