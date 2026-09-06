import { INestApplication } from '@nestjs/common';
import { OrganizationKind, PolicyPackStatus } from '@prisma/client';
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
import { provisionSuperAdmin, signInCustomer } from '../test/sign-in';

describe('catalog pricing (e2e)', () => {
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

  it('isolates vendors, hides drafts from customers, and quotes integer money', async () => {
    const xxCountry = await prisma.country.findUnique({ where: { isoAlpha2: 'XX' } });
    if (xxCountry) {
      await prisma.policyPack.updateMany({
        where: { countryId: xxCountry.id, status: PolicyPackStatus.PUBLISHED },
        data: { document: emptyPolicyDocument() as never },
      });
      await app.get(PolicyCache).invalidate('XX');
    }
    const xx = await request(app.getHttpServer()).get('/api/v1/catalog/items?country=XX');
    expect(xx.status).toBe(200);
    expect(xx.body.country_enabled).toBe(false);
    expect(xx.body.data).toEqual([]);

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
          nameI18n: { en: 'Catalog test' },
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
        data: { document: enabledDoc as never },
      });
    }
    await app.get(PolicyCache).invalidate('TQ');
    await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.PHARMACY_OWNED,
        legalName: 'Platform Pharmacy',
        displayName: 'Platform Pharmacy',
        status: 'ACTIVE',
      },
    });
    const vendorA = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: 'Vendor A',
        displayName: 'Vendor A',
        status: 'ACTIVE',
      },
    });
    const vendorB = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: 'Vendor B',
        displayName: 'Vendor B',
        status: 'ACTIVE',
      },
    });

    const admin = await provisionSuperAdmin(app, prisma, 'cat-admin');
    const vendorUser = await signInCustomer(app, `cat-vendor-${Date.now()}@example.com`);
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
    const otherVendor = await signInCustomer(app, `cat-vendor-b-${Date.now()}@example.com`);
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: otherVendor.personId,
        roleId: orgRole!.id,
        scope: 'organization',
        organizationId: vendorB.id,
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
      .send({ slug: `brand-${Date.now()}`, name: 'Acme' });
    expect(brand.status).toBe(201);
    const category = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/categories')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: `otc-${Date.now()}`, name: 'OTC' });
    expect(category.status).toBe(201);

    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: `zinc-${Date.now()}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        category_id: category.body.id,
        title: 'Zinc tablets',
        countries: [{ country_code: 'TQ' }],
      });
    expect(item.status).toBe(201);
    expect(item.body.status).toBe('DRAFT');

    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku_code: `SKU-${Date.now()}`, pack_size: '10 tabs' });
    expect(variant.status).toBe(201);

    const offer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set('Authorization', `Bearer ${vendorUser.token}`)
      .send({
        variant_id: variant.body.id,
        seller_org_id: vendorA.id,
        country_code: 'TQ',
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '500',
        sell_minor: '900',
      });
    expect(offer.status).toBe(201);
    expect(offer.body.sellerOrgId).toBe(vendorA.id);

    const steal = await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/publish`)
      .set('Authorization', `Bearer ${otherVendor.token}`);
    expect(steal.status).toBe(403);

    const listB = await request(app.getHttpServer())
      .get(`/api/v1/vendor/catalog/offers?seller_org_id=${vendorA.id}`)
      .set('Authorization', `Bearer ${otherVendor.token}`);
    expect(listB.status).toBe(403);

    await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/rules')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ country_code: 'TQ', take_bps: 250, take_flat_minor: '0' });

    const quote = await request(app.getHttpServer())
      .post('/api/v1/pricing/quote')
      .send({ offer_id: offer.body.id, quantity: '2' });
    expect(quote.status).toBe(200);
    expect(quote.body.unit.sell_minor).toBe('900');
    expect(quote.body.totals.sell_minor).toBe('1800');
    expect(quote.body.settlement).toBe(false);

    const hidden = await request(app.getHttpServer()).get(
      `/api/v1/catalog/items/${item.body.slug}?country=TQ`,
    );
    expect(hidden.status).toBe(404);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/publish`)
      .set('Authorization', `Bearer ${vendorUser.token}`);

    const visible = await request(app.getHttpServer()).get(
      `/api/v1/catalog/items/${item.body.slug}?country=TQ`,
    );
    expect(visible.status).toBe(200);
    expect(visible.body.offers[0].price.sell_minor).toBe('900');
    expect(JSON.stringify(visible.body)).not.toMatch(/cart|checkout|payment/i);

    const search = await request(app.getHttpServer()).get(
      `/api/v1/catalog/search?country=TQ&q=zinc`,
    );
    expect(search.status).toBe(200);

    const events = await prisma.outboxEvent.findMany({
      where: { type: { in: ['PRODUCT_CREATED', 'OFFER_CREATED', 'PRICE_CHANGED'] } },
    });
    expect(events.length).toBeGreaterThan(0);
  });
});
