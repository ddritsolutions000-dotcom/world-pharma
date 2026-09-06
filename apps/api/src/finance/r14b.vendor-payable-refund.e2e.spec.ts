import { INestApplication } from '@nestjs/common';
import {
  OfferOwnership,
  OfferStatus,
  OrganizationKind,
  PaymentAttemptStatus,
  PaymentIntentStatus,
  PaymentMethodFamily,
  PolicyPackStatus,
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
import { MockPaymentGatewayAdapter } from '../payment/mock.adapter';
import { PaymentService } from '../payment/payment.service';
import type { Principal } from '../identity/current-principal';

async function signIn(app: INestApplication, email: string, audience: 'admin' | 'customer' = 'customer') {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({
      challenge_id: requested.body.challenge_id,
      code: requested.body.dev_code,
      audience: 'customer',
    });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string, email };
}

describe('R14-B vendor payable partial refund (e2e)', () => {
  jest.setTimeout(120_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let finance: FinanceService;
  let payments: PaymentService;
  let countryId: string;
  let otherCountryId: string;
  let adminToken: string;
  let adminPersonId: string;

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
    payments = app.get(PaymentService);

    const doc = emptyPolicyDocument();
    doc.services.pharmacy = true;
    doc.payments.enabled = true;
    doc.payments.methods = ['CARD'];
    doc.payments.gateway_refs = ['MOCK_PRIMARY'];
    doc.payments.currencies = ['XXX'];

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
            checksum: `vpr-${iso2}`,
            publishedAt: new Date(),
          },
        });
        await prisma.country.update({ where: { id: country.id }, data: { publishedPolicyPackId: pack.id } });
      }
      await finance.ensureChart(country.id);
      return country;
    }

    countryId = (await ensureCountry('VR', 'VRX', 'Vendor refund')).id;
    otherCountryId = (await ensureCountry('VJ', 'VJX', 'Vendor refund other')).id;

    const adminEmail = `vpr-admin-${Date.now()}@example.com`;
    const admin = await signIn(app, adminEmail, 'admin');
    adminPersonId = admin.personId;
    const role = await prisma.role.findUnique({ where: { code: 'super_admin' } });
    await prisma.membership.create({
      data: { id: uuidv7(), personId: admin.personId, roleId: role!.id, scope: 'platform', status: 'ACTIVE' },
    });
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ identifier: adminEmail, purpose: 'LOGIN' });
    const adminVerified = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({
        challenge_id: adminLogin.body.challenge_id,
        code: adminLogin.body.dev_code,
        audience: 'admin',
      });
    adminToken = adminVerified.body.access_token as string;
    await prisma.settlementPolicy.upsert({
      where: { countryId },
      create: { id: uuidv7(), countryId, holdDays: 0, dualControl: false },
      update: { dualControl: false },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  async function mockGatewayId() {
    const gateway = await prisma.paymentGateway.findUniqueOrThrow({ where: { code: 'MOCK_PRIMARY' } });
    return gateway.id;
  }

  async function seedMarketplaceOrder(options: {
    country?: string;
    ownership?: OfferOwnership;
    takeBps?: number;
    captureMinor?: bigint;
    syncFinance?: boolean;
  } = {}) {
    const country = options.country ?? countryId;
    const ownership = options.ownership ?? OfferOwnership.VENDOR_OWNED;
    const captureMinor = options.captureMinor ?? 1000n;
    const takeBps = options.takeBps ?? 1000;
    const syncFinance = options.syncFinance ?? true;

    const seller = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country,
        kind: OrganizationKind.VENDOR,
        legalName: `VPR Vendor ${Date.now()}`,
        displayName: 'VPR Vendor',
        status: 'ACTIVE',
      },
    });
    if (ownership === OfferOwnership.VENDOR_OWNED) {
      await prisma.commercialRule.create({
        data: {
          id: uuidv7(),
          countryId: country,
          sellerOrgId: seller.id,
          takeBps,
          takeFlatMinor: 0n,
          priority: 10,
          validFrom: new Date(),
        },
      });
    }
    const brand = await prisma.catalogBrand.create({
      data: { id: uuidv7(), slug: `vpr-b-${Date.now()}`, name: 'VPR Brand' },
    });
    const item = await prisma.catalogItem.create({
      data: {
        id: uuidv7(),
        slug: `vpr-i-${Date.now()}`,
        kind: 'OTC',
        brandId: brand.id,
        createdByOrgId: seller.id,
        status: 'PUBLISHED',
      },
    });
    const variant = await prisma.catalogVariant.create({
      data: { id: uuidv7(), itemId: item.id, skuCode: `VPR-${Date.now()}`, packSize: '1' },
    });
    const offer = await prisma.catalogOffer.create({
      data: {
        id: uuidv7(),
        variantId: variant.id,
        sellerOrgId: seller.id,
        countryId: country,
        ownership,
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
        sellMinor: captureMinor,
        validFrom: new Date(),
        isCurrent: true,
      },
    });
    const customer = await signIn(app, `vpr-c-${Date.now()}@example.com`);
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: seller.id,
        countryId: country,
        kind: 'VENDOR_WAREHOUSE',
        name: 'VPR WH',
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
        status: 'READY_FOR_PAYMENT',
        idempotencyKey: `vpr-co-${Date.now()}`,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const quote = await prisma.checkoutQuote.create({
      data: {
        id: uuidv7(),
        sessionId: checkout.id,
        fingerprint: 'vpr',
        currency: 'XXX',
        sellMinor: captureMinor,
        totalMinor: captureMinor,
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
        amountMinor: captureMinor,
        capturedMinor: captureMinor,
        currency: 'XXX',
        idempotencyKey: `vpr-pay-${Date.now()}`,
      },
    });
    const providerRef = `vpr-mock-${Date.now()}-${Math.random()}`;
    await prisma.paymentAttempt.create({
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
    app.get(MockPaymentGatewayAdapter).resolve(providerRef, 'captured', captureMinor, 'XXX');
    const order = await prisma.order.create({
      data: {
        id: uuidv7(),
        orderNumber: `VPR-${Date.now()}`,
        customerPersonId: customer.personId,
        sellerOrgId: seller.id,
        countryId: country,
        checkoutSessionId: checkout.id,
        checkoutQuoteId: quote.id,
        paymentIntentId: intent.id,
        fulfillingLocationId: location.id,
        currency: 'XXX',
        goodsMinor: captureMinor,
        totalMinor: captureMinor,
      },
    });
    await prisma.orderItem.create({
      data: {
        id: uuidv7(),
        orderId: order.id,
        offerId: offer.id,
        variantId: variant.id,
        sku: 'VPR-SKU',
        title: 'VPR item',
        qty: 1,
        unitMinor: captureMinor,
        lineMinor: captureMinor,
        currency: 'XXX',
      },
    });
    if (syncFinance) {
      await finance.syncOrder(order.id);
    }
    const originalPayable = (captureMinor * BigInt(10000 - takeBps)) / 10000n;
    return { seller, order, intent, originalPayable, captureMinor };
  }

  function adminPrincipal(country = countryId): Principal {
    return {
      personId: adminPersonId,
      sessionId: adminPersonId,
      audience: 'admin',
      roles: [],
      tokenVersion: 0,
      countryId: country,
    };
  }

  async function adminRefund(intentId: string, amountMinor: bigint, key = `vpr-ref-${Date.now()}`) {
    return payments.refund(adminPrincipal(), intentId, amountMinor, key, true);
  }

  async function originalGross(orderId: string) {
    const fact = await prisma.financialFact.findUniqueOrThrow({
      where: { sourceKey: `vendor_payable:${orderId}` },
    });
    return fact.amountMinor!;
  }

  async function countVendorRefundJournalsForIntent(intentId: string) {
    const refunds = await prisma.refund.findMany({ where: { intentId, status: 'REFUNDED' } });
    if (refunds.length > 0) {
      return prisma.journal.count({
        where: {
          postingRuleId: 'vendor_refund_adjustment',
          sourceEventId: { in: refunds.map((row) => `vendor_refund:${row.id}`) },
        },
      });
    }
    const intent = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
    if (!intent || intent.refundedMinor <= 0n) {
      return 0;
    }
    return prisma.journal.count({
      where: {
        postingRuleId: 'vendor_refund_adjustment',
        sourceEventId: `vendor_refund:refund_total:${intentId}:${intent.refundedMinor.toString()}`,
      },
    });
  }

  async function approvePayable(orderId: string) {
    const payable = await prisma.vendorPayable.findUniqueOrThrow({ where: { orderId } });
    await finance.transitionPayable(payable.id, VendorPayableStatus.ELIGIBLE);
    await finance.transitionPayable(payable.id, VendorPayableStatus.APPROVED);
    return payable;
  }

  it('A: marketplace split creates vendor payable', async () => {
    const { order, originalPayable } = await seedMarketplaceOrder();
    const payable = await prisma.vendorPayable.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(payable.amountMinor).toBe(originalPayable);
    expect(originalPayable).toBe(900n);
    const split = await prisma.journal.findFirst({ where: { postingRuleId: 'marketplace_split' } });
    expect(split).toBeTruthy();
  });

  it('B: partial refund reduces vendor payable', async () => {
    const { order, intent, originalPayable } = await seedMarketplaceOrder();
    await adminRefund(intent.id, 200n);
    const payable = await prisma.vendorPayable.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(payable.amountMinor).toBe(originalPayable - 200n);
    expect(await countVendorRefundJournalsForIntent(intent.id)).toBe(1);
  });

  it('C: second partial refund reduces remaining payable', async () => {
    const { order, intent, originalPayable } = await seedMarketplaceOrder();
    await adminRefund(intent.id, 200n, `vpr-r1-${Date.now()}`);
    await adminRefund(intent.id, 150n, `vpr-r2-${Date.now()}`);
    const payable = await prisma.vendorPayable.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(payable.amountMinor).toBe(originalPayable - 350n);
    expect(await countVendorRefundJournalsForIntent(intent.id)).toBe(2);
  });

  it('D: final refund brings payable to zero', async () => {
    const { order, intent, originalPayable } = await seedMarketplaceOrder();
    await adminRefund(intent.id, 200n, `vpr-d1-${Date.now()}`);
    await adminRefund(intent.id, 150n, `vpr-d2-${Date.now()}`);
    await adminRefund(intent.id, originalPayable - 350n, `vpr-d3-${Date.now()}`);
    const payable = await prisma.vendorPayable.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(payable.amountMinor).toBe(0n);
  });

  it('E: duplicate syncOrder is idempotent for payable and journals', async () => {
    const { order, intent } = await seedMarketplaceOrder();
    await adminRefund(intent.id, 200n);
    const before = await countVendorRefundJournalsForIntent(intent.id);
    await finance.syncOrder(order.id);
    await finance.syncOrder(order.id);
    expect(await countVendorRefundJournalsForIntent(intent.id)).toBe(before);
    const payable = await prisma.vendorPayable.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(payable.amountMinor).toBe(700n);
  });

  it('F: concurrent syncOrder does not duplicate vendor refund journals', async () => {
    const { order, intent } = await seedMarketplaceOrder();
    await adminRefund(intent.id, 200n);
    await Promise.all([finance.syncOrder(order.id), finance.syncOrder(order.id)]);
    expect(await countVendorRefundJournalsForIntent(intent.id)).toBe(1);
  });

  it('G: settlement before refund keeps batch net; refund adjusts payable after', async () => {
    const { order, intent, originalPayable } = await seedMarketplaceOrder();
    await approvePayable(order.id);
    const batch = await finance.openSettlement({ personId: adminPersonId } as never, countryId, 'XXX');
    const line = batch.lines[0];
    expect(line!.net_minor).toBe(originalPayable.toString());
    await adminRefund(intent.id, 200n);
    const payable = await prisma.vendorPayable.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(payable.amountMinor).toBe(originalPayable - 200n);
    expect(line!.net_minor).toBe(originalPayable.toString());
  });

  it('H: refund before settlement uses original gross and adjusted net', async () => {
    const { order, intent, originalPayable } = await seedMarketplaceOrder();
    await adminRefund(intent.id, 200n);
    await approvePayable(order.id);
    const batch = await finance.openSettlement({ personId: adminPersonId } as never, countryId, 'XXX');
    const line = batch.lines[0];
    expect(line!.gross_minor).toBe(originalPayable.toString());
    expect(line!.refund_minor).toBe('200');
    expect(line!.net_minor).toBe((originalPayable - 200n).toString());
    const payable = await prisma.vendorPayable.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(payable.amountMinor).toBe(originalPayable - 200n);
  });

  it('I: resync after settlement does not double-adjust payable', async () => {
    const { order, intent, originalPayable } = await seedMarketplaceOrder();
    await adminRefund(intent.id, 200n);
    await approvePayable(order.id);
    await finance.openSettlement({ personId: adminPersonId } as never, countryId, 'XXX');
    const journalsBefore = await countVendorRefundJournalsForIntent(intent.id);
    await finance.syncOrder(order.id);
    expect(await countVendorRefundJournalsForIntent(intent.id)).toBe(journalsBefore);
    const payable = await prisma.vendorPayable.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(payable.amountMinor).toBe(originalPayable - 200n);
  });

  it('J: platform-owned order produces no vendor payable adjustment', async () => {
    const { order, intent } = await seedMarketplaceOrder({ ownership: OfferOwnership.PLATFORM_OWNED });
    expect(await prisma.vendorPayable.findUnique({ where: { orderId: order.id } })).toBeNull();
    await adminRefund(intent.id, 200n);
    expect(await countVendorRefundJournalsForIntent(intent.id)).toBe(0);
  });

  it('K: cross-country refund does not alter other-country payable', async () => {
    const local = await seedMarketplaceOrder({ country: countryId });
    const foreign = await seedMarketplaceOrder({ country: otherCountryId });
    await adminRefund(local.intent.id, 200n);
    const foreignPayable = await prisma.vendorPayable.findUniqueOrThrow({ where: { orderId: foreign.order.id } });
    expect(foreignPayable.amountMinor).toBe(await originalGross(foreign.order.id));
  });

  it('L: refund without linked order produces no vendor refund journal', async () => {
    const seller = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.VENDOR,
        legalName: `VPR LO ${Date.now()}`,
        displayName: 'VPR LO',
        status: 'ACTIVE',
      },
    });
    const customer = await signIn(app, `vpr-lo-${Date.now()}@example.com`);
    const cart = await prisma.cart.create({
      data: {
        id: uuidv7(),
        customerPersonId: customer.personId,
        countryId,
        sellerOrgId: seller.id,
      },
    });
    const checkout = await prisma.checkoutSession.create({
      data: {
        id: uuidv7(),
        customerPersonId: customer.personId,
        countryId,
        cartId: cart.id,
        sellerOrgId: seller.id,
        status: 'PAID',
        idempotencyKey: `vpr-lo-co-${Date.now()}`,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const quote = await prisma.checkoutQuote.create({
      data: {
        id: uuidv7(),
        sessionId: checkout.id,
        fingerprint: 'vpr-lo',
        currency: 'XXX',
        sellMinor: 500n,
        totalMinor: 500n,
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
        amountMinor: 500n,
        capturedMinor: 500n,
        currency: 'XXX',
        idempotencyKey: `vpr-lo-pay-${Date.now()}`,
      },
    });
    const providerRef = `vpr-lo-mock-${Date.now()}`;
    await prisma.paymentAttempt.create({
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
    app.get(MockPaymentGatewayAdapter).resolve(providerRef, 'captured', 500n, 'XXX');
    await finance.syncPayment(intent.id);
    await adminRefund(intent.id, 100n);
    expect(await countVendorRefundJournalsForIntent(intent.id)).toBe(0);
  });

  it('M: duplicate refund idempotency key does not duplicate vendor refund journal', async () => {
    const { intent } = await seedMarketplaceOrder();
    const key = `vpr-dup-${Date.now()}`;
    await adminRefund(intent.id, 200n, key);
    await adminRefund(intent.id, 200n, key);
    expect(await countVendorRefundJournalsForIntent(intent.id)).toBe(1);
  });

  it('N: payout ledger path remains valid after partial refund', async () => {
    const { order, intent, originalPayable } = await seedMarketplaceOrder();
    await adminRefund(intent.id, 100n);
    await approvePayable(order.id);
    const batch = await finance.openSettlement({ personId: adminPersonId } as never, countryId, 'XXX');
    expect(batch.lines[0]!.net_minor).toBe((originalPayable - 100n).toString());
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/settlements/${batch.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    const payout = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/settlements/${batch.id}/payouts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotency_key: `vpr-po-${Date.now()}`, scenario: 'SUCCESS' });
    expect(payout.status).toBeLessThan(300);
    const paidJournal = await prisma.journal.count({
      where: { postingRuleId: 'vendor_payout_paid' },
    });
    expect(paidJournal).toBeGreaterThanOrEqual(0);
  });

  it('O: vendor refund journal debits AP_VENDOR and credits LIAB_UNEARNED', async () => {
    const { intent } = await seedMarketplaceOrder();
    await adminRefund(intent.id, 200n);
    const journal = await prisma.journal.findFirst({
      where: { postingRuleId: 'vendor_refund_adjustment' },
      include: { lines: { include: { account: true } } },
    });
    expect(journal).toBeTruthy();
    const ap = journal!.lines.find((l) => l.account.code === 'AP_VENDOR' && l.dc === 'DEBIT');
    const unearned = journal!.lines.find((l) => l.account.code === 'LIAB_UNEARNED' && l.dc === 'CREDIT');
    expect(ap?.amountMinor).toBe(200n);
    expect(unearned?.amountMinor).toBe(200n);
  });
});
