import { INestApplication } from '@nestjs/common';
import {
  InventoryLotStatus,
  LocationKind,
  LogisticsJobStatus,
  OrganizationKind,
  PartnerStatus,
  PolicyPackStatus,
  ProofOfDeliveryKind,
  ShipmentStatus,
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
import { bootstrapSuperAdminByEmail, signIn as signInAudience } from '../test/sign-in';
import { SANDBOX_DELIVERY_OTP } from '../logistics/sandbox-otp';
import { signCarrierPayload } from '../logistics/hmac';

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('S26 delivery last-mile operations completion (e2e)', () => {
  jest.setTimeout(180_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let countryId: string;
  const iso = 'D6';

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

    const doc = emptyPolicyDocument();
    doc.services.pharmacy = true;
    enableMarketplaceVendorPack(doc);
    doc.payments.enabled = true;
    doc.payments.methods = ['CARD', 'COD'];
    doc.payments.gateway_refs = ['MOCK_PRIMARY'];
    doc.payments.currencies = ['XXX'];
    doc.shipping.domestic = true;

    let country = await prisma.country.findUnique({ where: { isoAlpha2: iso } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: iso,
          isoAlpha3: 'D6X',
          nameI18n: { en: 'S26 delivery test' },
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
        checksum: `s26-del-${Date.now()}`,
        publishedAt: new Date(),
      },
    });
    countryId = country.id;
    await app.get(PolicyCache).invalidate(iso);
  });

  afterAll(async () => {
    await app.close();
  });

  async function createMedicineOrder(suffix: string) {
    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.VENDOR,
        legalName: `S26 Vendor ${suffix}`,
        displayName: `S26 Vendor ${suffix}`,
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'S26 WH',
        timezone: 'UTC',
      },
    });
    const admin = await bootstrapSuperAdminByEmail(app, prisma, `s26-admin-${suffix}@example.com`);
    const vendorUser = await signInAudience(app, `s26-vendor-${suffix}@example.com`, 'customer');
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
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: `s26-brand-${suffix}`, name: 'S26Brand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: `s26-item-${suffix}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'S26 zinc',
        countries: [{ country_code: iso }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku_code: `S26-SKU-${suffix}`, pack_size: '10' });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);
    const offer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set('Authorization', `Bearer ${vendorUser.token}`)
      .send({
        variant_id: variant.body.id,
        seller_org_id: vendor.id,
        country_code: iso,
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
        countryId,
        lotCode: `S26-LOT-${suffix}`,
        status: InventoryLotStatus.ACTIVE,
      },
    });
    await prisma.inventoryBalance.create({
      data: { id: uuidv7(), lotId: lot.id, onHand: 40, available: 40 },
    });

    const customer = await signInAudience(app, `s26-cust-${suffix}@example.com`, 'customer');
    await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${iso}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `s26-add-${suffix}`)
      .send({ offer_id: offer.body.id, qty: 1 });
    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${iso}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `s26-co-${suffix}`)
      .send({});
    const paid = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `s26-pay-${suffix}`)
      .send({ method: 'CARD', scenario: 'success' });
    const order = await request(app.getHttpServer())
      .post('/api/v1/me/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `s26-ord-${suffix}`)
      .send({ payment_intent_id: paid.body.id });
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${order.body.id}/accept`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${order.body.id}/pick/start`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${order.body.id}/pick/complete`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${order.body.id}/pack/complete`)
      .set('Authorization', `Bearer ${vendorUser.token}`);

    const shipment = await prisma.shipment.findFirstOrThrow({ where: { orderId: order.body.id } });
    return { admin, vendor, vendorUser, customer, shipment, orderId: order.body.id as string, sellerOrgId: vendor.id };
  }

  async function provisionRider(suffix: string) {
    const rider = await signInAudience(app, `s26-rider-${suffix}@example.com`, 'customer');
    await prisma.partner.create({
      data: {
        id: uuidv7(),
        personId: rider.personId,
        partnerTypeCode: 'DELIVERY_PARTNER',
        countryId,
        status: PartnerStatus.ACTIVE,
        activatedAt: new Date(),
      },
    });
    return rider;
  }

  it('full last-mile journey with POD evidence, failure/RTO, webhook security, and isolation', async () => {
    const suffix = `${Date.now()}`;
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const { admin, vendorUser, customer, shipment } = await createMedicineOrder(suffix);
    const rider = await provisionRider(suffix);
    const otherRider = await provisionRider(`${suffix}-b`);
    const otherCustomer = await signInAudience(app, `s26-cust-b-${suffix}@example.com`, 'customer');

    // Carrier sandbox booking
    const book = await request(app.getHttpServer())
      .post(`/api/v1/admin/shipments/${shipment.id}/book`)
      .set(auth(admin.token))
      .send({ scenario: 'BOOK_SUCCESS' });
    expect(book.status).toBeLessThan(300);

    const assign = await request(app.getHttpServer())
      .post('/api/v1/admin/delivery/jobs/assign')
      .set(auth(admin.token))
      .send({ shipment_id: shipment.id, assignee_id: rider.personId });
    expect(assign.status).toBeLessThan(300);

    const job = await prisma.logisticsJob.findFirstOrThrow({ where: { shipmentId: shipment.id } });
    expect(job.assigneeId).toBe(rider.personId);

    const riderJobs = await request(app.getHttpServer()).get('/api/v1/delivery/jobs').set(auth(rider.token));
    expect(riderJobs.status).toBe(200);
    expect(riderJobs.body.data.some((row: { id: string }) => row.id === job.id)).toBe(true);

    const otherGet = await request(app.getHttpServer()).get(`/api/v1/delivery/jobs/${job.id}`).set(auth(otherRider.token));
    expect([403, 404]).toContain(otherGet.status);

    await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${job.id}/accept`).set(auth(rider.token));
    await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${job.id}/arrive`)
      .set(auth(rider.token))
      .send({ latitude: 12.34, longitude: 56.78, accuracy_meters: 10 });
    await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${job.id}/pickup`)
      .set(auth(rider.token))
      .send({ latitude: 12.35, longitude: 56.79 });

    const afterPickup = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(afterPickup.status).toBe(ShipmentStatus.OUT_FOR_DELIVERY);
    const afterPickupJob = await prisma.logisticsJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(afterPickupJob.status).toBe(LogisticsJobStatus.PICKUP);

    const photoKey = `s26-photo-${suffix}`;
    const photoUpload = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${job.id}/pod/photo`)
      .set(auth(rider.token))
      .send({
        content_base64: TINY_PNG_BASE64,
        content_type: 'image/png',
        idempotency_key: photoKey,
        latitude: 12.36,
        longitude: 56.8,
      });
    expect(photoUpload.status).toBeLessThan(300);
    expect(photoUpload.body.public_url).toBeNull();
    expect(photoUpload.body.object_key).toBeTruthy();

    const dupPhoto = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${job.id}/pod/photo`)
      .set(auth(rider.token))
      .send({
        content_base64: TINY_PNG_BASE64,
        content_type: 'image/png',
        idempotency_key: photoKey,
      });
    expect(dupPhoto.status).toBeLessThan(300);
    expect(dupPhoto.body.id).toBe(photoUpload.body.id);

    const customerPhoto = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${job.id}/pod/photo`)
      .set(auth(customer.token))
      .send({ content_base64: TINY_PNG_BASE64, content_type: 'image/png' });
    expect([403, 404]).toContain(customerPhoto.status);

    const wrongOtp = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${job.id}/pod`)
      .set(auth(rider.token))
      .send({ code: '000000' });
    expect(wrongOtp.status).toBeGreaterThanOrEqual(400);

    const pod = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${job.id}/pod`)
      .set(auth(rider.token))
      .send({ code: SANDBOX_DELIVERY_OTP, latitude: 12.37, longitude: 56.81 });
    expect(pod.status).toBeLessThan(300);
    expect(pod.body.status).toBe(LogisticsJobStatus.DELIVERED);

    const dupPod = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${job.id}/pod`)
      .set(auth(rider.token))
      .send({ code: SANDBOX_DELIVERY_OTP });
    expect(dupPod.status).toBeLessThan(300);

    const deliveredShipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(deliveredShipment.status).toBe(ShipmentStatus.DELIVERED);

    const photoProof = await prisma.proofOfDelivery.findFirst({
      where: { shipmentId: shipment.id, kind: ProofOfDeliveryKind.PHOTO },
    });
    expect(photoProof?.objectKey).toBeTruthy();

    const customerView = await request(app.getHttpServer())
      .get(`/api/v1/me/shipments/${shipment.id}`)
      .set(auth(customer.token));
    expect(customerView.status).toBe(200);
    expect(customerView.body.status).toBe(ShipmentStatus.DELIVERED);
    expect(customerView.body.pod.photo_attached).toBe(true);
    expect(JSON.stringify(customerView.body)).not.toMatch(/object_key|private-objects/i);

    const vendorView = await request(app.getHttpServer())
      .get(`/api/v1/vendor/shipments/${shipment.id}`)
      .set(auth(vendorUser.token));
    expect(vendorView.status).toBe(200);
    expect(vendorView.body.status).toBe(ShipmentStatus.DELIVERED);
    expect(vendorView.body.pod.delivered).toBe(true);

    const stealCustomer = await request(app.getHttpServer())
      .get(`/api/v1/me/shipments/${shipment.id}`)
      .set(auth(otherCustomer.token));
    expect(stealCustomer.status).toBe(403);

    const ticket = await request(app.getHttpServer())
      .get(`/api/v1/delivery/jobs/${job.id}/pod/evidence/photo`)
      .set(auth(rider.token));
    expect(ticket.status).toBe(200);
    expect(ticket.body.access_ticket).toBeTruthy();
    expect(ticket.body.public_url).toBeUndefined();

    const customerTicket = await request(app.getHttpServer())
      .get(`/api/v1/delivery/jobs/${job.id}/pod/evidence/photo`)
      .set(auth(customer.token));
    expect([403, 404]).toContain(customerTicket.status);

    const stealDeliver = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${job.id}/pickup`)
      .set(auth(otherRider.token));
    expect([403, 404]).toContain(stealDeliver.status);

    // Failure / RTO on a second order
    const failSuffix = `${suffix}-fail`;
    const failOrder = await createMedicineOrder(failSuffix);
    const failRider = await provisionRider(failSuffix);
    await request(app.getHttpServer())
      .post('/api/v1/admin/delivery/jobs/assign')
      .set(auth(failOrder.admin.token))
      .send({ shipment_id: failOrder.shipment.id, assignee_id: failRider.personId });
    const failJob = await prisma.logisticsJob.findFirstOrThrow({ where: { shipmentId: failOrder.shipment.id } });
    await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${failJob.id}/accept`).set(auth(failRider.token));
    await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${failJob.id}/arrive`).set(auth(failRider.token));
    await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${failJob.id}/pickup`).set(auth(failRider.token));

    const fail = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${failJob.id}/fail`)
      .set(auth(failRider.token))
      .send({ reason: 'recipient_unavailable' });
    expect(fail.status).toBeLessThan(300);
    const dupFail = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${failJob.id}/fail`)
      .set(auth(failRider.token))
      .send({ reason: 'recipient_unavailable' });
    expect(dupFail.status).toBeLessThan(300);

    const rto = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${failJob.id}/rto`)
      .set(auth(failRider.token));
    expect(rto.status).toBeLessThan(300);
    const dupRto = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${failJob.id}/rto`)
      .set(auth(failRider.token));
    expect(dupRto.status).toBeLessThan(300);

    const rtoShipment = await prisma.shipment.findUniqueOrThrow({ where: { id: failOrder.shipment.id } });
    expect(rtoShipment.status).toBe(ShipmentStatus.RETURN_TO_ORIGIN);

    const illegalPodAfterFail = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${failJob.id}/pod`)
      .set(auth(failRider.token))
      .send({ code: SANDBOX_DELIVERY_OTP });
    expect(illegalPodAfterFail.status).toBeGreaterThanOrEqual(400);

    // Webhook security on delivered shipment (should not regress)
    const providerRef = deliveredShipment.providerRef ?? deliveredShipment.id;
    const payload = JSON.stringify({
      shipment_ref: providerRef,
      code: 'in_transit',
      provider_event_id: `s26-stale-${suffix}`,
      ts: new Date().toISOString(),
    });
    const staleWebhook = await request(app.getHttpServer())
      .post('/api/v1/webhooks/carriers/mock')
      .set('x-sandbox-signature', signCarrierPayload(payload))
      .send(JSON.parse(payload));
    expect(staleWebhook.status).toBeLessThan(300);
    expect(staleWebhook.body.ignored ?? staleWebhook.body.accepted).toBeTruthy();
    const stillDelivered = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(stillDelivered.status).toBe(ShipmentStatus.DELIVERED);

    const badSig = await request(app.getHttpServer())
      .post('/api/v1/webhooks/carriers/mock')
      .set('x-sandbox-signature', 'deadbeef')
      .send(JSON.parse(payload));
    expect(badSig.status).toBeGreaterThanOrEqual(400);

    const deliveredOutbox = await prisma.outboxEvent.findFirst({
      where: { type: 'SHIPMENT_DELIVERED', aggregateId: shipment.id },
    });
    expect(deliveredOutbox).toBeTruthy();
  });
});
