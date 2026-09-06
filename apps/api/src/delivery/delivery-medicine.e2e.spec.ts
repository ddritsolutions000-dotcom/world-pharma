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

describe('delivery medicine rider lifecycle (e2e)', () => {
  jest.setTimeout(180_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let countryId: string;
  const iso = 'DM';

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
          isoAlpha3: 'DMX',
          nameI18n: { en: 'Delivery medicine test' },
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
        checksum: `delivery-med-${Date.now()}`,
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
        legalName: `Del Vendor ${suffix}`,
        displayName: `Del Vendor ${suffix}`,
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'Del WH',
        timezone: 'UTC',
      },
    });
    const admin = await bootstrapSuperAdminByEmail(app, prisma, `del-admin-${suffix}@example.com`);
    const vendorUser = await signInAudience(app, `del-vendor-${suffix}@example.com`, 'customer');
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
      .send({ slug: `del-brand-${suffix}`, name: 'DelBrand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: `del-item-${suffix}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'Del zinc',
        countries: [{ country_code: iso }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku_code: `DEL-SKU-${suffix}`, pack_size: '10' });
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
        lotCode: `DEL-LOT-${suffix}`,
        status: InventoryLotStatus.ACTIVE,
      },
    });
    await prisma.inventoryBalance.create({
      data: { id: uuidv7(), lotId: lot.id, onHand: 40, available: 40 },
    });

    const customer = await signInAudience(app, `del-cust-${suffix}@example.com`, 'customer');
    await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${iso}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `del-add-${suffix}`)
      .send({ offer_id: offer.body.id, qty: 1 });
    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${iso}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `del-co-${suffix}`)
      .send({});
    const paid = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `del-pay-${suffix}`)
      .send({ method: 'CARD', scenario: 'success' });
    const order = await request(app.getHttpServer())
      .post('/api/v1/me/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `del-ord-${suffix}`)
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
    return { admin, vendor, vendorUser, customer, shipment, orderId: order.body.id as string };
  }

  async function provisionRider(suffix: string) {
    const rider = await signInAudience(app, `del-rider-${suffix}@example.com`, 'customer');
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

  it('completes sandbox rider pickup → OTP POD → delivered with tenant isolation', async () => {
    const suffix = `${Date.now()}`;
    const { admin, vendorUser, customer, shipment } = await createMedicineOrder(suffix);
    const rider = await provisionRider(suffix);
    const otherRider = await provisionRider(`${suffix}-b`);
    const otherCustomer = await signInAudience(app, `del-cust-b-${suffix}@example.com`, 'customer');

    const assign = await request(app.getHttpServer())
      .post('/api/v1/admin/delivery/jobs/assign')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ shipment_id: shipment.id, assignee_id: rider.personId });
    expect(assign.status).toBeLessThan(300);

    const otpRow = await prisma.proofOfDelivery.findFirst({ where: { shipmentId: shipment.id } });
    expect(otpRow).toBeTruthy();

    const job = await prisma.logisticsJob.findFirstOrThrow({
      where: { shipmentId: shipment.id },
    });

    const stealAccept = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${job.id}/accept`)
      .set('Authorization', `Bearer ${otherRider.token}`);
    expect(stealAccept.status === 403 || stealAccept.status === 404).toBe(true);

    const acceptRes = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${job.id}/accept`)
      .set('Authorization', `Bearer ${rider.token}`);
    expect(acceptRes.status).toBeLessThan(300);

    const arriveRes = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${job.id}/arrive`)
      .set('Authorization', `Bearer ${rider.token}`);
    expect(arriveRes.status).toBeLessThan(300);

    const pickupRes = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${job.id}/pickup`)
      .set('Authorization', `Bearer ${rider.token}`);
    expect(pickupRes.status).toBeLessThan(300);

    const afterPickup = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(afterPickup.status).toBe(ShipmentStatus.OUT_FOR_DELIVERY);

    const stealPickup = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${job.id}/pickup`)
      .set('Authorization', `Bearer ${otherRider.token}`);
    expect(stealPickup.status === 403 || stealPickup.status === 404).toBe(true);

    const pod = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${job.id}/pod`)
      .set('Authorization', `Bearer ${rider.token}`)
      .send({ code: SANDBOX_DELIVERY_OTP });
    expect(pod.status).toBeLessThan(300);
    expect(pod.body.status).toBe(LogisticsJobStatus.DELIVERED);

    const dupPod = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${job.id}/pod`)
      .set('Authorization', `Bearer ${rider.token}`)
      .send({ code: SANDBOX_DELIVERY_OTP });
    expect(dupPod.status).toBeLessThan(300);
    expect(dupPod.body.status).toBe(LogisticsJobStatus.DELIVERED);

    const deliveredShipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(deliveredShipment.status).toBe(ShipmentStatus.DELIVERED);

    const deliveredJob = await prisma.logisticsJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(deliveredJob.status).toBe(LogisticsJobStatus.DELIVERED);

    const customerView = await request(app.getHttpServer())
      .get(`/api/v1/me/shipments/${shipment.id}`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(customerView.status).toBeLessThan(300);
    expect(customerView.body.status).toBe(ShipmentStatus.DELIVERED);
    expect(customerView.body.message).toMatch(/mock/i);

    const vendorView = await request(app.getHttpServer())
      .get(`/api/v1/vendor/shipments/${shipment.id}`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    expect(vendorView.status).toBeLessThan(300);
    expect(vendorView.body.status).toBe(ShipmentStatus.DELIVERED);

    const stealCustomer = await request(app.getHttpServer())
      .get(`/api/v1/me/shipments/${shipment.id}`)
      .set('Authorization', `Bearer ${otherCustomer.token}`);
    expect(stealCustomer.status).toBe(403);

    const deliveredOutbox = await prisma.outboxEvent.findFirst({
      where: { type: 'SHIPMENT_DELIVERED', aggregateId: shipment.id },
    });
    expect(deliveredOutbox).toBeTruthy();

    const jobEvents = await prisma.logisticsJobEvent.findMany({ where: { jobId: job.id } });
    expect(jobEvents.length).toBeGreaterThan(0);
  });

  it('records delivery failure and blocks duplicate illegal transitions', async () => {
    const suffix = `fail-${Date.now()}`;
    const { admin, customer, shipment } = await createMedicineOrder(suffix);
    const rider = await provisionRider(suffix);

    await request(app.getHttpServer())
      .post('/api/v1/admin/delivery/jobs/assign')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ shipment_id: shipment.id, assignee_id: rider.personId });

    const job = await prisma.logisticsJob.findFirstOrThrow({ where: { shipmentId: shipment.id } });
    await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${job.id}/accept`)
      .set('Authorization', `Bearer ${rider.token}`);
    await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${job.id}/arrive`)
      .set('Authorization', `Bearer ${rider.token}`);
    await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${job.id}/pickup`)
      .set('Authorization', `Bearer ${rider.token}`);

    const fail = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${job.id}/fail`)
      .set('Authorization', `Bearer ${rider.token}`)
      .send({ reason: 'customer_unavailable' });
    expect(fail.status).toBeLessThan(300);

    const failedShipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(failedShipment.status).toBe(ShipmentStatus.DELIVERY_FAILED);

    const customerView = await request(app.getHttpServer())
      .get(`/api/v1/me/shipments/${shipment.id}`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(customerView.body.status).toBe(ShipmentStatus.DELIVERY_FAILED);

    const illegalPod = await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${job.id}/pod`)
      .set('Authorization', `Bearer ${rider.token}`)
      .send({ code: SANDBOX_DELIVERY_OTP });
    expect(illegalPod.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects unauthenticated delivery mutations', async () => {
    const suffix = `auth-${Date.now()}`;
    const { shipment } = await createMedicineOrder(suffix);
    const job = await prisma.logisticsJob.findFirstOrThrow({ where: { shipmentId: shipment.id } });
    const res = await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${job.id}/pickup`);
    expect(res.status).toBe(401);
  });
});
