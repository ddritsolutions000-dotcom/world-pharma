import { INestApplication } from '@nestjs/common';
import {
  CheckoutStatus,
  FinancialFactKind,
  LocationKind,
  OrganizationKind,
  PaymentIntentStatus,
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
import {
  activateMarketplaceSeller,
  enableMarketplaceVendorPack,
} from '../test/marketplace-seller';
import { signIn, provisionOrgAdmin, provisionSuperAdmin } from '../test/sign-in';
import { seedCheckoutInventory } from '../test/seed-checkout-inventory';
import { MockPaymentGatewayAdapter } from './mock.adapter';
import { signSandboxPayload } from './hmac';
import { OrderService } from '../orders/order.service';
import { PaymentService } from './payment.service';

const countryCode = 'CS';

describe('payment checkout financial correctness (e2e)', () => {
  jest.setTimeout(300_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let customerToken: string;
  let customerBToken: string;
  let adminToken: string;
  let offerId: string;
  let gatewayCode: string;

  async function checkoutSession(token = customerToken) {
    await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${countryCode}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `pcfc-add-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
      .send({ offer_id: offerId, qty: 1 });
    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${countryCode}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `pcfc-co-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
      .send({});
    expect(session.status).toBe(201);
    return { session };
  }

  async function paySession(
    sessionId: string,
    scenario = 'success',
    idempotencyKey?: string,
    token = customerToken,
    extraBody: Record<string, unknown> = {},
  ) {
    return request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${sessionId}/pay`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey ?? `pcfc-pay-${Date.now()}`)
      .send({ method: 'CARD', scenario, ...extraBody });
  }

  async function postWebhook(payload: Record<string, unknown>, signature?: string) {
    const raw = JSON.stringify(payload);
    const req = request(app.getHttpServer())
      .post(`/api/v1/webhooks/payments/${gatewayCode}`)
      .set('Content-Type', 'application/json');
    if (signature === '') {
      return req.send(raw);
    }
    req.set('x-sandbox-signature', signature ?? signSandboxPayload(raw));
    req.set('x-sandbox-timestamp', String(Math.floor(Date.now() / 1000)));
    return req.send(raw);
  }

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

    let country = await prisma.country.findUnique({ where: { isoAlpha2: countryCode } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: countryCode,
          isoAlpha3: 'CSS',
          nameI18n: { en: 'Payment correctness' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
          dataResidencyMode: 'shared',
        },
      });
    }
    const doc = emptyPolicyDocument();
    doc.services.pharmacy = true;
    enableMarketplaceVendorPack(doc);
    doc.payments.enabled = true;
    doc.payments.methods = ['CARD'];
    doc.payments.gateway_refs = ['MOCK_PRIMARY'];
    doc.payments.currencies = ['XXX'];
    if (country.publishedPolicyPackId) {
      await prisma.policyPack.update({
        where: { id: country.publishedPolicyPackId },
        data: { document: doc as never },
      });
    } else {
      const pack = await prisma.policyPack.create({
        data: {
          id: uuidv7(),
          countryId: country.id,
          version: 1,
          status: PolicyPackStatus.PUBLISHED,
          document: doc as never,
          checksum: 'pcfc-pack',
          publishedAt: new Date(),
        },
      });
      await prisma.country.update({ where: { id: country.id }, data: { publishedPolicyPackId: pack.id } });
    }
    await app.get(PolicyCache).invalidate(countryCode);

    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: 'PCFC Vendor',
        displayName: 'PCFC Vendor',
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId: country.id,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'PCFC WH',
        timezone: 'UTC',
      },
    });
    const admin = await provisionSuperAdmin(app, prisma, 'pcfc-admin');
    adminToken = admin.token;
    const vendorUser = await provisionOrgAdmin(app, prisma, 'pcfc-vendor', vendor.id);
    await activateMarketplaceSeller(app, {
      vendorToken: vendorUser.token,
      adminToken: admin.token,
      sellerOrgId: vendor.id,
    });
    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: `pcfc-brand-${Date.now()}`, name: 'PcfcBrand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: `pcfc-item-${Date.now()}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'Pcfc item',
        countries: [{ country_code: countryCode }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku_code: `PCFC-SKU-${Date.now()}`, pack_size: '10' });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);
    const offer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set('Authorization', `Bearer ${vendorUser.token}`)
      .send({
        variant_id: variant.body.id,
        seller_org_id: vendor.id,
        country_code: countryCode,
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '2500',
      });
    offerId = offer.body.id;
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/publish`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    await seedCheckoutInventory(app, {
      vendorToken: vendorUser.token,
      locationId: location.id,
      ownerOrgId: vendor.id,
      variantId: variant.body.id,
      qty: 200,
    });

    const customer = await signIn(app, `pcfc-cust-${Date.now()}@example.com`, 'customer');
    customerToken = customer.token;
    const customerB = await signIn(app, `pcfc-cust-b-${Date.now()}@example.com`, 'customer');
    customerBToken = customerB.token;

    gatewayCode = 'MOCK_PRIMARY';
  });

  afterAll(async () => {
    await app?.close();
  });

  it('compensates when order creation fails after capture', async () => {
    const paymentSvc = app.get(PaymentService);
    const orders = (paymentSvc as unknown as { orders: OrderService }).orders;
    const compSession = (await checkoutSession()).session;
    const originalCreate = orders.createFromPayment.bind(orders);
    orders.createFromPayment = jest.fn().mockRejectedValueOnce(new Error('simulated order failure'));
    const compPay = await paySession(compSession.body.id, 'success', `pcfc-comp-${Date.now()}`);
    orders.createFromPayment = originalCreate;
    expect(compPay.status).toBe(409);
    expect(compPay.body.code).toBe('ORDER_CREATION_FAILED');
    const compIntent = await prisma.paymentIntent.findFirstOrThrow({
      where: { checkoutSessionId: compSession.body.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(compIntent.status).toBe(PaymentIntentStatus.CAPTURED);
    expect(compIntent.refundedMinor).toBe(compIntent.capturedMinor);
    expect(await prisma.order.count({ where: { paymentIntentId: compIntent.id } })).toBe(0);
    expect(
      (await prisma.checkoutSession.findUniqueOrThrow({ where: { id: compSession.body.id } })).status,
    ).toBe(CheckoutStatus.FAILED);
  });

  it('covers checkout payment refund webhook security and finance correctness', async () => {
    const { session } = await checkoutSession();
    const payKey = `pcfc-main-pay-${Date.now()}`;
    const pay = await paySession(session.body.id, 'success', payKey);
    expect(pay.status).toBe(201);
    expect(pay.body.status).toBe('CAPTURED');
    expect(pay.body.currency).toBe('XXX');
    expect(BigInt(pay.body.amount_minor)).toBeGreaterThan(0n);

    const intentId = pay.body.id as string;
    const orderCount = await prisma.order.count({ where: { paymentIntentId: intentId } });
    expect(orderCount).toBe(1);
    const order = await prisma.order.findFirstOrThrow({ where: { paymentIntentId: intentId } });

    const sessionRow = await prisma.checkoutSession.findUniqueOrThrow({
      where: { id: session.body.id },
    });
    expect(sessionRow.reservationIds.length).toBeGreaterThanOrEqual(1);
    const hold = await prisma.inventoryReservation.findUniqueOrThrow({
      where: { id: sessionRow.reservationIds[0]! },
    });
    expect(hold.status).toBe('CONSUMED');

    const dupPay = await paySession(session.body.id, 'success', payKey);
    expect(dupPay.body.id).toBe(intentId);
    expect(await prisma.order.count({ where: { paymentIntentId: intentId } })).toBe(1);

    const captureFactsBefore = await prisma.financialFact.count({
      where: { orderId: order.id, kind: FinancialFactKind.CAPTURE },
    });
    await paySession(session.body.id, 'success', `pcfc-dup2-${Date.now()}`);
    const captureFactsAfter = await prisma.financialFact.count({
      where: { orderId: order.id, kind: FinancialFactKind.CAPTURE },
    });
    expect(captureFactsAfter).toBe(captureFactsBefore);

    const history = await request(app.getHttpServer())
      .get('/api/v1/me/payments/intents')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(history.status).toBe(200);
    expect((history.body.data as Array<{ id: string }>).some((row) => row.id === intentId)).toBe(true);

    const steal = await request(app.getHttpServer())
      .get(`/api/v1/me/payments/intents/${intentId}`)
      .set('Authorization', `Bearer ${customerBToken}`);
    expect(steal.status).toBeGreaterThanOrEqual(403);

    const failSession = (await checkoutSession()).session;
    const failPay = await paySession(failSession.body.id, 'failure', `pcfc-fail-${Date.now()}`);
    expect(failPay.body.status).toBe('FAILED');
    expect(await prisma.order.count({ where: { checkoutSessionId: failSession.body.id } })).toBe(0);

    const retrySession = (await checkoutSession()).session;
    await paySession(retrySession.body.id, 'failure', `pcfc-retry-fail-${Date.now()}`);
    const retryOk = await paySession(retrySession.body.id, 'success', `pcfc-retry-ok-${Date.now()}`);
    expect(retryOk.body.status).toBe('CAPTURED');

    const partialSession = (await checkoutSession()).session;
    const partialPay = await paySession(partialSession.body.id, 'success', `pcfc-partial-${Date.now()}`);
    const partialIntentId = partialPay.body.id as string;
    const partialOrder = await prisma.order.findFirstOrThrow({ where: { paymentIntentId: partialIntentId } });
    const half = BigInt(partialPay.body.amount_minor) / 2n;
    const partialRefundKey = `pcfc-partial-ref-${Date.now()}`;
    const partialRefund = await request(app.getHttpServer())
      .post(`/api/v1/me/payments/intents/${partialIntentId}/refund`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', partialRefundKey)
      .send({ amount_minor: half.toString() });
    expect(partialRefund.status).toBeLessThan(300);
    const partialIntent = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: partialIntentId } });
    expect(partialIntent.refundedMinor).toBe(half);

    const dupRefund = await request(app.getHttpServer())
      .post(`/api/v1/me/payments/intents/${partialIntentId}/refund`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', partialRefundKey)
      .send({ amount_minor: half.toString() });
    expect(dupRefund.status).toBeLessThan(300);
    expect(dupRefund.body.refunded_minor).toBe(partialRefund.body.refunded_minor);

    const fullSession = (await checkoutSession()).session;
    const fullPay = await paySession(fullSession.body.id, 'success', `pcfc-full-${Date.now()}`);
    const fullIntentId = fullPay.body.id as string;
    const fullRefund = await request(app.getHttpServer())
      .post(`/api/v1/me/payments/intents/${fullIntentId}/refund`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `pcfc-full-ref-${Date.now()}`)
      .send({});
    expect(fullRefund.status).toBeLessThan(300);
    const fullIntent = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: fullIntentId } });
    expect(fullIntent.refundedMinor).toBe(fullIntent.capturedMinor);

    const overRefund = await request(app.getHttpServer())
      .post(`/api/v1/me/payments/intents/${fullIntentId}/refund`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `pcfc-over-ref-${Date.now()}`)
      .send({ amount_minor: '1' });
    expect(overRefund.status).toBeGreaterThanOrEqual(409);

    const unauthorizedRefund = await request(app.getHttpServer())
      .post(`/api/v1/me/payments/intents/${intentId}/refund`)
      .set('Authorization', `Bearer ${customerBToken}`)
      .set('Idempotency-Key', `pcfc-steal-ref-${Date.now()}`)
      .send({});
    expect(unauthorizedRefund.status).toBeGreaterThanOrEqual(403);

    const staleSession = (await checkoutSession()).session;
    const staleQuote = await prisma.checkoutQuote.findFirst({
      where: { sessionId: staleSession.body.id },
      orderBy: { createdAt: 'desc' },
    });
    if (staleQuote) {
      await prisma.checkoutQuote.update({
        where: { id: staleQuote.id },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
    }
    const stalePay = await paySession(staleSession.body.id, 'success', `pcfc-stale-${Date.now()}`);
    expect(stalePay.status).toBeGreaterThanOrEqual(409);

    const tamperSession = (await checkoutSession()).session;
    const tamperPay = await paySession(tamperSession.body.id, 'success', `pcfc-tamper-${Date.now()}`, customerToken, {
      amount_minor: '1',
    });
    expect(tamperPay.status).toBe(400);
    expect(tamperPay.body.code).toBe('AMOUNT_TAMPER');

    const currencySession = (await checkoutSession()).session;
    const currencyPay = await paySession(currencySession.body.id, 'success', `pcfc-currency-${Date.now()}`, customerToken, {
      currency: 'USD',
    });
    expect(currencyPay.status).toBe(201);
    expect(currencyPay.body.currency).toBe('XXX');

    const { providerRef } = await (async () => {
      const unkSession = (await checkoutSession()).session;
      const unkPay = await paySession(unkSession.body.id, 'timeout', `pcfc-wh-${Date.now()}`);
      const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { intentId: unkPay.body.id } });
      return { providerRef: attempt.providerRef!, intentId: unkPay.body.id as string };
    })();

    const badWebhook = await postWebhook(
      { event_id: `pcfc-bad-${Date.now()}`, type: 'payment.captured', provider_ref: providerRef },
      'invalid-signature',
    );
    expect(badWebhook.status).toBe(401);

    const eventId = `pcfc-wh-${Date.now()}`;
    const goodWebhook = await postWebhook({
      event_id: eventId,
      type: 'payment.captured',
      provider_ref: providerRef,
    });
    expect(goodWebhook.status).toBeLessThan(300);
    const dupWebhook = await postWebhook({
      event_id: eventId,
      type: 'payment.captured',
      provider_ref: providerRef,
    });
    expect(dupWebhook.body.duplicate).toBe(true);

    const capturedSession = (await checkoutSession()).session;
    const capturedPay = await paySession(capturedSession.body.id, 'success', `pcfc-cap-wh-${Date.now()}`);
    const capAttempt = await prisma.paymentAttempt.findFirstOrThrow({
      where: { intentId: capturedPay.body.id },
    });
    const regress = await postWebhook({
      event_id: `pcfc-regress-${Date.now()}`,
      type: 'payment.failed',
      provider_ref: capAttempt.providerRef!,
    });
    expect(regress.status).toBeLessThan(300);
    const capIntent = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: capturedPay.body.id } });
    expect(capIntent.status).toBe(PaymentIntentStatus.CAPTURED);

    const boundary = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/production-boundary?country_code=${countryCode}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(boundary.status).toBeLessThan(300);
    expect(boundary.body.sandbox_only).toBe(true);
    expect(boundary.body.ready_for_production).toBe(false);

    const idemConflict = await request(app.getHttpServer())
      .post(`/api/v1/me/payments/intents/${intentId}/refund`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', payKey)
      .send({});
    expect(idemConflict.status).toBeGreaterThanOrEqual(409);

    const vendorFacts = await prisma.financialFact.count({
      where: { orderId: order.id, kind: FinancialFactKind.VENDOR_PAYABLE },
    });
    expect(vendorFacts).toBeLessThanOrEqual(1);
  });
});
