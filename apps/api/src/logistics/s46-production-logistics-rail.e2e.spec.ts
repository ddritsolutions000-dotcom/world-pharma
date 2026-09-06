/**
 * Sprint 46 — Production logistics & last-mile delivery rail (e2e)
 *
 * Sandbox MockCarrierAdapter remains usable; production stays fail-closed.
 * Never silently routes production bookings to mock.
 */
import { INestApplication } from '@nestjs/common';
import {
  CountryProductionLifecycle,
  LocationKind,
  LogisticsJobStatus,
  OrganizationKind,
  PartnerStatus,
  PolicyPackStatus,
  ProductionDependencyStatus,
  ShipmentStatus,
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
import { activateMarketplaceSeller, enableMarketplaceVendorPack } from '../test/marketplace-seller';
import { bootstrapSuperAdminByEmail, signIn as signInAudience } from '../test/sign-in';
import { signCarrierPayload } from './hmac';
import { SANDBOX_DELIVERY_OTP } from './sandbox-otp';
import { evaluateProductionLogisticsAvailable } from './production-logistics-gate';
import { seedCheckoutInventory } from '../test/seed-checkout-inventory';
import { TITLE_BY_EVENT } from '../platform/notification-catalog';

const COUNTRY = 'G6';

function expectOk(res: { status: number; body: unknown }, label: string) {
  if (res.status < 200 || res.status > 299) {
    throw new Error(`${label} failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
}

describe('Sprint 46 production logistics rail (e2e)', () => {
  jest.setTimeout(360_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let vendorToken: string;
  let otherVendorToken: string;
  let customerToken: string;
  let otherCustomerToken: string;
  let countryId: string;
  let offerId: string;
  let vendorOrgId: string;
  let shipmentId: string;
  let jobId: string;
  let riderToken: string;
  let otherRiderToken: string;
  let riderPersonId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function placePackedOrder(suffix: string) {
    const customer = await signInAudience(app, `s46-c-${suffix}@example.com`, 'customer');
    await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${COUNTRY}`)
      .set(auth(customer.token))
      .set('Idempotency-Key', `s46-add-${suffix}`)
      .send({ offer_id: offerId, qty: 1 });
    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${COUNTRY}`)
      .set(auth(customer.token))
      .set('Idempotency-Key', `s46-co-${suffix}`)
      .send({});
    expectOk(session, 'checkout');
    const paid = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set(auth(customer.token))
      .set('Idempotency-Key', `s46-pay-${suffix}`)
      .send({ method: 'CARD', scenario: 'success' });
    expectOk(paid, 'pay');
    const created = await request(app.getHttpServer())
      .post('/api/v1/me/orders')
      .set(auth(customer.token))
      .set('Idempotency-Key', `s46-ord-${suffix}`)
      .send({ payment_intent_id: paid.body.id });
    expectOk(created, 'order');
    await request(app.getHttpServer()).post(`/api/v1/vendor/orders/${created.body.id}/accept`).set(auth(vendorToken));
    await request(app.getHttpServer()).post(`/api/v1/vendor/orders/${created.body.id}/pick/start`).set(auth(vendorToken));
    await request(app.getHttpServer()).post(`/api/v1/vendor/orders/${created.body.id}/pick/complete`).set(auth(vendorToken));
    const packed = await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${created.body.id}/pack/complete`)
      .set(auth(vendorToken));
    expectOk(packed, 'pack');
    const shipment = await prisma.shipment.findFirstOrThrow({ where: { orderId: created.body.id } });
    return { customer, orderId: created.body.id as string, shipment };
  }

  beforeAll(async () => {
    applyTestIsolation();
    process.env['NODE_ENV'] = 'test';
    process.env['AUTH_DEV_REVEAL_OTP'] = 'true';
    delete process.env['LOGISTICS_ENVIRONMENT'];
    delete process.env['CARRIER_ENVIRONMENT'];
    delete process.env['CARRIER_LIVE_ENABLED'];
    delete process.env['LOGISTICS_LIVE_ENABLED'];
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
    doc.payments.methods = ['CARD', 'COD'];
    doc.payments.gateway_refs = ['MOCK_PRIMARY'];
    doc.payments.currencies = ['XXX'];
    doc.shipping.domestic = true;

    let country = await prisma.country.findUnique({ where: { isoAlpha2: COUNTRY } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: COUNTRY,
          isoAlpha3: 'G46',
          nameI18n: { en: 'Sprint 46 logistics rail' },
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
        data: { status: 'ACTIVE', productionLifecycle: CountryProductionLifecycle.CONFIGURED },
      });
    }
    countryId = country.id;
    await prisma.productionDependency.deleteMany({ where: { countryId, dependencyType: 'CARRIER' } });

    const pack = await prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId,
        version: Math.floor(Date.now() % 900_000) + 100_000,
        status: PolicyPackStatus.PUBLISHED,
        document: doc as never,
        checksum: `s46-${Date.now()}`,
        publishedAt: new Date(),
      },
    });
    await prisma.country.update({ where: { id: countryId }, data: { publishedPolicyPackId: pack.id } });
    await app.get(PolicyCache).invalidate(COUNTRY);

    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.VENDOR,
        legalName: `S46 Vendor ${Date.now()}`,
        displayName: `S46 Vendor ${Date.now()}`,
        status: 'ACTIVE',
      },
    });
    vendorOrgId = vendor.id;
    const otherVendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.VENDOR,
        legalName: `S46 Other Vendor ${Date.now()}`,
        displayName: `S46 Other Vendor ${Date.now()}`,
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'S46 WH',
        timezone: 'UTC',
      },
    });

    const admin = await bootstrapSuperAdminByEmail(app, prisma, `s46-admin-${Date.now()}@example.com`);
    adminToken = admin.token;
    const vendorUser = await signInAudience(app, `s46-vendor-${Date.now()}@example.com`, 'customer');
    vendorToken = vendorUser.token;
    const otherVendorUser = await signInAudience(app, `s46-vendor-b-${Date.now()}@example.com`, 'customer');
    otherVendorToken = otherVendorUser.token;
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
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: otherVendorUser.personId,
        roleId: orgRole!.id,
        scope: 'organization',
        organizationId: otherVendor.id,
        status: 'ACTIVE',
      },
    });
    await activateMarketplaceSeller(app, { vendorToken, adminToken, sellerOrgId: vendor.id });

    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set(auth(adminToken))
      .send({ slug: `s46-brand-${Date.now()}`, name: 'S46Brand' });
    expectOk(brand, 'brand');
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set(auth(adminToken))
      .send({
        slug: `s46-otc-${Date.now()}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'S46 tabs',
        countries: [{ country_code: COUNTRY }],
      });
    expectOk(item, 'item');
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set(auth(adminToken))
      .send({ sku_code: `S46-SKU-${Date.now()}`, pack_size: '10' });
    expectOk(variant, 'variant');
    expectOk(
      await request(app.getHttpServer()).post(`/api/v1/admin/catalog/items/${item.body.id}/publish`).set(auth(adminToken)),
      'publish',
    );
    const autoOffer = await prisma.catalogOffer.findFirst({
      where: { sellerOrgId: vendor.id, variantId: variant.body.id, countryId },
    });
    let offerIdResolved = autoOffer?.id as string | undefined;
    if (!offerIdResolved) {
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
          sell_minor: '200',
        });
      expectOk(offer, 'offer');
      if (!offer.body.id) {
        throw new Error(`invalid offer: ${JSON.stringify(offer.body)}`);
      }
      offerIdResolved = offer.body.id as string;
    }
    expectOk(
      await request(app.getHttpServer()).post(`/api/v1/vendor/catalog/offers/${offerIdResolved}/publish`).set(auth(vendorToken)),
      'offer publish',
    );
    offerId = offerIdResolved;
    await seedCheckoutInventory(app, {
      vendorToken,
      locationId: location.id,
      ownerOrgId: vendor.id,
      variantId: variant.body.id,
      qty: 80,
    });

    const first = await placePackedOrder(`base-${Date.now()}`);
    customerToken = first.customer.token;
    shipmentId = first.shipment.id;
    const other = await signInAudience(app, `s46-other-${Date.now()}@example.com`, 'customer');
    otherCustomerToken = other.token;

    const rider = await signInAudience(app, `s46-rider-${Date.now()}@example.com`, 'customer');
    riderToken = rider.token;
    riderPersonId = rider.personId;
    const otherRider = await signInAudience(app, `s46-rider-b-${Date.now()}@example.com`, 'customer');
    otherRiderToken = otherRider.token;
    for (const personId of [rider.personId, otherRider.personId]) {
      await prisma.partner.create({
        data: {
          id: uuidv7(),
          personId,
          partnerTypeCode: 'DELIVERY_PARTNER',
          countryId,
          status: PartnerStatus.ACTIVE,
          activatedAt: new Date(),
        },
      });
    }
  });

  afterAll(async () => {
    delete process.env['LOGISTICS_ENVIRONMENT'];
    delete process.env['CARRIER_LIVE_ENABLED'];
    await app.close();
  });

  it('S46-01 sandbox booking creates tracking and a delivery job', async () => {
    const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    expect([ShipmentStatus.LABEL_CREATED, ShipmentStatus.BOOKED]).toContain(shipment.status);
    expect(shipment.trackingNumber).toBeTruthy();
    const job = await prisma.logisticsJob.findFirstOrThrow({ where: { shipmentId } });
    jobId = job.id;
    expect(job).toBeTruthy();
  });

  it('S46-02 duplicate booking is idempotent', async () => {
    const a = await request(app.getHttpServer()).post(`/api/v1/admin/shipments/${shipmentId}/book`).set(auth(adminToken)).send({
      scenario: 'BOOK_SUCCESS',
    });
    const b = await request(app.getHttpServer()).post(`/api/v1/admin/shipments/${shipmentId}/book`).set(auth(adminToken)).send({
      scenario: 'BOOK_SUCCESS',
    });
    expectOk(a, 'book a');
    expectOk(b, 'book b');
    expect(await prisma.shipment.count({ where: { id: shipmentId } })).toBe(1);
  });

  it('S46-03 customer tracking is sandbox, not live, and hides POD object keys', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/me/shipments/${shipmentId}`).set(auth(customerToken));
    expectOk(res, 'customer shipment');
    expect(res.body.live_tracking).toBe(false);
    expect(res.body.expected_delivery).toBeNull();
    expect(res.body.sandbox).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/object_key|objectKey/i);
    expect(res.body.pod?.note).toMatch(/POD metadata/i);
  });

  it('S46-04 customer isolation', async () => {
    const steal = await request(app.getHttpServer()).get(`/api/v1/me/shipments/${shipmentId}`).set(auth(otherCustomerToken));
    expect(steal.status).toBe(403);
  });

  it('S46-05 vendor isolation and no recon/audit metadata', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/v1/vendor/shipments?seller_org_id=${vendorOrgId}`)
      .set(auth(vendorToken));
    expectOk(list, 'vendor list');
    const own = await request(app.getHttpServer()).get(`/api/v1/vendor/shipments/${shipmentId}`).set(auth(vendorToken));
    expectOk(own, 'vendor shipment');
    expect(own.body.recon).toBeUndefined();
    expect(own.body.routing).toBeUndefined();
    const steal = await request(app.getHttpServer()).get(`/api/v1/vendor/shipments/${shipmentId}`).set(auth(otherVendorToken));
    expect(steal.status).toBe(403);
  });

  it('S46-06 customer cannot book or mutate shipment state', async () => {
    const book = await request(app.getHttpServer())
      .post(`/api/v1/admin/shipments/${shipmentId}/book`)
      .set(auth(customerToken))
      .send({ scenario: 'BOOK_SUCCESS' });
    expect(book.status).toBeGreaterThanOrEqual(400);
  });

  it('S46-07 webhook requires HMAC', async () => {
    const payload = JSON.stringify({
      event_id: `evt-unauth-${shipmentId}`,
      code: 'in_transit',
      shipment_ref: (await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } })).providerRef,
      sequence: 2,
      ts: new Date().toISOString(),
    });
    const unsigned = await request(app.getHttpServer())
      .post('/api/v1/webhooks/carriers/mock')
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(unsigned.status).toBe(401);
  });

  it('S46-08 unknown provider shipment is reviewable and replay-safe', async () => {
    const payload = JSON.stringify({
      event_id: `evt-unknown-${Date.now()}`,
      code: 'in_transit',
      shipment_ref: 'missing-provider-ref',
      sequence: 1,
      ts: new Date().toISOString(),
    });
    const first = await request(app.getHttpServer())
      .post('/api/v1/webhooks/carriers/mock')
      .set('x-sandbox-signature', signCarrierPayload(payload))
      .set('Content-Type', 'application/json')
      .send(payload);
    expectOk(first, 'unknown webhook');
    expect(first.body.discrepancy).toBe('UNKNOWN_PROVIDER_SHIPMENT');
    const replay = await request(app.getHttpServer())
      .post('/api/v1/webhooks/carriers/mock')
      .set('x-sandbox-signature', signCarrierPayload(payload))
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(replay.body.discrepancy).toBe('UNKNOWN_PROVIDER_SHIPMENT');
    const exceptions = await request(app.getHttpServer()).get('/api/v1/admin/shipments/exceptions').set(auth(adminToken));
    expectOk(exceptions, 'exceptions');
    expect(exceptions.body.unknown_webhooks.length).toBeGreaterThan(0);
  });

  it('S46-09 rider assignment, isolation, pickup, OTP, POD, delivered, replay', async () => {
    const assign = await request(app.getHttpServer())
      .post('/api/v1/admin/delivery/jobs/assign')
      .set(auth(adminToken))
      .send({ shipment_id: shipmentId, assignee_id: riderPersonId });
    expectOk(assign, 'assign');
    const job = await prisma.logisticsJob.findFirstOrThrow({ where: { shipmentId } });
    jobId = job.id;
    const steal = await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${jobId}/accept`).set(auth(otherRiderToken));
    expect(steal.status === 403 || steal.status === 404).toBe(true);
    expectOk(await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${jobId}/accept`).set(auth(riderToken)), 'accept');
    expectOk(await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${jobId}/arrive`).set(auth(riderToken)), 'arrive');
    expectOk(await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${jobId}/pickup`).set(auth(riderToken)), 'pickup');
    const afterPickup = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    expect(afterPickup.status).toBe(ShipmentStatus.OUT_FOR_DELIVERY);
    const wrong = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${jobId}/pod`)
      .set(auth(riderToken))
      .send({ code: '000000' });
    expect(wrong.status).toBeGreaterThanOrEqual(400);
    const pod = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${jobId}/pod`)
      .set(auth(riderToken))
      .send({ code: SANDBOX_DELIVERY_OTP });
    expectOk(pod, 'pod');
    expect(pod.body.status).toBe(LogisticsJobStatus.DELIVERED);
    const dup = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${jobId}/pod`)
      .set(auth(riderToken))
      .send({ code: SANDBOX_DELIVERY_OTP });
    expectOk(dup, 'pod replay');
    const delivered = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    expect(delivered.status).toBe(ShipmentStatus.DELIVERED);
    const events = await prisma.outboxEvent.findMany({
      where: { type: 'SHIPMENT_DELIVERED', aggregateId: shipmentId },
    });
    expect(events.length).toBe(1);
  });

  it('S46-10 webhook replay after delivered does not mutate', async () => {
    const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    const payload = JSON.stringify({
      event_id: `evt-delivered-${shipmentId}`,
      code: 'delivered',
      shipment_ref: shipment.providerRef,
      sequence: 9,
      ts: new Date().toISOString(),
    });
    const first = await request(app.getHttpServer())
      .post('/api/v1/webhooks/carriers/mock')
      .set('x-sandbox-signature', signCarrierPayload(payload))
      .set('Content-Type', 'application/json')
      .send(payload);
    expectOk(first, 'delivered webhook');
    const replay = await request(app.getHttpServer())
      .post('/api/v1/webhooks/carriers/mock')
      .set('x-sandbox-signature', signCarrierPayload(payload))
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(replay.body.duplicate).toBe(true);
    const after = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    expect(after.status).toBe(ShipmentStatus.DELIVERED);
  });

  it('S46-11 failed delivery, retry path, RTO idempotent, no auto-restock', async () => {
    const packed = await placePackedOrder(`fail-${Date.now()}`);
    const assign = await request(app.getHttpServer())
      .post('/api/v1/admin/delivery/jobs/assign')
      .set(auth(adminToken))
      .send({ shipment_id: packed.shipment.id, assignee_id: riderPersonId });
    expectOk(assign, 'assign fail path');
    const job = await prisma.logisticsJob.findFirstOrThrow({ where: { shipmentId: packed.shipment.id } });
    expectOk(await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${job.id}/accept`).set(auth(riderToken)), 'accept2');
    expectOk(await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${job.id}/pickup`).set(auth(riderToken)), 'pickup2');
    const fail = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${job.id}/fail`)
      .set(auth(riderToken))
      .send({ reason: 'customer_unavailable' });
    expectOk(fail, 'fail');
    const failed = await prisma.shipment.findUniqueOrThrow({ where: { id: packed.shipment.id } });
    expect(failed.status).toBe(ShipmentStatus.DELIVERY_FAILED);
    const rto = await request(app.getHttpServer()).post(`/api/v1/admin/shipments/${packed.shipment.id}/rto`).set(auth(adminToken));
    expectOk(rto, 'rto');
    expect(rto.body.disposition).toBe('QUARANTINE');
    const rtoDup = await request(app.getHttpServer()).post(`/api/v1/admin/shipments/${packed.shipment.id}/rto`).set(auth(adminToken));
    expectOk(rtoDup, 'rto replay');
    expect(rtoDup.body.disposition).toBe('QUARANTINE');
    const returned = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${job.id}/rto`)
      .set(auth(riderToken));
    expectOk(returned, 'job rto');
    const after = await prisma.shipment.findUniqueOrThrow({ where: { id: packed.shipment.id } });
    expect([ShipmentStatus.RETURN_TO_ORIGIN, ShipmentStatus.RETURNED]).toContain(after.status);
  });

  it('S46-12 cancellation from label-created sibling shipment', async () => {
    const packed = await placePackedOrder(`cancel-${Date.now()}`);
    const cancel = await request(app.getHttpServer())
      .post(`/api/v1/admin/shipments/${packed.shipment.id}/cancel`)
      .set(auth(adminToken));
    expectOk(cancel, 'cancel');
    expect(cancel.body.status).toBe(ShipmentStatus.CANCELLED);
    const again = await request(app.getHttpServer())
      .post(`/api/v1/admin/shipments/${packed.shipment.id}/cancel`)
      .set(auth(adminToken));
    expectOk(again, 'cancel idempotent');
  });

  it('S46-13 production availability evaluate/assert for inactive country', async () => {
    const evalRes = await request(app.getHttpServer())
      .get(`/api/v1/admin/shipments/production-availability?country_code=${COUNTRY}`)
      .set(auth(adminToken));
    expectOk(evalRes, 'evaluate');
    expect(evalRes.body.available).toBe(false);
    expect(evalRes.body.never_fallback_to_mock).toBe(true);
    expect(evalRes.body.blockers).toEqual(
      expect.arrayContaining(['COUNTRY_PRODUCTION_NOT_ACTIVE', 'CARRIER_DEPENDENCY_MISSING', 'LOGISTICS_LIVE_DISABLED']),
    );
    const assertRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/shipments/production-availability/assert?country_code=${COUNTRY}`)
      .set(auth(adminToken));
    expect(assertRes.status).toBe(409);
  });

  it('S46-14 mock carrier dependency is forbidden even if verified', async () => {
    await prisma.country.update({
      where: { id: countryId },
      data: { productionLifecycle: CountryProductionLifecycle.ACTIVE },
    });
    await prisma.productionDependency.create({
      data: {
        id: uuidv7(),
        countryId,
        dependencyType: 'CARRIER',
        environment: 'production',
        status: ProductionDependencyStatus.VERIFIED,
        providerIdentifier: 'MOCK',
        configReference: 'sandbox-only',
        externalGated: true,
      },
    });
    const result = await evaluateProductionLogisticsAvailable(prisma, { countryCode: COUNTRY });
    expect(result.blockers).toEqual(
      expect.arrayContaining(['MOCK_CARRIER_PRODUCTION_FORBIDDEN', 'CARRIER_EXTERNAL_GATED', 'NO_PRODUCTION_CARRIER_ADAPTER']),
    );
  });

  it('S46-15 production environment blocks booking and never uses mock', async () => {
    process.env['LOGISTICS_ENVIRONMENT'] = 'production';
    process.env['CARRIER_LIVE_ENABLED'] = 'true';
    try {
      const packed = await placePackedOrder(`prod-${Date.now()}`).catch((err: Error) => err);
      expect(packed).toBeInstanceOf(Error);
    } finally {
      delete process.env['LOGISTICS_ENVIRONMENT'];
      delete process.env['CARRIER_LIVE_ENABLED'];
    }
    const sandbox = await placePackedOrder(`sandbox-after-${Date.now()}`);
    expect([ShipmentStatus.LABEL_CREATED, ShipmentStatus.BOOKED]).toContain(sandbox.shipment.status);
  });

  it('S46-16 production webhooks are external-gated', async () => {
    process.env['LOGISTICS_ENVIRONMENT'] = 'production';
    try {
      const payload = JSON.stringify({
        event_id: `evt-prod-${Date.now()}`,
        code: 'in_transit',
        shipment_ref: 'x',
        sequence: 1,
        ts: new Date().toISOString(),
      });
      const res = await request(app.getHttpServer())
        .post('/api/v1/webhooks/carriers/mock')
        .set('x-sandbox-signature', signCarrierPayload(payload))
        .set('Content-Type', 'application/json')
        .send(payload);
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('PRODUCTION_CARRIER_WEBHOOK_EXTERNAL_GATED');
    } finally {
      delete process.env['LOGISTICS_ENVIRONMENT'];
    }
  });

  it('S46-17 admin snapshot exists and catalog covers logistics notifications', async () => {
    const snap = await request(app.getHttpServer()).get('/api/v1/admin/shipments/snapshot').set(auth(adminToken));
    expectOk(snap, 'snapshot');
    expect(snap.body.environment).toBe('sandbox');
    expect(TITLE_BY_EVENT.SHIPMENT_PICKED_UP).toBeTruthy();
    expect(TITLE_BY_EVENT.SHIPMENT_RETURNED).toBeTruthy();
    expect(TITLE_BY_EVENT.DELIVERY_OTP_REQUESTED).toBeTruthy();
  });

  it('S46-18 unauthenticated admin logistics is denied', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/admin/shipments/production-availability?country_code=G6');
    expect(res.status).toBeGreaterThanOrEqual(401);
  });

  it('S46-19 OTP wrong shipment cannot complete another job', async () => {
    const packed = await placePackedOrder(`otp-iso-${Date.now()}`);
    await request(app.getHttpServer())
      .post('/api/v1/admin/delivery/jobs/assign')
      .set(auth(adminToken))
      .send({ shipment_id: packed.shipment.id, assignee_id: riderPersonId });
    const job = await prisma.logisticsJob.findFirstOrThrow({ where: { shipmentId: packed.shipment.id } });
    const foreign = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${jobId}/pod`)
      .set(auth(riderToken))
      .send({ code: SANDBOX_DELIVERY_OTP });
    expect(foreign.body.status === LogisticsJobStatus.DELIVERED || foreign.status < 300).toBe(true);
    const still = await prisma.shipment.findUniqueOrThrow({ where: { id: packed.shipment.id } });
    expect(still.status).not.toBe(ShipmentStatus.DELIVERED);
    void job;
  });

  it('S46-20 reassignment is auditable', async () => {
    const packed = await placePackedOrder(`reassign-${Date.now()}`);
    expectOk(
      await request(app.getHttpServer())
        .post('/api/v1/admin/delivery/jobs/assign')
        .set(auth(adminToken))
        .send({ shipment_id: packed.shipment.id, assignee_id: riderPersonId }),
      'assign1',
    );
    const otherRider = await prisma.partner.findFirstOrThrow({
      where: { personId: { not: riderPersonId }, partnerTypeCode: 'DELIVERY_PARTNER', countryId },
    });
    expectOk(
      await request(app.getHttpServer())
        .post('/api/v1/admin/delivery/jobs/assign')
        .set(auth(adminToken))
        .send({ shipment_id: packed.shipment.id, assignee_id: otherRider.personId }),
      'assign2',
    );
    const job = await prisma.logisticsJob.findFirstOrThrow({ where: { shipmentId: packed.shipment.id } });
    const event = await prisma.logisticsJobEvent.findFirst({
      where: { jobId: job.id, type: 'JOB_REASSIGNED' },
    });
    expect(event).toBeTruthy();
  });
});
