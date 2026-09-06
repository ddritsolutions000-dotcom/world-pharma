/**
 * S462 — staged order-to-delivery real-use (sandbox).
 * Splits the Sprint-34 monolith into Stage A–D with per-stage timeouts + timing logs.
 * Harness/setup fix only — does not change application business logic.
 */
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

type Ctx = {
  suffix: string;
  iso2: string;
  countryId: string;
  vendorId: string;
  locationId: string;
  adminToken: string;
  vendorToken: string;
  otherVendorToken: string;
  customerToken: string;
  otherCustomerToken: string;
  itemId: string;
  itemSlug: string;
  variantId: string;
  offerId: string;
  medTitle: string;
  orderId?: string;
  paymentIntentId?: string;
  shipmentId?: string;
  jobId?: string;
  riderToken?: string;
  riderPersonId?: string;
};

function mark(stage: string, t0: number) {
  // eslint-disable-next-line no-console
  console.log(`[S462 ${stage}] +${Date.now() - t0}ms`);
}

describe('S462 staged order-to-delivery real-use (e2e)', () => {
  jest.setTimeout(600_000);

  let app: INestApplication;
  let prisma: PrismaService;
  const iso2 = 'R2';
  let ctx: Ctx;

  beforeAll(async () => {
    const t0 = Date.now();
    applyTestIsolation();
    process.env['NODE_ENV'] = 'test';
    process.env['AUTH_DEV_REVEAL_OTP'] = 'true';
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
    mark('beforeAll.app.init', t0);
  });

  afterAll(async () => {
    await app?.close();
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
          isoAlpha3: 'R2Q',
          nameI18n: { en: 'S462 real-use' },
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
        checksum: `s462-${Date.now()}`,
        publishedAt: new Date(),
      },
    });
    const zoneCount = await prisma.serviceabilityZone.count({ where: { countryId: country.id } });
    if (zoneCount === 0) {
      await prisma.serviceabilityZone.create({
        data: {
          id: uuidv7(),
          countryId: country.id,
          name: 'R2 metro',
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

  it(
    'STAGE A — catalog → cart → checkout → sandbox pay → order',
    async () => {
      const t0 = Date.now();
      const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
      const country = await seedMarket();
      const medTitle = `S462 Zinc ${suffix}`;
      mark('A.seedMarket', t0);

      const vendor = await prisma.organization.create({
        data: {
          id: uuidv7(),
          countryId: country.id,
          kind: OrganizationKind.VENDOR,
          legalName: `S462 Vendor ${suffix}`,
          displayName: `S462 Vendor ${suffix}`,
          status: 'ACTIVE',
        },
      });
      const otherVendor = await prisma.organization.create({
        data: {
          id: uuidv7(),
          countryId: country.id,
          kind: OrganizationKind.VENDOR,
          legalName: `S462 Other ${suffix}`,
          displayName: `S462 Other ${suffix}`,
          status: 'ACTIVE',
        },
      });
      const location = await prisma.location.create({
        data: {
          id: uuidv7(),
          organizationId: vendor.id,
          countryId: country.id,
          kind: LocationKind.VENDOR_WAREHOUSE,
          name: 'S462 WH',
          timezone: 'UTC',
        },
      });

      const admin = await provisionSuperAdmin(app, prisma, `s462-admin-${suffix}`);
      const vendorUser = await provisionOrgAdmin(app, prisma, `s462-vendor-${suffix}`, vendor.id);
      const otherVendorUser = await provisionOrgAdmin(
        app,
        prisma,
        `s462-vendor-b-${suffix}`,
        otherVendor.id,
      );
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
      mark('A.sellers', t0);

      const brand = await request(app.getHttpServer())
        .post('/api/v1/admin/catalog/brands')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ slug: `s462-brand-${suffix}`, name: 'S462 Brand' });
      expect(brand.status).toBeLessThan(300);

      const item = await request(app.getHttpServer())
        .post('/api/v1/admin/catalog/items')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          slug: `s462-med-${suffix}`,
          kind: 'OTC',
          brand_id: brand.body.id,
          title: medTitle,
          countries: [{ country_code: iso2 }],
        });
      expect(item.status).toBeLessThan(300);

      const variant = await request(app.getHttpServer())
        .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ sku_code: `S462-SKU-${suffix}`, pack_size: '10' });
      expect(variant.status).toBeLessThan(300);

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
      expect(offer.status).toBeLessThan(300);
      await request(app.getHttpServer())
        .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/publish`)
        .set('Authorization', `Bearer ${vendorUser.token}`);

      await prisma.inventoryLot
        .create({
          data: {
            id: uuidv7(),
            variantId: variant.body.id,
            locationId: location.id,
            ownerOrgId: vendor.id,
            countryId: country.id,
            lotCode: `S462-LOT-${suffix}`,
            status: InventoryLotStatus.ACTIVE,
          },
        })
        .then(async (lot) => {
          await prisma.inventoryBalance.create({
            data: { id: uuidv7(), lotId: lot.id, onHand: 40, available: 40 },
          });
        });
      mark('A.catalog', t0);

      const customer = await signIn(app, `s462-cust-${suffix}@example.com`, 'customer');
      const otherCustomer = await signIn(app, `s462-cust-b-${suffix}@example.com`, 'customer');

      const search = await request(app.getHttpServer()).get(
        `/api/v1/catalog/search?country=${iso2}&q=${encodeURIComponent(medTitle)}`,
      );
      expect(search.status).toBeLessThan(300);

      const detail = await request(app.getHttpServer()).get(
        `/api/v1/catalog/items/${item.body.slug}?country=${iso2}&postal_code=400001`,
      );
      expect(detail.status).toBeLessThan(300);
      expect(
        ((detail.body.offers ?? []) as Array<{ id: string }>).some((o) => o.id === offer.body.id),
      ).toBe(true);

      const add = await request(app.getHttpServer())
        .post(`/api/v1/me/cart/items?country=${iso2}`)
        .set('Authorization', `Bearer ${customer.token}`)
        .set('Idempotency-Key', `s462-add-${suffix}`)
        .send({ offer_id: offer.body.id, qty: 1 });
      expect(add.status).toBeLessThan(300);

      const session = await request(app.getHttpServer())
        .post(`/api/v1/me/checkout/sessions?country=${iso2}`)
        .set('Authorization', `Bearer ${customer.token}`)
        .set('Idempotency-Key', `s462-co-${suffix}`)
        .send({});
      expect(session.status).toBeLessThan(300);

      const addr = await request(app.getHttpServer())
        .post('/api/v1/me/addresses')
        .set('Authorization', `Bearer ${customer.token}`)
        .set('Idempotency-Key', `s462-addr-${suffix}`)
        .send({
          country_code: iso2,
          recipient_name: 'S462 Customer',
          line1: '1 Stage A Way',
          city: 'Sandbox City',
          postal_code: '400001',
          phone: '+10000000462',
        });
      expect(addr.status).toBeLessThan(300);

      await request(app.getHttpServer())
        .post(`/api/v1/me/checkout/sessions/${session.body.id}/fulfillment`)
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ address_id: addr.body.id });
      const quote = await request(app.getHttpServer())
        .post(`/api/v1/me/checkout/sessions/${session.body.id}/quote`)
        .set('Authorization', `Bearer ${customer.token}`)
        .set('Idempotency-Key', `s462-q-${suffix}`)
        .send({});
      expect(quote.status).toBeLessThan(300);

      const paid = await request(app.getHttpServer())
        .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
        .set('Authorization', `Bearer ${customer.token}`)
        .set('Idempotency-Key', `s462-pay-${suffix}`)
        .send({ method: 'CARD', scenario: 'success' });
      expect(paid.status).toBeLessThan(300);
      expect(paid.body.status).toBe('CAPTURED');
      expect(paid.body.sandbox).toBe(true);
      mark('A.paid', t0);

      const created = await request(app.getHttpServer())
        .post('/api/v1/me/orders')
        .set('Authorization', `Bearer ${customer.token}`)
        .set('Idempotency-Key', `s462-ord-${suffix}`)
        .send({ payment_intent_id: paid.body.id });
      expect(created.status).toBeLessThan(300);
      expect(created.body.id).toBeTruthy();
      mark('A.order', t0);

      const steal = await request(app.getHttpServer())
        .get(`/api/v1/me/orders/${created.body.id}`)
        .set('Authorization', `Bearer ${otherCustomer.token}`);
      expect(steal.status).toBe(403);

      ctx = {
        suffix,
        iso2,
        countryId: country.id,
        vendorId: vendor.id,
        locationId: location.id,
        adminToken: admin.token,
        vendorToken: vendorUser.token,
        otherVendorToken: otherVendorUser.token,
        customerToken: customer.token,
        otherCustomerToken: otherCustomer.token,
        itemId: item.body.id,
        itemSlug: item.body.slug,
        variantId: variant.body.id,
        offerId: offer.body.id,
        medTitle,
        orderId: created.body.id,
        paymentIntentId: paid.body.id,
      };
    },
    240_000,
  );

  it(
    'STAGE B — vendor accept → pick → pack → READY_TO_SHIP + shipment',
    async () => {
      const t0 = Date.now();
      expect(ctx?.orderId).toBeTruthy();
      const orderId = ctx.orderId!;

      const stealVendor = await request(app.getHttpServer())
        .get(`/api/v1/vendor/orders/${orderId}`)
        .set('Authorization', `Bearer ${ctx.otherVendorToken}`);
      expect(stealVendor.status === 403 || stealVendor.status === 404).toBe(true);

      await request(app.getHttpServer())
        .post(`/api/v1/vendor/orders/${orderId}/accept`)
        .set('Authorization', `Bearer ${ctx.vendorToken}`);
      mark('B.accept', t0);
      await request(app.getHttpServer())
        .post(`/api/v1/vendor/orders/${orderId}/pick/start`)
        .set('Authorization', `Bearer ${ctx.vendorToken}`);
      await request(app.getHttpServer())
        .post(`/api/v1/vendor/orders/${orderId}/pick/complete`)
        .set('Authorization', `Bearer ${ctx.vendorToken}`);
      mark('B.pick', t0);
      const packed = await request(app.getHttpServer())
        .post(`/api/v1/vendor/orders/${orderId}/pack/complete`)
        .set('Authorization', `Bearer ${ctx.vendorToken}`);
      expect(packed.status).toBeLessThan(300);
      expect(packed.body.status).toBe('READY_TO_SHIP');
      mark('B.pack', t0);

      const shipment = await prisma.shipment.findFirstOrThrow({ where: { orderId } });
      expect([ShipmentStatus.BOOKED, ShipmentStatus.LABEL_CREATED] as ShipmentStatus[]).toContain(
        shipment.status,
      );
      expect(shipment.trackingNumber).toBeTruthy();
      ctx.shipmentId = shipment.id;
      mark('B.shipment', t0);
    },
    180_000,
  );

  it(
    'STAGE C — assign rider → pickup → OUT_FOR_DELIVERY + customer tracking',
    async () => {
      const t0 = Date.now();
      expect(ctx?.shipmentId).toBeTruthy();

      const rider = await signIn(app, `s462-rider-${ctx.suffix}@example.com`, 'customer');
      await prisma.partner.create({
        data: {
          id: uuidv7(),
          personId: rider.personId,
          partnerTypeCode: 'DELIVERY_PARTNER',
          countryId: ctx.countryId,
          status: PartnerStatus.ACTIVE,
          activatedAt: new Date(),
        },
      });
      ctx.riderToken = rider.token;
      ctx.riderPersonId = rider.personId;

      const assign = await request(app.getHttpServer())
        .post('/api/v1/admin/delivery/jobs/assign')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ shipment_id: ctx.shipmentId, assignee_id: rider.personId });
      expect(assign.status).toBeLessThan(300);
      mark('C.assign', t0);

      // Prefer assign response id — avoids post-assign findFirst lock waits observed on this host (S460/S462).
      let jobId = (assign.body?.id as string | undefined) ?? null;
      if (!jobId) {
        const job = await Promise.race([
          prisma.logisticsJob.findFirst({ where: { shipmentId: ctx.shipmentId } }),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('S462 logisticsJob findFirst timed out after 20s')), 20_000),
          ),
        ]);
        jobId = job?.id ?? null;
      }
      expect(jobId).toBeTruthy();
      ctx.jobId = jobId!;
      mark(`C.job_found:${jobId}`, t0);

      const accept = await request(app.getHttpServer())
        .post(`/api/v1/delivery/jobs/${jobId}/accept`)
        .set('Authorization', `Bearer ${rider.token}`);
      expect(accept.status).toBeLessThan(300);
      mark(`C.accept:${accept.status}`, t0);

      const arrive = await request(app.getHttpServer())
        .post(`/api/v1/delivery/jobs/${jobId}/arrive`)
        .set('Authorization', `Bearer ${rider.token}`);
      expect(arrive.status).toBeLessThan(300);
      mark(`C.arrive:${arrive.status}`, t0);

      const pickup = await request(app.getHttpServer())
        .post(`/api/v1/delivery/jobs/${jobId}/pickup`)
        .set('Authorization', `Bearer ${rider.token}`);
      expect(pickup.status).toBeLessThan(300);
      mark(`C.pickup:${pickup.status}`, t0);

      const afterPickup = await prisma.shipment.findUniqueOrThrow({ where: { id: ctx.shipmentId! } });
      expect(afterPickup.status).toBe(ShipmentStatus.OUT_FOR_DELIVERY);

      const midOrder = await request(app.getHttpServer())
        .get(`/api/v1/me/orders/${ctx.orderId}`)
        .set('Authorization', `Bearer ${ctx.customerToken}`);
      expect(midOrder.status).toBeLessThan(300);
      expect(midOrder.body.status).toBe('OUT_FOR_DELIVERY');
      expect(midOrder.body.delivery_status).toBe('OUT_FOR_DELIVERY');
      mark('C.customer_track', t0);
    },
    180_000,
  );

  it(
    'STAGE D — POD delivered → customer completion + isolation',
    async () => {
      const t0 = Date.now();
      expect(ctx?.jobId).toBeTruthy();

      const pod = await request(app.getHttpServer())
        .post(`/api/v1/delivery/jobs/${ctx.jobId}/pod`)
        .set('Authorization', `Bearer ${ctx.riderToken}`)
        .send({ code: SANDBOX_DELIVERY_OTP });
      expect(pod.status).toBeLessThan(300);
      expect(pod.body.status).toBe(LogisticsJobStatus.DELIVERED);
      mark('D.pod', t0);

      const deliveredOrder = await request(app.getHttpServer())
        .get(`/api/v1/me/orders/${ctx.orderId}`)
        .set('Authorization', `Bearer ${ctx.customerToken}`);
      expect(deliveredOrder.body.status).toBe('DELIVERED');
      expect(deliveredOrder.body.delivery_status).toBe('DELIVERED');
      expect(deliveredOrder.body.shipments?.[0]?.pod?.sandbox !== false).toBe(true);

      const stealPod = await request(app.getHttpServer())
        .get(`/api/v1/me/shipments/${ctx.shipmentId}`)
        .set('Authorization', `Bearer ${ctx.otherCustomerToken}`);
      expect(stealPod.status).toBe(403);

      const ship = await request(app.getHttpServer())
        .get(`/api/v1/me/shipments/${ctx.shipmentId}`)
        .set('Authorization', `Bearer ${ctx.customerToken}`);
      expect(ship.status).toBeLessThan(300);
      expect(ship.body.status).toBe(ShipmentStatus.DELIVERED);
      expect(ship.body.sandbox !== false).toBe(true);
      mark('D.done', t0);
    },
    120_000,
  );
});
