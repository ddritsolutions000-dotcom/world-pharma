import { INestApplication } from '@nestjs/common';
import {
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
import { seedCheckoutInventory } from '../test/seed-checkout-inventory';
import { signIn, provisionOrgAdmin, provisionSuperAdmin } from '../test/sign-in';
import { MockPaymentGatewayAdapter } from './mock.adapter';

describe('R14-A checkout pay guard (e2e)', () => {
  jest.setTimeout(180_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let customerToken: string;
  let otherToken: string;
  let adminToken: string;
  let offerId: string;
  let countryId: string;
  const countryCode = 'PG';

  async function checkoutSession(token = customerToken) {
    await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${countryCode}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `pg-add-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
      .send({ offer_id: offerId, qty: 1 });
    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${countryCode}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `pg-co-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
      .send({});
    expect(session.status).toBe(201);
    return session;
  }

  async function paySession(
    sessionId: string,
    scenario = 'success',
    idempotencyKey?: string,
    token = customerToken,
  ) {
    return request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${sessionId}/pay`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey ?? `pg-pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
      .send({ method: 'CARD', scenario });
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
          isoAlpha3: 'PGG',
          nameI18n: { en: 'Pay guard test' },
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
      doc.payments.gateway_refs = ['MOCK_PRIMARY'];
      doc.payments.currencies = ['XXX'];
      const pack = await prisma.policyPack.create({
        data: {
          id: uuidv7(),
          countryId: country.id,
          version: 1,
          status: PolicyPackStatus.PUBLISHED,
          document: doc as never,
          checksum: 'pay-guard',
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
        legalName: 'Pay Guard Vendor',
        displayName: 'Pay Guard Vendor',
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId: country.id,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'Pay Guard WH',
        timezone: 'UTC',
      },
    });
    const admin = await provisionSuperAdmin(app, prisma, 'pg-admin');
    adminToken = admin.token;
    const vendorUser = await provisionOrgAdmin(app, prisma, 'pg-vendor', vendor.id);
    await activateMarketplaceSeller(app, {
      vendorToken: vendorUser.token,
      adminToken: admin.token,
      sellerOrgId: vendor.id,
    });
    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ slug: `pg-brand-${Date.now()}`, name: 'PgBrand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        slug: `pg-item-${Date.now()}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'Pay guard item',
        countries: [{ country_code: countryCode }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku_code: `PG-SKU-${Date.now()}`, pack_size: '10' });
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
      qty: 200,
    });
    const customer = await signIn(app, `pg-cust-${Date.now()}@example.com`, 'customer');
    customerToken = customer.token;
    const other = await signIn(app, `pg-other-${Date.now()}@example.com`, 'customer');
    otherToken = other.token;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('1: first pay on fresh checkout creates one intent', async () => {
    const session = await checkoutSession();
    const pay = await paySession(session.body.id, 'success');
    expect(pay.status).toBe(201);
    expect(pay.body.status).toBe('CAPTURED');
    expect(await prisma.paymentIntent.count({ where: { checkoutSessionId: session.body.id } })).toBe(1);
  });

  it('2: second pay with same idempotency key returns existing intent', async () => {
    const session = await checkoutSession();
    const key = `pg-idem-same-${Date.now()}`;
    const first = await paySession(session.body.id, 'success', key);
    const second = await paySession(session.body.id, 'success', key);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(await prisma.paymentIntent.count({ where: { checkoutSessionId: session.body.id } })).toBe(1);
  });

  it('3: second pay with different idempotency key does not create second intent', async () => {
    const session = await checkoutSession();
    const first = await paySession(session.body.id, 'success', `pg-key-a-${Date.now()}`);
    const second = await paySession(session.body.id, 'success', `pg-key-b-${Date.now()}`);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(await prisma.paymentIntent.count({ where: { checkoutSessionId: session.body.id } })).toBe(1);
    expect(
      await prisma.paymentTransaction.count({
        where: { intentId: first.body.id, kind: 'capture' },
      }),
    ).toBe(1);
  });

  it('4: different checkout session allows independent payment', async () => {
    const sessionA = await checkoutSession(customerToken);
    const sessionB = await checkoutSession(otherToken);
    const payA = await paySession(sessionA.body.id, 'success', `pg-ind-a-${Date.now()}`, customerToken);
    const payB = await paySession(sessionB.body.id, 'success', `pg-ind-b-${Date.now()}`, otherToken);
    expect(payA.status).toBe(201);
    expect(payB.status).toBe(201);
    expect(payA.body.id).not.toBe(payB.body.id);
  });

  it('5: failed gateway payment allows retry with a new intent', async () => {
    const session = await checkoutSession();
    const failed = await paySession(session.body.id, 'failure', `pg-fail-${Date.now()}`);
    expect(failed.status).toBe(201);
    expect(failed.body.status).toBe('FAILED');
    const retry = await paySession(session.body.id, 'success', `pg-retry-${Date.now()}`);
    expect(retry.status).toBe(201);
    expect(retry.body.status).toBe('CAPTURED');
    expect(retry.body.id).not.toBe(failed.body.id);
    expect(await prisma.paymentIntent.count({ where: { checkoutSessionId: session.body.id } })).toBe(2);
  });

  it('6: transient pre-submit failover still ends with one captured intent', async () => {
    const doc = emptyPolicyDocument();
    doc.services.pharmacy = true;
    enableMarketplaceVendorPack(doc);
    doc.payments.enabled = true;
    doc.payments.methods = ['CARD'];
    doc.payments.gateway_refs = ['MOCK_PRIMARY', 'MOCK_FALLBACK'];
    doc.payments.currencies = ['XXX'];
    await prisma.policyPack.updateMany({
      where: { countryId, status: PolicyPackStatus.PUBLISHED },
      data: { document: doc as never },
    });
    await app.get(PolicyCache).invalidate(countryCode);
    const session = await checkoutSession();
    const pay = await paySession(session.body.id, 'pre_submit_fail', `pg-failover-${Date.now()}`);
    expect(pay.status).toBe(201);
    expect(pay.body.status).toBe('CAPTURED');
    expect(await prisma.paymentAttempt.count({ where: { intentId: pay.body.id } })).toBe(2);
    expect(
      await prisma.paymentTransaction.count({ where: { intentId: pay.body.id, kind: 'capture' } }),
    ).toBe(1);
    await prisma.policyPack.updateMany({
      where: { countryId, status: PolicyPackStatus.PUBLISHED },
      data: {
        document: (() => {
          const reset = emptyPolicyDocument();
          reset.services.pharmacy = true;
          enableMarketplaceVendorPack(reset);
          reset.payments.enabled = true;
          reset.payments.methods = ['CARD'];
          reset.payments.gateway_refs = ['MOCK_PRIMARY'];
          reset.payments.currencies = ['XXX'];
          return reset as never;
        })(),
      },
    });
    await app.get(PolicyCache).invalidate(countryCode);
  });

  it('7: captured checkout pay does not invoke gateway again', async () => {
    const mock = app.get(MockPaymentGatewayAdapter);
    const submitSpy = jest.spyOn(mock, 'submit');
    const session = await checkoutSession();
    submitSpy.mockClear();
    const first = await paySession(session.body.id, 'success', `pg-gw-a-${Date.now()}`);
    expect(first.status).toBe(201);
    const callsAfterFirst = submitSpy.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);
    submitSpy.mockClear();
    const second = await paySession(session.body.id, 'success', `pg-gw-b-${Date.now()}`);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(submitSpy.mock.calls.length).toBe(0);
    submitSpy.mockRestore();
  });

  it('8: captured checkout pay does not create second attempt', async () => {
    const session = await checkoutSession();
    const first = await paySession(session.body.id, 'success', `pg-att-a-${Date.now()}`);
    const attemptsBefore = await prisma.paymentAttempt.count({ where: { intentId: first.body.id } });
    await paySession(session.body.id, 'success', `pg-att-b-${Date.now()}`);
    expect(await prisma.paymentAttempt.count({ where: { intentId: first.body.id } })).toBe(attemptsBefore);
  });

  it('9: captured checkout pay does not emit duplicate payment captured events', async () => {
    const session = await checkoutSession();
    const first = await paySession(session.body.id, 'success', `pg-evt-a-${Date.now()}`);
    const eventsBefore = await prisma.outboxEvent.count({
      where: { aggregateId: first.body.id, type: 'PAYMENT_CAPTURED' },
    });
    await paySession(session.body.id, 'success', `pg-evt-b-${Date.now()}`);
    expect(
      await prisma.outboxEvent.count({
        where: { aggregateId: first.body.id, type: 'PAYMENT_CAPTURED' },
      }),
    ).toBe(eventsBefore);
  });

  it('10: captured checkout pay does not create duplicate order', async () => {
    const session = await checkoutSession();
    const first = await paySession(session.body.id, 'success', `pg-ord-a-${Date.now()}`);
    await paySession(session.body.id, 'success', `pg-ord-b-${Date.now()}`);
    expect(await prisma.order.count({ where: { paymentIntentId: first.body.id } })).toBe(1);
    expect(await prisma.order.count({ where: { checkoutSessionId: session.body.id } })).toBe(1);
  });

  it('11: concurrent duplicate pay requests produce one captured intent', async () => {
    const session = await checkoutSession();
    const [a, b] = await Promise.all([
      paySession(session.body.id, 'success', `pg-conc-a-${Date.now()}`),
      paySession(session.body.id, 'success', `pg-conc-b-${Date.now()}`),
    ]);
    const winner = a.status === 201 ? a : b;
    expect(winner.status).toBe(201);
    expect(winner.body.status).toBe('CAPTURED');
    expect([a.status, b.status].sort((x, y) => x - y)).toEqual([201, 409]);
    if (a.status === 201 && b.status === 201) {
      expect(a.body.id).toBe(b.body.id);
    }
    expect(await prisma.paymentIntent.count({ where: { checkoutSessionId: session.body.id } })).toBe(1);
    expect(
      await prisma.paymentIntent.count({
        where: { checkoutSessionId: session.body.id, status: PaymentIntentStatus.CAPTURED },
      }),
    ).toBe(1);
  });

  it('12: guard relies on persisted DB state after first capture', async () => {
    const session = await checkoutSession();
    const first = await paySession(session.body.id, 'success', `pg-db-a-${Date.now()}`);
    const persisted = await prisma.paymentIntent.findUnique({ where: { id: first.body.id } });
    expect(persisted?.status).toBe(PaymentIntentStatus.CAPTURED);
    const replay = await paySession(session.body.id, 'success', `pg-db-b-${Date.now()}`);
    expect(replay.body.id).toBe(first.body.id);
  });

  it('13: customer cannot pay another customer checkout session', async () => {
    const session = await checkoutSession(customerToken);
    const denied = await paySession(session.body.id, 'success', `pg-x-${Date.now()}`, otherToken);
    expect(denied.status).toBe(403);
  });

  it('14: admin observability shows one intent and one successful attempt after blocked replay', async () => {
    const session = await checkoutSession();
    const first = await paySession(session.body.id, 'success', `pg-obs-a-${Date.now()}`);
    await paySession(session.body.id, 'success', `pg-obs-b-${Date.now()}`);
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/${first.body.id}/observability?country_code=${countryCode}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.attempt_history.attempts).toHaveLength(1);
    expect(detail.body.attempt_history.final_selected_gateway).toBe('MOCK_PRIMARY');
    expect(JSON.stringify(detail.body)).not.toMatch(/sk_live|payload_cipher|cvv|pan/i);
  });
});
