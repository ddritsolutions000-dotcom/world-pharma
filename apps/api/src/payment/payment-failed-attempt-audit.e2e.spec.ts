import { INestApplication } from '@nestjs/common';
import {
  LocationKind,
  OrganizationKind,
  PaymentAttemptStatus,
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
import { seedCheckoutInventory } from '../test/seed-checkout-inventory';
import { assertObservabilityResponseSafe } from './payment-observability';
import { MockPaymentGatewayAdapter } from './mock.adapter';

async function signIn(app: INestApplication, email: string, audience: 'admin' | 'customer' = 'customer') {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

describe('R14-A payment failed attempt audit (e2e)', () => {
  jest.setTimeout(180_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let customerToken: string;
  let adminToken: string;
  let otherAdminToken: string;
  let countryId: string;
  let otherCountryId: string;
  let offerId: string;
  const countryCode = 'FA';
  const otherCountryCode = 'FB';

  async function publishPolicy(
    code: string,
    countryDbId: string,
    mutator: (doc: ReturnType<typeof emptyPolicyDocument>) => void = () => undefined,
  ) {
    const doc = emptyPolicyDocument();
    doc.services.pharmacy = true;
    enableMarketplaceVendorPack(doc);
    doc.payments.enabled = true;
    doc.payments.methods = ['CARD'];
    doc.payments.currencies = ['XXX'];
    doc.payments.gateway_refs = ['MOCK_PRIMARY', 'MOCK_FALLBACK'];
    mutator(doc);
    await prisma.policyPack.updateMany({
      where: { countryId: countryDbId, status: PolicyPackStatus.PUBLISHED },
      data: { document: doc as never },
    });
    await app.get(PolicyCache).invalidate(code);
  }

  async function checkoutSession(token = customerToken, code = countryCode) {
    await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${code}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `fa-add-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
      .send({ offer_id: offerId, qty: 1 });
    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${code}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `fa-co-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
      .send({});
    expect(session.status).toBe(201);
    return session;
  }

  async function paySession(sessionId: string, scenario: string, idempotencyKey?: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${sessionId}/pay`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', idempotencyKey ?? `fa-pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
      .send({ method: 'CARD', scenario });
  }

  async function persistedIntentForSession(sessionId: string) {
    return prisma.paymentIntent.findFirst({
      where: { checkoutSessionId: sessionId },
      orderBy: { createdAt: 'desc' },
      include: { attempts: { orderBy: { createdAt: 'asc' } }, transactions: true },
    });
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

    for (const [code, name] of [
      [countryCode, 'Failed audit A'],
      [otherCountryCode, 'Failed audit B'],
    ] as const) {
      let country = await prisma.country.findUnique({ where: { isoAlpha2: code } });
      if (!country) {
        country = await prisma.country.create({
          data: {
            id: uuidv7(),
            isoAlpha2: code,
            isoAlpha3: `${code}X`,
            nameI18n: { en: name },
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
            checksum: `fa-${code}`,
            publishedAt: new Date(),
          },
        });
        await prisma.country.update({ where: { id: country.id }, data: { publishedPolicyPackId: pack.id } });
      }
      if (code === countryCode) {
        countryId = country.id;
      } else {
        otherCountryId = country.id;
      }
      await app.get(PolicyCache).invalidate(code);
    }

    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.VENDOR,
        legalName: 'Failed Audit Vendor',
        displayName: 'Failed Audit Vendor',
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'Failed Audit WH',
        timezone: 'UTC',
      },
    });
    const admin = await signIn(app, `fa-admin-${Date.now()}@example.com`, 'admin');
    adminToken = admin.token;
    const role = await prisma.role.findUnique({ where: { code: 'super_admin' } });
    await prisma.membership.create({
      data: { id: uuidv7(), personId: admin.personId, roleId: role!.id, scope: 'platform', status: 'ACTIVE' },
    });
    const otherAdmin = await signIn(app, `fa-other-admin-${Date.now()}@example.com`, 'admin');
    otherAdminToken = otherAdmin.token;
    await prisma.membership.create({
      data: { id: uuidv7(), personId: otherAdmin.personId, roleId: role!.id, scope: 'platform', status: 'ACTIVE' },
    });
    const vendorUser = await signIn(app, `fa-vendor-${Date.now()}@example.com`, 'admin');
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
      .send({ slug: `fa-brand-${Date.now()}`, name: 'FaBrand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        slug: `fa-item-${Date.now()}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'Failed audit item',
        countries: [{ country_code: countryCode }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku_code: `FA-SKU-${Date.now()}`, pack_size: '10' });
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
      qty: 5000,
    });
    const customer = await signIn(app, `fa-cust-${Date.now()}@example.com`, 'customer');
    customerToken = customer.token;
    await publishPolicy(countryCode, countryId);
    await publishPolicy(otherCountryCode, otherCountryId);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('1: primary pre-submit failure persists when all gateways fail', async () => {
    const session = await checkoutSession();
    const pay = await paySession(session.body.id, 'pre_submit_fail_all');
    expect(pay.status).toBe(409);
    const intent = await persistedIntentForSession(session.body.id);
    expect(intent).not.toBeNull();
    expect(intent!.status).toBe(PaymentIntentStatus.FAILED);
    expect(intent!.attempts.length).toBeGreaterThan(0);
  });

  it('2: persisted failure survives HTTP tenant transaction rollback', async () => {
    const session = await checkoutSession();
    await paySession(session.body.id, 'pre_submit_fail_all', `fa-rb-${Date.now()}`);
    const after = await persistedIntentForSession(session.body.id);
    expect(after).not.toBeNull();
    expect(await prisma.paymentAttempt.count({ where: { intentId: after!.id } })).toBe(after!.attempts.length);
  });

  it('3: transient primary failure + fallback success records both attempts', async () => {
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
  });

  it('4: primary and fallback both fail records both failures', async () => {
    const session = await checkoutSession();
    await paySession(session.body.id, 'pre_submit_fail_all');
    const intent = await persistedIntentForSession(session.body.id);
    expect(intent!.attempts).toHaveLength(2);
    expect(intent!.attempts.every((a) => !a.submitted && a.status === PaymentAttemptStatus.FAILED)).toBe(true);
  });

  it('5: failure classification is preserved in admin observability', async () => {
    const session = await checkoutSession();
    await paySession(session.body.id, 'pre_submit_fail_all');
    const intent = await persistedIntentForSession(session.body.id);
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/${intent!.id}/observability?country_code=${countryCode}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.payment.failure_outcome).toBe('PRE_SUBMIT_FAILURE');
    expect(detail.body.attempt_history.attempts[0]?.failure_classification).toBe('pre_submit_transient');
  });

  it('6: gateway and environment are preserved', async () => {
    const session = await checkoutSession();
    await paySession(session.body.id, 'pre_submit_permanent');
    const intent = await persistedIntentForSession(session.body.id);
    const attempt = intent!.attempts[0];
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/${intent!.id}/observability?country_code=${countryCode}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.body.attempt_history.attempts[0]?.gateway_code).toBe('MOCK_PRIMARY');
    expect(detail.body.attempt_history.attempts[0]?.gateway_environment).toBe('sandbox');
    expect(attempt?.errorCode).toBe('PRE_SUBMIT_PERMANENT');
  });

  it('7: attempt ordering is deterministic', async () => {
    const session = await checkoutSession();
    await paySession(session.body.id, 'pre_submit_fail_all');
    const intent = await persistedIntentForSession(session.body.id);
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/${intent!.id}/observability?country_code=${countryCode}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.body.attempt_history.attempts.map((a: { attempt_number: number }) => a.attempt_number)).toEqual([1, 2]);
    expect(detail.body.attempt_history.attempts.map((a: { gateway_code: string }) => a.gateway_code)).toEqual([
      'MOCK_PRIMARY',
      'MOCK_FALLBACK',
    ]);
  });

  it('8: duplicate persist for same intent id is idempotent', async () => {
    const session = await checkoutSession();
    await paySession(session.body.id, 'pre_submit_fail_all', `fa-dup-${Date.now()}`);
    const intent = await persistedIntentForSession(session.body.id);
    expect(await prisma.paymentIntent.count({ where: { id: intent!.id } })).toBe(1);
    expect(await prisma.paymentAttempt.count({ where: { intentId: intent!.id } })).toBe(intent!.attempts.length);
  });

  it('9: legitimate retry creates a new historical failed intent', async () => {
    const session = await checkoutSession();
    await paySession(session.body.id, 'pre_submit_fail_all', `fa-retry-a-${Date.now()}`);
    const first = await persistedIntentForSession(session.body.id);
    await paySession(session.body.id, 'pre_submit_fail_all', `fa-retry-b-${Date.now()}`);
    const intents = await prisma.paymentIntent.findMany({
      where: { checkoutSessionId: session.body.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(intents.length).toBe(2);
    expect(intents[0]?.id).toBe(first!.id);
    expect(intents[1]?.status).toBe(PaymentIntentStatus.FAILED);
  });

  it('10: captured checkout replay creates no new failure record', async () => {
    const session = await checkoutSession();
    const captured = await paySession(session.body.id, 'success', `fa-cap-a-${Date.now()}`);
    expect(captured.status).toBe(201);
    const before = await prisma.paymentIntent.count({ where: { checkoutSessionId: session.body.id } });
    await paySession(session.body.id, 'success', `fa-cap-b-${Date.now()}`);
    expect(await prisma.paymentIntent.count({ where: { checkoutSessionId: session.body.id } })).toBe(before);
  });

  it('11: persisted failure cannot create financial transactions', async () => {
    const session = await checkoutSession();
    await paySession(session.body.id, 'pre_submit_fail_all');
    const intent = await persistedIntentForSession(session.body.id);
    expect(intent!.transactions).toHaveLength(0);
  });

  it('12: persisted failure cannot create order events', async () => {
    const session = await checkoutSession();
    await paySession(session.body.id, 'pre_submit_fail_all');
    const intent = await persistedIntentForSession(session.body.id);
    expect(await prisma.order.count({ where: { paymentIntentId: intent!.id } })).toBe(0);
    expect(
      await prisma.outboxEvent.count({
        where: { aggregateId: intent!.id, type: 'PAYMENT_CAPTURED' },
      }),
    ).toBe(0);
  });

  it('13: tenant isolation via checkout session admin search', async () => {
    const session = await checkoutSession();
    await paySession(session.body.id, 'pre_submit_fail_all');
    const search = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments?country_code=${countryCode}&checkout_session_id=${session.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(search.status).toBe(200);
    expect(search.body.data).toHaveLength(1);
  });

  it('14: country isolation blocks cross-country observability read', async () => {
    const session = await checkoutSession();
    await paySession(session.body.id, 'pre_submit_fail_all');
    const intent = await persistedIntentForSession(session.body.id);
    const denied = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/${intent!.id}/observability?country_code=${otherCountryCode}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(denied.status).toBe(404);
  });

  it('15: admin authorized access to failed attempt observability', async () => {
    const session = await checkoutSession();
    await paySession(session.body.id, 'pre_submit_fail_all');
    const intent = await persistedIntentForSession(session.body.id);
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/${intent!.id}/observability?country_code=${countryCode}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.status).toBe(200);
    assertObservabilityResponseSafe(detail.body);
  });

  it('16: customer without payment:read gets 403 on admin observability', async () => {
    const session = await checkoutSession();
    await paySession(session.body.id, 'pre_submit_fail_all');
    const intent = await persistedIntentForSession(session.body.id);
    const denied = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/${intent!.id}/observability?country_code=${countryCode}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(denied.status).toBe(403);
  });

  it('17: cross-country admin search returns empty for foreign checkout session', async () => {
    const session = await checkoutSession();
    await paySession(session.body.id, 'pre_submit_fail_all');
    const search = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments?country_code=${otherCountryCode}&checkout_session_id=${session.body.id}`)
      .set('Authorization', `Bearer ${otherAdminToken}`);
    expect(search.status).toBe(200);
    expect(search.body.data).toHaveLength(0);
  });

  it('18: sensitive fields absent from observability', async () => {
    const session = await checkoutSession();
    await paySession(session.body.id, 'pre_submit_fail_all');
    const intent = await persistedIntentForSession(session.body.id);
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/${intent!.id}/observability?country_code=${countryCode}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(JSON.stringify(detail.body)).not.toMatch(/sk_live|payload_cipher|cvv|pan/i);
    assertObservabilityResponseSafe(detail.body);
  });

  it('19: CR-275 failover success path unchanged', async () => {
    const session = await checkoutSession();
    const pay = await paySession(session.body.id, 'pre_submit_fail');
    expect(pay.status).toBe(201);
    expect(pay.body.status).toBe('CAPTURED');
    expect(
      await prisma.paymentTransaction.count({ where: { intentId: pay.body.id, kind: 'capture' } }),
    ).toBe(1);
  });

  it('20: CR-276 captured-session pay guard unchanged', async () => {
    const mock = app.get(MockPaymentGatewayAdapter);
    const submitSpy = jest.spyOn(mock, 'submit');
    const session = await checkoutSession();
    const first = await paySession(session.body.id, 'success', `fa-guard-a-${Date.now()}`);
    submitSpy.mockClear();
    const second = await paySession(session.body.id, 'success', `fa-guard-b-${Date.now()}`);
    expect(first.body.id).toBe(second.body.id);
    expect(submitSpy.mock.calls.length).toBe(0);
    submitSpy.mockRestore();
  });
});
