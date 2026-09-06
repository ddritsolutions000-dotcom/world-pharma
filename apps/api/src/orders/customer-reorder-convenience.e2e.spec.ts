import { INestApplication } from '@nestjs/common';
import {
  InventoryLotStatus,
  LocationKind,
  OrganizationKind,
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
import { provisionOrgAdmin, provisionSuperAdmin, signIn } from '../test/sign-in';
import { signCarrierPayload } from '../logistics/hmac';
import { EventWorkerService } from '../events/worker.service';

describe('customer reorder convenience (e2e)', () => {
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
          nameI18n: { en: `Reorder ${iso2}` },
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
          checksum: `reorder-${iso2}`,
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
    const zoneCount = await prisma.serviceabilityZone.count({ where: { countryId: country.id } });
    if (zoneCount === 0) {
      await prisma.serviceabilityZone.create({
        data: {
          id: uuidv7(),
          countryId: country.id,
          name: `${iso2} default`,
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
    return country;
  }

  async function seedVendorCatalog(
    iso2: string,
    adminToken: string,
    vendorToken: string,
    sellerOrgId: string,
    locationId: string,
    opts?: { sellMinor?: string; stock?: number; title?: string },
  ) {
    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ slug: `rc-brand-${Date.now()}-${Math.random()}`, name: 'RC Brand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        slug: `rc-med-${Date.now()}-${Math.random()}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: opts?.title ?? 'Reorder medicine',
        countries: [{ country_code: iso2 }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku_code: `RC-SKU-${Date.now()}`, pack_size: '10' });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set('Authorization', `Bearer ${adminToken}`);
    const offer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({
        variant_id: variant.body.id,
        seller_org_id: sellerOrgId,
        country_code: iso2,
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: opts?.sellMinor ?? '250',
      });
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/publish`)
      .set('Authorization', `Bearer ${vendorToken}`);
    const lot = await prisma.inventoryLot.create({
      data: {
        id: uuidv7(),
        variantId: variant.body.id,
        locationId,
        ownerOrgId: sellerOrgId,
        countryId: (await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: iso2 } })).id,
        lotCode: `RC-LOT-${Date.now()}`,
        status: InventoryLotStatus.ACTIVE,
      },
    });
    await prisma.inventoryBalance.create({
      data: { id: uuidv7(), lotId: lot.id, onHand: opts?.stock ?? 25, available: opts?.stock ?? 25 },
    });
    return { offer, variant, item };
  }

  async function purchaseAndDeliver(
    iso2: string,
    customerToken: string,
    vendorToken: string,
    offerId: string,
    qty = 2,
  ) {
    await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${iso2}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `rc-add-${Date.now()}`)
      .send({ offer_id: offerId, qty });

    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${iso2}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `rc-co-${Date.now()}`)
      .send({});
    const addr = await request(app.getHttpServer())
      .post('/api/v1/me/addresses')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `rc-addr-${Date.now()}`)
      .send({
        country_code: iso2,
        recipient_name: 'Reorder Customer',
        line1: '1 Reorder Street',
        city: 'Test City',
        postal_code: '400001',
        phone: '+919999999999',
      });
    await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/fulfillment`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ address_id: addr.body.id });

    const quote = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/quote`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `rc-q-${Date.now()}`)
      .send({});
    expect(quote.status).toBeLessThan(300);
    expect(quote.body.quote?.total_minor).toBeTruthy();

    const paid = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `rc-pay-${session.body.id}`)
      .send({ method: 'CARD', scenario: 'success' });
    expect(paid.status).toBeLessThan(300);
    expect(paid.body.status).toBe('CAPTURED');

    const created = await request(app.getHttpServer())
      .post('/api/v1/me/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `rc-ord-${paid.body.id}`)
      .send({ payment_intent_id: paid.body.id });
    expect(created.status).toBeLessThan(300);
    if (created.status >= 300) {
      throw new Error(JSON.stringify(created.body));
    }

    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${created.body.id}/accept`)
      .set('Authorization', `Bearer ${vendorToken}`);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${created.body.id}/pick/start`)
      .set('Authorization', `Bearer ${vendorToken}`);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${created.body.id}/pick/complete`)
      .set('Authorization', `Bearer ${vendorToken}`);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${created.body.id}/pack/complete`)
      .set('Authorization', `Bearer ${vendorToken}`);

    const shipment = await prisma.shipment.findFirstOrThrow({ where: { orderId: created.body.id } });
    const payload = JSON.stringify({
      event_id: `evt-rc-${shipment.id}`,
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
    if (deliveredEvent) {
      await eventWorker.handle(deliveredEvent.id);
    }
    await prisma.order.update({ where: { id: created.body.id }, data: { status: 'DELIVERED' } });
    return { ...created.body, address_id: addr.body.id };
  }

  it('runs purchase → deliver → reorder → cart → quote with current validation', async () => {
    const iso2 = 'R1';
    const country = await seedMarket(iso2);
    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: 'Reorder Vendor',
        displayName: 'Reorder Vendor',
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId: country.id,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'RC WH',
        timezone: 'UTC',
      },
    });
    const admin = await provisionSuperAdmin(app, prisma, 'rc-admin');
    const vendorUser = await provisionOrgAdmin(app, prisma, 'rc-vendor', vendor.id);
    await activateMarketplaceSeller(app, {
      vendorToken: vendorUser.token,
      adminToken: admin.token,
      sellerOrgId: vendor.id,
    });
    const customer = await signIn(app, `rc-cust-${Date.now()}@example.com`, 'customer');
    const other = await signIn(app, `rc-other-${Date.now()}@example.com`, 'customer');
    const { offer } = await seedVendorCatalog(iso2, admin.token, vendorUser.token, vendor.id, location.id, {
      sellMinor: '250',
      title: 'Reorder Test Med',
    });

    const order = await purchaseAndDeliver(iso2, customer.token, vendorUser.token, offer.body.id, 2);

    const history = await request(app.getHttpServer())
      .get('/api/v1/me/orders')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(history.status).toBe(200);
    expect(history.body.data.some((row: { id: string }) => row.id === order.id)).toBe(true);
    expect(history.body.data.find((row: { id: string }) => row.id === order.id)?.reorder_eligible).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/me/orders/${order.id}`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.reorder_eligible).toBe(true);
    expect(detail.body.items?.length).toBeGreaterThan(0);

    const steal = await request(app.getHttpServer())
      .post(`/api/v1/me/orders/${order.id}/reorder`)
      .set('Authorization', `Bearer ${other.token}`)
      .set('Idempotency-Key', `rc-steal-${Date.now()}`)
      .send({ country_code: iso2 });
    expect(steal.status).toBe(403);

    const reorderKey = `rc-reorder-${order.id}`;
    const reorder = await request(app.getHttpServer())
      .post(`/api/v1/me/orders/${order.id}/reorder`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', reorderKey)
      .send({ country_code: iso2, postal_code: '400001' });
    expect(reorder.status).toBe(201);
    expect(reorder.body.added.length).toBeGreaterThan(0);
    expect(reorder.body.unavailable.length).toBe(0);
    expect(reorder.body.added[0].current_sell_minor).toBe('250');

    const dup = await request(app.getHttpServer())
      .post(`/api/v1/me/orders/${order.id}/reorder`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', reorderKey)
      .send({ country_code: iso2 });
    expect(dup.status).toBe(201);
    expect(dup.body.added).toEqual(reorder.body.added);

    const cart = await request(app.getHttpServer())
      .get(`/api/v1/me/cart?country=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(cart.status).toBe(200);
    expect(cart.body.items?.length).toBeGreaterThan(0);

    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `rc-requote-${Date.now()}`)
      .send({});
    await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/fulfillment`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ address_id: order.address_id });
    const quote = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/quote`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `rc-quote-${Date.now()}`)
      .send({});
    expect(quote.status).toBeLessThan(300);
    expect(quote.body.quote?.total_minor).toBeTruthy();
  });

  it('blocks reorder for out-of-stock scenarios', async () => {
    const iso2 = 'R2';
    const country = await seedMarket(iso2);
    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: 'Reorder Vendor 2',
        displayName: 'Reorder Vendor 2',
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId: country.id,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'RC WH2',
        timezone: 'UTC',
      },
    });
    const admin = await provisionSuperAdmin(app, prisma, 'rc2-admin');
    const vendorUser = await provisionOrgAdmin(app, prisma, 'rc2-vendor', vendor.id);
    await activateMarketplaceSeller(app, {
      vendorToken: vendorUser.token,
      adminToken: admin.token,
      sellerOrgId: vendor.id,
    });
    const customer = await signIn(app, `rc2-cust-${Date.now()}@example.com`, 'customer');
    const { offer, variant } = await seedVendorCatalog(iso2, admin.token, vendorUser.token, vendor.id, location.id, {
      stock: 5,
      title: 'OOS Reorder Med',
    });
    const order = await purchaseAndDeliver(iso2, customer.token, vendorUser.token, offer.body.id, 2);

    await prisma.inventoryBalance.updateMany({
      where: { lot: { variantId: variant.body.id } },
      data: { available: 0, onHand: 0 },
    });

    const oos = await request(app.getHttpServer())
      .post(`/api/v1/me/orders/${order.id}/reorder`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `rc-oos-${Date.now()}`)
      .send({ country_code: iso2 });
    expect(oos.status).toBe(201);
    expect(oos.body.added.length).toBe(0);
    expect(oos.body.unavailable[0]?.reason_code).toBe('OUT_OF_STOCK');
  });

  it('supports wishlist add/remove and reminder buy-again resolution', async () => {
    const iso2 = 'R3';
    const country = await seedMarket(iso2);
    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: 'Reorder Vendor 3',
        displayName: 'Reorder Vendor 3',
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId: country.id,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'RC WH3',
        timezone: 'UTC',
      },
    });
    const admin = await provisionSuperAdmin(app, prisma, 'rc3-admin');
    const vendorUser = await provisionOrgAdmin(app, prisma, 'rc3-vendor', vendor.id);
    await activateMarketplaceSeller(app, {
      vendorToken: vendorUser.token,
      adminToken: admin.token,
      sellerOrgId: vendor.id,
    });
    const customer = await signIn(app, `rc3-cust-${Date.now()}@example.com`, 'customer');
    const other = await signIn(app, `rc3-other-${Date.now()}@example.com`, 'customer');
    const { offer } = await seedVendorCatalog(iso2, admin.token, vendorUser.token, vendor.id, location.id, {
      title: 'Reminder Linked Med',
    });
    const order = await purchaseAndDeliver(iso2, customer.token, vendorUser.token, offer.body.id, 1);
    const orderDetail = await request(app.getHttpServer())
      .get(`/api/v1/me/orders/${order.id}`)
      .set('Authorization', `Bearer ${customer.token}`);
    const itemTitle = orderDetail.body.items?.[0]?.title ?? 'Reminder Linked Med';

    const wishAdd = await request(app.getHttpServer())
      .post('/api/v1/me/wishlist')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `rc-wl-${Date.now()}`)
      .send({ country_code: iso2, catalog_offer_id: offer.body.id });
    expect(wishAdd.status).toBeLessThan(300);

    const wishList = await request(app.getHttpServer())
      .get(`/api/v1/me/wishlist?country_code=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(wishList.body.data.length).toBe(1);

    const foreignWish = await request(app.getHttpServer())
      .get(`/api/v1/me/wishlist?country_code=${iso2}`)
      .set('Authorization', `Bearer ${other.token}`);
    expect(foreignWish.body.data.length).toBe(0);

    const reminder = await request(app.getHttpServer())
      .post('/api/v1/me/medication-reminders')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        country_code: iso2,
        medicine_label: itemTitle,
        schedule_times: ['09:00'],
      });
    expect(reminder.status).toBeLessThan(300);

    const buyAgain = await request(app.getHttpServer())
      .get(`/api/v1/me/medication-reminders/${reminder.body.id}/buy-again?country_code=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(buyAgain.status).toBe(200);
    expect(buyAgain.body.eligible).toBe(true);
    expect(buyAgain.body.offer_id).toBe(offer.body.id);
    expect(buyAgain.body.last_order_id).toBe(order.id);

    await request(app.getHttpServer())
      .delete(`/api/v1/me/wishlist?country_code=${iso2}&catalog_offer_id=${offer.body.id}`)
      .set('Authorization', `Bearer ${customer.token}`);
  });
});
