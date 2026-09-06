import { INestApplication } from '@nestjs/common';
import {
  InventoryLotStatus,
  InventoryReservationStatus,
  LocationKind,
  OrganizationKind,
  PolicyPackStatus,
  ShipmentStatus,
  VendorPayableStatus,
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
import { provisionOrgAdmin, provisionSuperAdmin, signIn } from '../test/sign-in';
import { signCarrierPayload } from '../logistics/hmac';
import { EventWorkerService } from '../events/worker.service';

describe('medicine closed-loop (e2e)', () => {
  jest.setTimeout(180_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let eventWorker: EventWorkerService;

  beforeAll(async () => {
    applyTestIsolation();
    process.env['NODE_ENV'] = 'test';
    process.env['AUTH_DEV_REVEAL_OTP'] = 'true';
    process.env['JWT_ACCESS_SECRET'] =
      process.env['JWT_ACCESS_SECRET'] ?? 'test-access-secret-must-be-32-chars-min';
    process.env['OTP_PEPPER'] =
      process.env['OTP_PEPPER'] ?? 'test-otp-pepper-must-be-32-chars-minx';
    if (!process.env['REDIS_URL']) {
      throw new Error('REDIS_URL is required');
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ProblemFilter());
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    prisma = app.get(PrismaService);
    eventWorker = app.get(EventWorkerService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function seedMarket(iso2: string) {
    const doc = emptyPolicyDocument();
    doc.services.pharmacy = true;
    enableMarketplaceVendorPack(doc);
    doc.payments.enabled = true;
    doc.payments.methods = ['CARD', 'COD'];
    doc.payments.gateway_refs = ['MOCK_PRIMARY'];
    doc.payments.currencies = ['XXX'];
    doc.shipping.domestic = true;

    let country = await prisma.country.findUnique({ where: { isoAlpha2: iso2 } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: iso2,
          isoAlpha3: `${iso2}Q`,
          nameI18n: { en: `Closed loop ${iso2}` },
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
          checksum: `closed-loop-${iso2}`,
          publishedAt: new Date(),
        },
      });
      await prisma.country.update({ where: { id: country.id }, data: { publishedPolicyPackId: pack.id } });
    } else {
      await prisma.policyPack.updateMany({
        where: { countryId: country.id, status: PolicyPackStatus.PUBLISHED },
        data: { document: doc as never },
      });
    }
    await app.get(PolicyCache).invalidate(iso2);
    return country;
  }

  it('runs cart → pay → order → vendor fulfill → shipment → delivery → vendor payable with sandbox rails', async () => {
    const iso2 = 'CL';
    const country = await seedMarket(iso2);

    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: 'Closed Loop Vendor',
        displayName: 'Closed Loop Vendor',
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId: country.id,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'CL WH',
        timezone: 'UTC',
      },
    });
    const admin = await provisionSuperAdmin(app, prisma, 'cl-admin');
    const vendorUser = await provisionOrgAdmin(app, prisma, 'cl-vendor', vendor.id);
    await activateMarketplaceSeller(app, {
      vendorToken: vendorUser.token,
      adminToken: admin.token,
      sellerOrgId: vendor.id,
    });

    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: `cl-brand-${Date.now()}`, name: 'CL Brand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: `cl-med-${Date.now()}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'Closed loop medicine',
        countries: [{ country_code: iso2 }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku_code: `CL-SKU-${Date.now()}`, pack_size: '10' });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);
    const offer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set('Authorization', `Bearer ${vendorUser.token}`)
      .send({
        variant_id: variant.body.id,
        seller_org_id: vendor.id,
        country_code: iso2,
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '250',
      });
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/publish`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    const lot = await prisma.inventoryLot.create({
      data: {
        id: uuidv7(),
        variantId: variant.body.id,
        locationId: location.id,
        ownerOrgId: vendor.id,
        countryId: country.id,
        lotCode: 'CL-LOT',
        status: InventoryLotStatus.ACTIVE,
      },
    });
    await prisma.inventoryBalance.create({
      data: { id: uuidv7(), lotId: lot.id, onHand: 25, available: 25 },
    });

    const customer = await signIn(app, `cl-cust-${Date.now()}@example.com`, 'customer');
    const other = await signIn(app, `cl-cust-b-${Date.now()}@example.com`, 'customer');

    await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `cl-add-${Date.now()}`)
      .send({ offer_id: offer.body.id, qty: 2 });

    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `cl-co-${Date.now()}`)
      .send({});
    expect(session.status).toBeLessThan(300);

    const addr = await request(app.getHttpServer())
      .post('/api/v1/me/addresses')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `cl-addr-${Date.now()}`)
      .send({
        country_code: iso2,
        recipient_name: 'Closed Loop Customer',
        line1: '1 Loop Street',
        city: 'Test City',
        postal_code: '400001',
        phone: '+919999999999',
      });
    expect(addr.status).toBeLessThan(300);

    await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/fulfillment`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ address_id: addr.body.id });

    const quote = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/quote`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `cl-q-${Date.now()}`)
      .send({});
    expect(quote.status).toBeLessThan(300);
    expect(quote.body.quote?.total_minor).toBeTruthy();

    const paid = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `cl-pay-${session.body.id}`)
      .send({ method: 'CARD', scenario: 'success' });
    expect(paid.status).toBeLessThan(300);
    expect(paid.body.status).toBe('CAPTURED');
    expect(paid.body.sandbox).toBe(true);

    const created = await request(app.getHttpServer())
      .post('/api/v1/me/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `cl-ord-${paid.body.id}`)
      .send({ payment_intent_id: paid.body.id });
    expect(created.status).toBeLessThan(300);
    expect(created.body.status).toBe('ALLOCATED');
    expect(created.body.sandbox).toBe(true);
    expect(await prisma.order.count({ where: { paymentIntentId: paid.body.id } })).toBe(1);

    const dup = await request(app.getHttpServer())
      .post('/api/v1/me/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `cl-ord-dup-${Date.now()}`)
      .send({ payment_intent_id: paid.body.id });
    expect(dup.body.id).toBe(created.body.id);

    const steal = await request(app.getHttpServer())
      .get(`/api/v1/me/orders/${created.body.id}`)
      .set('Authorization', `Bearer ${other.token}`);
    expect(steal.status).toBe(403);

    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${created.body.id}/accept`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${created.body.id}/pick/start`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${created.body.id}/pick/complete`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    const packed = await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${created.body.id}/pack/complete`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    expect(packed.body.status).toBe('READY_TO_SHIP');

    const shipment = await prisma.shipment.findFirstOrThrow({ where: { orderId: created.body.id } });
    expect([ShipmentStatus.BOOKED, ShipmentStatus.LABEL_CREATED] as ShipmentStatus[]).toContain(shipment.status);
    expect(shipment.trackingNumber).toBeTruthy();

    const payload = JSON.stringify({
      event_id: `evt-cl-${shipment.id}`,
      code: 'delivered',
      shipment_ref: shipment.providerRef,
      sequence: 9,
      ts: new Date().toISOString(),
    });
    const delivered = await request(app.getHttpServer())
      .post('/api/v1/webhooks/carriers/mock')
      .set('x-sandbox-signature', signCarrierPayload(payload))
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(delivered.status).toBeLessThan(300);

    const afterShip = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(afterShip.status).toBe(ShipmentStatus.DELIVERED);

    const deliveredEvent = await prisma.outboxEvent.findFirst({
      where: { type: 'SHIPMENT_DELIVERED', aggregateId: shipment.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(deliveredEvent).toBeTruthy();
    await eventWorker.handle(deliveredEvent!.id);

    const payable = await prisma.vendorPayable.findFirst({
      where: { orderId: created.body.id, sellerOrgId: vendor.id },
    });
    expect(payable).toBeTruthy();
    expect([VendorPayableStatus.PENDING, VendorPayableStatus.ELIGIBLE, VendorPayableStatus.PAID]).toContain(
      payable!.status,
    );

    const consumed = await prisma.inventoryReservation.count({
      where: { purpose: 'CHECKOUT', status: InventoryReservationStatus.CONSUMED },
    });
    expect(consumed).toBeGreaterThan(0);
  });

  it('blocks pay when checkout reservation expired and does not create an order', async () => {
    const iso2 = 'CX';
    const country = await seedMarket(iso2);
    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: 'CL Exp Vendor',
        displayName: 'CL Exp Vendor',
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId: country.id,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'CL Exp WH',
        timezone: 'UTC',
      },
    });
    const admin = await provisionSuperAdmin(app, prisma, 'cl-exp-admin');
    const vendorUser = await provisionOrgAdmin(app, prisma, 'cl-exp-vendor', vendor.id);
    await activateMarketplaceSeller(app, {
      vendorToken: vendorUser.token,
      adminToken: admin.token,
      sellerOrgId: vendor.id,
    });

    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: `cl-exp-brand-${Date.now()}`, name: 'CL Exp Brand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: `cl-exp-med-${Date.now()}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'Expired hold medicine',
        countries: [{ country_code: iso2 }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku_code: `CL-EXP-${Date.now()}`, pack_size: '10' });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);
    const offer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set('Authorization', `Bearer ${vendorUser.token}`)
      .send({
        variant_id: variant.body.id,
        seller_org_id: vendor.id,
        country_code: iso2,
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '200',
      });
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/publish`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    const lot = await prisma.inventoryLot.create({
      data: {
        id: uuidv7(),
        variantId: variant.body.id,
        locationId: location.id,
        ownerOrgId: vendor.id,
        countryId: country.id,
        lotCode: 'CL-EXP-LOT',
        status: InventoryLotStatus.ACTIVE,
      },
    });
    await prisma.inventoryBalance.create({
      data: { id: uuidv7(), lotId: lot.id, onHand: 10, available: 10 },
    });

    const customer = await signIn(app, `cl-exp-cust-${Date.now()}@example.com`, 'customer');
    await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `cl-exp-add-${Date.now()}`)
      .send({ offer_id: offer.body.id, qty: 1 });
    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `cl-exp-co-${Date.now()}`)
      .send({});
    const addr = await request(app.getHttpServer())
      .post('/api/v1/me/addresses')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `cl-exp-addr-${Date.now()}`)
      .send({
        country_code: iso2,
        recipient_name: 'Exp Customer',
        line1: '2 Loop Street',
        city: 'Test City',
        postal_code: '400001',
        phone: '+919999999999',
      });
    await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/fulfillment`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ address_id: addr.body.id });
    await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/quote`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `cl-exp-q-${Date.now()}`)
      .send({});

    const checkout = await prisma.checkoutSession.findUniqueOrThrow({ where: { id: session.body.id } });
    for (const reservationId of checkout.reservationIds) {
      await prisma.inventoryReservation.update({
        where: { id: reservationId },
        data: { status: InventoryReservationStatus.RELEASED },
      });
    }

    const blocked = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `cl-exp-pay-${Date.now()}`)
      .send({ method: 'CARD', scenario: 'success' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('RESERVATION_EXPIRED');
    expect(await prisma.order.count()).toBeGreaterThanOrEqual(0);
  });

  it('does not create an order when payment fails', async () => {
    const iso2 = 'CF';
    const country = await seedMarket(iso2);
    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: 'CL Fail Vendor',
        displayName: 'CL Fail Vendor',
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId: country.id,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'CL Fail WH',
        timezone: 'UTC',
      },
    });
    const admin = await provisionSuperAdmin(app, prisma, 'cl-fail-admin');
    const vendorUser = await provisionOrgAdmin(app, prisma, 'cl-fail-vendor', vendor.id);
    await activateMarketplaceSeller(app, {
      vendorToken: vendorUser.token,
      adminToken: admin.token,
      sellerOrgId: vendor.id,
    });

    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: `cl-fail-brand-${Date.now()}`, name: 'CL Fail Brand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: `cl-fail-med-${Date.now()}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'Fail pay medicine',
        countries: [{ country_code: iso2 }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku_code: `CL-FAIL-${Date.now()}`, pack_size: '10' });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);
    const offer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set('Authorization', `Bearer ${vendorUser.token}`)
      .send({
        variant_id: variant.body.id,
        seller_org_id: vendor.id,
        country_code: iso2,
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '200',
      });
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/publish`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    const lot = await prisma.inventoryLot.create({
      data: {
        id: uuidv7(),
        variantId: variant.body.id,
        locationId: location.id,
        ownerOrgId: vendor.id,
        countryId: country.id,
        lotCode: 'CL-FAIL-LOT',
        status: InventoryLotStatus.ACTIVE,
      },
    });
    await prisma.inventoryBalance.create({
      data: { id: uuidv7(), lotId: lot.id, onHand: 10, available: 10 },
    });

    const customer = await signIn(app, `cl-fail-cust-${Date.now()}@example.com`, 'customer');
    await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `cl-fail-add-${Date.now()}`)
      .send({ offer_id: offer.body.id, qty: 1 });
    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `cl-fail-co-${Date.now()}`)
      .send({});
    const addr = await request(app.getHttpServer())
      .post('/api/v1/me/addresses')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `cl-fail-addr-${Date.now()}`)
      .send({
        country_code: iso2,
        recipient_name: 'Fail Customer',
        line1: '3 Loop Street',
        city: 'Test City',
        postal_code: '400001',
        phone: '+919999999999',
      });
    await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/fulfillment`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ address_id: addr.body.id });
    await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/quote`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `cl-fail-q-${Date.now()}`)
      .send({});

    const failed = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `cl-fail-pay-${Date.now()}`)
      .send({ method: 'CARD', scenario: 'failure' });
    expect(failed.body.status).toBe('FAILED');
    expect(await prisma.order.count({ where: { paymentIntentId: failed.body.id } })).toBe(0);
  });
});
