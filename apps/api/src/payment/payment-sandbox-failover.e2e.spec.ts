import { INestApplication } from '@nestjs/common';
import {
  LocationKind,
  OrganizationKind,
  PaymentAttemptStatus,
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
import { seedCheckoutInventory } from '../test/seed-checkout-inventory';
import { assertObservabilityResponseSafe } from './payment-observability';
import { MockPaymentGatewayAdapter } from './mock.adapter';
import { signSandboxPayload } from './hmac';

async function signIn(app: INestApplication, email: string, audience: 'admin' | 'customer' = 'customer') {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

describe('R14-A payment sandbox failover (e2e)', () => {
  jest.setTimeout(180_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let customerToken: string;
  let adminToken: string;
  let countryId: string;
  let offerId: string;
  let inventoryLotId: string;
  const countryCode = 'SF';

  async function publishPolicy(mutator: (doc: ReturnType<typeof emptyPolicyDocument>) => void) {
    const doc = emptyPolicyDocument();
    doc.services.pharmacy = true;
    enableMarketplaceVendorPack(doc);
    doc.payments.enabled = true;
    doc.payments.methods = ['CARD'];
    doc.payments.currencies = ['XXX'];
    doc.payments.gateway_refs = ['MOCK_PRIMARY', 'MOCK_FALLBACK'];
    mutator(doc);
    await prisma.policyPack.updateMany({
      where: { countryId, status: PolicyPackStatus.PUBLISHED },
      data: { document: doc as never },
    });
    await app.get(PolicyCache).invalidate(countryCode);
  }

  async function checkoutSession() {
    await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${countryCode}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `sf-add-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
      .send({ offer_id: offerId, qty: 1 });
    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${countryCode}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `sf-co-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
      .send({});
    expect(session.status).toBe(201);
    return session;
  }

  async function paySession(sessionId: string, scenario: string, idempotencyKey?: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${sessionId}/pay`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', idempotencyKey ?? `sf-pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
      .send({ method: 'CARD', scenario });
  }

  async function attemptHistory(intentId: string) {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/${intentId}/observability?country_code=${countryCode}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    assertObservabilityResponseSafe(res.body);
    return res.body.attempt_history as {
      fallback_occurred: boolean;
      final_selected_gateway: string | null;
      attempts: Array<{
        attempt_number: number;
        gateway_code: string;
        gateway_environment: string;
        outcome: string;
        failure_classification: string | null;
        selected: boolean;
      }>;
    };
  }

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

    let country = await prisma.country.findUnique({ where: { isoAlpha2: countryCode } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: countryCode,
          isoAlpha3: 'SFF',
          nameI18n: { en: 'Sandbox failover test' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
          dataResidencyMode: 'shared',
        },
      });
      const doc = emptyPolicyDocument();
      doc.services.pharmacy = true;
      enableMarketplaceVendorPack(doc);
      doc.payments.enabled = true;
      doc.payments.methods = ['CARD'];
      doc.payments.gateway_refs = ['MOCK_PRIMARY', 'MOCK_FALLBACK'];
      doc.payments.currencies = ['XXX'];
      const pack = await prisma.policyPack.create({
        data: {
          id: uuidv7(),
          countryId: country.id,
          version: 1,
          status: PolicyPackStatus.PUBLISHED,
          document: doc as never,
          checksum: 'sandbox-failover',
          publishedAt: new Date(),
        },
      });
      await prisma.country.update({ where: { id: country.id }, data: { publishedPolicyPackId: pack.id } });
    }
    countryId = country.id;
    await app.get(PolicyCache).invalidate(countryCode);

    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: 'Failover Vendor',
        displayName: 'Failover Vendor',
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId: country.id,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'Failover WH',
        timezone: 'UTC',
      },
    });
    const admin = await signIn(app, `sf-admin-${Date.now()}@example.com`, 'admin');
    adminToken = admin.token;
    const role = await prisma.role.findUnique({ where: { code: 'super_admin' } });
    await prisma.membership.create({
      data: { id: uuidv7(), personId: admin.personId, roleId: role!.id, scope: 'platform', status: 'ACTIVE' },
    });
    const vendorUser = await signIn(app, `sf-vendor-${Date.now()}@example.com`, 'admin');
    const orgRole = await prisma.role.findUnique({ where: { code: 'org_owner' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: vendorUser.personId,
        roleId: orgRole!.id,
        scope: 'organization',
        organizationId: vendor.id,
        status: 'ACTIVE',
      },
    });
    await activateMarketplaceSeller(app, {
      vendorToken: vendorUser.token,
      adminToken: admin.token,
      sellerOrgId: vendor.id,
    });
    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ slug: `sf-brand-${Date.now()}`, name: 'SfBrand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        slug: `sf-item-${Date.now()}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'Failover item',
        countries: [{ country_code: countryCode }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku_code: `SF-SKU-${Date.now()}`, pack_size: '10' });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set('Authorization', `Bearer ${adminToken}`);
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
        sell_minor: '200',
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
      qty: 100,
    });
    const lots = await request(app.getHttpServer())
      .get(`/api/v1/vendor/inventory/lots?owner_org_id=${vendor.id}`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    inventoryLotId = lots.body.data?.[0]?.id as string;
    const customer = await signIn(app, `sf-cust-${Date.now()}@example.com`, 'customer');
    customerToken = customer.token;
  });

  beforeEach(async () => {
    if (inventoryLotId) {
      await prisma.inventoryBalance.updateMany({
        where: { lotId: inventoryLotId },
        data: {
          onHand: 100,
          reserved: 0,
          damaged: 0,
          expired: 0,
          quarantined: 0,
          returned: 0,
          inTransit: 0,
          available: 100,
        },
      });
    }
  });

  afterEach(async () => {
    await publishPolicy(() => undefined);
    const fallbackAccount = await prisma.paymentGatewayAccount.findUnique({
      where: { code: 'MOCK_FALLBACK_ACCOUNT' },
    });
    if (fallbackAccount) {
      await prisma.paymentGatewayAccount.update({
        where: { id: fallbackAccount.id },
        data: { countriesCsv: '*', currenciesCsv: '*', methodsCsv: 'CARD,BANK_TRANSFER,WALLET,COD', active: true },
      });
    }
    const fallbackGw = await prisma.paymentGateway.findUnique({ where: { code: 'MOCK_FALLBACK' } });
    if (fallbackGw) {
      await prisma.paymentGateway.update({
        where: { id: fallbackGw.id },
        data: { active: true, healthScore: 100 },
      });
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  it('1: primary success does not invoke fallback', async () => {
    await publishPolicy(() => undefined);
    const session = await checkoutSession();
    expect(session.status).toBe(201);
    const pay = await paySession(session.body.id, 'success');
    expect(pay.status).toBe(201);
    expect(pay.body.status).toBe('CAPTURED');
    const attempts = await prisma.paymentAttempt.findMany({ where: { intentId: pay.body.id } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.submitted).toBe(true);
    const history = await attemptHistory(pay.body.id);
    expect(history.fallback_occurred).toBe(false);
    expect(history.final_selected_gateway).toBe('MOCK_PRIMARY');
  });

  it('2: primary transient failure falls back and succeeds', async () => {
    await publishPolicy(() => undefined);
    const session = await checkoutSession();
    const pay = await paySession(session.body.id, 'pre_submit_fail');
    expect(pay.status).toBe(201);
    expect(pay.body.status).toBe('CAPTURED');
    const attempts = await prisma.paymentAttempt.findMany({
      where: { intentId: pay.body.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(attempts).toHaveLength(2);
    expect(attempts[0]?.submitted).toBe(false);
    expect(attempts[1]?.submitted).toBe(true);
    const history = await attemptHistory(pay.body.id);
    expect(history.fallback_occurred).toBe(true);
    expect(history.final_selected_gateway).toBe('MOCK_FALLBACK');
    expect(history.attempts[0]?.gateway_code).toBe('MOCK_PRIMARY');
    expect(history.attempts[0]?.failure_classification).toBe('pre_submit_transient');
    expect(history.attempts[1]?.gateway_code).toBe('MOCK_FALLBACK');
    expect(history.attempts[1]?.outcome).toBe('SUCCESS');
  });

  it('3: primary and fallback both fail pre-submit', async () => {
    await publishPolicy(() => undefined);
    const session = await checkoutSession();
    const pay = await paySession(session.body.id, 'pre_submit_fail_all');
    expect(pay.status).toBe(409);
    expect(JSON.stringify(pay.body)).toMatch(/PAYMENT_FAILED|payment failed/i);
    const intent = await prisma.paymentIntent.findFirst({
      where: { checkoutSessionId: session.body.id },
      include: { attempts: { orderBy: { createdAt: 'asc' } } },
    });
    expect(intent?.status).toBe('FAILED');
    expect(intent?.attempts).toHaveLength(2);
    expect(intent?.attempts.every((a) => !a.submitted)).toBe(true);
  });

  it('4: permanent primary failure does not blind-fallback', async () => {
    await publishPolicy(() => undefined);
    const session = await checkoutSession();
    const pay = await paySession(session.body.id, 'pre_submit_permanent');
    expect(pay.status).toBe(409);
    expect(JSON.stringify(pay.body)).toMatch(/PAYMENT_FAILED|payment failed/i);
    const intent = await prisma.paymentIntent.findFirst({
      where: { checkoutSessionId: session.body.id },
      include: { attempts: true },
    });
    expect(intent?.status).toBe('FAILED');
    expect(intent?.attempts).toHaveLength(1);
    expect(intent?.attempts[0]?.errorCode).toBe('PRE_SUBMIT_PERMANENT');
  });

  it('5: no eligible fallback when policy excludes fallback gateway', async () => {
    await publishPolicy((doc) => {
      doc.payments.gateway_refs = ['MOCK_PRIMARY'];
    });
    const session = await checkoutSession();
    const pay = await paySession(session.body.id, 'pre_submit_fail');
    expect(pay.status).toBe(409);
    expect(JSON.stringify(pay.body)).toMatch(/PAYMENT_FAILED|payment failed/i);
    const intent = await prisma.paymentIntent.findFirst({
      where: { checkoutSessionId: session.body.id },
      include: { attempts: true },
    });
    expect(intent?.status).toBe('FAILED');
    expect(intent?.attempts).toHaveLength(1);
  });

  it('6: multiple eligible gateways use deterministic priority', async () => {
    await publishPolicy((doc) => {
      doc.payments.gateway_refs = ['MOCK_PRIMARY', 'MOCK_FALLBACK'];
    });
    const matrix = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/routing-matrix?country_code=${countryCode}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(matrix.body.effective_route?.gateway_code).toBe('MOCK_PRIMARY');
    const session = await checkoutSession();
    const pay = await paySession(session.body.id, 'pre_submit_fail');
    expect(pay.status).toBe(201);
    const history = await attemptHistory(pay.body.id);
    expect(history.attempts.map((a) => a.gateway_code)).toEqual(['MOCK_PRIMARY', 'MOCK_FALLBACK']);
    expect(history.attempts[0]?.attempt_number).toBe(1);
    expect(history.attempts[1]?.attempt_number).toBe(2);
  });

  it('7: country restriction blocks fallback gateway', async () => {
    await publishPolicy(() => undefined);
    const fallbackAccount = await prisma.paymentGatewayAccount.findUniqueOrThrow({
      where: { code: 'MOCK_FALLBACK_ACCOUNT' },
    });
    await prisma.paymentGatewayAccount.update({
      where: { id: fallbackAccount.id },
      data: { countriesCsv: 'ZZ' },
    });
    const session = await checkoutSession();
    const pay = await paySession(session.body.id, 'pre_submit_fail');
    expect(pay.status).toBe(409);
  });

  it('8: currency restriction blocks fallback gateway', async () => {
    await publishPolicy(() => undefined);
    const fallbackAccount = await prisma.paymentGatewayAccount.findUniqueOrThrow({
      where: { code: 'MOCK_FALLBACK_ACCOUNT' },
    });
    await prisma.paymentGatewayAccount.update({
      where: { id: fallbackAccount.id },
      data: { currenciesCsv: 'USD' },
    });
    const session = await checkoutSession();
    const pay = await paySession(session.body.id, 'pre_submit_fail');
    expect(pay.status).toBe(409);
  });

  it('9: method restriction blocks fallback gateway', async () => {
    await publishPolicy((doc) => {
      doc.payments.methods = ['CARD'];
    });
    const fallbackAccount = await prisma.paymentGatewayAccount.findUniqueOrThrow({
      where: { code: 'MOCK_FALLBACK_ACCOUNT' },
    });
    await prisma.paymentGatewayAccount.update({
      where: { id: fallbackAccount.id },
      data: { methodsCsv: 'COD' },
    });
    const session = await checkoutSession();
    const pay = await paySession(session.body.id, 'pre_submit_fail');
    expect(pay.status).toBe(409);
  });

  it('10: gateway_refs policy blocks fallback even when router lists it', async () => {
    await publishPolicy((doc) => {
      doc.payments.gateway_refs = ['MOCK_PRIMARY'];
    });
    const matrix = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/routing-matrix?country_code=${countryCode}`)
      .set('Authorization', `Bearer ${adminToken}`);
    const fallbackRow = matrix.body.rows.find((row: { gateway_code: string }) => row.gateway_code === 'MOCK_FALLBACK');
    expect(fallbackRow?.policy_allowed).toBe(false);
    const session = await checkoutSession();
    const pay = await paySession(session.body.id, 'pre_submit_fail');
    expect(pay.status).toBe(409);
  });

  it('11: production environment mismatch remains fail-closed', async () => {
    await publishPolicy(() => undefined);
    const matrix = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/routing-matrix?country_code=${countryCode}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(matrix.body.production_preview.active).toBe(false);
    expect(
      matrix.body.production_preview.rows.some(
        (row: { gateway_environment: string; fail_closed_reason: string | null }) =>
          row.gateway_environment === 'production' && row.fail_closed_reason === 'mock_gateway_production_forbidden',
      ),
    ).toBe(true);
  });

  it('12: unknown gateway in policy fails closed', async () => {
    await publishPolicy((doc) => {
      doc.payments.gateway_refs = ['UNKNOWN_PSP_X'];
    });
    const session = await checkoutSession();
    const pay = await paySession(session.body.id, 'success');
    expect(pay.status).toBe(409);
    expect(JSON.stringify(pay.body)).toMatch(/NO_PAYMENT_GATEWAY|gateway/i);
  });

  it('13: capability / registry mismatch fails closed', async () => {
    await publishPolicy((doc) => {
      doc.payments.gateway_refs = ['MOCK_PRIMARY', 'NOT_REGISTERED_GATEWAY'];
    });
    const matrix = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/routing-matrix?country_code=${countryCode}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(
      matrix.body.rows.find((row: { gateway_code: string }) => row.gateway_code === 'NOT_REGISTERED_GATEWAY')
        ?.fail_closed_reason,
    ).toBeTruthy();
  });

  it('14: payments disabled fails closed before gateway contact', async () => {
    await publishPolicy((doc) => {
      doc.payments.enabled = false;
    });
    const session = await checkoutSession();
    const pay = await paySession(session.body.id, 'success');
    expect(pay.status).toBe(409);
    expect(JSON.stringify(pay.body)).toMatch(/PAYMENTS_DISABLED|disabled/i);
    expect(await prisma.paymentIntent.count({ where: { checkoutSessionId: session.body.id } })).toBe(0);
  });

  it('15: duplicate pay request is idempotent', async () => {
    await publishPolicy(() => undefined);
    const session = await checkoutSession();
    const key = `sf-idem-${Date.now()}`;
    const first = await paySession(session.body.id, 'success', key);
    const second = await paySession(session.body.id, 'success', key);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(await prisma.paymentIntent.count({ where: { checkoutSessionId: session.body.id } })).toBe(1);
  });

  it('16: failover retry does not duplicate capture transactions', async () => {
    await publishPolicy(() => undefined);
    const session = await checkoutSession();
    const pay = await paySession(session.body.id, 'pre_submit_fail');
    expect(pay.status).toBe(201);
    expect(pay.body.status).toBe('CAPTURED');
    const captureTx = await prisma.paymentTransaction.count({
      where: { intentId: pay.body.id, kind: 'capture' },
    });
    expect(captureTx).toBe(1);
    expect(await prisma.paymentAttempt.count({ where: { intentId: pay.body.id } })).toBe(2);
  });

  it('17: duplicate webhook remains idempotent', async () => {
    await publishPolicy(() => undefined);
    const session = await checkoutSession();
    const pay = await paySession(session.body.id, 'success');
    const attempt = await prisma.paymentAttempt.findFirst({ where: { intentId: pay.body.id } });
    const payload = JSON.stringify({
      event_id: `sf-dup-${Date.now()}`,
      type: 'payment.captured',
      provider_ref: attempt?.providerRef,
    });
    const first = await request(app.getHttpServer())
      .post('/api/v1/webhooks/payments/MOCK_PRIMARY')
      .set('x-sandbox-signature', signSandboxPayload(payload))
      .set('Content-Type', 'application/json')
      .send(payload);
    const dup = await request(app.getHttpServer())
      .post('/api/v1/webhooks/payments/MOCK_PRIMARY')
      .set('x-sandbox-signature', signSandboxPayload(payload))
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(first.status).toBeLessThan(300);
    expect(dup.body.duplicate).toBe(true);
    const txCount = await prisma.paymentTransaction.count({
      where: { intentId: pay.body.id, kind: 'capture' },
    });
    expect(txCount).toBe(1);
  });

  it('18: reconcile remains idempotent', async () => {
    await publishPolicy(() => undefined);
    const session = await checkoutSession();
    const pay = await paySession(session.body.id, 'success');
    const first = await request(app.getHttpServer())
      .post(`/api/v1/admin/payments/${pay.body.id}/reconcile`)
      .set('Authorization', `Bearer ${adminToken}`);
    const second = await request(app.getHttpServer())
      .post(`/api/v1/admin/payments/${pay.body.id}/reconcile`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(first.status).toBeLessThan(300);
    expect(second.status).toBeLessThan(300);
    expect(second.body.status).toBe(first.body.status);
    const reconCount = await prisma.paymentReconciliation.count({ where: { intentId: pay.body.id } });
    expect(reconCount).toBeGreaterThanOrEqual(1);
  });
});
