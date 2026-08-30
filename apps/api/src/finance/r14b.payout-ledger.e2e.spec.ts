import { INestApplication } from '@nestjs/common';
import {
  OfferOwnership,
  OfferStatus,
  OrganizationKind,
  PaymentIntentStatus,
  PaymentMethodFamily,
  PayoutStatus,
  PolicyPackStatus,
  SettlementBatchStatus,
  VendorPayableStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { Errors } from '../common/problem';
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

describe('R14-B payout execution ledger (e2e)', () => {
  jest.setTimeout(120_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let finance: FinanceService;
  let countryId: string;
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
            checksum: `pl-${iso2}`,
            publishedAt: new Date(),
          },
        });
        await prisma.country.update({ where: { id: country.id }, data: { publishedPolicyPackId: pack.id } });
      }
      await finance.ensureChart(country.id);
      return country;
    }

    countryId = (await ensureCountry('PL', 'PLX', 'Payout ledger')).id;
    otherCountryId = (await ensureCountry('PJ', 'PJX', 'Payout other')).id;

    const admin = await signIn(app, `pl-admin-${Date.now()}@example.com`, 'admin');
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

  async function seedMarketplaceOrder(amountMinor = 1000n, country = countryId) {
    const seller = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country,
        kind: OrganizationKind.VENDOR,
        legalName: `PL Vendor ${Date.now()}`,
        displayName: 'PL Vendor',
        status: 'ACTIVE',
      },
    });
    await prisma.commercialRule.create({
      data: {
        id: uuidv7(),
        countryId: country,
        sellerOrgId: seller.id,
        takeBps: 1200,
        takeFlatMinor: 0n,
        priority: 10,
        validFrom: new Date(),
      },
    });
    const brand = await prisma.catalogBrand.create({
      data: { id: uuidv7(), slug: `pl-b-${Date.now()}`, name: 'PLBrand' },
    });
    const item = await prisma.catalogItem.create({
      data: {
        id: uuidv7(),
        slug: `pl-i-${Date.now()}`,
        kind: 'OTC',
        brandId: brand.id,
        createdByOrgId: seller.id,
        status: 'PUBLISHED',
      },
    });
    const variant = await prisma.catalogVariant.create({
      data: { id: uuidv7(), itemId: item.id, skuCode: `PL-${Date.now()}`, packSize: '1' },
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
    await prisma.priceVersion.create({
      data: {
        id: uuidv7(),
        offerId: offer.id,
        version: 1,
        currency: 'XXX',
        costMinor: 400n,
        sellMinor: amountMinor,
        validFrom: new Date(),
        isCurrent: true,
      },
    });
    const customer = await signIn(app, `pl-c-${Date.now()}@example.com`);
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: seller.id,
        countryId: country,
        kind: 'VENDOR_WAREHOUSE',
        name: 'PL WH',
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
        idempotencyKey: `pl-co-${Date.now()}`,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const quote = await prisma.checkoutQuote.create({
      data: {
        id: uuidv7(),
        sessionId: checkout.id,
        fingerprint: 'pl',
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
        idempotencyKey: `pl-pay-${Date.now()}`,
      },
    });
    const order = await prisma.order.create({
      data: {
        id: uuidv7(),
        orderNumber: `PL-${Date.now()}`,
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
        sku: 'PL-SKU',
        title: 'PL item',
        qty: 1,
        unitMinor: amountMinor,
        lineMinor: amountMinor,
        currency: 'XXX',
      },
    });
    const group = await prisma.fulfillmentGroup.create({
      data: { id: uuidv7(), orderId: order.id, locationId: location.id },
    });
    await prisma.shipment.create({
      data: {
        id: uuidv7(),
        orderId: order.id,
        groupId: group.id,
        locationId: location.id,
        sellerOrgId: seller.id,
        countryId: country,
        customerPersonId: customer.personId,
        status: 'LABEL_CREATED',
        currency: 'XXX',
      },
    });
    await finance.syncOrder(order.id);
    const payable = await prisma.vendorPayable.findUniqueOrThrow({ where: { orderId: order.id } });
    await finance.transitionPayable(payable.id, VendorPayableStatus.ELIGIBLE);
    await finance.transitionPayable(payable.id, VendorPayableStatus.APPROVED);
    return { order, payable, seller, amountMinor };
  }

  async function createApprovedPayout(
    scenario: 'SUCCESS' | 'FAILURE' | 'UNKNOWN' = 'SUCCESS',
    amountMinor = 880n,
  ) {
    await seedMarketplaceOrder(amountMinor);
    const batch = await finance.openSettlement({ personId: adminPersonId } as never, countryId, 'XXX');
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/settlements/${batch.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    const key = `pl-payout-${Date.now()}-${Math.random()}`;
    const created = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/settlements/${batch.id}/payouts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: key, scenario });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/payouts/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    return { batch, payoutId: created.body.id as string, idempotencyKey: key };
  }

  function journalCountForPayout(payoutId: string) {
    return prisma.journal.count({
      where: { sourceEventId: `payout:${payoutId}`, postingRuleId: 'vendor_payout_paid' },
    });
  }

  it('A: sandbox payout created', async () => {
    const { payoutId } = await createApprovedPayout();
    const row = await prisma.payout.findUniqueOrThrow({ where: { id: payoutId } });
    expect(row.status).toBe(PayoutStatus.APPROVED);
    expect(row.sandbox).toBe(true);
  });

  it('B: payout → PAID', async () => {
    const { payoutId } = await createApprovedPayout();
    const executed = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/payouts/${payoutId}/execute`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(executed.status).toBe(201);
    expect(executed.body.status).toBe(PayoutStatus.PAID);
    expect(executed.body.ledger_posting_status).toBe('POSTED');
  });

  it('C: PAID → exactly one AP→clearing journal', async () => {
    const { payoutId } = await createApprovedPayout();
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/payouts/${payoutId}/execute`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(await journalCountForPayout(payoutId)).toBe(1);
    const journal = await prisma.journal.findUniqueOrThrow({
      where: {
        sourceEventId_postingRuleId: { sourceEventId: `payout:${payoutId}`, postingRuleId: 'vendor_payout_paid' },
      },
      include: { lines: { include: { account: true } } },
    });
    const ap = journal.lines.find((l) => l.account.code === 'AP_VENDOR');
    const clearing = journal.lines.find((l) => l.account.code === 'AST_GATEWAY_CLEARING');
    expect(ap?.dc).toBe('DEBIT');
    expect(clearing?.dc).toBe('CREDIT');
    expect(ap?.amountMinor).toBe(clearing?.amountMinor);
  });

  it('D: duplicate PAID execute → no duplicate journal', async () => {
    const { payoutId } = await createApprovedPayout();
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/payouts/${payoutId}/execute`)
      .set('Authorization', `Bearer ${adminToken}`);
    const replay = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/payouts/${payoutId}/execute`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(replay.body.ledger_duplicate).toBe(true);
    expect(await journalCountForPayout(payoutId)).toBe(1);
  });

  it('E: duplicate payout submit → idempotent', async () => {
    const { batch, payoutId, idempotencyKey } = await createApprovedPayout();
    const dup = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/settlements/${batch.id}/payouts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: idempotencyKey, scenario: 'SUCCESS' });
    expect(dup.body.id).toBe(payoutId);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/payouts/${payoutId}/execute`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(await journalCountForPayout(payoutId)).toBe(1);
  });

  it('F: FAILED payout → no PAID journal', async () => {
    const { payoutId } = await createApprovedPayout('FAILURE');
    const executed = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/payouts/${payoutId}/execute`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(executed.body.status).toBe(PayoutStatus.FAILED);
    expect(executed.body.ledger_posting_status).toBe('NOT_APPLICABLE');
    expect(await journalCountForPayout(payoutId)).toBe(0);
  });

  it('G: CANCELLED batch → no PAID journal', async () => {
    const { batch, payoutId } = await createApprovedPayout();
    await prisma.settlementBatch.update({
      where: { id: batch.id },
      data: { status: SettlementBatchStatus.CANCELLED },
    });
    const executed = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/payouts/${payoutId}/execute`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(executed.status).toBe(409);
    expect((await prisma.payout.findUniqueOrThrow({ where: { id: payoutId } })).status).toBe(PayoutStatus.APPROVED);
    expect(await journalCountForPayout(payoutId)).toBe(0);
  });

  it('H: invalid payout reference → safe failure', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/payouts/${uuidv7()}/execute`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('I: country mismatch → blocked', async () => {
    const { payable } = await seedMarketplaceOrder(880n, countryId);
    const batch = await finance.openSettlement({ personId: adminPersonId } as never, countryId, 'XXX');
    await prisma.vendorPayable.update({
      where: { id: payable.id },
      data: { countryId: otherCountryId },
    });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/settlements/${batch.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    const created = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/settlements/${batch.id}/payouts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: `pl-mismatch-${Date.now()}`, scenario: 'SUCCESS' });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/payouts/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    const executed = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/payouts/${created.body.id}/execute`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(executed.status).toBe(409);
    expect(executed.body.code).toBe('PAYOUT_COUNTRY_MISMATCH');
    expect(await journalCountForPayout(created.body.id)).toBe(0);
  });

  it('J: ledger posting failure → fail closed', async () => {
    const { payoutId } = await createApprovedPayout();
    const spy = jest.spyOn(finance, 'postVendorPayoutPaidJournal').mockRejectedValueOnce(
      Errors.problem(
        503,
        'PAYOUT_LEDGER_POST_FAILED',
        'Payout ledger posting failed',
        'Simulated ledger failure.',
      ),
    );
    const executed = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/payouts/${payoutId}/execute`)
      .set('Authorization', `Bearer ${adminToken}`);
    spy.mockRestore();
    expect(executed.status).toBe(503);
    expect((await prisma.payout.findUniqueOrThrow({ where: { id: payoutId } })).status).toBe(PayoutStatus.APPROVED);
    expect(await journalCountForPayout(payoutId)).toBe(0);
  });

  it('K: replay after successful ledger posting → no financial mutation', async () => {
    const { payoutId } = await createApprovedPayout();
    const first = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/payouts/${payoutId}/execute`)
      .set('Authorization', `Bearer ${adminToken}`);
    const journalId = first.body.journal_id as string;
    const replay = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/payouts/${payoutId}/execute`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(replay.body.journal_id).toBe(journalId);
    expect(replay.body.ledger_duplicate).toBe(true);
    expect(await journalCountForPayout(payoutId)).toBe(1);
    expect(await prisma.journalLine.count({ where: { journalId } })).toBe(2);
  });

  it('L: amount/currency invariants preserved', async () => {
    const { payoutId } = await createApprovedPayout('SUCCESS', 1000n);
    const executed = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/payouts/${payoutId}/execute`)
      .set('Authorization', `Bearer ${adminToken}`);
    const payoutAmount = BigInt(executed.body.amount_minor as string);
    expect(executed.body.currency).toBe('XXX');
    const journal = await prisma.journal.findUniqueOrThrow({
      where: {
        sourceEventId_postingRuleId: { sourceEventId: `payout:${payoutId}`, postingRuleId: 'vendor_payout_paid' },
      },
      include: { lines: true },
    });
    expect(journal.currency).toBe('XXX');
    for (const line of journal.lines) {
      expect(line.amountMinor).toBe(payoutAmount);
      expect(line.currency).toBe('XXX');
    }
  });
});
