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
import { activateMarketplaceSeller, enableMarketplaceVendorPack } from '../test/marketplace-seller';
import { signInCustomer, provisionSuperAdmin, provisionOrgAdmin } from '../test/sign-in';

describe('Sprint 20 customer medicine discovery (e2e)', () => {
  jest.setTimeout(240_000);
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

  async function ensureMarket(countryCode: string) {
    const doc = emptyPolicyDocument();
    doc.services.pharmacy = true;
    enableMarketplaceVendorPack(doc);
    doc.payments.enabled = true;
    doc.payments.methods = ['CARD', 'COD'];
    doc.payments.gateway_refs = ['MOCK_PRIMARY'];
    doc.payments.currencies = ['XXX'];
    doc.shipping.domestic = true;

    let country = await prisma.country.findUnique({ where: { isoAlpha2: countryCode } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: countryCode,
          isoAlpha3: `${countryCode}Q`,
          nameI18n: { en: `Discovery ${countryCode}` },
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
          checksum: 'test',
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
        data: { document: doc as never },
      });
    }
    await app.get(PolicyCache).invalidate(countryCode);
    return country;
  }

  it('search, filters, PDP, cart quote, Rx, isolation, and mobile-equivalent APIs', async () => {
    const runToken = `${Date.now().toString(36)}-${uuidv7().slice(0, 6)}`;
    const countryCode = 'TQ';
    const country = await ensureMarket(countryCode);
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    const admin = await provisionSuperAdmin(app, prisma, `s20-admin-${runToken}`);
    const adminToken = admin.token;

    const vendorActive = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: `Active Vendor ${runToken}`,
        displayName: `Active Vendor ${runToken}`,
        status: 'ACTIVE',
      },
    });
    const vendorSuspended = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: `Suspended Vendor ${runToken}`,
        displayName: `Suspended Vendor ${runToken}`,
        status: 'SUSPENDED',
      },
    });

    const vendorUser = await provisionOrgAdmin(app, prisma, `s20-vendor-${runToken}`, vendorActive.id);
    await activateMarketplaceSeller(app, {
      vendorToken: vendorUser.token,
      adminToken,
      sellerOrgId: vendorActive.id,
    });

    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set(auth(adminToken))
      .send({ slug: `brand-${runToken}`, name: `Brand ${runToken}` });
    const category = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/categories')
      .set(auth(adminToken))
      .send({ slug: `cat-${runToken}`, name: 'Medicines' });

    const productTitle = `${runToken} Paracetamol 500mg`;
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set(auth(adminToken))
      .send({
        slug: `paracetamol-${runToken}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        category_id: category.body.id,
        title: productTitle,
        countries: [
          {
            country_code: countryCode,
            attributes: {
              manufacturer_name: `Mfg ${runToken}`,
              composition: 'Paracetamol 500mg',
            },
          },
        ],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set(auth(adminToken))
      .send({ sku_code: `SKU-${runToken}`, pack_size: '10 tablets', strength: '500mg' });

    const activeOffer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set(auth(vendorUser.token))
      .send({
        variant_id: variant.body.id,
        seller_org_id: vendorActive.id,
        country_code: countryCode,
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '400',
        sell_minor: '800',
        list_minor: '1000',
      });

    const suspendedOffer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set(auth(vendorUser.token))
      .send({
        variant_id: variant.body.id,
        seller_org_id: vendorSuspended.id,
        country_code: countryCode,
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '300',
        sell_minor: '600',
      });

    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set(auth(adminToken));

    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendorActive.id,
        countryId: country.id,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: `WH ${runToken}`,
        timezone: 'UTC',
      },
    });

    const lot = await prisma.inventoryLot.create({
      data: {
        id: uuidv7(),
        variantId: variant.body.id,
        locationId: location.id,
        ownerOrgId: vendorActive.id,
        countryId: country.id,
        lotCode: `LOT-${runToken}`,
        status: InventoryLotStatus.ACTIVE,
      },
    });
    await prisma.inventoryBalance.create({
      data: {
        id: uuidv7(),
        lotId: lot.id,
        onHand: 50,
        available: 50,
      },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${activeOffer.body.id}/publish`)
      .set(auth(vendorUser.token));
    expect(activeOffer.status).toBeLessThan(300);

    const customerA = await signInCustomer(app, `s20-customer-a-${runToken}@example.com`);
    const customerB = await signInCustomer(app, `s20-customer-b-${runToken}@example.com`);

    const discovery = await request(app.getHttpServer())
      .get(`/api/v1/discovery/search?country=${countryCode}&q=${encodeURIComponent(runToken)}&types=commerce`)
      .set(auth(customerA.token));
    expect(discovery.status).toBe(200);
    expect(discovery.body.data.some((row: { title: string }) => row.title.includes(runToken))).toBe(true);
    const hit = discovery.body.data.find((row: { type: string }) => row.type === 'commerce');
    expect(hit.min_sell_minor).toBe('800');
    expect(hit.rx_required).toBe(false);

    const filtered = await request(app.getHttpServer())
      .get(
        `/api/v1/discovery/search?country=${countryCode}&q=${encodeURIComponent(runToken)}&types=commerce&sort=price_asc&in_stock=true`,
      )
      .set(auth(customerA.token));
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.length).toBeGreaterThan(0);

    const noResult = await request(app.getHttpServer())
      .get(`/api/v1/discovery/search?country=${countryCode}&q=${encodeURIComponent(`missing-${runToken}`)}&types=commerce`)
      .set(auth(customerA.token));
    expect(noResult.body.data.length).toBe(0);

    const pdp = await request(app.getHttpServer())
      .get(`/api/v1/catalog/items/${item.body.slug}?country=${countryCode}&postal_code=999999`)
      .set(auth(customerA.token));
    expect(pdp.status).toBe(200);
    expect(String(pdp.body.title ?? '')).toContain(runToken);
    expect(pdp.body.review_summary).toBeDefined();
    if (pdp.body.attributes?.composition) {
      expect(String(pdp.body.attributes.composition)).toContain('Paracetamol');
    }
    expect(pdp.body.offers.some((row: { seller_org_id: string }) => row.seller_org_id === vendorActive.id)).toBe(true);
    expect(pdp.body.offers.some((row: { seller_org_id: string }) => row.seller_org_id === vendorSuspended.id)).toBe(
      false,
    );

    const mobileDiscovery = await request(app.getHttpServer())
      .get(`/api/v1/discovery/search?country=${countryCode}&q=${encodeURIComponent(runToken)}&types=commerce&sort=relevance`)
      .set(auth(customerA.token));
    expect(mobileDiscovery.body.data[0]?.slug).toBe(item.body.slug);

    const add = await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${countryCode}`)
      .set(auth(customerA.token))
      .set('Idempotency-Key', uuidv7())
      .send({ offer_id: activeOffer.body.id, qty: 1 });
    expect(add.status).toBeLessThan(300);

    const checkout = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${countryCode}`)
      .set(auth(customerA.token))
      .set('Idempotency-Key', uuidv7())
      .send({});
    expect(checkout.status).toBeLessThan(300);

    const addr = await request(app.getHttpServer())
      .post('/api/v1/me/addresses')
      .set(auth(customerA.token))
      .send({
        country_code: countryCode,
        recipient_name: 'Discovery Customer',
        line1: '1 Test Street',
        city: 'Testville',
        postal_code: '999999',
        phone: '+10000000099',
      });
    expect(addr.status).toBeLessThan(300);

    await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${checkout.body.id}/fulfillment`)
      .set(auth(customerA.token))
      .send({ address_id: addr.body.id });

    const quote = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${checkout.body.id}/quote`)
      .set(auth(customerA.token))
      .set('Idempotency-Key', uuidv7())
      .send({});
    expect(quote.status).toBeLessThan(300);
    expect(Number(quote.body.quote?.total_minor ?? quote.body.totals?.sell_minor ?? 0)).toBeGreaterThan(0);

    const foreignCart = await request(app.getHttpServer())
      .get(`/api/v1/me/cart?country=${countryCode}`)
      .set(auth(customerB.token));
    expect(foreignCart.status).toBe(200);
    expect((foreignCart.body.items ?? []).length).toBe(0);

    const browse = await request(app.getHttpServer())
      .get(`/api/v1/catalog/items?country=${countryCode}&q=${encodeURIComponent(runToken)}&sort=price_asc`)
      .set(auth(customerA.token));
    expect(browse.status).toBe(200);
    expect(browse.body.data.length).toBeGreaterThan(0);
  });
});
