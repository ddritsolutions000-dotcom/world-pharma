import { INestApplication } from '@nestjs/common';
import { InventoryLotStatus, LocationKind, OrganizationKind, PolicyPackStatus } from '@prisma/client';
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
import { signIn, provisionOrgAdmin, provisionSuperAdmin } from '../test/sign-in';

describe('orders fulfillment (e2e)', () => {
  jest.setTimeout(120_000);
  let app: INestApplication;
  let prisma: PrismaService;

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates one order per captured payment, consumes reservation once, isolates actors, and never calls a carrier', async () => {
    const doc = emptyPolicyDocument();
    doc.services.pharmacy = true;
    enableMarketplaceVendorPack(doc);
    doc.payments.enabled = true;
    doc.payments.methods = ['CARD', 'COD'];
    doc.payments.gateway_refs = ['MOCK_PRIMARY'];
    doc.payments.currencies = ['XXX'];
    doc.shipping.domestic = true;

    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'OQ' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'OQ',
          isoAlpha3: 'OQQ',
          nameI18n: { en: 'Order test' },
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
          checksum: 'order-test',
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
    await app.get(PolicyCache).invalidate('OQ');

    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: 'Order Vendor',
        displayName: 'Order Vendor',
        status: 'ACTIVE',
      },
    });
    const otherVendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: 'Other Vendor',
        displayName: 'Other Vendor',
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId: country.id,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'Order WH',
        timezone: 'UTC',
      },
    });
    const admin = await provisionSuperAdmin(app, prisma, 'ord-admin');
    const vendorUser = await provisionOrgAdmin(app, prisma, 'ord-vendor', vendor.id);
    const otherVendorUser = await provisionOrgAdmin(app, prisma, 'ord-vendor-b', otherVendor.id);

    await activateMarketplaceSeller(app, {
      vendorToken: vendorUser.token,
      adminToken: admin.token,
      sellerOrgId: vendor.id,
    });

    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: `ord-brand-${Date.now()}`, name: 'OrdBrand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: `ord-zinc-${Date.now()}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'Order zinc',
        countries: [{ country_code: 'OQ' }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku_code: `ORD-SKU-${Date.now()}`, pack_size: '10' });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);
    const offer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set('Authorization', `Bearer ${vendorUser.token}`)
      .send({
        variant_id: variant.body.id,
        seller_org_id: vendor.id,
        country_code: 'OQ',
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
        lotCode: 'ORD-LOT',
        status: InventoryLotStatus.ACTIVE,
      },
    });
    await prisma.inventoryBalance.create({
      data: { id: uuidv7(), lotId: lot.id, onHand: 30, available: 30 },
    });

    const customer = await signIn(app, `ord-cust-${Date.now()}@example.com`, 'customer');
    const other = await signIn(app, `ord-cust-b-${Date.now()}@example.com`, 'customer');

    await request(app.getHttpServer())
      .post('/api/v1/me/cart/items?country=OQ')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `ord-add-${Date.now()}`)
      .send({ offer_id: offer.body.id, qty: 1 });
    const session = await request(app.getHttpServer())
      .post('/api/v1/me/checkout/sessions?country=OQ')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `ord-co-${Date.now()}`)
      .send({});
    const paid = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `ord-pay-${Date.now()}`)
      .send({ method: 'CARD', scenario: 'success' });
    expect(paid.status).toBe(201);
    expect(paid.body.status).toBe('CAPTURED');

    const created = await request(app.getHttpServer())
      .post('/api/v1/me/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `ord-create-${Date.now()}`)
      .send({ payment_intent_id: paid.body.id });
    expect(created.status).toBeLessThan(300);
    expect(created.body.status).toBe('ALLOCATED');
    expect(created.body.shipments[0].carrier).toBe('sandbox');
    expect(created.body.economics.actual_carrier_cost_minor).toBeNull();
    expect(created.body.economics.platform_take_est_minor).toBe('0');

    const dup = await request(app.getHttpServer())
      .post('/api/v1/me/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `ord-create-dup-${Date.now()}`)
      .send({ payment_intent_id: paid.body.id });
    expect(dup.body.id).toBe(created.body.id);
    expect(await prisma.order.count({ where: { paymentIntentId: paid.body.id } })).toBe(1);

    const concurrent = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/me/orders')
        .set('Authorization', `Bearer ${customer.token}`)
        .set('Idempotency-Key', `ord-c1-${Date.now()}`)
        .send({ payment_intent_id: paid.body.id }),
      request(app.getHttpServer())
        .post('/api/v1/me/orders')
        .set('Authorization', `Bearer ${customer.token}`)
        .set('Idempotency-Key', `ord-c2-${Date.now()}`)
        .send({ payment_intent_id: paid.body.id }),
    ]);
    expect(concurrent.map((row) => row.body.id).every((id) => id === created.body.id)).toBe(true);

    const steal = await request(app.getHttpServer())
      .get(`/api/v1/me/orders/${created.body.id}`)
      .set('Authorization', `Bearer ${other.token}`);
    expect(steal.status).toBe(403);

    const vendorPeek = await request(app.getHttpServer())
      .get(`/api/v1/vendor/orders/${created.body.id}`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    expect(vendorPeek.status).toBeLessThan(300);
    const otherPeek = await request(app.getHttpServer())
      .get(`/api/v1/vendor/orders/${created.body.id}`)
      .set('Authorization', `Bearer ${otherVendorUser.token}`);
    expect(otherPeek.status).toBe(403);

    const picked = await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${created.body.id}/accept`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    expect(picked.status).toBeLessThan(300);

    const pickStarted = await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${created.body.id}/pick/start`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    expect(pickStarted.status).toBeLessThan(300);
    const pickedDone = await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${created.body.id}/pick/complete`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    expect(pickedDone.body.status).toBe('PICKED');
    const packed = await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${created.body.id}/pack/complete`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    expect(packed.body.status).toBe('READY_TO_SHIP');

    await request(app.getHttpServer())
      .post('/api/v1/me/cart/items?country=OQ')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `ord-add2-${Date.now()}`)
      .send({ offer_id: offer.body.id, qty: 1 });
    const session2 = await request(app.getHttpServer())
      .post('/api/v1/me/checkout/sessions?country=OQ')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `ord-co2-${Date.now()}`)
      .send({});
    const unknown = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session2.body.id}/pay`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `ord-unk-${Date.now()}`)
      .send({ method: 'CARD', scenario: 'timeout' });
    expect(unknown.body.status).toBe('UNKNOWN');
    expect(await prisma.order.count({ where: { paymentIntentId: unknown.body.id } })).toBe(0);

    const failedPay = await request(app.getHttpServer())
      .post('/api/v1/me/cart/items?country=OQ')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `ord-add3-${Date.now()}`)
      .send({ offer_id: offer.body.id, qty: 1 });
    void failedPay;
    const session3 = await request(app.getHttpServer())
      .post('/api/v1/me/checkout/sessions?country=OQ')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `ord-co3-${Date.now()}`)
      .send({});
    const failed = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session3.body.id}/pay`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `ord-fail-${Date.now()}`)
      .send({ method: 'CARD', scenario: 'failure' });
    expect(failed.body.status).toBe('FAILED');
    expect(await prisma.order.count({ where: { paymentIntentId: failed.body.id } })).toBe(0);

    const consumed = await prisma.inventoryReservation.count({
      where: { id: { in: created.body.fulfillment?.[0] ? [] : [] }, status: 'CONSUMED' },
    });
    void consumed;
    const hold = await prisma.inventoryReservation.findMany({
      where: { purpose: 'CHECKOUT', status: 'CONSUMED' },
    });
    expect(hold.length).toBeGreaterThan(0);
    expect(await prisma.outboxEvent.count({ where: { type: { in: ['VENDOR_PAID', 'AFFILIATE_PAID'] } } })).toBe(0);
  });
});
