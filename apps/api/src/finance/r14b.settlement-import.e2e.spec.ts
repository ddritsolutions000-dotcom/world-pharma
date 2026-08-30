import { INestApplication } from '@nestjs/common';
import {
  OfferOwnership,
  OfferStatus,
  OrganizationKind,
  PaymentAttemptStatus,
  PaymentIntentStatus,
  PaymentMethodFamily,
  PolicyPackStatus,
  SettlementImportRecordStatus,
  SettlementMatchClassification,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { ProblemException } from '../common/problem';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { applyTestIsolation } from '../test/isolate-runtime';
import { SettlementImportRegistry } from './settlement-import.registry';
import { SettlementImportService } from './settlement-import.service';
import { MockSettlementImportAdapter } from './mock-settlement-import.adapter';
import { FinanceService } from './finance.service';

async function signIn(app: INestApplication, email: string, audience: 'admin' | 'customer' = 'customer') {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

describe('R14-B settlement import port (e2e)', () => {
  jest.setTimeout(120_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let imports: SettlementImportService;
  let finance: FinanceService;
  let mockSettlement: MockSettlementImportAdapter;
  let countryId: string;
  let countryIso2 = 'SI';
  let adminToken: string;
  let adminPersonId: string;
  let otherCountryId: string;

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
    imports = app.get(SettlementImportService);
    finance = app.get(FinanceService);
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
            checksum: `si-${iso2}`,
            publishedAt: new Date(),
          },
        });
        await prisma.country.update({ where: { id: country.id }, data: { publishedPolicyPackId: pack.id } });
      }
      await finance.ensureChart(country.id);
      return country;
    }

    countryId = (await ensureCountry(countryIso2, 'SIX', 'Settlement import')).id;
    otherCountryId = (await ensureCountry('SJ', 'SJX', 'Settlement other')).id;

    const admin = await signIn(app, `si-admin-${Date.now()}@example.com`, 'admin');
    adminToken = admin.token;
    adminPersonId = admin.personId;
    const role = await prisma.role.findUnique({ where: { code: 'super_admin' } });
    await prisma.membership.create({
      data: { id: uuidv7(), personId: admin.personId, roleId: role!.id, scope: 'platform', status: 'ACTIVE' },
    });
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
        legalName: `SI Vendor ${Date.now()}`,
        displayName: 'SI Vendor',
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
    const customer = await signIn(app, `si-c-${Date.now()}@example.com`);
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: seller.id,
        countryId: country,
        kind: 'VENDOR_WAREHOUSE',
        name: 'SI WH',
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
        idempotencyKey: `si-co-${Date.now()}`,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const quote = await prisma.checkoutQuote.create({
      data: {
        id: uuidv7(),
        sessionId: checkout.id,
        fingerprint: 'si',
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
        idempotencyKey: `si-pay-${Date.now()}`,
      },
    });
    const providerRef = `mock-si-${Date.now()}`;
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
    const brand = await prisma.catalogBrand.create({
      data: { id: uuidv7(), slug: `si-b-${Date.now()}`, name: 'SI Brand' },
    });
    const item = await prisma.catalogItem.create({
      data: {
        id: uuidv7(),
        slug: `si-i-${Date.now()}`,
        kind: 'OTC',
        brandId: brand.id,
        createdByOrgId: seller.id,
        status: 'PUBLISHED',
      },
    });
    const variant = await prisma.catalogVariant.create({
      data: { id: uuidv7(), itemId: item.id, skuCode: `SI-${Date.now()}`, packSize: '1' },
    });
    const offer = await prisma.catalogOffer.create({
      data: {
        id: uuidv7(),
        variantId: variant.id,
        sellerOrgId: seller.id,
        countryId: country,
        ownership: OfferOwnership.VENDOR_OWNED,
        status: OfferStatus.PUBLISHED,
        currency: 'XXX',
      },
    });
    const order = await prisma.order.create({
      data: {
        id: uuidv7(),
        orderNumber: `SI-${Date.now()}`,
        customerPersonId: customer.personId,
        sellerOrgId: seller.id,
        countryId: country,
        checkoutSessionId: checkout.id,
        checkoutQuoteId: quote.id,
        paymentIntentId: intent.id,
        fulfillingLocationId: location.id,
        currency: 'XXX',
        goodsMinor: amountMinor,
        totalMinor: amountMinor,
      },
    });
    await prisma.orderItem.create({
      data: {
        id: uuidv7(),
        orderId: order.id,
        offerId: offer.id,
        variantId: variant.id,
        sku: 'SI-SKU',
        title: 'SI item',
        qty: 1,
        unitMinor: amountMinor,
        lineMinor: amountMinor,
        currency: 'XXX',
      },
    });
    return { intent, order, providerRef, amountMinor };
  }

  async function importBody(
    externalBatchRef: string,
    idempotencyKey: string,
    records: Array<{
      external_record_ref: string;
      provider_payment_ref: string;
      amount_minor: string;
      fee_minor?: string;
      currency: string;
    }>,
    country = countryId,
    iso2 = countryIso2,
  ) {
    return {
      country_id: country,
      country_iso2: iso2,
      provider_code: 'MOCK_SETTLEMENT',
      external_batch_ref: externalBatchRef,
      idempotency_key: idempotencyKey,
      currency: 'XXX',
      fetch_from_provider: false,
      records,
    };
  }

  it('A: new settlement batch imports successfully', async () => {
    const { providerRef, amountMinor } = await seedCapturedPayment();
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/finance/settlement-imports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(
        await importBody(`batch-a-${Date.now()}`, `idem-a-${Date.now()}`, [
          {
            external_record_ref: `rec-a-${Date.now()}`,
            provider_payment_ref: providerRef,
            amount_minor: amountMinor.toString(),
            currency: 'XXX',
          },
        ]),
      );
    expect(res.status).toBe(201);
    expect(res.body.record_count).toBe(1);
    expect(res.body.sandbox).toBe(true);
    const matched = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/settlement-imports/${res.body.id}/match`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(matched.status).toBe(201);
    expect(matched.body.records[0].classification).toBe(SettlementMatchClassification.MATCH);
  });

  it('B: same batch imported twice is idempotent', async () => {
    const { providerRef, amountMinor } = await seedCapturedPayment();
    const body = await importBody(`batch-b-${Date.now()}`, `idem-b-fixed`, [
      {
        external_record_ref: `rec-b-${Date.now()}`,
        provider_payment_ref: providerRef,
        amount_minor: amountMinor.toString(),
        currency: 'XXX',
      },
    ]);
    const first = await request(app.getHttpServer())
      .post('/api/v1/admin/finance/settlement-imports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);
    const second = await request(app.getHttpServer())
      .post('/api/v1/admin/finance/settlement-imports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.id).toBe(first.body.id);
    expect(await prisma.settlementImportBatch.count({ where: { idempotencyKey: body.idempotency_key } })).toBe(1);
  });

  it('C: same settlement record in a new batch is classified DUPLICATE on match', async () => {
    const { providerRef, amountMinor } = await seedCapturedPayment();
    const recordRef = `rec-c-${Date.now()}`;
    const first = await request(app.getHttpServer())
      .post('/api/v1/admin/finance/settlement-imports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(
        await importBody(`batch-c1-${Date.now()}`, `idem-c1-${Date.now()}`, [
          {
            external_record_ref: recordRef,
            provider_payment_ref: providerRef,
            amount_minor: amountMinor.toString(),
            currency: 'XXX',
          },
        ]),
      );
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/settlement-imports/${first.body.id}/match`)
      .set('Authorization', `Bearer ${adminToken}`);
    const second = await request(app.getHttpServer())
      .post('/api/v1/admin/finance/settlement-imports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(
        await importBody(`batch-c2-${Date.now()}`, `idem-c2-${Date.now()}`, [
          {
            external_record_ref: recordRef,
            provider_payment_ref: providerRef,
            amount_minor: amountMinor.toString(),
            currency: 'XXX',
          },
        ]),
      );
    expect(second.status).toBe(409);
  });

  it('D: MATCH produces exactly one settlement journal', async () => {
    const { providerRef, amountMinor } = await seedCapturedPayment(1500n);
    const recordRef = `rec-d-${Date.now()}`;
    const imported = await request(app.getHttpServer())
      .post('/api/v1/admin/finance/settlement-imports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(
        await importBody(`batch-d-${Date.now()}`, `idem-d-${Date.now()}`, [
          {
            external_record_ref: recordRef,
            provider_payment_ref: providerRef,
            amount_minor: amountMinor.toString(),
            fee_minor: '50',
            currency: 'XXX',
          },
        ]),
      );
    const record = imported.body.records[0];
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/settlement-imports/${imported.body.id}/match`)
      .set('Authorization', `Bearer ${adminToken}`);
    const journals = await prisma.journal.count({
      where: { sourceEventId: `psp_settlement:${record.id}`, postingRuleId: 'psp_settlement_match' },
    });
    expect(journals).toBe(1);
  });

  it('E: re-running MATCH does not duplicate posting', async () => {
    const { providerRef, amountMinor } = await seedCapturedPayment();
    const imported = await request(app.getHttpServer())
      .post('/api/v1/admin/finance/settlement-imports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(
        await importBody(`batch-e-${Date.now()}`, `idem-e-${Date.now()}`, [
          {
            external_record_ref: `rec-e-${Date.now()}`,
            provider_payment_ref: providerRef,
            amount_minor: amountMinor.toString(),
            currency: 'XXX',
          },
        ]),
      );
    const recordId = imported.body.records[0].id;
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/settlement-imports/${imported.body.id}/match`)
      .set('Authorization', `Bearer ${adminToken}`);
    const before = await prisma.journal.count({
      where: { sourceEventId: `psp_settlement:${recordId}`, postingRuleId: 'psp_settlement_match' },
    });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/settlement-imports/${imported.body.id}/match`)
      .set('Authorization', `Bearer ${adminToken}`);
    const after = await prisma.journal.count({
      where: { sourceEventId: `psp_settlement:${recordId}`, postingRuleId: 'psp_settlement_match' },
    });
    expect(before).toBe(1);
    expect(after).toBe(1);
  });

  it('F: PARTIAL classification when settlement amount differs', async () => {
    const { providerRef, amountMinor } = await seedCapturedPayment(1000n);
    const imported = await request(app.getHttpServer())
      .post('/api/v1/admin/finance/settlement-imports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(
        await importBody(`batch-f-${Date.now()}`, `idem-f-${Date.now()}`, [
          {
            external_record_ref: `rec-f-${Date.now()}`,
            provider_payment_ref: providerRef,
            amount_minor: (amountMinor - 100n).toString(),
            currency: 'XXX',
          },
        ]),
      );
    const matched = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/settlement-imports/${imported.body.id}/match`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(matched.body.records[0].classification).toBe(SettlementMatchClassification.PARTIAL);
    expect(matched.body.records[0].status).toBe(SettlementImportRecordStatus.PARTIAL);
  });

  it('G: UNMATCHED classification when provider ref unknown', async () => {
    const imported = await request(app.getHttpServer())
      .post('/api/v1/admin/finance/settlement-imports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(
        await importBody(`batch-g-${Date.now()}`, `idem-g-${Date.now()}`, [
          {
            external_record_ref: `rec-g-${Date.now()}`,
            provider_payment_ref: 'mock_missing_ref',
            amount_minor: '1000',
            currency: 'XXX',
          },
        ]),
      );
    const matched = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/settlement-imports/${imported.body.id}/match`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(matched.body.records[0].classification).toBe(SettlementMatchClassification.UNMATCHED);
  });

  it('H: DUPLICATE classification when match re-run on posted record', async () => {
    const { providerRef, amountMinor } = await seedCapturedPayment();
    const imported = await request(app.getHttpServer())
      .post('/api/v1/admin/finance/settlement-imports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(
        await importBody(`batch-h-${Date.now()}`, `idem-h-${Date.now()}`, [
          {
            external_record_ref: `rec-h-${Date.now()}`,
            provider_payment_ref: providerRef,
            amount_minor: amountMinor.toString(),
            currency: 'XXX',
          },
        ]),
      );
    const first = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/settlement-imports/${imported.body.id}/match`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(first.body.records[0].status).toBe(SettlementImportRecordStatus.POSTED);
    const second = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/settlement-imports/${imported.body.id}/match`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(second.body.records[0].status).toBe(SettlementImportRecordStatus.POSTED);
    expect(second.body.records[0].classification).toBe(SettlementMatchClassification.MATCH);
  });

  it('I: INVALID settlement record during normalization', async () => {
    const imported = await request(app.getHttpServer())
      .post('/api/v1/admin/finance/settlement-imports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(
        await importBody(`batch-i-${Date.now()}`, `idem-i-${Date.now()}`, [
          {
            external_record_ref: `rec-i-${Date.now()}`,
            provider_payment_ref: 'mock-x',
            amount_minor: '-1',
            currency: 'XXX',
          },
        ]),
      );
    expect(imported.body.records[0].classification).toBe(SettlementMatchClassification.INVALID);
  });

  it('J: cross-country payment ref is blocked as INVALID', async () => {
    const { providerRef, amountMinor } = await seedCapturedPayment(1000n, countryId);
    const imported = await request(app.getHttpServer())
      .post('/api/v1/admin/finance/settlement-imports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(
        await importBody(
          `batch-j-${Date.now()}`,
          `idem-j-${Date.now()}`,
          [
            {
              external_record_ref: `rec-j-${Date.now()}`,
              provider_payment_ref: providerRef,
              amount_minor: amountMinor.toString(),
              currency: 'XXX',
            },
          ],
          otherCountryId,
          'SJ',
        ),
      );
    const matched = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/settlement-imports/${imported.body.id}/match`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(matched.body.records[0].classification).toBe(SettlementMatchClassification.INVALID);
  });

  it('K: unregistered provider fails closed', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/finance/settlement-imports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        country_id: countryId,
        country_iso2: countryIso2,
        provider_code: 'STRIPE_LIVE',
        external_batch_ref: `batch-k-${Date.now()}`,
        idempotency_key: `idem-k-${Date.now()}`,
        currency: 'XXX',
        records: [],
      });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SETTLEMENT_PROVIDER_NOT_CONFIGURED');
  });

  it('L: transient import failure does not stage financial records', async () => {
    const batchRef = `batch-l-${Date.now()}`;
    mockSettlement.armTransientFailure(batchRef);
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/finance/settlement-imports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        country_id: countryId,
        country_iso2: countryIso2,
        provider_code: 'MOCK_SETTLEMENT',
        external_batch_ref: batchRef,
        idempotency_key: `idem-l-${Date.now()}`,
        currency: 'XXX',
        fetch_from_provider: true,
        records: [],
      });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SETTLEMENT_IMPORT_TRANSIENT');
    expect(await prisma.settlementImportBatch.count({ where: { externalBatchRef: batchRef } })).toBe(0);
    mockSettlement.clearTransientFailure(batchRef);
  });

  it('production MOCK settlement provider is forbidden', () => {
    const registry = app.get(SettlementImportRegistry);
    expect(() => registry.resolve('MOCK_SETTLEMENT', 'production')).toThrow(ProblemException);
    try {
      registry.resolve('MOCK_SETTLEMENT', 'production');
    } catch (err) {
      expect((err as ProblemException).code).toBe('MOCK_SETTLEMENT_PRODUCTION_FORBIDDEN');
    }
  });

  it('lists settlement import batches for admin observability', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/admin/finance/settlement-imports?limit=5')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.sandbox).toBe(true);
    expect(Array.isArray(list.body.data)).toBe(true);
  });
});
