import { INestApplication } from '@nestjs/common';
import {
  InventoryLotStatus,
  LocationKind,
  OfferStatus,
  OrganizationKind,
  PolicyPackStatus,
  PromoCampaignStatus,
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

describe('customer pharmacy convenience completion (e2e)', () => {
  jest.setTimeout(360_000);
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
          nameI18n: { en: `S22 ${iso2}` },
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
          checksum: `s22-${iso2}`,
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
    opts?: { sellMinor?: string; stock?: number; title?: string; rxRequired?: boolean },
  ) {
    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ slug: `s22-brand-${Date.now()}-${Math.random()}`, name: 'S22 Brand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        slug: `s22-med-${Date.now()}-${Math.random()}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: opts?.title ?? 'S22 medicine',
        countries: [{ country_code: iso2, rx_required: opts?.rxRequired ?? false }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku_code: `S22-SKU-${Date.now()}`, pack_size: '10' });
    expect(variant.status).toBeLessThan(300);
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
    expect(offer.status).toBeLessThan(300);
    expect(offer.body.id).toBeTruthy();
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/publish`)
      .set('Authorization', `Bearer ${vendorToken}`);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set('Authorization', `Bearer ${adminToken}`);
    const lot = await prisma.inventoryLot.create({
      data: {
        id: uuidv7(),
        variantId: variant.body.id,
        locationId,
        ownerOrgId: sellerOrgId,
        countryId: (await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: iso2 } })).id,
        lotCode: `S22-LOT-${Date.now()}`,
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
    offerIds: string | string[],
    opts?: { qty?: number; prescriptionCaseId?: string },
  ) {
    const ids = Array.isArray(offerIds) ? offerIds : [offerIds];
    const qty = opts?.qty ?? 2;
    for (const offerId of ids) {
      await request(app.getHttpServer())
        .post(`/api/v1/me/cart/items?country=${iso2}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', `s22-add-${offerId}-${Date.now()}`)
        .send({
          offer_id: offerId,
          qty,
          ...(opts?.prescriptionCaseId ? { prescription_case_id: opts.prescriptionCaseId } : {}),
        });
    }

    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${iso2}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `s22-co-${Date.now()}`)
      .send({});
    const addr = await request(app.getHttpServer())
      .post('/api/v1/me/addresses')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `s22-addr-${Date.now()}`)
      .send({
        country_code: iso2,
        recipient_name: 'S22 Customer',
        line1: '1 Convenience Street',
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
      .set('Idempotency-Key', `s22-q-${Date.now()}`)
      .send({});
    expect(quote.status).toBeLessThan(300);
    if (quote.status >= 300) {
      throw new Error(`quote failed: ${quote.status} ${JSON.stringify(quote.body)}`);
    }

    const paid = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `s22-pay-${session.body.id}`)
      .send({ method: 'CARD', scenario: 'success' });
    expect(paid.status).toBeLessThan(300);

    const created = await request(app.getHttpServer())
      .post('/api/v1/me/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `s22-ord-${paid.body.id}`)
      .send({ payment_intent_id: paid.body.id });
    expect(created.status).toBeLessThan(300);

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
      event_id: `evt-s22-${shipment.id}`,
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

  async function provisionVendor(iso2: string, label: string) {
    const country = await seedMarket(iso2);
    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: `S22 Vendor ${label}`,
        displayName: `S22 Vendor ${label}`,
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId: country.id,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: `S22 WH ${label}`,
        timezone: 'UTC',
      },
    });
    const admin = await provisionSuperAdmin(app, prisma, `s22-admin-${label}`);
    const vendorUser = await provisionOrgAdmin(app, prisma, `s22-vendor-${label}`, vendor.id);
    await activateMarketplaceSeller(app, {
      vendorToken: vendorUser.token,
      adminToken: admin.token,
      sellerOrgId: vendor.id,
    });
    return { country, vendor, location, admin, vendorUser };
  }

  it('A recently viewed create/read and B customer isolation', async () => {
    const iso2 = 'P4';
    const { admin, vendorUser, vendor, location } = await provisionVendor(iso2, 'rv');
    const customerA = await signIn(app, `s22-rv-a-${Date.now()}@example.com`, 'customer');
    const customerB = await signIn(app, `s22-rv-b-${Date.now()}@example.com`, 'customer');
    const { item, offer } = await seedVendorCatalog(
      iso2,
      admin.token,
      vendorUser.token,
      vendor.id,
      location.id,
      { title: 'Recently Viewed Med' },
    );

    const recorded = await request(app.getHttpServer())
      .post('/api/v1/me/personalization/events')
      .set('Authorization', `Bearer ${customerA.token}`)
      .send({
        country_code: iso2,
        event_kind: 'PRODUCT_VIEWED',
        source: 'pdp',
        source_key: `s22-view-${Date.now()}`,
        catalog_item_id: item.body.id,
      });
    expect(recorded.status).toBe(201);

    const listA = await request(app.getHttpServer())
      .get(`/api/v1/me/recently-viewed?country_code=${iso2}`)
      .set('Authorization', `Bearer ${customerA.token}`);
    expect(listA.status).toBe(200);
    expect(listA.body.data.some((row: { item_id: string }) => row.item_id === item.body.id)).toBe(true);
    expect(listA.body.data[0].best_offer_id).toBeTruthy();
    expect(listA.body.data[0].sell_minor).toBe('250');

    const listB = await request(app.getHttpServer())
      .get(`/api/v1/me/recently-viewed?country_code=${iso2}`)
      .set('Authorization', `Bearer ${customerB.token}`);
    expect(listB.status).toBe(200);
    expect(listB.body.data.some((row: { item_id: string }) => row.item_id === item.body.id)).toBe(false);
  });

  it('C reminder buy-again path with customer isolation', async () => {
    const iso2 = 'P5';
    const { admin, vendorUser, vendor, location } = await provisionVendor(iso2, 'rem');
    const customer = await signIn(app, `s22-rem-${Date.now()}@example.com`, 'customer');
    const other = await signIn(app, `s22-rem-other-${Date.now()}@example.com`, 'customer');
    const { offer } = await seedVendorCatalog(iso2, admin.token, vendorUser.token, vendor.id, location.id, {
      title: 'Reminder Buy Again Med',
    });
    const order = await purchaseAndDeliver(iso2, customer.token, vendorUser.token, offer.body.id, { qty: 1 });
    const orderDetail = await request(app.getHttpServer())
      .get(`/api/v1/me/orders/${order.id}`)
      .set('Authorization', `Bearer ${customer.token}`);
    const itemTitle = orderDetail.body.items?.[0]?.title ?? 'Reminder Buy Again Med';

    const reminder = await request(app.getHttpServer())
      .post('/api/v1/me/medication-reminders')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ country_code: iso2, medicine_label: itemTitle, schedule_times: ['09:00'] });
    expect(reminder.status).toBeLessThan(300);

    const buyAgain = await request(app.getHttpServer())
      .get(`/api/v1/me/medication-reminders/${reminder.body.id}/buy-again?country_code=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(buyAgain.status).toBe(200);
    expect(buyAgain.body.eligible).toBe(true);
    expect(buyAgain.body.offer_id).toBe(offer.body.id);

    const steal = await request(app.getHttpServer())
      .get(`/api/v1/me/medication-reminders/${reminder.body.id}/buy-again?country_code=${iso2}`)
      .set('Authorization', `Bearer ${other.token}`);
    expect([403, 404]).toContain(steal.status);
  });

  it('D Rx checkout enforces S156 prescription safety gate (no forged case)', async () => {
    const iso2 = 'P6';
    const { admin, vendorUser, vendor, location } = await provisionVendor(iso2, 'rx');
    const customer = await signIn(app, `s22-rx-${Date.now()}@example.com`, 'customer');
    const forgedCaseId = uuidv7();
    const { offer } = await seedVendorCatalog(iso2, admin.token, vendorUser.token, vendor.id, location.id, {
      title: 'Rx Gate Med',
      rxRequired: true,
    });

    const addMissing = await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `s22-rx-add-missing-${Date.now()}`)
      .send({ offer_id: offer.body.id, qty: 1 });
    expect(addMissing.status).toBeLessThan(300);

    const blockedMissing = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `s22-rx-co-block-${Date.now()}`)
      .send({});
    expect(blockedMissing.status).toBe(422);
    expect(blockedMissing.body.code).toBe('RX_REQUIRED');

    const cartItem = await prisma.cartItem.findFirst({
      where: { offerId: offer.body.id, deletedAt: null },
    });
    expect(cartItem).toBeTruthy();
    await prisma.cartItem.update({
      where: { id: cartItem!.id },
      data: { prescriptionCaseId: forgedCaseId },
    });

    const addr = await request(app.getHttpServer())
      .post('/api/v1/me/addresses')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `s22-rx-addr-${Date.now()}`)
      .send({
        country_code: iso2,
        recipient_name: 'S22 Rx Customer',
        line1: '1 Rx Gate Street',
        city: 'Test City',
        postal_code: '400001',
        phone: '+919999999999',
      });
    expect(addr.status).toBeLessThan(300);

    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `s22-rx-co-forged-${Date.now()}`)
      .send({});
    // Session may start; quote must fail closed on forged case (S156).
    if (session.status < 300) {
      await request(app.getHttpServer())
        .post(`/api/v1/me/checkout/sessions/${session.body.id}/fulfillment`)
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ address_id: addr.body.id });
      const quoted = await request(app.getHttpServer())
        .post(`/api/v1/me/checkout/sessions/${session.body.id}/quote`)
        .set('Authorization', `Bearer ${customer.token}`)
        .set('Idempotency-Key', `s22-rx-q-forged-${Date.now()}`)
        .send({});
      expect(quoted.status).toBe(422);
      expect(['RX_CASE_NOT_FOUND', 'RX_CASE_INVALID', 'RX_REQUIRED']).toContain(quoted.body.code);
    } else {
      expect(session.status).toBe(422);
      expect(['RX_CASE_NOT_FOUND', 'RX_CASE_INVALID', 'RX_REQUIRED']).toContain(session.body.code);
    }

    await prisma.cartItem.update({ where: { id: cartItem!.id }, data: { prescriptionCaseId: null } });
    const blockedAgain = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `s22-rx-co-block2-${Date.now()}`)
      .send({});
    expect(blockedAgain.status).toBe(422);
    expect(blockedAgain.body.code).toBe('RX_REQUIRED');
  });

  it('E suspended seller blocks reorder', async () => {
    const iso2 = 'P7';
    const { admin, vendorUser, vendor, location } = await provisionVendor(iso2, 'suspend');
    const customer = await signIn(app, `s22-susp-${Date.now()}@example.com`, 'customer');
    const { offer } = await seedVendorCatalog(iso2, admin.token, vendorUser.token, vendor.id, location.id);
    const order = await purchaseAndDeliver(iso2, customer.token, vendorUser.token, offer.body.id);

    await request(app.getHttpServer())
      .post('/api/v1/admin/marketplace/acceptance')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ seller_org_id: vendor.id, action: 'block', reason: 'Sandbox suspension' });

    const reorder = await request(app.getHttpServer())
      .post(`/api/v1/me/orders/${order.id}/reorder`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `s22-susp-${Date.now()}`)
      .send({ country_code: iso2 });
    expect(reorder.status).toBe(201);
    expect(reorder.body.added.length).toBe(0);
    expect(reorder.body.unavailable[0]?.reason_code).toBe('SELLER_UNAVAILABLE');
  });

  it('F price-change reorder uses current price', async () => {
    const iso2 = 'P8';
    const { admin, vendorUser, vendor, location } = await provisionVendor(iso2, 'price');
    const customer = await signIn(app, `s22-price-${Date.now()}@example.com`, 'customer');
    const { offer } = await seedVendorCatalog(iso2, admin.token, vendorUser.token, vendor.id, location.id, {
      sellMinor: '250',
    });
    const order = await purchaseAndDeliver(iso2, customer.token, vendorUser.token, offer.body.id);

    await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/prices`)
      .set('Authorization', `Bearer ${vendorUser.token}`)
      .send({ cost_minor: '100', sell_minor: '399' });

    const reorder = await request(app.getHttpServer())
      .post(`/api/v1/me/orders/${order.id}/reorder`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `s22-price-${Date.now()}`)
      .send({ country_code: iso2 });
    expect(reorder.status).toBe(201);
    expect(reorder.body.added[0]?.current_sell_minor).toBe('399');
  });

  it('G out-of-stock reorder reports unavailable', async () => {
    const iso2 = 'P9';
    const { admin, vendorUser, vendor, location } = await provisionVendor(iso2, 'oos');
    const customer = await signIn(app, `s22-oos-${Date.now()}@example.com`, 'customer');
    const { offer, variant } = await seedVendorCatalog(iso2, admin.token, vendorUser.token, vendor.id, location.id, {
      stock: 5,
    });
    const order = await purchaseAndDeliver(iso2, customer.token, vendorUser.token, offer.body.id, { qty: 2 });
    await prisma.inventoryBalance.updateMany({
      where: { lot: { variantId: variant.body.id } },
      data: { available: 0, onHand: 0 },
    });
    const reorder = await request(app.getHttpServer())
      .post(`/api/v1/me/orders/${order.id}/reorder`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `s22-oos-${Date.now()}`)
      .send({ country_code: iso2 });
    expect(reorder.status).toBe(201);
    expect(reorder.body.added.length).toBe(0);
    expect(reorder.body.unavailable[0]?.reason_code).toBe('OUT_OF_STOCK');
  });

  it('H non-serviceable postal code fails reorder authoritatively', async () => {
    const iso2 = 'Q4';
    const { admin, vendorUser, vendor, location } = await provisionVendor(iso2, 'nosvc');
    const customer = await signIn(app, `s22-nosvc-${Date.now()}@example.com`, 'customer');
    const { offer } = await seedVendorCatalog(iso2, admin.token, vendorUser.token, vendor.id, location.id);
    const order = await purchaseAndDeliver(iso2, customer.token, vendorUser.token, offer.body.id);

    const reorder = await request(app.getHttpServer())
      .post(`/api/v1/me/orders/${order.id}/reorder`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `s22-nosvc-${Date.now()}`)
      .send({ country_code: iso2, postal_code: 'X' });
    expect(reorder.status).toBe(422);
    expect(reorder.body.code).toBe('NOT_SERVICEABLE');
  });

  it('I invalid variant/unpublished offer blocks reorder', async () => {
    const iso2 = 'Q5';
    const { admin, vendorUser, vendor, location } = await provisionVendor(iso2, 'invalid');
    const customer = await signIn(app, `s22-inv-${Date.now()}@example.com`, 'customer');
    const { offer } = await seedVendorCatalog(iso2, admin.token, vendorUser.token, vendor.id, location.id);
    const order = await purchaseAndDeliver(iso2, customer.token, vendorUser.token, offer.body.id);

    await prisma.catalogOffer.update({
      where: { id: offer.body.id },
      data: { status: OfferStatus.DRAFT },
    });

    const reorder = await request(app.getHttpServer())
      .post(`/api/v1/me/orders/${order.id}/reorder`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `s22-inv-${Date.now()}`)
      .send({ country_code: iso2 });
    expect(reorder.status).toBe(201);
    expect(reorder.body.added.length).toBe(0);
    expect(reorder.body.unavailable[0]?.reason_code).toBe('OFFER_UNAVAILABLE');
  });

  it('J duplicate reorder idempotency and G customer ownership', async () => {
    const iso2 = 'Q6';
    const { admin, vendorUser, vendor, location } = await provisionVendor(iso2, 'idem');
    const customer = await signIn(app, `s22-idem-${Date.now()}@example.com`, 'customer');
    const other = await signIn(app, `s22-idem-other-${Date.now()}@example.com`, 'customer');
    const { offer } = await seedVendorCatalog(iso2, admin.token, vendorUser.token, vendor.id, location.id);
    const order = await purchaseAndDeliver(iso2, customer.token, vendorUser.token, offer.body.id);

    const steal = await request(app.getHttpServer())
      .post(`/api/v1/me/orders/${order.id}/reorder`)
      .set('Authorization', `Bearer ${other.token}`)
      .set('Idempotency-Key', `s22-steal-${Date.now()}`)
      .send({ country_code: iso2 });
    expect(steal.status).toBe(403);

    const key = `s22-idem-${order.id}`;
    const first = await request(app.getHttpServer())
      .post(`/api/v1/me/orders/${order.id}/reorder`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', key)
      .send({ country_code: iso2 });
    expect(first.status).toBe(201);
    const dup = await request(app.getHttpServer())
      .post(`/api/v1/me/orders/${order.id}/reorder`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', key)
      .send({ country_code: iso2 });
    expect(dup.status).toBe(201);
    expect(dup.body.added).toEqual(first.body.added);
  });

  it('K multi-item partial reorder', async () => {
    const iso2 = 'Q7';
    const { admin, vendorUser, vendor, location } = await provisionVendor(iso2, 'multi');
    const customer = await signIn(app, `s22-multi-${Date.now()}@example.com`, 'customer');
    const first = await seedVendorCatalog(iso2, admin.token, vendorUser.token, vendor.id, location.id, {
      title: 'Multi A',
      stock: 20,
    });
    const second = await seedVendorCatalog(iso2, admin.token, vendorUser.token, vendor.id, location.id, {
      title: 'Multi B',
      stock: 20,
    });
    const order = await purchaseAndDeliver(iso2, customer.token, vendorUser.token, [
      first.offer.body.id,
      second.offer.body.id,
    ], { qty: 1 });
    await prisma.inventoryBalance.updateMany({
      where: { lot: { variantId: second.variant.body.id } },
      data: { available: 0, onHand: 0 },
    });

    const reorder = await request(app.getHttpServer())
      .post(`/api/v1/me/orders/${order.id}/reorder`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `s22-multi-${Date.now()}`)
      .send({ country_code: iso2 });
    expect(reorder.status).toBe(201);
    expect(reorder.body.added.length).toBe(1);
    expect(reorder.body.unavailable.length).toBe(1);
    expect(reorder.body.unavailable[0]?.reason_code).toBe('OUT_OF_STOCK');
  });

  it('L wishlist to cart with current validation', async () => {
    const iso2 = 'Q8';
    const { admin, vendorUser, vendor, location } = await provisionVendor(iso2, 'wl');
    const customer = await signIn(app, `s22-wl-${Date.now()}@example.com`, 'customer');
    const { offer } = await seedVendorCatalog(iso2, admin.token, vendorUser.token, vendor.id, location.id);

    await request(app.getHttpServer())
      .post('/api/v1/me/wishlist')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `s22-wl-${Date.now()}`)
      .send({ country_code: iso2, catalog_offer_id: offer.body.id });

    const add = await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `s22-wl-cart-${Date.now()}`)
      .send({ offer_id: offer.body.id, qty: 1 });
    expect(add.status).toBeLessThan(300);

    await request(app.getHttpServer())
      .post('/api/v1/admin/marketplace/acceptance')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ seller_org_id: vendor.id, action: 'block', reason: 'Wishlist seller test' });

    const blocked = await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `s22-wl-block-${Date.now()}`)
      .send({ offer_id: offer.body.id, qty: 1 });
    expect(blocked.status).toBeGreaterThanOrEqual(400);
  });

  it('M-N promo apply/remove and server quote correctness', async () => {
    const iso2 = 'Q9';
    const { admin, vendorUser, vendor, location } = await provisionVendor(iso2, 'promo');
    const customer = await signIn(app, `s22-promo-${Date.now()}@example.com`, 'customer');
    const { offer } = await seedVendorCatalog(iso2, admin.token, vendorUser.token, vendor.id, location.id, {
      sellMinor: '1000',
    });

    const promoRole = await prisma.role.findUnique({ where: { code: 'company_operations' } });
    const code = `S22SAVE-${Date.now().toString(36).toUpperCase()}`;
    const country = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: iso2 } });
    await prisma.promoCampaign.create({
      data: {
        id: uuidv7(),
        code,
        kind: 'PERCENT',
        percentBps: 1000,
        countryId: country.id,
        status: PromoCampaignStatus.ACTIVE,
        minBasketMinor: 0n,
      },
    });
    void promoRole;

    await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `s22-promo-add-${Date.now()}`)
      .send({ offer_id: offer.body.id, qty: 1 });

    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `s22-promo-co-${Date.now()}`)
      .send({});
    const addr = await request(app.getHttpServer())
      .post('/api/v1/me/addresses')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `s22-promo-addr-${Date.now()}`)
      .send({
        country_code: iso2,
        recipient_name: 'Promo Customer',
        line1: '1 Promo Street',
        city: 'Test City',
        postal_code: '400001',
        phone: '+919999999999',
      });
    await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/fulfillment`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ address_id: addr.body.id });

    const hints = await request(app.getHttpServer())
      .get(`/api/v1/me/promo/available?country_code=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(hints.status).toBe(200);
    expect(Array.isArray(hints.body.data)).toBe(true);

    await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/promo`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ promo_code: code });

    const quoted = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/quote`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `s22-promo-q-${Date.now()}`)
      .send({});
    expect(quoted.status).toBeLessThan(300);
    expect(quoted.body.quote.discount_minor).toBe('100');
    expect(quoted.body.quote.total_minor).toBe('900');

    await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/promo`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ promo_code: '' });

    const removed = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/quote`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `s22-promo-rm-${Date.now()}`)
      .send({});
    expect(removed.status).toBeLessThan(300);
    expect(removed.body.quote.discount_minor ?? '0').toBe('0');
    expect(removed.body.quote.total_minor).toBe('1000');
  });

  it('O mobile API parity — same customer endpoints', async () => {
    const iso2 = 'T4';
    const { admin, vendorUser, vendor, location } = await provisionVendor(iso2, 'parity');
    const customer = await signIn(app, `s22-parity-${Date.now()}@example.com`, 'customer');
    const { item, offer } = await seedVendorCatalog(iso2, admin.token, vendorUser.token, vendor.id, location.id);

    await request(app.getHttpServer())
      .post('/api/v1/me/personalization/events')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        country_code: iso2,
        event_kind: 'PRODUCT_VIEWED',
        source: 'mobile-pdp',
        source_key: `s22-m-${Date.now()}`,
        catalog_item_id: item.body.id,
      });

    const rv = await request(app.getHttpServer())
      .get(`/api/v1/me/recently-viewed?country_code=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(rv.status).toBe(200);

    const promos = await request(app.getHttpServer())
      .get(`/api/v1/me/promo/available?country_code=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(promos.status).toBe(200);

    const order = await purchaseAndDeliver(iso2, customer.token, vendorUser.token, offer.body.id, { qty: 1 });
    const reorder = await request(app.getHttpServer())
      .post(`/api/v1/me/orders/${order.id}/reorder`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `s22-parity-${Date.now()}`)
      .send({ country_code: iso2 });
    expect(reorder.status).toBe(201);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/me/orders/${order.id}`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.reorder_eligible).toBe(true);
  });
});
