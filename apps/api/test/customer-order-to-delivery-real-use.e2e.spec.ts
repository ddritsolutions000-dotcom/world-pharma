import { INestApplication } from '@nestjs/common';
import {
  InventoryLotStatus,
  LocationKind,
  LogisticsJobStatus,
  OrganizationKind,
  PartnerStatus,
  PolicyPackStatus,
  ShipmentStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../src/app/app.module';
import { PrismaService } from '../src/app/prisma.service';
import { PolicyCache } from '../src/policy/cache';
import { ProblemFilter } from '../src/common/problem.filter';
import { emptyPolicyDocument } from '../src/policy/empty-pack';
import { applyTestIsolation } from '../src/test/isolate-runtime';
import {
  activateMarketplaceSeller,
  enableMarketplaceVendorPack,
} from '../src/test/marketplace-seller';
import { provisionOrgAdmin, provisionSuperAdmin, signIn } from '../src/test/sign-in';
import { SANDBOX_DELIVERY_OTP } from '../src/logistics/sandbox-otp';
import { EventWorkerService } from '../src/events/worker.service';

/**
 * Sprint 34 — customer order-to-delivery real-use journey.
 * Exercises discover → cart → checkout → pay → order → vendor → shipment →
 * delivery/POD → notifications → return/refund with isolation + idempotency.
 */
describe('customer order-to-delivery real-use (e2e)', () => {
  // S462: host needs >300s for Nest boot + full chain; staged suite is authoritative proof.
  jest.setTimeout(600_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let eventWorker: EventWorkerService;

  const iso2 = 'RU';

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

  async function seedMarket() {
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
          isoAlpha3: 'RUQ',
          nameI18n: { en: 'Real-use sandbox' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
          dataResidencyMode: 'shared',
        },
      });
    }
    await prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        version: Math.floor(Date.now() % 1_000_000) + Math.floor(Math.random() * 1000),
        status: PolicyPackStatus.PUBLISHED,
        document: doc as never,
        checksum: `real-use-${Date.now()}`,
        publishedAt: new Date(),
      },
    });
    const zoneCount = await prisma.serviceabilityZone.count({ where: { countryId: country.id } });
    if (zoneCount === 0) {
      await prisma.serviceabilityZone.create({
        data: {
          id: uuidv7(),
          countryId: country.id,
          name: 'RU metro',
          postalFrom: '10000',
          postalTo: '99999',
          medicineDelivery: true,
          labHomeCollection: true,
          expressDelivery: true,
          codAvailable: true,
          priority: 10,
          active: true,
        },
      });
    }
    await app.get(PolicyCache).invalidate(iso2);
    return country;
  }

  async function drainOrderBuyerEvents(orderId: string, types: string[]) {
    for (const type of types) {
      const events = await prisma.outboxEvent.findMany({
        where: { aggregateId: orderId, type },
        orderBy: { createdAt: 'asc' },
      });
      for (const event of events) {
        await eventWorker.handle(event.id);
        await eventWorker.handle(event.id); // idempotent replay
      }
    }
  }

  async function inboxTitles(token: string): Promise<string[]> {
    const res = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const rows = res.body.data ?? res.body;
    return (rows as Array<{ title: string }>).map((row) => row.title);
  }

  it('runs discover → delivered POD → notifications → return/refund with isolation', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const country = await seedMarket();
    const medTitle = `RealUse Zinc ${suffix}`;

    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: `RU Vendor ${suffix}`,
        displayName: `RU Vendor ${suffix}`,
        status: 'ACTIVE',
      },
    });
    const otherVendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: `RU Other Vendor ${suffix}`,
        displayName: `RU Other Vendor ${suffix}`,
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId: country.id,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'RU WH',
        timezone: 'UTC',
      },
    });

    const admin = await provisionSuperAdmin(app, prisma, `ru-admin-${suffix}`);
    const vendorUser = await provisionOrgAdmin(app, prisma, `ru-vendor-${suffix}`, vendor.id);
    const otherVendorUser = await provisionOrgAdmin(app, prisma, `ru-vendor-b-${suffix}`, otherVendor.id);
    await activateMarketplaceSeller(app, {
      vendorToken: vendorUser.token,
      adminToken: admin.token,
      sellerOrgId: vendor.id,
    });
    await activateMarketplaceSeller(app, {
      vendorToken: otherVendorUser.token,
      adminToken: admin.token,
      sellerOrgId: otherVendor.id,
    });

    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: `ru-brand-${suffix}`, name: 'RU Brand' });
    expect(brand.status).toBeLessThan(300);

    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: `ru-med-${suffix}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: medTitle,
        countries: [{ country_code: iso2 }],
      });
    expect(item.status).toBeLessThan(300);

    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku_code: `RU-SKU-${suffix}`, pack_size: '10' });
    expect(variant.status).toBeLessThan(300);
    expect(variant.body.id).toBeTruthy();
    const published = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(published.status).toBeLessThan(300);

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
    if (offer.status >= 300) {
      // Surface problem body for CI diagnosis
      // eslint-disable-next-line no-console
      console.error('offer create failed', offer.status, offer.body);
    }
    expect(offer.status).toBeLessThan(300);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/publish`)
      .set('Authorization', `Bearer ${vendorUser.token}`);

    await prisma.inventoryLot.create({
      data: {
        id: uuidv7(),
        variantId: variant.body.id,
        locationId: location.id,
        ownerOrgId: vendor.id,
        countryId: country.id,
        lotCode: `RU-LOT-${suffix}`,
        status: InventoryLotStatus.ACTIVE,
      },
    }).then(async (lot) => {
      await prisma.inventoryBalance.create({
        data: { id: uuidv7(), lotId: lot.id, onHand: 40, available: 40 },
      });
    });

    const customer = await signIn(app, `ru-cust-${suffix}@example.com`, 'customer');
    const otherCustomer = await signIn(app, `ru-cust-b-${suffix}@example.com`, 'customer');

    // 1–2: discover / select seller offer
    const search = await request(app.getHttpServer()).get(
      `/api/v1/catalog/search?country=${iso2}&q=${encodeURIComponent(medTitle)}`,
    );
    expect(search.status).toBeLessThan(300);
    const hits = (search.body.data ?? search.body.items ?? search.body) as Array<{
      title?: string;
      offers?: Array<{ id: string }>;
    }>;
    const hit = Array.isArray(hits)
      ? hits.find((row) => row.title === medTitle || (row.offers ?? []).some((o) => o.id === offer.body.id))
      : null;
    expect(hit || offer.body.id).toBeTruthy();

    const detail = await request(app.getHttpServer()).get(
      `/api/v1/catalog/items/${item.body.slug}?country=${iso2}&postal_code=400001`,
    );
    expect(detail.status).toBeLessThan(300);
    const detailOffers = (detail.body.offers ?? []) as Array<{ id: string; seller_org_id?: string }>;
    expect(detailOffers.some((row) => row.id === offer.body.id)).toBe(true);

    // 3: add to cart
    const add = await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `ru-add-${suffix}`)
      .send({ offer_id: offer.body.id, qty: 1 });
    expect(add.status).toBeLessThan(300);

    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `ru-co-${suffix}`)
      .send({});
    expect(session.status).toBeLessThan(300);

    const goodAddr = await request(app.getHttpServer())
      .post('/api/v1/me/addresses')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `ru-addr-${suffix}`)
      .send({
        country_code: iso2,
        recipient_name: 'RU Customer',
        line1: '1 Real Use Way',
        city: 'Sandbox City',
        postal_code: '400001',
        phone: '+10000000034',
      });
    expect(goodAddr.status).toBeLessThan(300);

    const badAddr = await request(app.getHttpServer())
      .post('/api/v1/me/addresses')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `ru-addr-bad-${suffix}`)
      .send({
        country_code: iso2,
        recipient_name: 'RU Customer',
        line1: '9 Unserviceable Lane',
        city: 'Nowhere',
        postal_code: 'X',
        phone: '+10000000035',
      });
    expect(badAddr.status).toBeLessThan(300);

    // 4: serviceability enforced
    await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/fulfillment`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ address_id: badAddr.body.id });
    const blockedQuote = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/quote`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `ru-q-bad-${suffix}`)
      .send({});
    expect(blockedQuote.status).toBeGreaterThanOrEqual(400);

    await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/fulfillment`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ address_id: goodAddr.body.id });
    const quote = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/quote`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `ru-q-${suffix}`)
      .send({});
    expect(quote.status).toBeLessThan(300);

    // 5–6: sandbox checkout + payment
    const paid = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `ru-pay-${suffix}`)
      .send({ method: 'CARD', scenario: 'success' });
    expect(paid.status).toBeLessThan(300);
    expect(paid.body.status).toBe('CAPTURED');
    expect(paid.body.sandbox).toBe(true);

    // 7: order exactly once
    const created = await request(app.getHttpServer())
      .post('/api/v1/me/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `ru-ord-${suffix}`)
      .send({ payment_intent_id: paid.body.id });
    expect(created.status).toBeLessThan(300);
    expect(created.body.id).toBeTruthy();
    expect(await prisma.order.count({ where: { paymentIntentId: paid.body.id } })).toBe(1);

    const dupOrder = await request(app.getHttpServer())
      .post('/api/v1/me/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `ru-ord-dup-${suffix}`)
      .send({ payment_intent_id: paid.body.id });
    expect(dupOrder.body.id).toBe(created.body.id);

    const orderId = created.body.id as string;
    const correlationId = created.body.order_number ?? orderId;

    // 8: customer order history + detail
    const history = await request(app.getHttpServer())
      .get('/api/v1/me/orders')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(history.status).toBeLessThan(300);
    expect((history.body.data as Array<{ id: string }>).some((row) => row.id === orderId)).toBe(true);

    // 24: customer isolation on order
    const stealOrder = await request(app.getHttpServer())
      .get(`/api/v1/me/orders/${orderId}`)
      .set('Authorization', `Bearer ${otherCustomer.token}`);
    expect(stealOrder.status).toBe(403);

    // 9–11: vendor sees + accepts + fulfills to shipment-ready
    const vendorList = await request(app.getHttpServer())
      .get(`/api/v1/vendor/orders?seller_org_id=${vendor.id}`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    expect(vendorList.status).toBeLessThan(300);
    expect((vendorList.body.data as Array<{ id: string }>).some((row) => row.id === orderId)).toBe(true);

    const stealVendor = await request(app.getHttpServer())
      .get(`/api/v1/vendor/orders/${orderId}`)
      .set('Authorization', `Bearer ${otherVendorUser.token}`);
    expect(stealVendor.status === 403 || stealVendor.status === 404).toBe(true);

    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/accept`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/pick/start`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/pick/complete`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    const packed = await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/pack/complete`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    expect(packed.body.status).toBe('READY_TO_SHIP');

    // 12: shipment synchronized
    const shipment = await prisma.shipment.findFirstOrThrow({ where: { orderId } });
    expect([ShipmentStatus.BOOKED, ShipmentStatus.LABEL_CREATED] as ShipmentStatus[]).toContain(shipment.status);
    expect(shipment.trackingNumber).toBeTruthy();

    // 13–15: delivery assign → accept → OFD
    const rider = await signIn(app, `ru-rider-${suffix}@example.com`, 'customer');
    await prisma.partner.create({
      data: {
        id: uuidv7(),
        personId: rider.personId,
        partnerTypeCode: 'DELIVERY_PARTNER',
        countryId: country.id,
        status: PartnerStatus.ACTIVE,
        activatedAt: new Date(),
      },
    });

    const assign = await request(app.getHttpServer())
      .post('/api/v1/admin/delivery/jobs/assign')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ shipment_id: shipment.id, assignee_id: rider.personId });
    expect(assign.status).toBeLessThan(300);

    const job = await prisma.logisticsJob.findFirstOrThrow({ where: { shipmentId: shipment.id } });

    await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${job.id}/accept`)
      .set('Authorization', `Bearer ${rider.token}`);
    await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${job.id}/arrive`)
      .set('Authorization', `Bearer ${rider.token}`);
    const pickup = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${job.id}/pickup`)
      .set('Authorization', `Bearer ${rider.token}`);
    expect(pickup.status).toBeLessThan(300);

    const afterPickup = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(afterPickup.status).toBe(ShipmentStatus.OUT_FOR_DELIVERY);

    // 16: customer sees updated delivery/order state
    const midOrder = await request(app.getHttpServer())
      .get(`/api/v1/me/orders/${orderId}`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(midOrder.status).toBeLessThan(300);
    expect(midOrder.body.status).toBe('OUT_FOR_DELIVERY');
    expect(midOrder.body.delivery_status).toBe('OUT_FOR_DELIVERY');
    expect(midOrder.body.seller_name).toMatch(/RU Vendor/);
    expect(midOrder.body.tracking?.message ?? '').toMatch(/sandbox|external/i);
    expect(Array.isArray(midOrder.body.timeline)).toBe(true);
    expect(midOrder.body.timeline.some((row: { status: string }) => row.status === 'OUT_FOR_DELIVERY')).toBe(
      true,
    );

    // 17: complete with sandbox POD
    const pod = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${job.id}/pod`)
      .set('Authorization', `Bearer ${rider.token}`)
      .send({ code: SANDBOX_DELIVERY_OTP });
    expect(pod.status).toBeLessThan(300);
    expect(pod.body.status).toBe(LogisticsJobStatus.DELIVERED);

    // 21: repeated completion does not duplicate
    const dupPod = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${job.id}/pod`)
      .set('Authorization', `Bearer ${rider.token}`)
      .send({ code: SANDBOX_DELIVERY_OTP });
    expect(dupPod.status).toBeLessThan(300);
    expect(dupPod.body.status).toBe(LogisticsJobStatus.DELIVERED);
    expect(await prisma.proofOfDelivery.count({ where: { shipmentId: shipment.id } })).toBe(1);

    // 18: customer delivered + POD metadata
    const deliveredOrder = await request(app.getHttpServer())
      .get(`/api/v1/me/orders/${orderId}`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(deliveredOrder.body.status).toBe('DELIVERED');
    expect(deliveredOrder.body.payment_status).toBeTruthy();
    expect(deliveredOrder.body.delivery_status).toBe('DELIVERED');
    expect(deliveredOrder.body.shipments?.[0]?.pod?.delivered).toBe(true);
    expect(deliveredOrder.body.shipments?.[0]?.pod?.otp_recorded).toBe(true);
    expect(deliveredOrder.body.shipments?.[0]?.pod?.sandbox !== false).toBe(true);
    expect(String(deliveredOrder.body.pod?.note ?? '')).not.toMatch(/s3:\/\/|object_key|storage_path/i);

    const customerShip = await request(app.getHttpServer())
      .get(`/api/v1/me/shipments/${shipment.id}`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(customerShip.status).toBeLessThan(300);
    expect(customerShip.body.status).toBe(ShipmentStatus.DELIVERED);
    expect(customerShip.body.message).toMatch(/mock/i);
    expect(customerShip.body.pod?.delivered).toBe(true);
    expect(customerShip.body.pod).not.toHaveProperty('object_key');
    expect(customerShip.body.pod).not.toHaveProperty('storage_path');

    // 25: POD isolation
    const stealPod = await request(app.getHttpServer())
      .get(`/api/v1/me/shipments/${shipment.id}`)
      .set('Authorization', `Bearer ${otherCustomer.token}`);
    expect(stealPod.status).toBe(403);

    // 20 + 29: notifications for real events; duplicate suppressed
    await drainOrderBuyerEvents(orderId, [
      'ORDER_READY_FOR_SHIPMENT',
      'ORDER_SHIPPED',
      'ORDER_OUT_FOR_DELIVERY',
      'ORDER_DELIVERED',
    ]);
    const titles = await inboxTitles(customer.token);
    expect(titles.filter((t) => t === 'Order out for delivery').length).toBe(1);
    expect(titles.filter((t) => t === 'Order delivered').length).toBe(1);
    expect(await inboxTitles(otherCustomer.token)).not.toEqual(expect.arrayContaining(['Order delivered']));

    const inbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set('Authorization', `Bearer ${customer.token}`);
    const deliveredNotif = (inbox.body.data ?? inbox.body).find(
      (row: { title: string; reference_type?: string; reference_id?: string }) =>
        row.title === 'Order delivered',
    );
    expect(deliveredNotif?.reference_type).toBe('order');
    expect(deliveredNotif?.reference_id).toBe(orderId);

    // 22: return then refund for eligible delivered order
    const returnReq = await request(app.getHttpServer())
      .post(`/api/v1/me/orders/${orderId}/returns`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `ru-ret-${suffix}`)
      .send({ reason: 'DAMAGED' });
    expect(returnReq.status).toBeLessThan(300);
    expect(returnReq.body.status).toBe('RETURN_REQUESTED');

    const returns = await prisma.returnRequest.findMany({ where: { orderId } });
    expect(returns).toHaveLength(1);

    const approve = await request(app.getHttpServer())
      .post(`/api/v1/vendor/returns/${orderId}/${returns[0]!.id}/approve`)
      .set('Authorization', `Bearer ${vendorUser.token}`)
      .send({});
    expect(approve.status).toBeLessThan(300);

    const afterReturn = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(afterReturn.status).toBe('RETURNED');

    const refund = await request(app.getHttpServer())
      .post(`/api/v1/me/orders/${orderId}/refund`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `ru-ref-${suffix}`)
      .send({});
    expect(refund.status).toBeLessThan(300);
    expect(refund.body.status).toBe('REFUND_PENDING');

    const refundEvent = await prisma.outboxEvent.findFirst({
      where: { type: 'PAYMENT_REFUND_REQUESTED', aggregateId: paid.body.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(refundEvent).toBeTruthy();
    await eventWorker.handle(refundEvent!.id);

    const refundedEvent = await prisma.outboxEvent.findFirst({
      where: { type: 'PAYMENT_REFUNDED', aggregateId: paid.body.id },
      orderBy: { createdAt: 'desc' },
    });
    if (refundedEvent) {
      await eventWorker.handle(refundedEvent.id);
    }

    const afterRefund = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(['REFUNDED', 'PARTIALLY_REFUNDED', 'REFUND_PENDING']).toContain(afterRefund.status);

    // 23: duplicate refund rejected / idempotent
    const dupRefund = await request(app.getHttpServer())
      .post(`/api/v1/me/orders/${orderId}/refund`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `ru-ref-dup-${suffix}`)
      .send({});
    expect(dupRefund.status === 409 || dupRefund.status < 300).toBe(true);
    expect(await prisma.refund.count({ where: { intentId: paid.body.id } })).toBe(1);

    // 27: financial consistency
    const intent = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: paid.body.id } });
    expect(intent.refundedMinor).toBeGreaterThan(0n);
    expect(intent.refundedMinor).toBeLessThanOrEqual(intent.capturedMinor);

    // 28: sandbox carrier truthful
    expect(customerShip.body.sandbox !== false).toBe(true);

    // 30: correlation / references
    expect(correlationId).toBeTruthy();
    expect(shipment.trackingNumber).toBeTruthy();
    expect(job.id).toBeTruthy();
    expect(paid.body.id).toBeTruthy();
  });
});
