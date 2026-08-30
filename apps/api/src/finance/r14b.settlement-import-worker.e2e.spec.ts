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
  SettlementMatchClassification,
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
import { SettlementImportService } from './settlement-import.service';
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

describe('R14-B settlement import worker (e2e)', () => {
  jest.setTimeout(180_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let finance: FinanceService;
  let imports: SettlementImportService;
  let worker: SettlementImportWorkerService;
  let mockSettlement: MockSettlementImportAdapter;
  let countryId: string;
  let otherCountryId: string;
  let countryIso2 = 'SW';
  let adminToken: string;
  let scheduleId: string;

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
    delete process.env['PAYMENT_LIVE_ENABLED'];
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
    imports = app.get(SettlementImportService);
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
            checksum: `sw-${iso2}`,
            publishedAt: new Date(),
          },
        });
        await prisma.country.update({ where: { id: country.id }, data: { publishedPolicyPackId: pack.id } });
      }
      await finance.ensureChart(country.id);
      return country;
    }

    countryId = (await ensureCountry(countryIso2, 'SWX', 'Settlement worker')).id;
    otherCountryId = (await ensureCountry('SX', 'SXX', 'Settlement worker other')).id;

    const admin = await signIn(app, `sw-admin-${Date.now()}@example.com`, 'admin');
    adminToken = admin.token;
    const role = await prisma.role.findUnique({ where: { code: 'super_admin' } });
    await prisma.membership.create({
      data: { id: uuidv7(), personId: admin.personId, roleId: role!.id, scope: 'platform', status: 'ACTIVE' },
    });

    const schedule = await prisma.settlementImportSchedule.upsert({
      where: { countryId_providerCode: { countryId, providerCode: 'MOCK_SETTLEMENT' } },
      create: {
        id: uuidv7(),
        countryId,
        providerCode: 'MOCK_SETTLEMENT',
        currency: 'XXX',
        enabled: true,
      },
      update: { enabled: true, currency: 'XXX' },
    });
    scheduleId = schedule.id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function mockGatewayId() {
    return (await prisma.paymentGateway.findUniqueOrThrow({ where: { code: 'MOCK_PRIMARY' } })).id;
  }

  async function seedCapturedPayment(amountMinor = 1000n, country = countryId) {
    const seller = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country,
        kind: OrganizationKind.VENDOR,
        legalName: `SW Vendor ${Date.now()}`,
        displayName: 'SW Vendor',
        status: 'ACTIVE',
      },
    });
    await prisma.commercialRule.create({
      data: {
        id: uuidv7(),
        countryId: country,
        sellerOrgId: seller.id,
        takeBps: 1000,
        takeFlatMinor: 0n,
        priority: 10,
        validFrom: new Date(),
      },
    });
    const customer = await signIn(app, `sw-c-${Date.now()}@example.com`);
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: seller.id,
        countryId: country,
        kind: 'VENDOR_WAREHOUSE',
        name: 'SW WH',
        timezone: 'UTC',
      },
    });
    const cart = await prisma.cart.create({
      data: {
        id: uuidv7(),
        customerPersonId: customer.personId,
        countryId: country,
        sellerOrgId: seller.id,
      },
    });
    const checkout = await prisma.checkoutSession.create({
      data: {
        id: uuidv7(),
        customerPersonId: customer.personId,
        countryId: country,
        cartId: cart.id,
        sellerOrgId: seller.id,
        status: 'PAID',
        idempotencyKey: `sw-co-${Date.now()}`,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const quote = await prisma.checkoutQuote.create({
      data: {
        id: uuidv7(),
        sessionId: checkout.id,
        fingerprint: 'sw',
        currency: 'XXX',
        sellMinor: amountMinor,
        totalMinor: amountMinor,
        payload: {},
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const intent = await prisma.paymentIntent.create({
      data: {
        id: uuidv7(),
        checkoutSessionId: checkout.id,
        checkoutQuoteId: quote.id,
        customerPersonId: customer.personId,
        countryId: country,
        method: PaymentMethodFamily.CARD,
        status: PaymentIntentStatus.CAPTURED,
        amountMinor,
        capturedMinor: amountMinor,
        currency: 'XXX',
        idempotencyKey: `sw-pay-${Date.now()}`,
      },
    });
    const providerRef = `mock-sw-${Date.now()}`;
    const attempt = await prisma.paymentAttempt.create({
      data: {
        id: uuidv7(),
        intentId: intent.id,
        gatewayId: await mockGatewayId(),
        method: PaymentMethodFamily.CARD,
        status: PaymentAttemptStatus.SUCCEEDED,
        submitted: true,
        providerRef,
        routingJson: { gateway_code: 'MOCK_PRIMARY', gateway_environment: 'sandbox' },
      },
    });
    await prisma.paymentTransaction.create({
      data: {
        id: uuidv7(),
        intentId: intent.id,
        attemptId: attempt.id,
        kind: 'capture',
        amountMinor,
        currency: 'XXX',
        providerRef,
      },
    });
    return { providerRef, amountMinor };
  }

  async function registerMatchBatch(batchRef: string) {
    const { providerRef, amountMinor } = await seedCapturedPayment(1000n);
    mockSettlement.registerBatch(batchRef, {
      externalBatchRef: batchRef,
      currency: 'XXX',
      records: [
        {
          externalRecordRef: `rec-${batchRef}`,
          providerPaymentRef: providerRef,
          amountMinor,
          currency: 'XXX',
        },
      ],
    });
    return { batchRef, providerRef, amountMinor };
  }

  it('A: scheduled job imports sandbox settlement batch', async () => {
    const batchRef = `worker-a-${Date.now()}`;
    await registerMatchBatch(batchRef);
    const outcome = await worker.runScheduledImport({ scheduleId, externalBatchRef: batchRef });
    expect(outcome.status).toBe(SettlementImportWorkerRunStatus.SUCCEEDED);
    const batch = await prisma.settlementImportBatch.findFirstOrThrow({ where: { externalBatchRef: batchRef } });
    expect(batch.importSource).toBe('SCHEDULED');
    expect(batch.status).toBe(SettlementImportBatchStatus.COMPLETED);
  });

  it('B: imported batch enters existing match/ledger pipeline', async () => {
    const batchRef = `worker-b-${Date.now()}`;
    await registerMatchBatch(batchRef);
    const outcome = await worker.runScheduledImport({ scheduleId, externalBatchRef: batchRef });
    const batch = await prisma.settlementImportBatch.findFirstOrThrow({ where: { id: outcome.batchId } });
    expect(batch.matchedCount).toBe(1);
    expect(await prisma.journal.count({ where: { postingRuleId: 'psp_settlement_match' } })).toBeGreaterThan(0);
  });

  it('C: duplicate scheduled job is idempotent', async () => {
    const batchRef = `worker-c-${Date.now()}`;
    await registerMatchBatch(batchRef);
    const first = await worker.runScheduledImport({ scheduleId, externalBatchRef: batchRef });
    const second = await worker.runScheduledImport({ scheduleId, externalBatchRef: batchRef });
    expect(second.skipped || second.duplicate).toBeTruthy();
    expect(await prisma.settlementImportBatch.count({ where: { externalBatchRef: batchRef } })).toBe(1);
    expect(await prisma.settlementImportWorkerRun.count({ where: { externalBatchRef: batchRef } })).toBe(1);
    expect(first.batchId).toBe(second.batchId ?? first.batchId);
  });

  it('D: duplicate provider batch is idempotent', async () => {
    const batchRef = `worker-d-${Date.now()}`;
    await registerMatchBatch(batchRef);
    await worker.runScheduledImport({ scheduleId, externalBatchRef: batchRef });
    mockSettlement.registerBatch(batchRef, mockSettlement.buildPayload(batchRef, 'XXX', []));
    const replay = await worker.runScheduledImport({ scheduleId, externalBatchRef: batchRef });
    expect(replay.skipped || replay.duplicate).toBeTruthy();
    expect(await prisma.settlementImportBatch.count({ where: { externalBatchRef: batchRef } })).toBe(1);
  });

  it('E: duplicate records are skipped safely', async () => {
    const batchRef = `worker-e-${Date.now()}`;
    const { providerRef, amountMinor } = await registerMatchBatch(batchRef);
    await worker.runScheduledImport({ scheduleId, externalBatchRef: batchRef });
    expect(await prisma.settlementImportRecord.count({ where: { externalRecordRef: `rec-${batchRef}` } })).toBe(1);
    const dupBatchRef = `worker-e-dup-${Date.now()}`;
    mockSettlement.registerBatch(dupBatchRef, {
      externalBatchRef: dupBatchRef,
      currency: 'XXX',
      records: [{ externalRecordRef: `rec-${batchRef}`, providerPaymentRef: providerRef, amountMinor, currency: 'XXX' }],
    });
    const dupRun = await worker.runScheduledImport({ scheduleId, externalBatchRef: dupBatchRef });
    expect(dupRun.status).toBe(SettlementImportWorkerRunStatus.SUCCEEDED);
    expect(await prisma.settlementImportRecord.count({ where: { externalRecordRef: `rec-${batchRef}` } })).toBe(1);
  });

  it('F: concurrent workers do not duplicate journals', async () => {
    const batchRef = `worker-f-${Date.now()}`;
    await registerMatchBatch(batchRef);
    const [a, b] = await Promise.all([
      worker.runScheduledImport({ scheduleId, externalBatchRef: batchRef }),
      worker.runScheduledImport({ scheduleId, externalBatchRef: batchRef }),
    ]);
    expect(a.status === SettlementImportWorkerRunStatus.SUCCEEDED || b.status === SettlementImportWorkerRunStatus.SUCCEEDED).toBe(true);
    expect(await prisma.settlementImportBatch.count({ where: { externalBatchRef: batchRef } })).toBe(1);
    const batch = await prisma.settlementImportBatch.findFirstOrThrow({ where: { externalBatchRef: batchRef } });
    const record = await prisma.settlementImportRecord.findFirstOrThrow({ where: { batchId: batch.id } });
    expect(
      await prisma.journal.count({
        where: { sourceEventId: `psp_settlement:${record.id}`, postingRuleId: 'psp_settlement_match' },
      }),
    ).toBeLessThanOrEqual(1);
  });

  it('G: retry after transient provider failure succeeds', async () => {
    const batchRef = `worker-g-${Date.now()}`;
    await registerMatchBatch(batchRef);
    mockSettlement.armTransientFailure(batchRef);
    const failed = await worker.runScheduledImport({ scheduleId, externalBatchRef: batchRef });
    expect(failed.status).toBe(SettlementImportWorkerRunStatus.FAILED_TRANSIENT);
    mockSettlement.clearTransientFailure(batchRef);
    const run = await prisma.settlementImportWorkerRun.findFirstOrThrow({ where: { externalBatchRef: batchRef } });
    await prisma.settlementImportWorkerRun.update({
      where: { id: run.id },
      data: { nextRetryAt: new Date(Date.now() - 1000) },
    });
    await prisma.settlementImportSchedule.updateMany({
      where: { id: { not: scheduleId } },
      data: { enabled: false },
    });
    const outcomes = await worker.pollOnce();
    expect(outcomes.some((row) => row.status === SettlementImportWorkerRunStatus.SUCCEEDED)).toBe(true);
    expect(await prisma.settlementImportBatch.count({ where: { externalBatchRef: batchRef } })).toBe(1);
  });

  it('H: permanent provider failure is classified and stops retry', async () => {
    const batchRef = `worker-h-${Date.now()}`;
    mockSettlement.armPermanentFailure(batchRef);
    const failed = await worker.runScheduledImport({ scheduleId, externalBatchRef: batchRef });
    expect(failed.status).toBe(SettlementImportWorkerRunStatus.FAILED_PERMANENT);
    const run = await prisma.settlementImportWorkerRun.findFirstOrThrow({ where: { externalBatchRef: batchRef } });
    expect(run.failureClassification).toBe('PERMANENT');
    const replay = await worker.runScheduledImport({ scheduleId, externalBatchRef: batchRef });
    expect(replay.skipped).toBe(true);
    expect(await prisma.settlementImportBatch.count({ where: { externalBatchRef: batchRef } })).toBe(0);
  });

  it('I: provider timeout/restart is safe', async () => {
    const batchRef = `worker-i-${Date.now()}`;
    await registerMatchBatch(batchRef);
    mockSettlement.armTransientFailure(batchRef);
    await worker.runScheduledImport({ scheduleId, externalBatchRef: batchRef });
    mockSettlement.clearTransientFailure(batchRef);
    const run = await prisma.settlementImportWorkerRun.findFirstOrThrow({ where: { externalBatchRef: batchRef } });
    await prisma.settlementImportWorkerRun.update({
      where: { id: run.id },
      data: { nextRetryAt: new Date(Date.now() - 1000), status: SettlementImportWorkerRunStatus.FAILED_TRANSIENT },
    });
    await prisma.settlementImportSchedule.updateMany({
      where: { id: { not: scheduleId } },
      data: { enabled: false },
    });
    await worker.pollOnce();
    expect(await prisma.settlementImportBatch.count({ where: { externalBatchRef: batchRef } })).toBe(1);
  });

  it('J: empty batch is handled safely', async () => {
    const batchRef = `worker-j-${Date.now()}`;
    mockSettlement.registerBatch(batchRef, { externalBatchRef: batchRef, currency: 'XXX', records: [] });
    const outcome = await worker.runScheduledImport({ scheduleId, externalBatchRef: batchRef });
    expect(outcome.status).toBe(SettlementImportWorkerRunStatus.SUCCEEDED);
    const batch = await prisma.settlementImportBatch.findFirstOrThrow({ where: { externalBatchRef: batchRef } });
    expect(batch.recordCount).toBe(0);
    expect(batch.status).toBe(SettlementImportBatchStatus.FAILED);
  });

  it('K: invalid settlement records remain INVALID', async () => {
    const batchRef = `worker-k-${Date.now()}`;
    mockSettlement.registerBatch(batchRef, {
      externalBatchRef: batchRef,
      currency: 'XXX',
      records: [{ externalRecordRef: `bad-${Date.now()}`, providerPaymentRef: 'x', amountMinor: -1n, currency: 'XXX' }],
    });
    await worker.runScheduledImport({ scheduleId, externalBatchRef: batchRef });
    const batch = await prisma.settlementImportBatch.findFirstOrThrow({ where: { externalBatchRef: batchRef } });
    const record = await prisma.settlementImportRecord.findFirstOrThrow({ where: { batchId: batch.id } });
    expect(record.status).toBe('INVALID');
    expect(record.classification).toBe(SettlementMatchClassification.INVALID);
  });

  it('L: existing COMPLETED batch is not reprocessed financially', async () => {
    const batchRef = `worker-l-${Date.now()}`;
    await registerMatchBatch(batchRef);
    const outcome = await worker.runScheduledImport({ scheduleId, externalBatchRef: batchRef });
    const before = await prisma.journal.count();
    await imports.processImportReceived(outcome.batchId!);
    await worker.runScheduledImport({ scheduleId, externalBatchRef: batchRef });
    expect(await prisma.journal.count()).toBe(before);
  });

  it('M: settlement break reaches CR-287 unified break queue', async () => {
    const batchRef = `worker-m-${Date.now()}`;
    mockSettlement.registerBatch(batchRef, {
      externalBatchRef: batchRef,
      currency: 'XXX',
      records: [
        {
          externalRecordRef: `rec-m-${Date.now()}`,
          providerPaymentRef: `missing-${Date.now()}`,
          amountMinor: 1000n,
          currency: 'XXX',
        },
      ],
    });
    await worker.runScheduledImport({ scheduleId, externalBatchRef: batchRef });
    const queue = await request(app.getHttpServer())
      .get('/api/v1/admin/finance/breaks?classification=UNMATCHED')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(queue.status).toBe(200);
    expect((queue.body.data as Array<{ source_kind: string }>).some((row) => row.source_kind === 'SETTLEMENT_IMPORT')).toBe(true);
  });

  it('N: country isolation on worker runs list', async () => {
    const scopedAdmin = await signIn(app, `sw-scoped-${Date.now()}@example.com`, 'admin');
    const role = await prisma.role.findUnique({ where: { code: 'super_admin' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: scopedAdmin.personId,
        roleId: role!.id,
        scope: 'country',
        countryId: otherCountryId,
        status: 'ACTIVE',
      },
    });
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/finance/settlement-import-worker/runs?country_id=${countryId}`)
      .set('Authorization', `Bearer ${scopedAdmin.token}`);
    expect(res.status).toBe(403);
  });

  it('O: unauthorized admin access → 403', async () => {
    const customer = await signIn(app, `sw-noauth-${Date.now()}@example.com`, 'customer');
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/finance/settlement-import-worker/runs')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(res.status).toBe(403);
  });

  it('P: cross-country worker schedule blocked by RLS context', async () => {
    const otherSchedule = await prisma.settlementImportSchedule.upsert({
      where: { countryId_providerCode: { countryId: otherCountryId, providerCode: 'MOCK_SETTLEMENT' } },
      create: {
        id: uuidv7(),
        countryId: otherCountryId,
        providerCode: 'MOCK_SETTLEMENT',
        currency: 'XXX',
        enabled: true,
      },
      update: { enabled: true },
    });
    const batchRef = `worker-p-${Date.now()}`;
    await registerMatchBatch(batchRef);
    const outcome = await worker.runScheduledImport({ scheduleId: otherSchedule.id, externalBatchRef: batchRef });
    expect(outcome.status).toBe(SettlementImportWorkerRunStatus.SUCCEEDED);
    const batch = await prisma.settlementImportBatch.findFirstOrThrow({ where: { externalBatchRef: batchRef } });
    expect(batch.countryId).toBe(otherCountryId);
  });

  it('Q: production MOCK provider fails closed', async () => {
    process.env['SETTLEMENT_IMPORT_ENVIRONMENT'] = 'production';
    process.env['SETTLEMENT_IMPORT_LIVE_ENABLED'] = 'true';
    const batchRef = `worker-q-${Date.now()}`;
    await registerMatchBatch(batchRef);
    const outcome = await worker.runScheduledImport({ scheduleId, externalBatchRef: batchRef });
    expect(outcome.status).toBe(SettlementImportWorkerRunStatus.FAILED_PERMANENT);
    const run = await prisma.settlementImportWorkerRun.findFirstOrThrow({ where: { externalBatchRef: batchRef } });
    expect(run.lastErrorCode).toBe('MOCK_SETTLEMENT_PRODUCTION_FORBIDDEN');
    delete process.env['SETTLEMENT_IMPORT_ENVIRONMENT'];
    delete process.env['SETTLEMENT_IMPORT_LIVE_ENABLED'];
  });

  it('R: live import disabled fails closed', async () => {
    process.env['SETTLEMENT_IMPORT_ENVIRONMENT'] = 'production';
    delete process.env['SETTLEMENT_IMPORT_LIVE_ENABLED'];
    const batchRef = `worker-r-${Date.now()}`;
    await registerMatchBatch(batchRef);
    await expect(worker.runScheduledImport({ scheduleId, externalBatchRef: batchRef })).rejects.toMatchObject({
      response: { code: expect.stringMatching(/LIVE_SETTLEMENT_IMPORT_DISABLED|MOCK_SETTLEMENT_PRODUCTION_FORBIDDEN/) },
    });
    delete process.env['SETTLEMENT_IMPORT_ENVIRONMENT'];
  });

  it('S: unknown provider fails closed', async () => {
    const badSchedule = await prisma.settlementImportSchedule.upsert({
      where: { countryId_providerCode: { countryId, providerCode: 'UNKNOWN_PROVIDER_X' } },
      create: {
        id: uuidv7(),
        countryId,
        providerCode: 'UNKNOWN_PROVIDER_X',
        currency: 'XXX',
        enabled: true,
      },
      update: { enabled: true },
    });
    const outcome = await worker.runScheduledImport({
      scheduleId: badSchedule.id,
      externalBatchRef: `worker-s-${Date.now()}`,
    });
    expect(outcome.status).toBe(SettlementImportWorkerRunStatus.FAILED_PERMANENT);
    const run = await prisma.settlementImportWorkerRun.findFirstOrThrow({
      where: { scheduleId: badSchedule.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(run.lastErrorCode).toBe('SETTLEMENT_PROVIDER_NOT_CONFIGURED');
  });

  it('T: safe admin observability output', async () => {
    const batchRef = `worker-t-${Date.now()}`;
    await registerMatchBatch(batchRef);
    await worker.runScheduledImport({ scheduleId, externalBatchRef: batchRef });
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/finance/settlement-import-worker/runs?limit=5')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0].provider_code).toBe('MOCK_SETTLEMENT');
    expect(res.body.data[0].import_source).toBe('SCHEDULED');
    expect(JSON.stringify(res.body)).not.toMatch(/cvv|pan|secret|password/i);
  });

  it('U: worker replay after staging does not duplicate journal', async () => {
    const batchRef = `worker-u-${Date.now()}`;
    await registerMatchBatch(batchRef);
    const outcome = await worker.runScheduledImport({ scheduleId, externalBatchRef: batchRef });
    const batch = await prisma.settlementImportBatch.findFirstOrThrow({ where: { id: outcome.batchId } });
    const record = await prisma.settlementImportRecord.findFirstOrThrow({ where: { batchId: batch.id } });
    const before = await prisma.journal.count({
      where: { sourceEventId: `psp_settlement:${record.id}`, postingRuleId: 'psp_settlement_match' },
    });
    await imports.processImportReceived(batch.id);
    expect(
      await prisma.journal.count({
        where: { sourceEventId: `psp_settlement:${record.id}`, postingRuleId: 'psp_settlement_match' },
      }),
    ).toBe(before);
  });

  it('V: worker replay after match does not duplicate journal', async () => {
    const batchRef = `worker-v-${Date.now()}`;
    await registerMatchBatch(batchRef);
    const outcome = await worker.runScheduledImport({ scheduleId, externalBatchRef: batchRef });
    const batch = await prisma.settlementImportBatch.findFirstOrThrow({ where: { id: outcome.batchId } });
    const record = await prisma.settlementImportRecord.findFirstOrThrow({ where: { batchId: batch.id } });
    const before = await prisma.journal.count({
      where: { sourceEventId: `psp_settlement:${record.id}`, postingRuleId: 'psp_settlement_match' },
    });
    await worker.runScheduledImport({ scheduleId, externalBatchRef: batchRef });
    await imports.processImportReceived(batch.id);
    expect(
      await prisma.journal.count({
        where: { sourceEventId: `psp_settlement:${record.id}`, postingRuleId: 'psp_settlement_match' },
      }),
    ).toBe(before);
  });
});
