import { INestApplication } from '@nestjs/common';
import {
  FinanceReconDomain,
  FinanceReconSourceKind,
  FinanceReconWorkflowStatus,
  OfferOwnership,
  OfferStatus,
  OrganizationKind,
  PaymentAttemptStatus,
  PaymentIntentStatus,
  PaymentMethodFamily,
  PayoutStatus,
  PolicyPackStatus,
  SettlementMatchClassification,
  VendorPayableStatus,
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

async function signIn(app: INestApplication, email: string, audience: 'admin' | 'customer' = 'customer') {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

describe('R14-B reconciliation break workflow (e2e)', () => {
  jest.setTimeout(180_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let finance: FinanceService;
  let countryId: string;
  let otherCountryId: string;
  let adminToken: string;
  let adminPersonId: string;
  let countryIso2 = 'BK';

  beforeAll(async () => {
    applyTestIsolation();
    process.env['NODE_ENV'] = 'test';
    process.env['AUTH_DEV_REVEAL_OTP'] = 'true';
    process.env['JWT_ACCESS_SECRET'] =
      process.env['JWT_ACCESS_SECRET'] ?? 'test-access-secret-must-be-32-chars-min';
    process.env['OTP_PEPPER'] =
      process.env['OTP_PEPPER'] ?? 'test-otp-pepper-must-be-32-chars-minx';
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
            checksum: `bk-${iso2}`,
            publishedAt: new Date(),
          },
        });
        await prisma.country.update({ where: { id: country.id }, data: { publishedPolicyPackId: pack.id } });
      }
      await finance.ensureChart(country.id);
      return country;
    }

    countryId = (await ensureCountry(countryIso2, 'BKX', 'Break workflow')).id;
    otherCountryId = (await ensureCountry('BJ', 'BJX', 'Break other')).id;

    const admin = await signIn(app, `bk-admin-${Date.now()}@example.com`, 'admin');
    adminToken = admin.token;
    adminPersonId = admin.personId;
    const role = await prisma.role.findUnique({ where: { code: 'super_admin' } });
    await prisma.membership.create({
      data: { id: uuidv7(), personId: admin.personId, roleId: role!.id, scope: 'platform', status: 'ACTIVE' },
    });
    await prisma.settlementPolicy.upsert({
      where: { countryId },
      create: { id: uuidv7(), countryId, holdDays: 0, dualControl: false },
      update: { dualControl: false },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  async function importBody(batchRef: string, idem: string, records: Array<Record<string, string>>, country = countryId) {
    return {
      country_id: country,
      country_iso2: country === countryId ? countryIso2 : 'BJ',
      provider_code: 'MOCK_SETTLEMENT',
      external_batch_ref: batchRef,
      idempotency_key: idem,
      currency: 'XXX',
      records,
    };
  }

  async function seedCapturedPayment(amountMinor = 1000n) {
    const seller = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.VENDOR,
        legalName: `BK Vendor ${Date.now()}`,
        displayName: 'BK Vendor',
        status: 'ACTIVE',
      },
    });
    const customer = await signIn(app, `bk-c-${Date.now()}@example.com`);
    const checkout = await prisma.checkoutSession.create({
      data: {
        id: uuidv7(),
        customerPersonId: customer.personId,
        countryId,
        cartId: (
          await prisma.cart.create({
            data: {
              id: uuidv7(),
              customerPersonId: customer.personId,
              countryId,
              sellerOrgId: seller.id,
            },
          })
        ).id,
        sellerOrgId: seller.id,
        status: 'PAID',
        idempotencyKey: `bk-co-${Date.now()}`,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const quote = await prisma.checkoutQuote.create({
      data: {
        id: uuidv7(),
        sessionId: checkout.id,
        fingerprint: 'bk',
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
        countryId,
        method: PaymentMethodFamily.CARD,
        status: PaymentIntentStatus.CAPTURED,
        amountMinor,
        capturedMinor: amountMinor,
        currency: 'XXX',
        idempotencyKey: `bk-pay-${Date.now()}`,
      },
    });
    const providerRef = `mock-bk-${Date.now()}`;
    const gateway = await prisma.paymentGateway.findUniqueOrThrow({ where: { code: 'MOCK_PRIMARY' } });
    await prisma.paymentAttempt.create({
      data: {
        id: uuidv7(),
        intentId: intent.id,
        gatewayId: gateway.id,
        method: PaymentMethodFamily.CARD,
        status: PaymentAttemptStatus.SUCCEEDED,
        submitted: true,
        providerRef,
        routingJson: { gateway_code: 'MOCK_PRIMARY', gateway_environment: 'sandbox' },
      },
    });
    return { providerRef, amountMinor };
  }

  async function latestBreak(where: {
    classification?: string;
    breakType?: string;
    domain?: FinanceReconDomain;
  }) {
    const row = await prisma.financeReconciliation.findFirst({
      where: {
        countryId,
        classification: where.classification,
        breakType: where.breakType,
        domain: where.domain,
        workflowStatus: { not: FinanceReconWorkflowStatus.CLOSED },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(row?.id).toBeTruthy();
    return row!.id;
  }

  async function createUnmatchedBreak() {
    const stamp = Date.now();
    const imported = await request(app.getHttpServer())
      .post('/api/v1/admin/finance/settlement-imports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(
        await importBody(`batch-a-${stamp}`, `idem-a-${stamp}`, [
          {
            external_record_ref: `rec-a-${stamp}`,
            provider_payment_ref: `missing-${stamp}`,
            amount_minor: '1000',
            currency: 'XXX',
          },
        ]),
      );
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/settlement-imports/${imported.body.id}/match`)
      .set('Authorization', `Bearer ${adminToken}`);
    return latestBreak({ classification: SettlementMatchClassification.UNMATCHED, breakType: 'unmatched_provider_ref' });
  }

  async function createPartialBreak() {
    const stamp = Date.now();
    const { providerRef, amountMinor } = await seedCapturedPayment(1000n);
    const imported = await request(app.getHttpServer())
      .post('/api/v1/admin/finance/settlement-imports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(
        await importBody(`batch-b-${stamp}`, `idem-b-${stamp}`, [
          {
            external_record_ref: `rec-b-${stamp}`,
            provider_payment_ref: providerRef,
            amount_minor: (amountMinor - 100n).toString(),
            currency: 'XXX',
          },
        ]),
      );
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/settlement-imports/${imported.body.id}/match`)
      .set('Authorization', `Bearer ${adminToken}`);
    return latestBreak({ classification: SettlementMatchClassification.PARTIAL, breakType: 'partial_amount' });
  }

  async function createUnknownPayoutBreak() {
    const seller = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.VENDOR,
        legalName: `BK Pay ${Date.now()}`,
        displayName: 'BK Pay',
        status: 'ACTIVE',
      },
    });
    await prisma.commercialRule.create({
      data: {
        id: uuidv7(),
        countryId,
        sellerOrgId: seller.id,
        takeBps: 1200,
        takeFlatMinor: 0n,
        priority: 10,
        validFrom: new Date(),
      },
    });
    const brand = await prisma.catalogBrand.create({ data: { id: uuidv7(), slug: `bkpb-${Date.now()}`, name: 'BKB' } });
    const item = await prisma.catalogItem.create({
      data: {
        id: uuidv7(),
        slug: `bkpi-${Date.now()}`,
        kind: 'OTC',
        brandId: brand.id,
        createdByOrgId: seller.id,
        status: 'PUBLISHED',
      },
    });
    const variant = await prisma.catalogVariant.create({
      data: { id: uuidv7(), itemId: item.id, skuCode: `BKP-${Date.now()}`, packSize: '1' },
    });
    const offer = await prisma.catalogOffer.create({
      data: {
        id: uuidv7(),
        variantId: variant.id,
        sellerOrgId: seller.id,
        countryId,
        ownership: OfferOwnership.VENDOR_OWNED,
        status: OfferStatus.PUBLISHED,
        currency: 'XXX',
      },
    });
    await prisma.priceVersion.create({
      data: {
        id: uuidv7(),
        offerId: offer.id,
        version: 1,
        currency: 'XXX',
        costMinor: 400n,
        sellMinor: 1000n,
        validFrom: new Date(),
        isCurrent: true,
      },
    });
    const customer = await signIn(app, `bkpc-${Date.now()}@example.com`);
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: seller.id,
        countryId,
        kind: 'VENDOR_WAREHOUSE',
        name: 'BK WH',
        timezone: 'UTC',
      },
    });
    const checkout = await prisma.checkoutSession.create({
      data: {
        id: uuidv7(),
        customerPersonId: customer.personId,
        countryId,
        cartId: (
          await prisma.cart.create({
            data: {
              id: uuidv7(),
              customerPersonId: customer.personId,
              countryId,
              sellerOrgId: seller.id,
            },
          })
        ).id,
        sellerOrgId: seller.id,
        status: 'PAID',
        idempotencyKey: `bkpco-${Date.now()}`,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const quote = await prisma.checkoutQuote.create({
      data: {
        id: uuidv7(),
        sessionId: checkout.id,
        fingerprint: 'bkp',
        currency: 'XXX',
        sellMinor: 1000n,
        totalMinor: 1000n,
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
        countryId,
        method: PaymentMethodFamily.CARD,
        status: PaymentIntentStatus.CAPTURED,
        amountMinor: 1000n,
        capturedMinor: 1000n,
        currency: 'XXX',
        idempotencyKey: `bkpp-${Date.now()}`,
      },
    });
    const order = await prisma.order.create({
      data: {
        id: uuidv7(),
        orderNumber: `BKP-${Date.now()}`,
        customerPersonId: customer.personId,
        sellerOrgId: seller.id,
        countryId,
        checkoutSessionId: checkout.id,
        checkoutQuoteId: quote.id,
        paymentIntentId: intent.id,
        fulfillingLocationId: location.id,
        currency: 'XXX',
        goodsMinor: 1000n,
        totalMinor: 1000n,
      },
    });
    await prisma.orderItem.create({
      data: {
        id: uuidv7(),
        orderId: order.id,
        offerId: offer.id,
        variantId: variant.id,
        sku: 'BKP',
        title: 'BKP',
        qty: 1,
        unitMinor: 1000n,
        lineMinor: 1000n,
        currency: 'XXX',
      },
    });
    await prisma.fulfillmentGroup.create({
      data: { id: uuidv7(), orderId: order.id, locationId: location.id },
    });
    await prisma.shipment.create({
      data: {
        id: uuidv7(),
        orderId: order.id,
        groupId: (await prisma.fulfillmentGroup.findFirstOrThrow({ where: { orderId: order.id } })).id,
        locationId: location.id,
        sellerOrgId: seller.id,
        countryId,
        customerPersonId: customer.personId,
        status: 'LABEL_CREATED',
        currency: 'XXX',
      },
    });
    await finance.syncOrder(order.id);
    const payable = await prisma.vendorPayable.findUniqueOrThrow({ where: { orderId: order.id } });
    await finance.transitionPayable(payable.id, VendorPayableStatus.ELIGIBLE);
    await finance.transitionPayable(payable.id, VendorPayableStatus.APPROVED);
    const batch = await finance.openSettlement({ personId: adminPersonId } as never, countryId, 'XXX');
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/settlements/${batch.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    const created = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/settlements/${batch.id}/payouts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: `bk-payout-${Date.now()}`, scenario: 'UNKNOWN' });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/payouts/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/payouts/${created.body.id}/execute`)
      .set('Authorization', `Bearer ${adminToken}`);
    const queue = await request(app.getHttpServer())
      .get('/api/v1/admin/finance/breaks?domain=PAYOUT')
      .set('Authorization', `Bearer ${adminToken}`);
    const breakRow = (queue.body.data as Array<{ id: string; source_ref: string }>).find(
      (row) => row.source_ref === created.body.id,
    );
    expect(breakRow?.id).toBeTruthy();
    return { breakId: breakRow!.id, payoutId: created.body.id as string };
  }

  it('A: UNMATCHED settlement appears in break queue', async () => {
    const breakId = await createUnmatchedBreak();
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/finance/breaks/${breakId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.body.classification).toBe(SettlementMatchClassification.UNMATCHED);
    expect(detail.body.workflow_status).toBe(FinanceReconWorkflowStatus.OPEN);
  });

  it('B: PARTIAL settlement appears in break queue', async () => {
    const breakId = await createPartialBreak();
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/finance/breaks/${breakId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.body.classification).toBe(SettlementMatchClassification.PARTIAL);
  });

  it('C: payout UNKNOWN appears in break queue', async () => {
    const { breakId } = await createUnknownPayoutBreak();
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/finance/breaks/${breakId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.body.domain).toBe(FinanceReconDomain.PAYOUT);
    expect(detail.body.source_kind).toBe(FinanceReconSourceKind.PAYOUT);
  });

  it('D: OPEN → INVESTIGATING', async () => {
    const breakId = await createUnmatchedBreak();
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/breaks/${breakId}/investigate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: `inv-d-${Date.now()}`, note: 'checking refs' });
    expect(res.body.workflow_status).toBe(FinanceReconWorkflowStatus.INVESTIGATING);
  });

  it('E: INVESTIGATING → RESOLVED', async () => {
    const breakId = await createUnmatchedBreak();
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/breaks/${breakId}/investigate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: `inv-e-${Date.now()}` });
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/breaks/${breakId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: `res-e-${Date.now()}`, note: 'manual match confirmed offline' });
    expect(res.body.workflow_status).toBe(FinanceReconWorkflowStatus.RESOLVED);
  });

  it('F: RESOLVED → CLOSED', async () => {
    const breakId = await createUnmatchedBreak();
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/breaks/${breakId}/investigate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: `inv-f-${Date.now()}` });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/breaks/${breakId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: `res-f-${Date.now()}` });
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/breaks/${breakId}/close`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: `close-f-${Date.now()}` });
    expect(res.body.workflow_status).toBe(FinanceReconWorkflowStatus.CLOSED);
  });

  it('G: illegal transition rejected', async () => {
    const breakId = await createUnmatchedBreak();
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/breaks/${breakId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: `bad-g-${Date.now()}` });
    expect(res.status).toBe(409);
  });

  it('H: duplicate investigate is idempotent', async () => {
    const breakId = await createUnmatchedBreak();
    const key = `dup-h-${Date.now()}`;
    const first = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/breaks/${breakId}/investigate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: key });
    const second = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/breaks/${breakId}/investigate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: key });
    expect(second.body.id).toBe(first.body.id);
    expect(await prisma.financeReconBreakAction.count({ where: { reconId: breakId, action: 'INVESTIGATE' } })).toBe(1);
  });

  it('I: duplicate resolve is idempotent', async () => {
    const breakId = await createUnmatchedBreak();
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/breaks/${breakId}/investigate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: `inv-i-${Date.now()}` });
    const key = `dup-i-${Date.now()}`;
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/breaks/${breakId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: key });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/breaks/${breakId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: key });
    expect(await prisma.financeReconBreakAction.count({ where: { reconId: breakId, action: 'RESOLVE' } })).toBe(1);
  });

  it('J: duplicate close is idempotent', async () => {
    const breakId = await createUnmatchedBreak();
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/breaks/${breakId}/investigate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: `inv-j-${Date.now()}` });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/breaks/${breakId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: `res-j-${Date.now()}` });
    const key = `dup-j-${Date.now()}`;
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/breaks/${breakId}/close`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: key });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/breaks/${breakId}/close`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: key });
    expect(await prisma.financeReconBreakAction.count({ where: { reconId: breakId, action: 'CLOSE' } })).toBe(1);
  });

  it('K: resolution does not duplicate journal entries', async () => {
    const breakId = await createPartialBreak();
    const before = await prisma.journal.count();
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/breaks/${breakId}/investigate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: `inv-k-${Date.now()}` });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/breaks/${breakId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: `res-k-${Date.now()}` });
    expect(await prisma.journal.count()).toBe(before);
  });

  it('L: tenant isolation via country-scoped membership', async () => {
    const breakId = await createUnmatchedBreak();
    const scopedAdmin = await signIn(app, `bk-scoped-${Date.now()}@example.com`, 'admin');
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
      .get(`/api/v1/admin/finance/breaks/${breakId}`)
      .set('Authorization', `Bearer ${scopedAdmin.token}`);
    expect(res.status).toBe(403);
  });

  it('M: country filter on break list', async () => {
    await createUnmatchedBreak();
    const scopedAdmin = await signIn(app, `bk-country-${Date.now()}@example.com`, 'admin');
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
      .get(`/api/v1/admin/finance/breaks?country_id=${countryId}`)
      .set('Authorization', `Bearer ${scopedAdmin.token}`);
    expect(res.status).toBe(403);
  });

  it('N: unauthorized admin access → 403', async () => {
    const customer = await signIn(app, `bk-noauth-${Date.now()}@example.com`, 'customer');
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/finance/breaks')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(res.status).toBe(403);
  });

  it('O: invalid/nonexistent break → 404', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/finance/breaks/${uuidv7()}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('P: replay of resolution event → no duplicate financial side effect', async () => {
    const breakId = await createPartialBreak();
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/breaks/${breakId}/investigate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: `inv-p-${Date.now()}` });
    const key = `res-p-${Date.now()}`;
    const before = await prisma.journal.count();
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/breaks/${breakId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: key, note: 'accepted variance' });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/breaks/${breakId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: key, note: 'accepted variance' });
    expect(await prisma.journal.count()).toBe(before);
  });

  it('Q: audit trail contains safe metadata', async () => {
    const breakId = await createUnmatchedBreak();
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/breaks/${breakId}/investigate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: `inv-q-${Date.now()}`, note: 'reviewing provider ref' });
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/finance/breaks/${breakId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.body.actions.length).toBeGreaterThan(0);
    expect(JSON.stringify(detail.body)).not.toMatch(/cvv|pan|secret|password/i);
  });

  it('R: unresolved break remains visible', async () => {
    const breakId = await createUnmatchedBreak();
    const list = await request(app.getHttpServer())
      .get('/api/v1/admin/finance/breaks')
      .set('Authorization', `Bearer ${adminToken}`);
    expect((list.body.data as Array<{ id: string }>).some((row) => row.id === breakId)).toBe(true);
  });

  it('S: UNKNOWN payout cannot become PAID merely by resolving break', async () => {
    const { breakId, payoutId } = await createUnknownPayoutBreak();
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/breaks/${breakId}/investigate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: `inv-s-${Date.now()}` });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/breaks/${breakId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: `res-s-${Date.now()}`, note: 'still unknown at provider' });
    expect((await prisma.payout.findUniqueOrThrow({ where: { id: payoutId } })).status).toBe(PayoutStatus.UNKNOWN);
    expect(await prisma.journal.count({
      where: { postingRuleId: 'vendor_payout_paid', sourceEventId: `payout:${payoutId}` },
    })).toBe(0);
  });
});
