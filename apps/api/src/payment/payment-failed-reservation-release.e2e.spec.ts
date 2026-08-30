import { INestApplication } from '@nestjs/common';
import {
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
import { MockPaymentGatewayAdapter } from '../payment/mock.adapter';

async function signIn(app: INestApplication, email: string, audience: 'admin' | 'customer' = 'customer') {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

describe('R14-A payment failed reservation release (e2e)', () => {
  jest.setTimeout(240_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let customerA: string;
  let customerB: string;
  let adminToken: string;
  let offerId: string;
  let variantId: string;
  let countryId: string;
  let lotId: string;
  let vendorToken: string;
  let locationId: string;
  let vendorOrgId: string;
  const countryCode = 'FR';

  async function publishPolicy(mutator: (doc: ReturnType<typeof emptyPolicyDocument>) => void = () => undefined) {
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

  async function checkoutSession(token = customerA) {
    await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${countryCode}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `fr-add-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
      .send({ offer_id: offerId, qty: 1 });
    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${countryCode}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `fr-co-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
      .send({});
    expect(session.status).toBe(201);
    return session;
  }

  async function paySession(sessionId: string, scenario: string, idempotencyKey?: string, token = customerA) {
    return request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${sessionId}/pay`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey ?? `fr-pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
      .send({ method: 'CARD', scenario });
  }

  async function lotBalance() {
    const balance = await prisma.inventoryBalance.findUnique({ where: { lotId } });
    return balance!;
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
          isoAlpha3: 'FRR',
          nameI18n: { en: 'Reservation release' },
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
          checksum: 'fr-release',
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
        legalName: 'FR Vendor',
        displayName: 'FR Vendor',
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'FR WH',
        timezone: 'UTC',
      },
    });
    const admin = await signIn(app, `fr-admin-${Date.now()}@example.com`, 'admin');
    adminToken = admin.token;
    const role = await prisma.role.findUnique({ where: { code: 'super_admin' } });
    await prisma.membership.create({
      data: { id: uuidv7(), personId: admin.personId, roleId: role!.id, scope: 'platform', status: 'ACTIVE' },
    });
    const vendorUser = await signIn(app, `fr-vendor-${Date.now()}@example.com`, 'admin');
    vendorToken = vendorUser.token;
    vendorOrgId = vendor.id;
    locationId = location.id;
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
      .send({ slug: `fr-brand-${Date.now()}`, name: 'FrBrand' });
    const catalogItem = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        slug: `fr-item-${Date.now()}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'FR item',
        countries: [{ country_code: countryCode }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${catalogItem.body.id}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku_code: `FR-SKU-${Date.now()}`, pack_size: '10' });
    variantId = variant.body.id;
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
    const seeded = await seedCheckoutInventory(app, {
      vendorToken: vendorUser.token,
      locationId: location.id,
      ownerOrgId: vendor.id,
      variantId: variant.body.id,
      qty: 50,
      lotCode: `FR-LOT-${Date.now()}`,
    });
    lotId = seeded.lotId;
    const a = await signIn(app, `fr-a-${Date.now()}@example.com`, 'customer');
    const b = await signIn(app, `fr-b-${Date.now()}@example.com`, 'customer');
    customerA = a.token;
    customerB = b.token;
    await publishPolicy();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('1-6: pre-submit failure releases reservation and restores availability', async () => {
    const before = await lotBalance();
    const session = await checkoutSession();
    const reservations = await prisma.inventoryReservation.findMany({
      where: { id: { in: (await sessionRow(session.body.id)).reservationIds } },
    });
    expect(reservations.every((r) => r.status === InventoryReservationStatus.OPEN)).toBe(true);
    const pay = await paySession(session.body.id, 'pre_submit_fail_all');
    expect(pay.status).toBe(409);
    const afterHold = await lotBalance();
    expect(afterHold.reserved).toBe(before.reserved);
    expect(afterHold.available).toBe(before.available);
    expect((await sessionRow(session.body.id)).reservationIds).toEqual([]);
    for (const r of reservations) {
      const row = await prisma.inventoryReservation.findUnique({ where: { id: r.id } });
      expect(row?.status).toBe(InventoryReservationStatus.RELEASED);
    }
  });

  it('4: second customer can reserve after first customer payment failure', async () => {
    const sessionA = await checkoutSession(customerA);
    await paySession(sessionA.body.id, 'pre_submit_fail_all', undefined, customerA);
    const sessionB = await checkoutSession(customerB);
    expect(sessionB.status).toBe(201);
    expect((await sessionRow(sessionB.body.id)).reservationIds.length).toBe(1);
  });

  it('5-6: repeated failure does not double-release or drive reserved negative', async () => {
    const session = await checkoutSession();
    await paySession(session.body.id, 'pre_submit_fail_all', `fr-dup-a-${Date.now()}`);
    const balanceAfterFirst = await lotBalance();
    await paySession(session.body.id, 'pre_submit_fail_all', `fr-dup-b-${Date.now()}`);
    const balanceAfterSecond = await lotBalance();
    expect(balanceAfterSecond.reserved).toBe(balanceAfterFirst.reserved);
    expect(balanceAfterSecond.reserved).toBeGreaterThanOrEqual(0);
  });

  it('7: primary failure + fallback success keeps reservation until capture', async () => {
    await publishPolicy();
    const before = await lotBalance();
    const session = await checkoutSession();
    const pay = await paySession(session.body.id, 'pre_submit_fail');
    expect(pay.status).toBe(201);
    expect(pay.body.status).toBe('CAPTURED');
    const after = await lotBalance();
    expect(after.reserved).toBeLessThan(before.reserved + 1);
    expect(await prisma.order.count({ where: { paymentIntentId: pay.body.id } })).toBe(1);
  });

  it('8: gateway unknown state does not release reservation prematurely', async () => {
    const session = await checkoutSession();
    const pay = await paySession(session.body.id, 'timeout');
    expect(pay.status).toBe(201);
    expect(pay.body.status).toBe('UNKNOWN');
    const row = await sessionRow(session.body.id);
    expect(row.reservationIds.length).toBeGreaterThan(0);
  });

  it('9-10: captured payment and duplicate pay do not release reservation', async () => {
    const mock = app.get(MockPaymentGatewayAdapter);
    const submitSpy = jest.spyOn(mock, 'submit');
    const session = await checkoutSession();
    const first = await paySession(session.body.id, 'success', `fr-cap-a-${Date.now()}`);
    expect(first.status).toBe(201);
    const reservedAfterCapture = (await lotBalance()).reserved;
    submitSpy.mockClear();
    const second = await paySession(session.body.id, 'success', `fr-cap-b-${Date.now()}`);
    expect(second.body.id).toBe(first.body.id);
    expect(submitSpy.mock.calls.length).toBe(0);
    expect((await lotBalance()).reserved).toBe(reservedAfterCapture);
    submitSpy.mockRestore();
  });

  it('11-12: retry after FAILED works with a fresh checkout session', async () => {
    const session = await checkoutSession();
    await paySession(session.body.id, 'pre_submit_fail_all', `fr-retry-fail-${Date.now()}`);
    expect((await sessionRow(session.body.id)).reservationIds).toEqual([]);
    const retrySession = await checkoutSession();
    const success = await paySession(retrySession.body.id, 'success', `fr-retry-ok-${Date.now()}`);
    expect(success.status).toBe(201);
    expect(success.body.status).toBe('CAPTURED');
  });

  it('13: expired reservation release is safe no-op', async () => {
    const session = await checkoutSession();
    const row = await sessionRow(session.body.id);
    const reservationId = row.reservationIds[0]!;
    await prisma.inventoryReservation.update({
      where: { id: reservationId },
      data: { status: InventoryReservationStatus.EXPIRED, expiresAt: new Date(Date.now() - 60_000) },
    });
    await paySession(session.body.id, 'pre_submit_fail_all');
    expect((await sessionRow(session.body.id)).reservationIds).toEqual([]);
  });

  it('17-18: release creates no capture transaction or order', async () => {
    const session = await checkoutSession();
    await paySession(session.body.id, 'pre_submit_fail_all');
    const intent = await prisma.paymentIntent.findFirst({ where: { checkoutSessionId: session.body.id } });
    expect(intent?.status).toBe(PaymentIntentStatus.FAILED);
    expect(await prisma.paymentTransaction.count({ where: { intentId: intent!.id } })).toBe(0);
    expect(await prisma.order.count({ where: { paymentIntentId: intent!.id } })).toBe(0);
  });

  it('19: CR-277 PRE_SUBMIT_FAILURE audit remains durable after release', async () => {
    const session = await checkoutSession();
    await paySession(session.body.id, 'pre_submit_fail_all');
    const intent = await prisma.paymentIntent.findFirst({
      where: { checkoutSessionId: session.body.id },
      include: { attempts: true },
    });
    expect(intent?.status).toBe(PaymentIntentStatus.FAILED);
    expect(intent!.attempts.length).toBeGreaterThan(0);
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/${intent!.id}/observability?country_code=${countryCode}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.payment.failure_outcome).toBe('PRE_SUBMIT_FAILURE');
    expect(
      await prisma.outboxEvent.count({
        where: { aggregateId: session.body.id, type: 'CHECKOUT_PAYMENT_FAILED_RESERVATION_RELEASED' },
      }),
    ).toBeGreaterThan(0);
  });

  it('20-21: submitted gateway failure keeps reservation for retry success', async () => {
    const session = await checkoutSession();
    const failed = await paySession(session.body.id, 'failure', `fr-gw-fail-${Date.now()}`);
    expect(failed.status).toBe(201);
    expect(failed.body.status).toBe('FAILED');
    expect((await sessionRow(session.body.id)).reservationIds.length).toBeGreaterThan(0);
    const retry = await paySession(session.body.id, 'success', `fr-gw-ok-${Date.now()}`);
    expect(retry.status).toBe(201);
    expect(retry.body.status).toBe('CAPTURED');
  });

});

describe('R14-A payment failed reservation release — qty=1 runtime (e2e)', () => {
  jest.setTimeout(240_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let customerA: string;
  let customerB: string;
  let adminToken: string;
  let offerId: string;
  let countryId: string;
  let lotId: string;
  const countryCode = 'F1';

  async function checkoutSession(token: string) {
    await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${countryCode}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `f1-add-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
      .send({ offer_id: offerId, qty: 1 });
    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${countryCode}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `f1-co-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
      .send({});
    return session;
  }

  async function paySession(sessionId: string, scenario: string, idempotencyKey: string, token: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${sessionId}/pay`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
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
          isoAlpha3: 'FR1',
          nameI18n: { en: 'Reservation release qty1' },
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
          checksum: 'f1-release',
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
        legalName: 'F1 Vendor',
        displayName: 'F1 Vendor',
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'F1 WH',
        timezone: 'UTC',
      },
    });
    const admin = await signIn(app, `f1-admin-${Date.now()}@example.com`, 'admin');
    adminToken = admin.token;
    const role = await prisma.role.findUnique({ where: { code: 'super_admin' } });
    await prisma.membership.create({
      data: { id: uuidv7(), personId: admin.personId, roleId: role!.id, scope: 'platform', status: 'ACTIVE' },
    });
    const vendorUser = await signIn(app, `f1-vendor-${Date.now()}@example.com`, 'admin');
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: vendorUser.personId,
        roleId: (await prisma.role.findUnique({ where: { code: 'org_owner' } }))!.id,
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
      .send({ slug: `f1-brand-${Date.now()}`, name: 'F1Brand' });
    const catalogItem = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        slug: `f1-item-${Date.now()}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'F1 item',
        countries: [{ country_code: countryCode }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${catalogItem.body.id}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku_code: `F1-SKU-${Date.now()}`, pack_size: '1' });
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
    const seeded = await seedCheckoutInventory(app, {
      vendorToken: vendorUser.token,
      locationId: location.id,
      ownerOrgId: vendor.id,
      variantId: variant.body.id,
      qty: 1,
      lotCode: `F1-LOT-${Date.now()}`,
    });
    lotId = seeded.lotId;
    expect(seeded.available).toBe(1);
    const a = await signIn(app, `f1-a-${Date.now()}@example.com`, 'customer');
    const b = await signIn(app, `f1-b-${Date.now()}@example.com`, 'customer');
    customerA = a.token;
    customerB = b.token;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('27: qty=1 — fail releases hold and customer B can checkout', async () => {
    const before = await prisma.inventoryBalance.findUniqueOrThrow({ where: { lotId } });
    expect(before.available).toBe(1);
    expect(before.reserved).toBe(0);

    const sessionA = await checkoutSession(customerA);
    expect(sessionA.status).toBe(201);
    const holdId = (
      await prisma.checkoutSession.findUniqueOrThrow({ where: { id: sessionA.body.id } })
    ).reservationIds[0]!;
    const during = await prisma.inventoryBalance.findUniqueOrThrow({ where: { lotId } });
    expect(during.reserved).toBe(1);
    expect(during.available).toBe(0);

    const blockedAdd = await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${countryCode}`)
      .set('Authorization', `Bearer ${customerB}`)
      .set('Idempotency-Key', `f1-block-${Date.now()}`)
      .send({ offer_id: offerId, qty: 1 });
    expect(blockedAdd.status).toBe(409);

    const fail = await paySession(
      sessionA.body.id,
      'pre_submit_fail_all',
      `f1-run-fail-${Date.now()}`,
      customerA,
    );
    expect(fail.status).toBe(409);
    expect((await prisma.inventoryReservation.findUnique({ where: { id: holdId } }))!.status).toBe(
      InventoryReservationStatus.RELEASED,
    );
    const after = await prisma.inventoryBalance.findUniqueOrThrow({ where: { lotId } });
    expect(after.reserved).toBe(0);
    expect(after.available).toBe(1);

    const sessionB = await checkoutSession(customerB);
    expect(sessionB.status).toBe(201);
    expect(
      (await prisma.checkoutSession.findUniqueOrThrow({ where: { id: sessionB.body.id } })).reservationIds.length,
    ).toBe(1);
  });
});
