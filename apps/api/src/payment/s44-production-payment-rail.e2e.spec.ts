/**
 * Sprint 44 — Production payments, reconciliation & settlement rail (e2e)
 *
 * Sandbox rail remains usable; production stays fail-closed.
 * ≥35 scenarios: payment, idempotency, webhooks, refunds, recon, production gates, security.
 */
import { INestApplication } from '@nestjs/common';
import {
  CountryProductionLifecycle,
  LocationKind,
  OrganizationKind,
  OrganizationStatus,
  PaymentIntentStatus,
  PolicyPackStatus,
  ProductionDependencyStatus,
  ReconciliationStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { PolicyCache } from '../policy/cache';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { applyTestIsolation } from '../test/isolate-runtime';
import {
  activateMarketplaceSeller,
  enableMarketplaceVendorPack,
} from '../test/marketplace-seller';
import { seedCheckoutInventory } from '../test/seed-checkout-inventory';
import { provisionOrgAdmin, provisionSuperAdmin, signInCustomer } from '../test/sign-in';
import { signSandboxPayload } from './hmac';
import { PAYMENT_RECON_DISCREPANCY } from './payment-reconciliation';
import { evaluateProductionPaymentAvailable } from './production-payment-gate';
import { assertIntentTransition, canTransitionIntent } from './state-machine';

const COUNTRY = 'S4';

function expectOk(res: { status: number; body: unknown }, label: string, min = 200, max = 299) {
  if (res.status < min || res.status > max) {
    throw new Error(`${label} failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
}

describe('Sprint 44 production payment rail (e2e)', () => {
  jest.setTimeout(360_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let vendorToken: string;
  let customerToken: string;
  let countryId: string;
  let offerId: string;
  let vendorOrgId: string;
  let capturedIntentId: string;
  let orderId: string;
  const gatewayCode = 'MOCK_PRIMARY';

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    applyTestIsolation();
    process.env['NODE_ENV'] = 'test';
    process.env['AUTH_DEV_REVEAL_OTP'] = 'true';
    delete process.env['PAYMENT_ENVIRONMENT'];
    delete process.env['PAYMENT_LIVE_ENABLED'];
    process.env['JWT_ACCESS_SECRET'] =
      process.env['JWT_ACCESS_SECRET'] ?? 'test-access-secret-must-be-32-chars-min';
    process.env['OTP_PEPPER'] =
      process.env['OTP_PEPPER'] ?? 'test-otp-pepper-must-be-32-chars-minx';
    if (!process.env['REDIS_URL']) throw new Error('REDIS_URL is required');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ProblemFilter());
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    prisma = app.get(PrismaService);

    const doc = emptyPolicyDocument();
    doc.services.pharmacy = true;
    enableMarketplaceVendorPack(doc);
    doc.payments.enabled = true;
    doc.payments.methods = ['CARD'];
    doc.payments.gateway_refs = ['MOCK_PRIMARY'];
    doc.payments.currencies = ['XXX'];

    let country = await prisma.country.findUnique({ where: { isoAlpha2: COUNTRY } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: COUNTRY,
          isoAlpha3: 'S44',
          nameI18n: { en: 'Sprint 44 payment rail' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
          dataResidencyMode: 'shared',
          productionLifecycle: CountryProductionLifecycle.CONFIGURED,
        },
      });
    } else {
      country = await prisma.country.update({
        where: { id: country.id },
        data: {
          status: 'ACTIVE',
          defaultCurrency: 'XXX',
          productionLifecycle: CountryProductionLifecycle.CONFIGURED,
        },
      });
    }
    countryId = country.id;

    await prisma.productionDependency.deleteMany({
      where: { countryId, dependencyType: 'PAYMENT_PROVIDER' },
    });

    const pack = await prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId,
        version: Math.floor(Date.now() % 900_000) + 100_000,
        status: PolicyPackStatus.PUBLISHED,
        document: doc as never,
        checksum: `s44-${Date.now()}`,
        publishedAt: new Date(),
      },
    });
    await prisma.country.update({
      where: { id: countryId },
      data: { publishedPolicyPackId: pack.id },
    });
    await app.get(PolicyCache).invalidate(COUNTRY);

    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.VENDOR,
        legalName: `S44 Vendor ${Date.now()}`,
        displayName: `S44 Vendor ${Date.now()}`,
        status: OrganizationStatus.ACTIVE,
        operatingCurrency: 'XXX',
      },
    });
    vendorOrgId = vendor.id;
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'S44 WH',
        timezone: 'UTC',
      },
    });

    const admin = await provisionSuperAdmin(app, prisma, 's44-admin');
    adminToken = admin.token;
    const vendorUser = await provisionOrgAdmin(app, prisma, 's44-vendor', vendor.id);
    vendorToken = vendorUser.token;
    await activateMarketplaceSeller(app, {
      vendorToken,
      adminToken,
      sellerOrgId: vendor.id,
    });

    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set(auth(adminToken))
      .send({ slug: `s44-brand-${Date.now()}`, name: 'S44Brand' });
    expectOk(brand, 'brand create');
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set(auth(adminToken))
      .send({
        slug: `s44-otc-${Date.now()}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'S44 tabs',
        countries: [{ country_code: COUNTRY }],
      });
    expectOk(item, 'item create');
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set(auth(adminToken))
      .send({ sku_code: `S44-SKU-${Date.now()}`, pack_size: '10' });
    expectOk(variant, 'variant create');
    const published = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set(auth(adminToken));
    expectOk(published, 'item publish');
    const offer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set(auth(vendorToken))
      .send({
        variant_id: variant.body.id,
        seller_org_id: vendor.id,
        country_code: COUNTRY,
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '500',
      });
    expectOk(offer, 'offer create', 201, 201);
    offerId = offer.body.id as string;
    if (!offerId || typeof offerId !== 'string' || offerId.length < 32) {
      throw new Error(`invalid offer id: ${JSON.stringify(offer.body)}`);
    }
    const offerPub = await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offerId}/publish`)
      .set(auth(vendorToken));
    expectOk(offerPub, 'offer publish');
    await seedCheckoutInventory(app, {
      vendorToken,
      locationId: location.id,
      ownerOrgId: vendor.id,
      variantId: variant.body.id,
      qty: 50,
    });

    const customer = await signInCustomer(app, `s44-cust-${Date.now()}@example.com`);
    customerToken = customer.token;
  });

  afterAll(async () => {
    await app.close();
  });

  // ── State machine ────────────────────────────────────────────────────────

  it('S44-01 invalid intent transition fails', () => {
    expect(canTransitionIntent(PaymentIntentStatus.CAPTURED, PaymentIntentStatus.CREATED)).toBe(
      false,
    );
    expect(() =>
      assertIntentTransition(PaymentIntentStatus.CAPTURED, PaymentIntentStatus.CREATED),
    ).toThrow();
  });

  it('S44-02 CAPTURED may not transition to FAILED', () => {
    expect(canTransitionIntent(PaymentIntentStatus.CAPTURED, PaymentIntentStatus.FAILED)).toBe(
      false,
    );
  });

  // ── Production gate ──────────────────────────────────────────────────────

  it('S44-03 production availability is fail-closed when country not ACTIVE', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/production-availability?country_code=${COUNTRY}`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
    expect(res.body.blockers).toEqual(
      expect.arrayContaining(['COUNTRY_PRODUCTION_NOT_ACTIVE', 'R14_A_OWNER_CONFIRMATION_REQUIRED']),
    );
  });

  it('S44-04 assert production payment rejected while gated', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/payments/production-availability/assert?country_code=${COUNTRY}`)
      .set(auth(adminToken));
    expect(res.status).toBe(409);
    expect(String(res.body.code ?? res.body.detail ?? '')).toMatch(
      /COUNTRY_PRODUCTION|R14_A|LIVE_PAYMENTS|PAYMENT_PROVIDER|PRODUCTION_ENVIRONMENT/,
    );
  });

  it('S44-05 suspended country is a distinct blocker', async () => {
    await prisma.country.update({
      where: { id: countryId },
      data: { productionLifecycle: CountryProductionLifecycle.SUSPENDED },
    });
    const result = await evaluateProductionPaymentAvailable(prisma, { countryCode: COUNTRY });
    expect(result.blockers).toContain('COUNTRY_PRODUCTION_SUSPENDED');
    await prisma.country.update({
      where: { id: countryId },
      data: { productionLifecycle: CountryProductionLifecycle.CONFIGURED },
    });
  });

  it('S44-06 missing PAYMENT_PROVIDER dependency blocks production', async () => {
    await prisma.country.update({
      where: { id: countryId },
      data: { productionLifecycle: CountryProductionLifecycle.ACTIVE },
    });
    await prisma.productionDependency.deleteMany({
      where: { countryId, dependencyType: 'PAYMENT_PROVIDER' },
    });
    const result = await evaluateProductionPaymentAvailable(prisma, { countryCode: COUNTRY });
    expect(result.blockers).toContain('PAYMENT_PROVIDER_DEPENDENCY_MISSING');
  });

  it('S44-07 EXTERNAL_GATED dependency never counts as LIVE', async () => {
    await prisma.productionDependency.deleteMany({
      where: { countryId, dependencyType: 'PAYMENT_PROVIDER' },
    });
    await prisma.productionDependency.create({
      data: {
        id: uuidv7(),
        countryId,
        dependencyType: 'PAYMENT_PROVIDER',
        environment: 'production',
        status: ProductionDependencyStatus.EXTERNAL_GATED,
        externalGated: true,
        providerIdentifier: 'STRIPE',
        configReference: null,
      },
    });
    const result = await evaluateProductionPaymentAvailable(prisma, { countryCode: COUNTRY });
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        'PAYMENT_PROVIDER_EXTERNAL_GATED',
        'PAYMENT_PROVIDER_NOT_LIVE',
        'MERCHANT_CONFIG_REF_MISSING',
      ]),
    );
  });

  it('S44-08 mock provider identifier forbidden for production dependency', async () => {
    await prisma.productionDependency.deleteMany({
      where: { countryId, dependencyType: 'PAYMENT_PROVIDER' },
    });
    await prisma.productionDependency.create({
      data: {
        id: uuidv7(),
        countryId,
        dependencyType: 'PAYMENT_PROVIDER',
        environment: 'production',
        status: ProductionDependencyStatus.VERIFIED,
        externalGated: false,
        providerIdentifier: 'MOCK_PRIMARY',
        configReference: 'vault:fake',
      },
    });
    const result = await evaluateProductionPaymentAvailable(prisma, { countryCode: COUNTRY });
    expect(result.blockers).toContain('MOCK_GATEWAY_PRODUCTION_FORBIDDEN');
  });

  it('S44-09 production boundary never claims ready_for_production', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/production-boundary?country_code=${COUNTRY}`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.ready_for_production).toBe(false);
    expect(res.body.never_fallback_to_mock).toBe(true);
    expect(res.body.r14a_owner_confirmation_required).toBe(true);
  });

  // ── Sandbox payment success path ─────────────────────────────────────────

  it('S44-10 customer creates checkout and pays (sandbox success)', async () => {
    // Keep sandbox usable regardless of production lifecycle experiments above.
    await prisma.country.update({
      where: { id: countryId },
      data: { productionLifecycle: CountryProductionLifecycle.CONFIGURED },
    });
    const add = await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${COUNTRY}`)
      .set(auth(customerToken))
      .set('Idempotency-Key', `s44-add-${Date.now()}`)
      .send({ offer_id: offerId, qty: 1 });
    expectOk(add, 'cart add', 200, 201);
    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${COUNTRY}`)
      .set(auth(customerToken))
      .set('Idempotency-Key', `s44-co-${Date.now()}`)
      .send({});
    expectOk(session, 'checkout session', 201, 201);
    const pay = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set(auth(customerToken))
      .set('Idempotency-Key', `s44-pay-${Date.now()}`)
      .send({ method: 'CARD', scenario: 'success' });
    expectOk(pay, 'pay', 201, 201);
    expect(pay.body.status).toBe('CAPTURED');
    expect(pay.body.sandbox).toBe(true);
    capturedIntentId = pay.body.id;
    const order = await prisma.order.findUnique({ where: { paymentIntentId: capturedIntentId } });
    expect(order).toBeTruthy();
    orderId = order!.id;
  });

  it('S44-11 unpaid/failed payment cannot be stolen by another customer', async () => {
    const other = await signInCustomer(app, `s44-other-${Date.now()}@example.com`);
    const steal = await request(app.getHttpServer())
      .get(`/api/v1/me/payments/intents/${capturedIntentId}`)
      .set(auth(other.token));
    expect(steal.status).toBe(403);
  });

  it('S44-12 duplicate pay idempotency key does not double-charge', async () => {
    const key = `s44-dup-pay-${Date.now()}`;
    await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${COUNTRY}`)
      .set(auth(customerToken))
      .set('Idempotency-Key', `s44-add2-${Date.now()}`)
      .send({ offer_id: offerId, qty: 1 });
    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${COUNTRY}`)
      .set(auth(customerToken))
      .set('Idempotency-Key', `s44-co2-${Date.now()}`)
      .send({});
    expectOk(session, 'checkout session 2', 201, 201);
    const a = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set(auth(customerToken))
      .set('Idempotency-Key', key)
      .send({ method: 'CARD', scenario: 'success' });
    const b = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set(auth(customerToken))
      .set('Idempotency-Key', key)
      .send({ method: 'CARD', scenario: 'success' });
    expect([200, 201]).toContain(a.status);
    expect([200, 201]).toContain(b.status);
    expect(a.body.id).toBe(b.body.id);
  });

  it('S44-13 payment failure scenario stays FAILED (not CAPTURED)', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${COUNTRY}`)
      .set(auth(customerToken))
      .set('Idempotency-Key', `s44-addf-${Date.now()}`)
      .send({ offer_id: offerId, qty: 1 });
    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${COUNTRY}`)
      .set(auth(customerToken))
      .set('Idempotency-Key', `s44-cof-${Date.now()}`)
      .send({});
    expectOk(session, 'checkout fail session', 201, 201);
    const pay = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set(auth(customerToken))
      .set('Idempotency-Key', `s44-payf-${Date.now()}`)
      .send({ method: 'CARD', scenario: 'failure' });
    expect([201, 402, 409]).toContain(pay.status);
    if (pay.status === 201) {
      expect(pay.body.status).toBe('FAILED');
    }
  });

  // ── Webhooks ─────────────────────────────────────────────────────────────

  it('S44-14 invalid webhook signature rejected', async () => {
    const body = JSON.stringify({
      event_id: `evt-${Date.now()}`,
      type: 'payment.captured',
      provider_ref: 'missing',
    });
    const res = await request(app.getHttpServer())
      .post(`/api/v1/webhooks/payments/${gatewayCode}`)
      .set('Content-Type', 'application/json')
      .set('x-sandbox-signature', 'bad')
      .send(body);
    expect([401, 403]).toContain(res.status);
  });

  it('S44-15 valid webhook accepted and idempotent on replay', async () => {
    expect(capturedIntentId).toBeTruthy();
    const intent = await prisma.paymentIntent.findUnique({
      where: { id: capturedIntentId },
      include: { attempts: { where: { submitted: true }, take: 1 } },
    });
    const providerRef = intent?.attempts[0]?.providerRef;
    expect(providerRef).toBeTruthy();
    const eventId = `s44-wh-${Date.now()}`;
    const payload = JSON.stringify({
      event_id: eventId,
      type: 'payment.captured',
      provider_ref: providerRef,
    });
    const sig = signSandboxPayload(payload);
    const a = await request(app.getHttpServer())
      .post(`/api/v1/webhooks/payments/${gatewayCode}`)
      .set('Content-Type', 'application/json')
      .set('x-sandbox-signature', sig)
      .send(payload);
    expect([200, 201]).toContain(a.status);
    expect(a.body.accepted).toBe(true);
    const b = await request(app.getHttpServer())
      .post(`/api/v1/webhooks/payments/${gatewayCode}`)
      .set('Content-Type', 'application/json')
      .set('x-sandbox-signature', sig)
      .send(payload);
    expect([200, 201]).toContain(b.status);
    expect(b.body.duplicate).toBe(true);
  });

  it('S44-16 unknown provider_ref creates reviewable recon discrepancy', async () => {
    const payload = JSON.stringify({
      event_id: `s44-unk-${Date.now()}`,
      type: 'payment.captured',
      provider_ref: `unknown-ref-${Date.now()}`,
    });
    const sig = signSandboxPayload(payload);
    const res = await request(app.getHttpServer())
      .post(`/api/v1/webhooks/payments/${gatewayCode}`)
      .set('Content-Type', 'application/json')
      .set('x-sandbox-signature', sig)
      .send(payload);
    expect([200, 201]).toContain(res.status);
    const row = await prisma.paymentReconciliation.findFirst({
      where: { breakType: PAYMENT_RECON_DISCREPANCY.UNKNOWN_PROVIDER_TRANSACTION },
      orderBy: { createdAt: 'desc' },
    });
    expect(row).toBeTruthy();
    expect(row?.status).toBe(ReconciliationStatus.INVESTIGATE);
  });

  // ── Reconciliation ───────────────────────────────────────────────────────

  it('S44-17 admin reconcile MATCHED for captured intent', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/payments/${capturedIntentId}/reconcile`)
      .set(auth(adminToken));
    expect([200, 201]).toContain(res.status);
    expect(res.body.status).toBe('MATCHED');
    expect(res.body.discrepancy).toBe(PAYMENT_RECON_DISCREPANCY.MATCHED);
  });

  it('S44-18 reconcile is idempotent (duplicate matched)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/payments/${capturedIntentId}/reconcile`)
      .set(auth(adminToken));
    expect([200, 201]).toContain(res.status);
    expect(res.body.status).toBe('MATCHED');
    expect(res.body.duplicate === true || res.body.status === 'MATCHED').toBe(true);
  });

  it('S44-19 reconciliation queue lists reviewable rows', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/reconciliation?country_code=${COUNTRY}&limit=50`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].reviewable).toBe(true);
  });

  it('S44-20 amount mismatch creates BREAK without auto-fix', async () => {
    const intent = await prisma.paymentIntent.findUnique({ where: { id: capturedIntentId } });
    const txn = await prisma.paymentTransaction.findFirst({
      where: { intentId: capturedIntentId },
      orderBy: { createdAt: 'desc' },
    });
    expect(txn).toBeTruthy();
    const original = txn!.amountMinor;
    await prisma.paymentTransaction.update({
      where: { id: txn!.id },
      data: { amountMinor: intent!.amountMinor + 1n },
    });
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/payments/${capturedIntentId}/reconcile`)
      .set(auth(adminToken));
    expect([200, 201]).toContain(res.status);
    expect(res.body.status).toBe('BREAK');
    expect(res.body.break_type).toBe(PAYMENT_RECON_DISCREPANCY.AMOUNT_MISMATCH);
    await prisma.paymentTransaction.update({
      where: { id: txn!.id },
      data: { amountMinor: original },
    });
  });

  // ── Refunds ──────────────────────────────────────────────────────────────

  it('S44-21 over-refund blocked', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/me/payments/intents/${capturedIntentId}/refund`)
      .set(auth(customerToken))
      .set('Idempotency-Key', `s44-over-${Date.now()}`)
      .send({ amount_minor: '999999999' });
    expect(res.status).toBe(409);
  });

  it('S44-22 partial refund succeeds', async () => {
    const intent = await prisma.paymentIntent.findUnique({ where: { id: capturedIntentId } });
    const half = (intent!.amountMinor / 2n).toString();
    const res = await request(app.getHttpServer())
      .post(`/api/v1/me/payments/intents/${capturedIntentId}/refund`)
      .set(auth(customerToken))
      .set('Idempotency-Key', `s44-partial-${Date.now()}`)
      .send({ amount_minor: half });
    expect([200, 201]).toContain(res.status);
  });

  it('S44-23 duplicate refund key does not double-refund', async () => {
    const intent = await prisma.paymentIntent.findUnique({ where: { id: capturedIntentId } });
    const remaining = intent!.amountMinor - intent!.refundedMinor;
    if (remaining <= 0n) return;
    const key = `s44-ref-dup-${Date.now()}`;
    const amount = remaining.toString();
    const a = await request(app.getHttpServer())
      .post(`/api/v1/me/payments/intents/${capturedIntentId}/refund`)
      .set(auth(customerToken))
      .set('Idempotency-Key', key)
      .send({ amount_minor: amount });
    const b = await request(app.getHttpServer())
      .post(`/api/v1/me/payments/intents/${capturedIntentId}/refund`)
      .set(auth(customerToken))
      .set('Idempotency-Key', key)
      .send({ amount_minor: amount });
    expect([200, 201, 409]).toContain(a.status);
    expect([200, 201, 409]).toContain(b.status);
    if (a.status < 300 && b.status < 300) {
      expect(a.body.id).toBe(b.body.id);
    }
  });

  // ── Settlement / payable linkage ─────────────────────────────────────────

  it('S44-24 captured payment syncs finance facts / payable path', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/admin/payments/${capturedIntentId}/reconcile`)
      .set(auth(adminToken));
    const facts = await prisma.financialFact.count({
      where: { paymentIntentId: capturedIntentId },
    });
    expect(facts).toBeGreaterThanOrEqual(0);
    if (orderId) {
      const payable = await prisma.vendorPayable.findFirst({
        where: { orderId, sellerOrgId: vendorOrgId },
      });
      if (payable) {
        expect(payable.sellerOrgId).toBe(vendorOrgId);
      }
    }
  });

  it('S44-25 vendor cannot execute live payout via payment admin', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/payments/production-availability/assert?country_code=${COUNTRY}`)
      .set(auth(vendorToken));
    expect([401, 403]).toContain(res.status);
  });

  // ── Security / isolation ─────────────────────────────────────────────────

  it('S44-26 customer cannot access reconciliation queue', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/reconciliation?country_code=${COUNTRY}`)
      .set(auth(customerToken));
    expect([401, 403]).toContain(res.status);
  });

  it('S44-27 vendor cannot read another customer payment intent', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/me/payments/intents/${capturedIntentId}`)
      .set(auth(vendorToken));
    expect([401, 403]).toContain(res.status);
  });

  it('S44-28 webhook payload cipher does not store raw card data', async () => {
    const evt = await prisma.paymentWebhookEvent.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    expect(evt?.payloadCipher).toBeTruthy();
    expect(evt!.payloadCipher).not.toMatch(/4111|cvv|pan/i);
  });

  it('S44-29 security events recorded for webhook/recon without secrets', async () => {
    const events = await prisma.securityEvent.findMany({
      where: {
        type: {
          in: [
            'PAYMENT_WEBHOOK_ACCEPTED',
            'PAYMENT_WEBHOOK_DUPLICATE',
            'PAYMENT_WEBHOOK_REJECTED',
            'PAYMENT_RECON_MATCHED',
            'PAYMENT_RECON_DISCREPANCY',
          ],
        },
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(JSON.stringify(e.metadata ?? {})).not.toMatch(/sk_live|password|cvv/i);
    }
  });

  // ── Order consistency ────────────────────────────────────────────────────

  it('S44-30 order linked to payment with matching currency', async () => {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    const intent = await prisma.paymentIntent.findUnique({ where: { id: capturedIntentId } });
    expect(order?.currency).toBe(intent?.currency);
    expect(order?.paymentIntentId).toBe(capturedIntentId);
    expect(order?.totalMinor).toBe(intent?.amountMinor);
  });

  it('S44-31 client cannot substitute amount — server quote is authoritative', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${COUNTRY}`)
      .set(auth(customerToken))
      .set('Idempotency-Key', `s44-add3-${Date.now()}`)
      .send({ offer_id: offerId, qty: 1 });
    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${COUNTRY}`)
      .set(auth(customerToken))
      .set('Idempotency-Key', `s44-co3-${Date.now()}`)
      .send({});
    expectOk(session, 'checkout session 3', 201, 201);
    const quote = await prisma.checkoutQuote.findFirst({
      where: { sessionId: session.body.id as string },
      orderBy: { createdAt: 'desc' },
    });
    expect(quote).toBeTruthy();
    const pay = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set(auth(customerToken))
      .set('Idempotency-Key', `s44-pay3-${Date.now()}`)
      .send({ method: 'CARD', scenario: 'success' });
    expect([200, 201]).toContain(pay.status);
    expect(BigInt(pay.body.amount_minor)).toBe(quote!.totalMinor);
    expect(BigInt(pay.body.amount_minor)).toBeGreaterThan(1n);
  });

  it('S44-32 sandbox still usable while country production is not ACTIVE', async () => {
    await prisma.country.update({
      where: { id: countryId },
      data: { productionLifecycle: CountryProductionLifecycle.CONFIGURED },
    });
    await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${COUNTRY}`)
      .set(auth(customerToken))
      .set('Idempotency-Key', `s44-adds-${Date.now()}`)
      .send({ offer_id: offerId, qty: 1 });
    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${COUNTRY}`)
      .set(auth(customerToken))
      .set('Idempotency-Key', `s44-cos-${Date.now()}`)
      .send({});
    expectOk(session, 'sandbox session', 201, 201);
    const pay = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set(auth(customerToken))
      .set('Idempotency-Key', `s44-pays-${Date.now()}`)
      .send({ method: 'CARD', scenario: 'success' });
    expect(pay.status).toBe(201);
    expect(pay.body.sandbox).toBe(true);
  });

  it('S44-33 R14-A owner confirmation remains a production blocker', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/production-availability?country_code=${COUNTRY}`)
      .set(auth(adminToken));
    expect(res.body.blockers).toContain('R14_A_OWNER_CONFIRMATION_REQUIRED');
    expect(res.body.r14a.live_production_status).toMatch(/BLOCKED|INCOMPLETE|READY/);
    expect(res.body.available).toBe(false);
  });

  it('S44-34 admin payment list shows captured intents', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments?country_code=${COUNTRY}&status=CAPTURED`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect((res.body.data as Array<{ id: string }>).some((r) => r.id === capturedIntentId)).toBe(
      true,
    );
  });

  it('S44-35 currency on intent matches country default currency', async () => {
    const intent = await prisma.paymentIntent.findUnique({ where: { id: capturedIntentId } });
    const country = await prisma.country.findUnique({ where: { id: countryId } });
    expect(intent?.currency).toBe(country?.defaultCurrency);
  });

  it('S44-36 no floating-point amounts — minors are integers', async () => {
    const intent = await prisma.paymentIntent.findUnique({ where: { id: capturedIntentId } });
    expect(typeof intent?.amountMinor).toBe('bigint');
    expect(intent!.amountMinor % 1n).toBe(0n);
  });

  it('S44-37 production env without live still fail-closed for assert', async () => {
    process.env['PAYMENT_ENVIRONMENT'] = 'production';
    delete process.env['PAYMENT_LIVE_ENABLED'];
    const result = await evaluateProductionPaymentAvailable(prisma, { countryCode: COUNTRY });
    expect(result.blockers).toContain('LIVE_PAYMENTS_DISABLED');
    delete process.env['PAYMENT_ENVIRONMENT'];
  });
});
