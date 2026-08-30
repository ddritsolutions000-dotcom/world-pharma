import { INestApplication } from '@nestjs/common';
import {
  InventoryLotStatus,
  LocationKind,
  OrganizationKind,
  OrganizationStatus,
  PolicyPackStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { EventWorkerService } from '../events/worker.service';
import { OrganizationService } from '../partner/organization.service';
import { PolicyCache } from '../policy/cache';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { applyTestIsolation } from '../test/isolate-runtime';
import {
  activateMarketplaceSeller,
  enableMarketplaceVendorPack,
} from '../test/marketplace-seller';

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

describe('CR-317 order fulfillment notification recipient parity (e2e)', () => {
  jest.setTimeout(120_000);
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

  async function seedMarketplaceOrder(suffix: string) {
    const admin = await signIn(app, `cr317-admin-${suffix}@example.com`, 'admin');
    const vendor = await signIn(app, `cr317-vendor-${suffix}@example.com`);
    const customer = await signIn(app, `cr317-customer-${suffix}@example.com`);
    const otherCustomer = await signIn(app, `cr317-other-${suffix}@example.com`);

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

    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'T7' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'T7',
          isoAlpha3: 'T77',
          nameI18n: { en: 'CR-317 test' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
        },
      });
    }
    const doc = emptyPolicyDocument();
    enableMarketplaceVendorPack(doc);
    doc.services.pharmacy = true;
    doc.payments.enabled = true;
    doc.payments.methods = ['CARD', 'COD'];
    doc.payments.gateway_refs = ['MOCK_PRIMARY'];
    doc.payments.currencies = ['XXX'];
    doc.shipping.domestic = true;
    await prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        version: Math.floor(Date.now() % 1_000_000),
        status: PolicyPackStatus.PUBLISHED,
        document: doc as never,
        checksum: `cr317-${suffix}`,
        publishedAt: new Date(),
      },
    });
    const pack = await prisma.policyPack.findFirst({
      where: { countryId: country.id, status: PolicyPackStatus.PUBLISHED },
      orderBy: { publishedAt: 'desc' },
    });
    if (pack) {
      await prisma.country.update({
        where: { id: country.id },
        data: { publishedPolicyPackId: pack.id },
      });
    }
    await app.get(PolicyCache).invalidate('T7');

    const org = await orgs.create({
      countryCode: 'T7',
      kind: OrganizationKind.VENDOR,
      legalName: `CR317 Vendor ${suffix}`,
      displayName: `CR317 Vendor ${suffix}`,
      actorId: admin.personId,
    });
    await prisma.organization.update({
      where: { id: org.id },
      data: { status: OrganizationStatus.ACTIVE },
    });
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
        name: `CR317 WH ${suffix}`,
        timezone: 'UTC',
      });
    expect(loc.status).toBe(201);

    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set(auth(admin.token))
      .send({ slug: `cr317-brand-${suffix}`, name: 'CR317 Brand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set(auth(admin.token))
      .send({
        slug: `cr317-item-${suffix}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'CR317 Tabs',
        countries: [{ country_code: 'T7' }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set(auth(admin.token))
      .send({ sku_code: `CR317-SKU-${suffix}`, pack_size: '10' });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set(auth(admin.token));
    const offer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set(auth(vendor.token))
      .send({
        variant_id: variant.body.id,
        seller_org_id: org.id,
        country_code: 'T7',
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '250',
      });
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/publish`)
      .set(auth(vendor.token));

    const lot = await prisma.inventoryLot.create({
      data: {
        id: uuidv7(),
        variantId: variant.body.id,
        locationId: loc.body.id,
        ownerOrgId: org.id,
        countryId: country.id,
        lotCode: `CR317-${suffix}`,
        status: InventoryLotStatus.ACTIVE,
      },
    });
    await prisma.inventoryBalance.create({
      data: { id: uuidv7(), lotId: lot.id, onHand: 40, available: 40 },
    });

    await request(app.getHttpServer())
      .post('/api/v1/me/cart/items?country=T7')
      .set(auth(customer.token))
      .set('Idempotency-Key', `cr317-add-${suffix}`)
      .send({ offer_id: offer.body.id, qty: 1 });
    const session = await request(app.getHttpServer())
      .post('/api/v1/me/checkout/sessions?country=T7')
      .set(auth(customer.token))
      .set('Idempotency-Key', `cr317-co-${suffix}`)
      .send({});
    const paid = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set(auth(customer.token))
      .set('Idempotency-Key', `cr317-pay-${suffix}`)
      .send({ method: 'CARD', scenario: 'success' });
    expect(paid.status).toBe(201);

    const created = await request(app.getHttpServer())
      .post('/api/v1/me/orders')
      .set(auth(customer.token))
      .set('Idempotency-Key', `cr317-ord-${suffix}`)
      .send({ payment_intent_id: paid.body.id });
    expect(created.status).toBeLessThan(300);

    return {
      auth,
      admin,
      vendor,
      customer,
      otherCustomer,
      orderId: created.body.id as string,
    };
  }

  async function inboxTitles(token: string) {
    const res = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const rows = res.body.data ?? res.body;
    return rows.map((row: { title: string }) => row.title as string);
  }

  it('notifies buyer (not seller) on READY_FOR_SHIPMENT with idempotent replay', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const ctx = await seedMarketplaceOrder(suffix);

    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${ctx.orderId}/pick/start`)
      .set(ctx.auth(ctx.vendor.token));
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${ctx.orderId}/pick/complete`)
      .set(ctx.auth(ctx.vendor.token));

    const pickingEvent = await prisma.outboxEvent.findFirst({
      where: { aggregateId: ctx.orderId, type: 'ORDER_PICKING' },
      orderBy: { createdAt: 'desc' },
    });
    expect(pickingEvent?.actorId).toBe(ctx.vendor.personId);
    expect(pickingEvent?.payload).not.toHaveProperty('customer_person_id');

    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${ctx.orderId}/pack/complete`)
      .set(ctx.auth(ctx.vendor.token));

    const readyEvent = await prisma.outboxEvent.findFirst({
      where: { aggregateId: ctx.orderId, type: 'ORDER_READY_FOR_SHIPMENT' },
      orderBy: { createdAt: 'desc' },
    });
    expect(readyEvent).toBeTruthy();
    expect(readyEvent?.payload).toMatchObject({
      customer_person_id: ctx.customer.personId,
      fulfillment_actor_id: ctx.vendor.personId,
    });
    expect(readyEvent?.actorId).toBeNull();

    await eventWorker.handle(readyEvent!.id);
    await eventWorker.handle(readyEvent!.id);

    const customerTitles = await inboxTitles(ctx.customer.token);
    expect(customerTitles.filter((title: string) => title === 'Order ready for shipment').length).toBe(1);

    const vendorTitles = await inboxTitles(ctx.vendor.token);
    expect(vendorTitles.filter((title: string) => title === 'Order ready for shipment').length).toBe(0);

    const otherTitles = await inboxTitles(ctx.otherCustomer.token);
    expect(otherTitles.filter((title: string) => title === 'Order ready for shipment').length).toBe(0);
  });

  it('notifies buyer when seller cancels an allocated order', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const ctx = await seedMarketplaceOrder(suffix);

    const cancelled = await request(app.getHttpServer())
      .post(`/api/v1/me/orders/${ctx.orderId}/cancel`)
      .set(ctx.auth(ctx.vendor.token))
      .set('Idempotency-Key', `cr317-cancel-${suffix}`);
    expect(cancelled.status).toBeLessThan(300);
    expect(cancelled.body.status).toBe('CANCELLED');

    const cancelEvent = await prisma.outboxEvent.findFirst({
      where: { aggregateId: ctx.orderId, type: 'ORDER_CANCELLED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(cancelEvent?.payload).toMatchObject({
      customer_person_id: ctx.customer.personId,
      fulfillment_actor_id: ctx.vendor.personId,
    });
    expect(cancelEvent?.actorId).toBeNull();

    await eventWorker.handle(cancelEvent!.id);
    await eventWorker.handle(cancelEvent!.id);

    const customerTitles = await inboxTitles(ctx.customer.token);
    expect(customerTitles.filter((title: string) => title === 'Order cancelled').length).toBe(1);

    const vendorTitles = await inboxTitles(ctx.vendor.token);
    expect(vendorTitles.filter((title: string) => title === 'Order cancelled').length).toBe(0);

    const otherTitles = await inboxTitles(ctx.otherCustomer.token);
    expect(otherTitles.filter((title: string) => title === 'Order cancelled').length).toBe(0);
  });
});
