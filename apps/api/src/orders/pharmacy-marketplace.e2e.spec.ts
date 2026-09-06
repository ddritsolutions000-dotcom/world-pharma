import { INestApplication } from '@nestjs/common';
import {
  InventoryLotStatus,
  InventoryReservationStatus,
  LocationKind,
  OrganizationKind,
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
import { provisionOrgAdmin, provisionSuperAdmin, signIn } from '../test/sign-in';
import { signCarrierPayload } from '../logistics/hmac';
import { EventWorkerService } from '../events/worker.service';

describe('Sprint 13 pharmacy marketplace (e2e)', () => {
  jest.setTimeout(240_000);
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
          nameI18n: { en: `Marketplace ${iso2}` },
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
          checksum: `pm-${iso2}`,
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

  async function seedVendor(countryId: string, key: string, label: string) {
    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.VENDOR,
        legalName: label,
        displayName: label,
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: `${label} WH`,
        timezone: 'UTC',
      },
    });
    const admin = await provisionSuperAdmin(app, prisma, `pm-${key}-admin`);
    const vendorUser = await provisionOrgAdmin(app, prisma, `pm-${key}-vendor`, vendor.id);
    await activateMarketplaceSeller(app, {
      vendorToken: vendorUser.token,
      adminToken: admin.token,
      sellerOrgId: vendor.id,
    });
    return { vendor, location, vendorUser, admin };
  }

  it('multi-seller catalog, checkout loop, delivered review, and isolation', async () => {
    const iso2 = 'PM';
    const country = await seedMarket(iso2);
    const sellerA = await seedVendor(country.id, 'alpha', 'Alpha Pharmacy');
    const sellerB = await seedVendor(country.id, 'beta', 'Beta Pharmacy');

    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set('Authorization', `Bearer ${sellerA.admin.token}`)
      .send({ slug: `pm-brand-${Date.now()}`, name: 'PM Brand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${sellerA.admin.token}`)
      .send({
        slug: `pm-med-${Date.now()}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'Marketplace medicine',
        countries: [{ country_code: iso2 }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${sellerA.admin.token}`)
      .send({ sku_code: `PM-SKU-${Date.now()}`, pack_size: '10', strength: '500mg' });

    const offerA = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set('Authorization', `Bearer ${sellerA.vendorUser.token}`)
      .send({
        variant_id: variant.body.id,
        seller_org_id: sellerA.vendor.id,
        country_code: iso2,
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '300',
        list_minor: '400',
      });
    const offerB = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set('Authorization', `Bearer ${sellerB.vendorUser.token}`)
      .send({
        variant_id: variant.body.id,
        seller_org_id: sellerB.vendor.id,
        country_code: iso2,
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '220',
        list_minor: '350',
      });
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offerA.body.id}/publish`)
      .set('Authorization', `Bearer ${sellerA.vendorUser.token}`);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offerB.body.id}/publish`)
      .set('Authorization', `Bearer ${sellerB.vendorUser.token}`);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set('Authorization', `Bearer ${sellerA.admin.token}`);

    const lotA = await prisma.inventoryLot.create({
      data: {
        id: uuidv7(),
        variantId: variant.body.id,
        locationId: sellerA.location.id,
        ownerOrgId: sellerA.vendor.id,
        countryId: country.id,
        lotCode: 'PM-A',
        status: InventoryLotStatus.ACTIVE,
      },
    });
    await prisma.inventoryBalance.create({
      data: { id: uuidv7(), lotId: lotA.id, onHand: 0, available: 0 },
    });
    const lotB = await prisma.inventoryLot.create({
      data: {
        id: uuidv7(),
        variantId: variant.body.id,
        locationId: sellerB.location.id,
        ownerOrgId: sellerB.vendor.id,
        countryId: country.id,
        lotCode: 'PM-B',
        status: InventoryLotStatus.ACTIVE,
      },
    });
    await prisma.inventoryBalance.create({
      data: { id: uuidv7(), lotId: lotB.id, onHand: 12, available: 12 },
    });

    const catalog = await request(app.getHttpServer()).get(
      `/api/v1/catalog/items/${item.body.slug}?country=${iso2}`,
    );
    expect(catalog.status).toBe(200);
    expect(catalog.body.offers).toHaveLength(2);
    const betaOffer = catalog.body.offers.find((row: { id: string }) => row.id === offerB.body.id);
    const alphaOffer = catalog.body.offers.find((row: { id: string }) => row.id === offerA.body.id);
    expect(betaOffer.inventory.available).toBe(true);
    expect(alphaOffer.inventory.available).toBe(false);

    const customer = await signIn(app, `pm-cust-${Date.now()}@example.com`, 'customer');
    const other = await signIn(app, `pm-other-${Date.now()}@example.com`, 'customer');

    await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `pm-add-${Date.now()}`)
      .send({ offer_id: offerB.body.id, qty: 1 });
    const cart = await request(app.getHttpServer())
      .get(`/api/v1/me/cart?country=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(cart.body.seller_display_name).toBe('Beta Pharmacy');
    expect(cart.body.single_seller_cart).toBe(true);

    const conflict = await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `pm-conflict-${Date.now()}`)
      .send({ offer_id: offerA.body.id, qty: 1 });
    expect(conflict.status).toBe(409);

    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `pm-co-${Date.now()}`)
      .send({});
    const addr = await request(app.getHttpServer())
      .post('/api/v1/me/addresses')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `pm-addr-${Date.now()}`)
      .send({
        country_code: iso2,
        recipient_name: 'PM Customer',
        line1: '9 Market Street',
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
      .set('Idempotency-Key', `pm-q-${Date.now()}`)
      .send({});

    const paid = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `pm-pay-${session.body.id}`)
      .send({ method: 'CARD', scenario: 'success' });
    expect(paid.body.sandbox).toBe(true);

    const created = await request(app.getHttpServer())
      .post('/api/v1/me/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `pm-ord-${paid.body.id}`)
      .send({ payment_intent_id: paid.body.id });
    expect(created.body.status).toBe('ALLOCATED');

    const steal = await request(app.getHttpServer())
      .get(`/api/v1/me/orders/${created.body.id}`)
      .set('Authorization', `Bearer ${other.token}`);
    expect(steal.status).toBe(403);

    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${created.body.id}/accept`)
      .set('Authorization', `Bearer ${sellerB.vendorUser.token}`);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${created.body.id}/pick/start`)
      .set('Authorization', `Bearer ${sellerB.vendorUser.token}`);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${created.body.id}/pick/complete`)
      .set('Authorization', `Bearer ${sellerB.vendorUser.token}`);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${created.body.id}/pack/complete`)
      .set('Authorization', `Bearer ${sellerB.vendorUser.token}`);

    const earlyReview = await request(app.getHttpServer())
      .post(`/api/v1/catalog/items/${item.body.id}/reviews`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ country_code: iso2, rating: 5, title: 'Too early', body: 'Should fail' });
    expect(earlyReview.status).toBe(403);

    const shipment = await prisma.shipment.findFirstOrThrow({ where: { orderId: created.body.id } });
    const payload = JSON.stringify({
      event_id: `evt-pm-${shipment.id}`,
      code: 'delivered',
      shipment_ref: shipment.providerRef,
      sequence: 9,
      ts: new Date().toISOString(),
    });
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/carriers/mock')
      .set('x-sandbox-signature', signCarrierPayload(payload))
      .set('Content-Type', 'application/json')
      .send(payload);
    const deliveredEvent = await prisma.outboxEvent.findFirst({
      where: { type: 'SHIPMENT_DELIVERED', aggregateId: shipment.id },
      orderBy: { createdAt: 'desc' },
    });
    await eventWorker.handle(deliveredEvent!.id);
    await prisma.order.update({ where: { id: created.body.id }, data: { status: 'DELIVERED' } });

    const review = await request(app.getHttpServer())
      .post(`/api/v1/catalog/items/${item.body.id}/reviews`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ country_code: iso2, rating: 5, title: 'Works', body: 'Sandbox delivery and review' });
    expect(review.status).toBeLessThan(300);

    const dupReview = await request(app.getHttpServer())
      .post(`/api/v1/catalog/items/${item.body.id}/reviews`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ country_code: iso2, rating: 4, title: 'Duplicate', body: 'Should fail' });
    expect(dupReview.status).toBeLessThan(300);
    expect(dupReview.body.duplicate).toBe(true);

    const consumed = await prisma.inventoryReservation.count({
      where: { purpose: 'CHECKOUT', status: InventoryReservationStatus.CONSUMED },
    });
    expect(consumed).toBeGreaterThan(0);
    expect(await prisma.shipment.findUnique({ where: { id: shipment.id } })).toMatchObject({
      status: ShipmentStatus.DELIVERED,
    });
  });
});
