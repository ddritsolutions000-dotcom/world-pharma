import { INestApplication } from '@nestjs/common';
import {
  FinanceReconDomain,
  FinanceReconStatus,
  OfferOwnership,
  OfferStatus,
  OrganizationKind,
  PaymentAttemptStatus,
  PaymentIntentStatus,
  PaymentMethodFamily,
  PolicyPackStatus,
  ReconciliationStatus,
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

async function signIn(app: INestApplication, email: string, audience: 'admin' | 'customer' = 'customer') {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

describe('R14-B finance reconciliation foundation (e2e)', () => {
  jest.setTimeout(120_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let finance: FinanceService;
  let payments: PaymentService;
  let countryId: string;
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
    delete process.env['PAYMENT_ENVIRONMENT'];
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

    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'RB' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'RB',
          isoAlpha3: 'RBB',
          nameI18n: { en: 'R14-B test' },
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
          checksum: 'r14b-recon',
          publishedAt: new Date(),
        },
      });
      await prisma.country.update({ where: { id: country.id }, data: { publishedPolicyPackId: pack.id } });
    }
    countryId = country.id;
    await finance.ensureChart(countryId);

    const admin = await signIn(app, `r14b-admin-${Date.now()}@example.com`, 'admin');
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
    const gateway = await prisma.paymentGateway.findUniqueOrThrow({ where: { code: 'MOCK_PRIMARY' } });
    return gateway.id;
  }

  async function seedVendorOrder(refundMinor = 0n, syncFinance = true) {
    const seller = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.VENDOR,
        legalName: `R14B Vendor ${Date.now()}`,
        displayName: 'R14B Vendor',
        status: 'ACTIVE',
      },
    });
    await prisma.commercialRule.create({
      data: {
        id: uuidv7(),
        countryId,
        sellerOrgId: seller.id,
        takeBps: 1000,
        takeFlatMinor: 0n,
        priority: 10,
        validFrom: new Date(),
      },
    });
    const brand = await prisma.catalogBrand.create({
      data: { id: uuidv7(), slug: `r14b-b-${Date.now()}`, name: 'R14B Brand' },
    });
    const item = await prisma.catalogItem.create({
      data: {
        id: uuidv7(),
        slug: `r14b-i-${Date.now()}`,
        kind: 'OTC',
        brandId: brand.id,
        createdByOrgId: seller.id,
        status: 'PUBLISHED',
      },
    });
    const variant = await prisma.catalogVariant.create({
      data: { id: uuidv7(), itemId: item.id, skuCode: `R14B-${Date.now()}`, packSize: '1' },
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
    const customer = await signIn(app, `r14b-c-${Date.now()}@example.com`);
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: seller.id,
        countryId,
        kind: 'VENDOR_WAREHOUSE',
        name: 'R14B WH',
        timezone: 'UTC',
      },
    });
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
        status: 'READY_FOR_PAYMENT',
        idempotencyKey: `r14b-co-${Date.now()}`,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const quote = await prisma.checkoutQuote.create({
      data: {
        id: uuidv7(),
        sessionId: checkout.id,
        fingerprint: 'r14b',
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
        refundedMinor: refundMinor,
        currency: 'XXX',
        idempotencyKey: `r14b-pay-${Date.now()}`,
      },
    });
    const order = await prisma.order.create({
      data: {
        id: uuidv7(),
        orderNumber: `R14B-${Date.now()}`,
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
        sku: 'R14B-SKU',
        title: 'R14B item',
        qty: 1,
        unitMinor: 1000n,
        lineMinor: 1000n,
        currency: 'XXX',
      },
    });
    if (syncFinance) {
      await finance.syncOrder(order.id);
    }
    return { seller, order, intent, customer };
  }

  it('1: settlement net reflects refund facts keyed by payment intent', async () => {
    const refundMinor = 200n;
    const { order, intent } = await seedVendorOrder(refundMinor);
    const payable = await prisma.vendorPayable.findUniqueOrThrow({ where: { orderId: order.id } });
    const originalGross = await prisma.financialFact.findUniqueOrThrow({
      where: { sourceKey: `vendor_payable:${order.id}` },
    });
    expect(payable.amountMinor).toBe((originalGross.amountMinor! - refundMinor));
    await finance.transitionPayable(payable.id, VendorPayableStatus.ELIGIBLE);
    await finance.transitionPayable(payable.id, VendorPayableStatus.APPROVED);
    const batch = await finance.openSettlement({ personId: adminPersonId } as never, countryId, 'XXX');
    const line = batch.lines.find((row) => row.id);
    expect(line).toBeDefined();
    expect(line!.refund_minor).toBe(refundMinor.toString());
    expect(line!.gross_minor).toBe(originalGross.amountMinor!.toString());
    expect(line!.net_minor).toBe((originalGross.amountMinor! - refundMinor).toString());
    const refundFact = await prisma.financialFact.findFirst({
      where: { paymentIntentId: intent.id, kind: 'REFUND' },
    });
    expect(refundFact?.orderId).toBe(order.id);
  });

  async function countLedgerPostingRules(postingRuleId: string) {
    const ledger = await request(app.getHttpServer())
      .get('/api/v1/admin/finance/ledger')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ledger.status).toBe(200);
    return (ledger.body.data as Array<{ posting_rule_id: string }>).filter(
      (row) => row.posting_rule_id === postingRuleId,
    ).length;
  }

  it('2: payment reconcile MATCH syncs finance journals for existing order', async () => {
    const { order, intent } = await seedVendorOrder(0n, false);
    await prisma.paymentIntent.update({
      where: { id: intent.id },
      data: { status: PaymentIntentStatus.UNKNOWN },
    });
    const attempt = await prisma.paymentAttempt.create({
      data: {
        id: uuidv7(),
        intentId: intent.id,
        gatewayId: await mockGatewayId(),
        method: PaymentMethodFamily.CARD,
        status: PaymentAttemptStatus.UNKNOWN,
        submitted: true,
        providerRef: `mock-r14b-${Date.now()}`,
        routingJson: { gateway_code: 'MOCK_PRIMARY', gateway_environment: 'sandbox' },
      },
    });
    app.get(MockPaymentGatewayAdapter).resolve(attempt.providerRef!, 'captured', 1000n, 'XXX');
    expect(await prisma.financialFact.count({ where: { paymentIntentId: intent.id, kind: 'CAPTURE' } })).toBe(0);
    const recon = await request(app.getHttpServer())
      .post(`/api/v1/admin/payments/${intent.id}/reconcile`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(recon.status).toBeLessThan(300);
    expect(recon.body.status).toBe('MATCHED');
    expect(await prisma.financialFact.count({ where: { paymentIntentId: intent.id, kind: 'CAPTURE' } })).toBe(1);
    const contribution = await finance.getContribution(order.id);
    expect(contribution.gross_revenue_minor).toBe('1000');
  });

  it('3: finance reconciliation import is idempotent', async () => {
    const intentId = uuidv7();
    await prisma.paymentReconciliation.create({
      data: {
        id: uuidv7(),
        intentId,
        status: ReconciliationStatus.MATCHED,
        breakType: 'none',
        detail: 'r14b import test',
      },
    });
    const first = await request(app.getHttpServer())
      .post('/api/v1/admin/finance/reconciliation/import')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(first.status).toBe(201);
    expect(first.body.imported).toBeGreaterThan(0);
    const countAfterFirst = await prisma.financeReconciliation.count({
      where: { domain: FinanceReconDomain.PSP, internalRef: intentId },
    });
    const second = await request(app.getHttpServer())
      .post('/api/v1/admin/finance/reconciliation/import')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(second.status).toBe(201);
    expect(second.body.skipped).toBeGreaterThan(0);
    expect(await prisma.financeReconciliation.count({
      where: { domain: FinanceReconDomain.PSP, internalRef: intentId },
    })).toBe(countAfterFirst);
  });

  it('4: admin can list finance reconciliation break queue', async () => {
    await prisma.financeReconciliation.create({
      data: {
        id: uuidv7(),
        domain: FinanceReconDomain.PSP,
        status: FinanceReconStatus.BREAK,
        breakType: 'amount_mismatch',
        internalRef: uuidv7(),
        detail: 'r14b break queue test',
      },
    });
    const list = await request(app.getHttpServer())
      .get('/api/v1/admin/finance/reconciliations?domain=PSP&status=BREAK&limit=10')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.sandbox).toBe(true);
    expect(list.body.live_psp).toBe(false);
    expect((list.body.data as Array<{ status: string }>).some((row) => row.status === 'BREAK')).toBe(true);
  });

  it('5: duplicate payment reconcile re-syncs finance without duplicate journals', async () => {
    const { intent } = await seedVendorOrder();
    let attempt = await prisma.paymentAttempt.findFirst({ where: { intentId: intent.id } });
    if (!attempt?.providerRef) {
      attempt = await prisma.paymentAttempt.create({
        data: {
          id: uuidv7(),
          intentId: intent.id,
          gatewayId: await mockGatewayId(),
          method: PaymentMethodFamily.CARD,
          status: PaymentAttemptStatus.SUCCEEDED,
          submitted: true,
          providerRef: `mock-r14b-dup-${Date.now()}`,
          routingJson: { gateway_code: 'MOCK_PRIMARY', gateway_environment: 'sandbox' },
        },
      });
    }
    const providerRef = attempt!.providerRef!;
    await prisma.paymentTransaction.create({
      data: {
        id: uuidv7(),
        intentId: intent.id,
        attemptId: attempt!.id,
        kind: 'capture',
        amountMinor: 1000n,
        currency: 'XXX',
        providerRef,
      },
    });
    app.get(MockPaymentGatewayAdapter).resolve(providerRef, 'captured', 1000n, 'XXX');
    const ledger = await app.get(MockPaymentGatewayAdapter).status(providerRef);
    expect(ledger.status).toBe('captured');
    expect(ledger.amountMinor).toBe(1000n);
    await prisma.paymentReconciliation.create({
      data: {
        id: uuidv7(),
        intentId: intent.id,
        status: ReconciliationStatus.MATCHED,
        breakType: 'none',
        detail: 'prior match',
      },
    });
    const journalBefore = await countLedgerPostingRules('customer_capture');
    const second = await payments.reconcile(intent.id);
    expect(second.duplicate).toBe(true);
    expect(await countLedgerPostingRules('customer_capture')).toBe(journalBefore);
    const facts = await request(app.getHttpServer())
      .get('/api/v1/admin/finance/facts')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(facts.status).toBe(200);
    expect(
      (facts.body.data as Array<{ kind: string }>).some((row) => row.kind === 'CAPTURE'),
    ).toBe(true);
  });
});
