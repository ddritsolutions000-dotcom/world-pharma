import { INestApplication } from '@nestjs/common';
import { LocationKind, OrganizationKind, PolicyPackStatus } from '@prisma/client';
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
import { seedCheckoutInventory } from '../test/seed-checkout-inventory';

async function signIn(
  app: INestApplication,
  email: string,
  audience: 'admin' | 'customer' = 'customer',
): Promise<{ token: string; personId: string }> {
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
  return { token: verified.body.access_token, personId: verified.body.person_id };
}

describe('cart checkout (e2e)', () => {
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

  it('enforces one seller, isolates customers, reserves only at quote, and disables payment', async () => {
    const enabledDoc = emptyPolicyDocument();
    enabledDoc.services.pharmacy = true;
    enableMarketplaceVendorPack(enabledDoc);
    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'TQ' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'TQ',
          isoAlpha3: 'TQQ',
          nameI18n: { en: 'Cart test' },
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
          document: enabledDoc as never,
          checksum: 'cart-test',
          publishedAt: new Date(),
        },
      });
      await prisma.country.update({
        where: { id: country.id },
        data: { publishedPolicyPackId: pack.id },
      });
    } else {
      await prisma.policyPack.updateMany({
        where: { countryId: country.id, status: PolicyPackStatus.PUBLISHED },
        data: { document: enabledDoc as never },
      });
    }
    await app.get(PolicyCache).invalidate('TQ');

    const vendorA = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: 'Cart Vendor A',
        displayName: 'Cart Vendor A',
        status: 'ACTIVE',
      },
    });
    const vendorB = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: 'Cart Vendor B',
        displayName: 'Cart Vendor B',
        status: 'ACTIVE',
      },
    });
    const locationA = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendorA.id,
        countryId: country.id,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'A WH',
        timezone: 'UTC',
      },
    });

    const admin = await signIn(app, `cart-admin-${Date.now()}@example.com`, 'admin');
    const role = await prisma.role.findUnique({ where: { code: 'super_admin' } });
    await prisma.membership.create({
      data: { id: uuidv7(), personId: admin.personId, roleId: role!.id, scope: 'platform', status: 'ACTIVE' },
    });
    const vendorUser = await signIn(app, `cart-vendor-${Date.now()}@example.com`, 'admin');
    const orgRole = await prisma.role.findUnique({ where: { code: 'org_owner' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: vendorUser.personId,
        roleId: orgRole!.id,
        scope: 'organization',
        organizationId: vendorA.id,
        status: 'ACTIVE',
      },
    });

    await activateMarketplaceSeller(app, {
      vendorToken: vendorUser.token,
      adminToken: admin.token,
      sellerOrgId: vendorA.id,
    });

    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: `cart-brand-${Date.now()}`, name: 'CartBrand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: `cart-zinc-${Date.now()}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'Cart zinc',
        countries: [{ country_code: 'TQ' }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku_code: `CART-SKU-${Date.now()}`, pack_size: '10' });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);
    const offerA = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set('Authorization', `Bearer ${vendorUser.token}`)
      .send({
        variant_id: variant.body.id,
        seller_org_id: vendorA.id,
        country_code: 'TQ',
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '200',
      });
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offerA.body.id}/publish`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    await seedCheckoutInventory(app, {
      vendorToken: vendorUser.token,
      locationId: locationA.id,
      ownerOrgId: vendorA.id,
      variantId: variant.body.id,
      qty: 5,
    });
    const offerB = await prisma.catalogOffer.create({
      data: {
        id: uuidv7(),
        variantId: variant.body.id,
        sellerOrgId: vendorB.id,
        countryId: country.id,
        ownership: 'VENDOR_OWNED',
        status: 'PUBLISHED',
        currency: 'XXX',
        publishedAt: new Date(),
      },
    });
    await prisma.priceVersion.create({
      data: {
        id: uuidv7(),
        offerId: offerB.id,
        version: 1,
        currency: 'XXX',
        costMinor: 100n,
        sellMinor: 200n,
        validFrom: new Date(),
        isCurrent: true,
      },
    });

    const customer = await signIn(app, `cart-cust-${Date.now()}@example.com`, 'customer');
    const other = await signIn(app, `cart-cust-b-${Date.now()}@example.com`, 'customer');

    const added = await request(app.getHttpServer())
      .post('/api/v1/me/cart/items?country=TQ')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `add-${Date.now()}`)
      .send({ offer_id: offerA.body.id, qty: 2 });
    expect(added.status).toBe(201);
    expect(added.body.seller_org_id).toBe(vendorA.id);
    const reservationsAfterAdd = await prisma.inventoryReservation.count({
      where: { ownerOrgId: vendorA.id, purpose: 'CHECKOUT', status: 'OPEN' },
    });
    expect(reservationsAfterAdd).toBe(0);

    const steal = await request(app.getHttpServer())
      .get('/api/v1/me/cart?country=TQ')
      .set('Authorization', `Bearer ${other.token}`);
    expect(steal.status).toBe(200);
    expect(steal.body.items ?? []).toEqual([]);

    const conflict = await request(app.getHttpServer())
      .post('/api/v1/me/cart/items?country=TQ')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `conflict-${Date.now()}`)
      .send({ offer_id: offerB.id, qty: 1 });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('CART_SELLER_CONFLICT');

    const dup = await request(app.getHttpServer())
      .post('/api/v1/me/cart/items?country=TQ')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `add-${Date.now()}-dup`)
      .send({ offer_id: offerA.body.id, qty: 1 });
    const key = `idem-add-${Date.now()}`;
    const first = await request(app.getHttpServer())
      .post('/api/v1/me/cart/items?country=TQ')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', key)
      .send({ offer_id: offerA.body.id, qty: 1 });
    const second = await request(app.getHttpServer())
      .post('/api/v1/me/cart/items?country=TQ')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', key)
      .send({ offer_id: offerA.body.id, qty: 1 });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.items[0].qty).toBe(first.body.items[0].qty);

    const session = await request(app.getHttpServer())
      .post('/api/v1/me/checkout/sessions?country=TQ')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `co-${Date.now()}`)
      .send({});
    expect(session.status).toBe(201);
    expect(['QUOTED', 'READY_FOR_PAYMENT']).toContain(session.body.status);
    const holds = await prisma.inventoryReservation.count({
      where: { ownerOrgId: vendorA.id, purpose: 'CHECKOUT', status: 'OPEN' },
    });
    expect(holds).toBeGreaterThan(0);

    const pay = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(pay.status).toBe(409);
    expect(pay.body.code).toBe('PAYMENTS_DISABLED');

    expect(await prisma.order.count({ where: { checkoutSessionId: session.body.id } })).toBe(0);
    const paidEvents = await prisma.outboxEvent.findMany({
      where: { type: 'ORDER_PAID' },
    });
    expect(paidEvents).toHaveLength(0);
    const cartEvents = await prisma.outboxEvent.findMany({
      where: { type: { in: ['CART_CREATED', 'CART_ITEM_ADDED', 'CHECKOUT_STARTED'] } },
    });
    expect(cartEvents.length).toBeGreaterThan(0);
    expect(dup.status).toBeGreaterThan(0);
  });
});
