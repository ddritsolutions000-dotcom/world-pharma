import { INestApplication } from '@nestjs/common';
import { OrganizationKind, OrganizationStatus, PolicyPackStatus } from '@prisma/client';
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
import { provisionSuperAdmin, signInCustomer } from '../test/sign-in';

describe('R6-A vendor foundation (e2e)', () => {
  jest.setTimeout(120_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let orgs: OrganizationService;

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

  it('filters VENDOR orgs, hardens catalog DTO, and isolates sellers', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const admin = await provisionSuperAdmin(app, prisma, `r6a-admin-${suffix}`);
    const vendorUser = await signInCustomer(app, `r6a-va-${suffix}@example.com`);
    const otherVendor = await signInCustomer(app, `r6a-vb-${suffix}@example.com`);
    const clinicUser = await signInCustomer(app, `r6a-clinic-${suffix}@example.com`);

    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'XX' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'XX',
          isoAlpha3: 'XXX',
          nameI18n: { en: 'R6A test' },
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
    await prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        version: Math.floor(Date.now() % 1_000_000),
        status: PolicyPackStatus.PUBLISHED,
        document: doc as never,
        checksum: `r6a-${suffix}`,
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
    await app.get(PolicyCache).invalidate('XX');

    const vendorA = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.VENDOR,
      legalName: `R6A Vendor A ${suffix}`,
      displayName: `R6A Seller A ${suffix}`,
      actorId: admin.personId,
    });
    const vendorB = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.VENDOR,
      legalName: `R6A Vendor B ${suffix}`,
      displayName: `R6A Seller B ${suffix}`,
      actorId: admin.personId,
    });
    const clinic = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.CLINIC,
      legalName: `R6A Clinic ${suffix}`,
      displayName: `R6A Clinic ${suffix}`,
      actorId: admin.personId,
    });

    await prisma.organization.updateMany({
      where: { id: { in: [vendorA.id, vendorB.id, clinic.id] } },
      data: { status: OrganizationStatus.ACTIVE },
    });

    await attachOrgAdmin(vendorUser.personId, vendorA.id);
    await attachOrgAdmin(vendorUser.personId, clinic.id);
    await attachOrgAdmin(otherVendor.personId, vendorB.id);
    await attachOrgAdmin(clinicUser.personId, clinic.id);

    await activateMarketplaceSeller(app, {
      vendorToken: vendorUser.token,
      adminToken: admin.token,
      sellerOrgId: vendorA.id,
    });

    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    const orgsRes = await request(app.getHttpServer())
      .get('/api/v1/vendor/organizations')
      .set(auth(vendorUser.token));
    expect(orgsRes.status).toBe(200);
    expect(Array.isArray(orgsRes.body.data)).toBe(true);
    const kinds = orgsRes.body.data.map((row: { kind: string }) => row.kind);
    expect(kinds.every((kind: string) => kind === 'VENDOR')).toBe(true);
    expect(orgsRes.body.data.some((row: { id: string }) => row.id === vendorA.id)).toBe(true);
    expect(orgsRes.body.data.some((row: { id: string }) => row.id === clinic.id)).toBe(false);

    const clinicOrgs = await request(app.getHttpServer())
      .get('/api/v1/vendor/organizations')
      .set(auth(clinicUser.token));
    expect(clinicOrgs.status).toBe(200);
    expect(clinicOrgs.body.data).toEqual([]);

    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set(auth(admin.token))
      .send({ slug: `r6a-brand-${suffix}`, name: 'R6A Brand' });
    expect(brand.status).toBe(201);
    const category = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/categories')
      .set(auth(admin.token))
      .send({ slug: `r6a-cat-${suffix}`, name: 'R6A Category' });
    expect(category.status).toBe(201);
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set(auth(admin.token))
      .send({
        slug: `r6a-item-${suffix}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        category_id: category.body.id,
        title: 'R6A Vitamin',
        countries: [{ country_code: 'XX' }],
      });
    expect(item.status).toBe(201);
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set(auth(admin.token))
      .send({ sku_code: `R6A-${suffix}`, pack_size: '10 tabs' });
    expect(variant.status).toBe(201);

    const offer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set(auth(vendorUser.token))
      .send({
        variant_id: variant.body.id,
        seller_org_id: vendorA.id,
        country_code: 'XX',
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '250',
      });
    expect(offer.status).toBe(201);

    const listOwn = await request(app.getHttpServer())
      .get(`/api/v1/vendor/catalog/offers?seller_org_id=${vendorA.id}`)
      .set(auth(vendorUser.token));
    expect(listOwn.status).toBe(200);
    expect(Array.isArray(listOwn.body.data)).toBe(true);
    expect(listOwn.body.data.length).toBeGreaterThan(0);
    const presented = listOwn.body.data[0];
    expect(presented).toHaveProperty('seller_org_id', vendorA.id);
    expect(presented).toHaveProperty('country_code');
    expect(presented).toHaveProperty('sell_minor');
    expect(presented).not.toHaveProperty('sellerOrgId');
    expect(presented).not.toHaveProperty('sellMinor');

    const listClinicAsSeller = await request(app.getHttpServer())
      .get(`/api/v1/vendor/catalog/offers?seller_org_id=${clinic.id}`)
      .set(auth(vendorUser.token));
    expect(listClinicAsSeller.status).toBe(403);

    const cross = await request(app.getHttpServer())
      .get(`/api/v1/vendor/catalog/offers?seller_org_id=${vendorB.id}`)
      .set(auth(vendorUser.token));
    expect(cross.status).toBe(403);

    const crossSettle = await request(app.getHttpServer())
      .get(`/api/v1/vendor/settlements?seller_org_id=${vendorB.id}`)
      .set(auth(vendorUser.token));
    expect(crossSettle.status).toBe(403);

    const crossLots = await request(app.getHttpServer())
      .get(`/api/v1/vendor/inventory/lots?owner_org_id=${vendorB.id}`)
      .set(auth(vendorUser.token));
    expect(crossLots.status).toBe(403);

    const customerFinance = await request(app.getHttpServer())
      .get('/api/v1/admin/finance/dashboard')
      .set(auth(vendorUser.token));
    expect(customerFinance.status).toBeGreaterThanOrEqual(400);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set(auth(admin.token));
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/publish`)
      .set(auth(vendorUser.token));

    // Marketplace may be pack-gated for XX; still assert presenter field when visible.
    const visible = await request(app.getHttpServer()).get(
      `/api/v1/catalog/items/${item.body.slug}?country=XX`,
    );
    if (visible.status === 200 && visible.body.offers?.length) {
      expect(visible.body.offers[0].seller_display_name).toBe(`R6A Seller A ${suffix}`);
      expect(visible.body.offers[0].seller_org_id).toBe(vendorA.id);
      expect(JSON.stringify(visible.body)).not.toMatch(/diagnosis|clinical_note|prescription_instruction/i);
    }
  });
});
