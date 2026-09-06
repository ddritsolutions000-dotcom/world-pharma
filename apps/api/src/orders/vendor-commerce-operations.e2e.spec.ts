import { INestApplication } from '@nestjs/common';
import {
  InventoryLotStatus,
  LocationKind,
  OrganizationKind,
  OrganizationStatus,
  PolicyPackStatus,
  ShipmentStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { OrganizationService } from '../partner/organization.service';
import { PolicyCache } from '../policy/cache';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { applyTestIsolation } from '../test/isolate-runtime';
import {
  activateMarketplaceSeller,
  enableMarketplaceVendorPack,
} from '../test/marketplace-seller';
import { signCarrierPayload } from '../logistics/hmac';
import { EventWorkerService } from '../events/worker.service';

async function signIn(app: INestApplication, email: string, audience: 'admin' | 'customer' = 'customer') {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({
      challenge_id: requested.body.challenge_id,
      code: requested.body.dev_code,
      audience,
    });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

describe('Sprint 16 vendor commerce operations (e2e)', () => {
  jest.setTimeout(300_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let orgs: OrganizationService;
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
    orgs = app.get(OrganizationService);
    eventWorker = app.get(EventWorkerService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function attachOrgAdmin(personId: string, organizationId: string) {
    const role = await prisma.role.findUnique({ where: { code: 'org_admin' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId,
        roleId: role!.id,
        scope: 'organization',
        organizationId,
        status: 'ACTIVE',
      },
    });
  }

  async function seedMarket(iso2: string) {
    const runId = uuidv7().replace(/-/g, '').slice(0, 12);
    const suffix = `${Date.now().toString(36)}-${runId}`;
    const doc = emptyPolicyDocument();
    enableMarketplaceVendorPack(doc);
    doc.services.pharmacy = true;
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
          isoAlpha3: `${iso2}X`,
          nameI18n: { en: `S16 ${iso2}` },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
        },
      });
    }
    await prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        version: Math.floor(Date.now() % 1_000_000),
        status: PolicyPackStatus.PUBLISHED,
        document: doc as never,
        checksum: `s16-${suffix}`,
        publishedAt: new Date(),
      },
    });
    const pack = await prisma.policyPack.findFirst({
      where: { countryId: country.id, status: PolicyPackStatus.PUBLISHED },
      orderBy: { publishedAt: 'desc' },
    });
    if (pack) {
      await prisma.country.update({ where: { id: country.id }, data: { publishedPolicyPackId: pack.id } });
    }
    await app.get(PolicyCache).invalidate(iso2);
    return { country, suffix };
  }

  type VendorCtx = {
    orgId: string;
    vendorToken: string;
    vendorPersonId: string;
    adminToken: string;
    locationId: string;
    offerId: string;
    variantId: string;
    lotId: string;
    iso2: string;
    countryId: string;
    initialOnHand: number;
  };

  async function seedVendor(iso2: string, countryId: string, suffix: string, label: string, onHand: number): Promise<VendorCtx> {
    const unique = uuidv7().slice(0, 8);
    const admin = await signIn(app, `s16-admin-${label}-${unique}@example.com`, 'customer');
    const superAdmin = await prisma.role.findUnique({ where: { code: 'super_admin' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: admin.personId,
        roleId: superAdmin!.id,
        scope: 'platform',
        status: 'ACTIVE',
      },
    });
    const vendor = await signIn(app, `s16-${label}-${unique}@example.com`);
    const org = await orgs.create({
      countryCode: iso2,
      kind: OrganizationKind.VENDOR,
      legalName: `S16 ${label} ${suffix}`,
      displayName: `S16 ${label} ${suffix}`,
      actorId: admin.personId,
    });
    await prisma.organization.update({ where: { id: org.id }, data: { status: OrganizationStatus.ACTIVE } });
    await attachOrgAdmin(vendor.personId, org.id);
    await activateMarketplaceSeller(app, {
      vendorToken: vendor.token,
      adminToken: admin.token,
      sellerOrgId: org.id,
    });
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const loc = await request(app.getHttpServer())
      .post('/api/v1/admin/inventory/locations')
      .set(auth(admin.token))
      .send({
        organization_id: org.id,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: `S16 WH ${label} ${unique}`,
        timezone: 'UTC',
      });
    expect(loc.status).toBeLessThan(300);
    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set(auth(admin.token))
      .send({ slug: `s16-brand-${label}-${unique}`, name: `S16 Brand ${label}` });
    expect(brand.status).toBeLessThan(300);
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set(auth(admin.token))
      .send({
        slug: `s16-item-${label}-${unique}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: `S16 Med ${label}`,
        countries: [{ country_code: iso2 }],
      });
    expect(item.status).toBeLessThan(300);
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set(auth(admin.token))
      .send({ sku_code: `S16-${label}-${unique}`, pack_size: '10' });
    expect(variant.status).toBeLessThan(300);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set(auth(admin.token))
      .expect(201);
    const offer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set(auth(vendor.token))
      .send({
        variant_id: variant.body.id,
        seller_org_id: org.id,
        country_code: iso2,
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '300',
      });
    expect(offer.status).toBeLessThan(300);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/publish`)
      .set(auth(vendor.token))
      .expect(201);
    const lot = await prisma.inventoryLot.create({
      data: {
        id: uuidv7(),
        variantId: variant.body.id,
        locationId: loc.body.id,
        ownerOrgId: org.id,
        countryId,
        lotCode: `S16-${label}-${unique}`,
        status: InventoryLotStatus.ACTIVE,
      },
    });
    await prisma.inventoryBalance.create({
      data: { id: uuidv7(), lotId: lot.id, onHand, available: onHand },
    });
    return {
      orgId: org.id,
      vendorToken: vendor.token,
      vendorPersonId: vendor.personId,
      adminToken: admin.token,
      locationId: loc.body.id,
      offerId: offer.body.id,
      variantId: variant.body.id,
      lotId: lot.id,
      iso2,
      countryId,
      initialOnHand: onHand,
    };
  }

  async function placeOrder(customerToken: string, vendor: VendorCtx, idem: string) {
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const add = await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${vendor.iso2}`)
      .set(auth(customerToken))
      .set('Idempotency-Key', `${idem}-add`)
      .send({ offer_id: vendor.offerId, qty: 1 });
    expect(add.status).toBeLessThan(300);
    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${vendor.iso2}`)
      .set(auth(customerToken))
      .set('Idempotency-Key', `${idem}-co`)
      .send({});
    expect(session.status).toBeLessThan(300);
    const paid = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set(auth(customerToken))
      .set('Idempotency-Key', `${idem}-pay`)
      .send({ method: 'CARD', scenario: 'success' });
    expect(paid.status).toBeLessThan(300);
    const created = await request(app.getHttpServer())
      .post('/api/v1/me/orders')
      .set(auth(customerToken))
      .set('Idempotency-Key', `${idem}-ord`)
      .send({ payment_intent_id: paid.body.id });
    expect(created.status).toBeLessThan(300);
    expect(created.body.status).toBe('ALLOCATED');
    return created.body.id as string;
  }

  async function lotBalance(lotId: string) {
    const row = await prisma.inventoryBalance.findUnique({ where: { lotId } });
    return row!;
  }

  it('A–D: acceptance, invalid transitions, idempotency, and pick/pack/ready lifecycle', async () => {
    const iso2 = 'V1';
    const { country, suffix } = await seedMarket(iso2);
    const vendor = await seedVendor(iso2, country.id, suffix, 'alpha', 50);
    const customer = await signIn(app, `s16-cust-${suffix}@example.com`);
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const orderId = await placeOrder(customer.token, vendor, `s16-life-${suffix}`);

    const beforeConsume = await lotBalance(vendor.lotId);
    expect(beforeConsume.onHand).toBe(vendor.initialOnHand - 1);

    const pickEarly = await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/pick/start`)
      .set(auth(vendor.vendorToken));
    expect(pickEarly.status).toBe(409);
    expect(pickEarly.body.code).toBe('VENDOR_ACCEPT_REQUIRED');

    const accepted = await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/accept`)
      .set(auth(vendor.vendorToken));
    expect(accepted.status).toBeLessThan(300);

    const acceptDup = await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/accept`)
      .set(auth(vendor.vendorToken));
    expect(acceptDup.status).toBeLessThan(300);
    expect(acceptDup.body.status).toBe('ALLOCATED');

    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/pick/start`)
      .set(auth(vendor.vendorToken))
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/pick/complete`)
      .set(auth(vendor.vendorToken))
      .expect(201);

    const packEarly = await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/pack/start`)
      .set(auth(vendor.vendorToken));
    expect(packEarly.status).toBeLessThan(300);

    const pickAgain = await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/pick/start`)
      .set(auth(vendor.vendorToken));
    expect(pickAgain.status).toBe(409);

    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/pack/complete`)
      .set(auth(vendor.vendorToken))
      .expect(201);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/vendor/orders/${orderId}`)
      .set(auth(vendor.vendorToken));
    expect(detail.status).toBe(200);
    expect(['READY_TO_SHIP', 'PACKED']).toContain(detail.body.status);
  });

  it('E: vendor reject restores inventory idempotently', async () => {
    const iso2 = 'V2';
    const { country, suffix } = await seedMarket(iso2);
    const vendor = await seedVendor(iso2, country.id, suffix, 'reject', 30);
    const customer = await signIn(app, `s16-rej-${suffix}@example.com`);
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const orderId = await placeOrder(customer.token, vendor, `s16-rej-${suffix}`);

    expect((await lotBalance(vendor.lotId)).onHand).toBe(29);

    const rejected = await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/reject`)
      .set(auth(vendor.vendorToken))
      .send({ reason: 'OUT_OF_STOCK', idempotency_key: `rej-${suffix}` });
    expect(rejected.status).toBeLessThan(300);
    expect(rejected.body.status).toBe('CANCELLED');

    expect((await lotBalance(vendor.lotId)).onHand).toBe(30);

    const rejectAgain = await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/reject`)
      .set(auth(vendor.vendorToken))
      .send({ reason: 'OUT_OF_STOCK', idempotency_key: `rej-${suffix}` });
    expect(rejectAgain.status).toBeLessThan(300);
    expect((await lotBalance(vendor.lotId)).onHand).toBe(30);

    const restockMoves = await prisma.inventoryMovement.count({
      where: { refId: orderId, reasonCode: 'order_cancel_restock' },
    });
    expect(restockMoves).toBe(1);
  });

  it('F: customer cancel restores inventory without double restock', async () => {
    const iso2 = 'V3';
    const { country, suffix } = await seedMarket(iso2);
    const vendor = await seedVendor(iso2, country.id, suffix, 'cancel', 20);
    const customer = await signIn(app, `s16-can-${suffix}@example.com`);
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const orderId = await placeOrder(customer.token, vendor, `s16-can-${suffix}`);

    expect((await lotBalance(vendor.lotId)).onHand).toBe(19);

    const cancelled = await request(app.getHttpServer())
      .post(`/api/v1/me/orders/${orderId}/cancel`)
      .set(auth(customer.token))
      .set('Idempotency-Key', `can-${suffix}`)
      .send({});
    expect(cancelled.status).toBeLessThan(300);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect((await lotBalance(vendor.lotId)).onHand).toBe(20);

    const cancelAgain = await request(app.getHttpServer())
      .post(`/api/v1/me/orders/${orderId}/cancel`)
      .set(auth(customer.token))
      .set('Idempotency-Key', `can-${suffix}`)
      .send({});
    expect(cancelAgain.status).toBeLessThan(300);
    expect((await lotBalance(vendor.lotId)).onHand).toBe(20);
  });

  it('G–H: vendor and inventory isolation', async () => {
    const iso2 = 'V4';
    const { country, suffix } = await seedMarket(iso2);
    const vendorA = await seedVendor(iso2, country.id, `${suffix}-a`, 'isoA', 15);
    const vendorB = await seedVendor(iso2, country.id, `${suffix}-b`, 'isoB', 15);
    const customer = await signIn(app, `s16-iso-${suffix}@example.com`);
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const orderId = await placeOrder(customer.token, vendorA, `s16-iso-${suffix}`);

    const steal = await request(app.getHttpServer())
      .get(`/api/v1/vendor/orders/${orderId}`)
      .set(auth(vendorB.vendorToken));
    expect(steal.status).toBe(403);

    const mutate = await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/accept`)
      .set(auth(vendorB.vendorToken));
    expect(mutate.status).toBe(403);

    const lotsA = await request(app.getHttpServer())
      .get(`/api/v1/vendor/inventory/lots?owner_org_id=${vendorA.orgId}`)
      .set(auth(vendorA.vendorToken));
    expect(lotsA.status).toBe(200);
    expect(lotsA.body.data.some((row: { id: string }) => row.id === vendorA.lotId)).toBe(true);
    expect(lotsA.body.data.some((row: { id: string }) => row.id === vendorB.lotId)).toBe(false);

    const lotsBSteal = await request(app.getHttpServer())
      .get(`/api/v1/vendor/inventory/lots?owner_org_id=${vendorB.orgId}`)
      .set(auth(vendorA.vendorToken));
    expect(lotsBSteal.status).toBe(403);
  });

  it('I: settlement visibility for vendor (sandbox read-only)', async () => {
    const iso2 = 'V5';
    const { country, suffix } = await seedMarket(iso2);
    const vendor = await seedVendor(iso2, country.id, suffix, 'fin', 10);
    const customer = await signIn(app, `s16-fin-${suffix}@example.com`);
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const orderId = await placeOrder(customer.token, vendor, `s16-fin-${suffix}`);

    const payable = await prisma.vendorPayable.findUnique({ where: { orderId } });
    expect(payable).toBeTruthy();
    expect(payable!.sellerOrgId).toBe(vendor.orgId);
    expect(payable!.amountMinor).toBeGreaterThan(0n);

    const orderDetail = await request(app.getHttpServer())
      .get(`/api/v1/vendor/orders/${orderId}`)
      .set(auth(vendor.vendorToken));
    expect(orderDetail.status).toBe(200);
    expect(orderDetail.body.economics?.vendor_payable_est_minor).toBeDefined();

    const settlements = await request(app.getHttpServer())
      .get(`/api/v1/vendor/settlements?seller_org_id=${vendor.orgId}`)
      .set(auth(vendor.vendorToken));
    expect(settlements.status).toBe(200);
    expect(settlements.body.data).toEqual(expect.any(Array));
  });

  it('J: suspended vendor cannot accept new fulfillment actions', async () => {
    const iso2 = 'V6';
    const { country, suffix } = await seedMarket(iso2);
    const vendor = await seedVendor(iso2, country.id, suffix, 'susp', 10);
    const customer = await signIn(app, `s16-susp-${suffix}@example.com`);
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const orderId = await placeOrder(customer.token, vendor, `s16-susp-${suffix}`);

    await prisma.organization.update({
      where: { id: vendor.orgId },
      data: { status: OrganizationStatus.SUSPENDED },
    });

    const accept = await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/accept`)
      .set(auth(vendor.vendorToken));
    expect(accept.status).toBe(403);
    expect(accept.body.code).toBe('VENDOR_NOT_ACTIVE');
  });

  it('K: customer → vendor → delivery closed loop with vendor notification', async () => {
    const iso2 = 'V7';
    const { country, suffix } = await seedMarket(iso2);
    const vendor = await seedVendor(iso2, country.id, suffix, 'loop', 25);
    const customer = await signIn(app, `s16-loop-${suffix}@example.com`);
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const orderId = await placeOrder(customer.token, vendor, `s16-loop-${suffix}`);

    const allocatedEvent = await prisma.outboxEvent.findFirst({
      where: { type: 'ORDER_ALLOCATED', aggregateId: orderId },
      orderBy: { createdAt: 'desc' },
    });
    expect(allocatedEvent).toBeTruthy();
    const allocatedPayload = allocatedEvent!.payload as Record<string, unknown>;
    expect(allocatedPayload).toMatchObject({
      seller_org_id: vendor.orgId,
    });
    expect(Array.isArray(allocatedPayload.person_ids)).toBe(true);
    expect((allocatedPayload.person_ids as string[]).includes(vendor.vendorPersonId)).toBe(true);
    await eventWorker.handle(allocatedEvent!.id);

    const inbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set(auth(vendor.vendorToken));
    expect(inbox.status).toBe(200);
    expect(inbox.body.data.some((row: { title: string }) => row.title === 'New order received')).toBe(true);

    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/accept`)
      .set(auth(vendor.vendorToken))
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/pick/start`)
      .set(auth(vendor.vendorToken))
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/pick/complete`)
      .set(auth(vendor.vendorToken))
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/pack/complete`)
      .set(auth(vendor.vendorToken))
      .expect(201);

    const shipment = await prisma.shipment.findFirstOrThrow({ where: { orderId } });
    const payload = JSON.stringify({
      event_id: `evt-s16-${shipment.id}`,
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
    await prisma.order.update({ where: { id: orderId }, data: { status: 'DELIVERED' } });

    const customerOrder = await request(app.getHttpServer())
      .get(`/api/v1/me/orders/${orderId}`)
      .set(auth(customer.token));
    expect(customerOrder.status).toBe(200);

    const payable = await prisma.vendorPayable.findUnique({ where: { orderId } });
    expect(payable).toBeTruthy();
    expect(payable!.sellerOrgId).toBe(vendor.orgId);

    expect((await lotBalance(vendor.lotId)).onHand).toBe(24);
    expect(await prisma.shipment.findUnique({ where: { id: shipment.id } })).toMatchObject({
      status: ShipmentStatus.DELIVERED,
    });
  });
});
