import { INestApplication } from '@nestjs/common';
import {
  CheckoutStatus,
  InventoryReservationStatus,
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

describe('R14-A checkout session state (e2e)', () => {
  jest.setTimeout(240_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let customerToken: string;
  let adminToken: string;
  let offerId: string;
  let countryId: string;
  const countryCode = 'CS';

  async function checkoutSession(token = customerToken) {
    await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${countryCode}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `cs-add-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
      .send({ offer_id: offerId, qty: 1 });
    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${countryCode}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `cs-co-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
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
      .set('Idempotency-Key', idempotencyKey ?? `cs-pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
      .send({ method: 'CARD', scenario });
  }

  async function sessionRow(sessionId: string) {
    return prisma.checkoutSession.findUniqueOrThrow({ where: { id: sessionId } });
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
          nameI18n: { en: 'Checkout state' },
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
          checksum: 'cs-state',
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
        countryId,
        kind: OrganizationKind.VENDOR,
        legalName: 'CS Vendor',
        displayName: 'CS Vendor',
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'CS WH',
        timezone: 'UTC',
      },
    });
    const admin = await provisionSuperAdmin(app, prisma, 'cs-admin');
    adminToken = admin.token;
    const vendorUser = await provisionOrgAdmin(app, prisma, 'cs-vendor', vendor.id);
    await activateMarketplaceSeller(app, {
      vendorToken: vendorUser.token,
      adminToken: admin.token,
      sellerOrgId: vendor.id,
    });
    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ slug: `cs-brand-${Date.now()}`, name: 'CSBrand' });
    const catalogItem = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        slug: `cs-item-${Date.now()}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'CS item',
        countries: [{ country_code: countryCode }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${catalogItem.body.id}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku_code: `CS-SKU-${Date.now()}`, pack_size: '10' });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${catalogItem.body.id}/publish`)
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
    const customer = await signIn(app, `cs-cust-${Date.now()}@example.com`, 'customer');
    customerToken = customer.token;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('1-2: checkout starts READY_FOR_PAYMENT; CAPTURED moves to PAID', async () => {
    const session = await checkoutSession();
    expect((await sessionRow(session.body.id)).status).toBe(CheckoutStatus.READY_FOR_PAYMENT);
    const pay = await paySession(session.body.id, 'success', `cs-cap-${Date.now()}`);
    expect(pay.status).toBe(201);
    expect(pay.body.status).toBe('CAPTURED');
    expect((await sessionRow(session.body.id)).status).toBe(CheckoutStatus.PAID);
    expect(
      await prisma.outboxEvent.count({
        where: { aggregateId: session.body.id, type: 'CHECKOUT_SESSION_PAID' },
      }),
    ).toBeGreaterThan(0);
  });

  it('3-4: pre-submit failure moves to FAILED and releases reservation once', async () => {
    const session = await checkoutSession();
    const holdId = (await sessionRow(session.body.id)).reservationIds[0]!;
    const fail = await paySession(session.body.id, 'pre_submit_fail_all', `cs-pre-${Date.now()}`);
    expect(fail.status).toBe(409);
    expect((await sessionRow(session.body.id)).status).toBe(CheckoutStatus.FAILED);
    expect((await sessionRow(session.body.id)).reservationIds).toEqual([]);
    expect((await prisma.inventoryReservation.findUnique({ where: { id: holdId } }))!.status).toBe(
      InventoryReservationStatus.RELEASED,
    );
    await paySession(session.body.id, 'pre_submit_fail_all', `cs-pre-dup-${Date.now()}`);
    expect((await sessionRow(session.body.id)).status).toBe(CheckoutStatus.FAILED);
  });

  it('5-7: PROCESSING/UNKNOWN/REQUIRES_ACTION keep checkout payable without FAILED', async () => {
    const unknownSession = await checkoutSession();
    const unknown = await paySession(unknownSession.body.id, 'timeout', `cs-unk-${Date.now()}`);
    expect(unknown.body.status).toBe('UNKNOWN');
    expect((await sessionRow(unknownSession.body.id)).status).toBe(CheckoutStatus.READY_FOR_PAYMENT);

    const mock = app.get(MockPaymentGatewayAdapter);
    jest.spyOn(mock, 'submit').mockResolvedValueOnce({
      status: 'requires_action',
      submitted: true,
      providerRef: `ra-${Date.now()}`,
      nextAction: { type: 'redirect', url: 'https://example.test/3ds', sandbox: true as const },
    });
    const raSession = await checkoutSession();
    const ra = await paySession(raSession.body.id, 'success', `cs-ra-${Date.now()}`);
    expect(ra.body.status).toBe('REQUIRES_ACTION');
    expect((await sessionRow(raSession.body.id)).status).toBe(CheckoutStatus.READY_FOR_PAYMENT);
    jest.restoreAllMocks();
  });

  it('8-10: FAILED checkout can retry; captured checkout cannot duplicate intent', async () => {
    const session = await checkoutSession();
    await paySession(session.body.id, 'pre_submit_fail_all', `cs-fail-${Date.now()}`);
    expect((await sessionRow(session.body.id)).status).toBe(CheckoutStatus.FAILED);
    const retrySession = await checkoutSession();
    const success = await paySession(retrySession.body.id, 'success', `cs-retry-ok-${Date.now()}`);
    expect(success.status).toBe(201);
    expect(success.body.status).toBe('CAPTURED');
    expect((await sessionRow(retrySession.body.id)).status).toBe(CheckoutStatus.PAID);

    const capSession = await checkoutSession();
    const first = await paySession(capSession.body.id, 'success', `cs-cap-a-${Date.now()}`);
    expect((await sessionRow(capSession.body.id)).status).toBe(CheckoutStatus.PAID);
    const mock = app.get(MockPaymentGatewayAdapter);
    const submitSpy = jest.spyOn(mock, 'submit');
    const second = await paySession(capSession.body.id, 'success', `cs-cap-b-${Date.now()}`);
    expect(second.body.id).toBe(first.body.id);
    expect(submitSpy.mock.calls.length).toBe(0);
    submitSpy.mockRestore();
  });

  it('11-12: duplicate capture is idempotent and PAID cannot regress', async () => {
    const session = await checkoutSession();
    await paySession(session.body.id, 'success', `cs-idem-${Date.now()}`);
    expect((await sessionRow(session.body.id)).status).toBe(CheckoutStatus.PAID);
    await paySession(session.body.id, 'success', `cs-idem-b-${Date.now()}`);
    expect((await sessionRow(session.body.id)).status).toBe(CheckoutStatus.PAID);
  });

  it('17: refund does not regress checkout PAID state', async () => {
    const session = await checkoutSession();
    const pay = await paySession(session.body.id, 'success', `cs-ref-${Date.now()}`);
    const intentId = pay.body.id as string;
    expect((await sessionRow(session.body.id)).status).toBe(CheckoutStatus.PAID);
    const refund = await request(app.getHttpServer())
      .post(`/api/v1/me/payments/intents/${intentId}/refund`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `cs-refund-${Date.now()}`)
      .send({});
    expect(refund.status).toBeLessThan(300);
    expect((await sessionRow(session.body.id)).status).toBe(CheckoutStatus.PAID);
  });

  it('20-21: submitted gateway failure keeps READY_FOR_PAYMENT until retry success', async () => {
    const session = await checkoutSession();
    const failed = await paySession(session.body.id, 'failure', `cs-gw-fail-${Date.now()}`);
    expect(failed.body.status).toBe('FAILED');
    expect((await sessionRow(session.body.id)).status).toBe(CheckoutStatus.READY_FOR_PAYMENT);
    expect((await sessionRow(session.body.id)).reservationIds.length).toBeGreaterThan(0);
    const retry = await paySession(session.body.id, 'success', `cs-gw-ok-${Date.now()}`);
    expect(retry.body.status).toBe('CAPTURED');
    expect((await sessionRow(session.body.id)).status).toBe(CheckoutStatus.PAID);
  });

  it('runtime: fail → FAILED → requote → pay success → PAID', async () => {
    const session = await checkoutSession();
    await paySession(session.body.id, 'pre_submit_fail_all', `cs-run-fail-${Date.now()}`);
    expect((await sessionRow(session.body.id)).status).toBe(CheckoutStatus.FAILED);
    const requote = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/quote`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `cs-requote-${Date.now()}`)
      .send({});
    expect(requote.status).toBe(201);
    expect((await sessionRow(session.body.id)).status).toBe(CheckoutStatus.READY_FOR_PAYMENT);
    expect((await sessionRow(session.body.id)).reservationIds.length).toBe(1);
    const success = await paySession(session.body.id, 'success', `cs-run-ok-${Date.now()}`);
    expect(success.status).toBe(201);
    expect(success.body.status).toBe('CAPTURED');
    expect((await sessionRow(session.body.id)).status).toBe(CheckoutStatus.PAID);
  });
});
