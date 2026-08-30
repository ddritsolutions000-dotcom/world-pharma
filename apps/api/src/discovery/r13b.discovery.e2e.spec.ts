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
import { activateMarketplaceSeller, enableMarketplaceVendorPack } from '../test/marketplace-seller';

async function signIn(app: INestApplication, email: string, audience: 'admin' | 'customer' = 'admin') {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

async function grantPlatformRole(prisma: PrismaService, personId: string, roleCode: string) {
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  await prisma.membership.create({
    data: {
      id: uuidv7(),
      personId,
      roleId: role!.id,
      scope: 'platform',
      status: 'ACTIVE',
    },
  });
}

function assertNoSensitivePayload(body: unknown) {
  const raw = JSON.stringify(body).toLowerCase();
  for (const token of [
    'diagnosis',
    'lab_result',
    'prescription_version',
    'consult_note',
    'health_timeline',
    'break_glass',
    'audit_id',
    'internal_note',
  ]) {
    expect(raw.includes(token)).toBe(false);
  }
}

describe('R13-B discovery (e2e)', () => {
  jest.setTimeout(180_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let countryId: string;
  let itemSlug: string;
  let helpSlug: string;
  let runToken: string;

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

    const xxCountry = await prisma.country.findUnique({ where: { isoAlpha2: 'XX' } });
    if (xxCountry) {
      await prisma.policyPack.updateMany({
        where: { countryId: xxCountry.id, status: PolicyPackStatus.PUBLISHED },
        data: { document: emptyPolicyDocument() as never },
      });
      await app.get(PolicyCache).invalidate('XX');
    }

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
          nameI18n: { en: 'Discovery test' },
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
    countryId = country.id;
    await app.get(PolicyCache).invalidate('TQ');

    const admin = await signIn(app, `r13b-admin-${Date.now()}@example.com`);
    await grantPlatformRole(prisma, admin.personId, 'super_admin');
    const publisher = await signIn(app, `r13b-publisher-${Date.now()}@example.com`);
    await grantPlatformRole(prisma, publisher.personId, 'company_compliance');

    const vendorOrg = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.VENDOR,
        legalName: 'Vendor R13B',
        displayName: 'Vendor R13B',
        status: 'ACTIVE',
      },
    });
    const vendorUser = await signIn(app, `r13b-vendor-${Date.now()}@example.com`);
    const orgRole = await prisma.role.findUnique({ where: { code: 'org_owner' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: vendorUser.personId,
        roleId: orgRole!.id,
        scope: 'organization',
        organizationId: vendorOrg.id,
        status: 'ACTIVE',
      },
    });
    await activateMarketplaceSeller(app, {
      vendorToken: vendorUser.token,
      adminToken: admin.token,
      sellerOrgId: vendorOrg.id,
    });

    const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    runToken = `r13b-unified-${suffix}`;
    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: `${runToken}-brand`, name: `${runToken} Brand` });
    const category = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/categories')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: `${runToken}-cat`, name: `${runToken} Category` });
    itemSlug = `${runToken}-item`;
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: itemSlug,
        kind: 'OTC',
        brand_id: brand.body.id,
        category_id: category.body.id,
        title: `${runToken} Discovery Zinc`,
        countries: [{ country_code: 'TQ' }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku_code: `${runToken}-sku`.toUpperCase(), pack_size: '10' });
    const offer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set('Authorization', `Bearer ${vendorUser.token}`)
      .send({
        variant_id: variant.body.id,
        seller_org_id: vendorOrg.id,
        country_code: 'TQ',
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '200',
      });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({});
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/publish`)
      .set('Authorization', `Bearer ${vendorUser.token}`)
      .send({});
    await request(app.getHttpServer())
      .post('/api/v1/admin/search/reindex')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ country_code: 'TQ', index_kind: 'catalog', item_id: item.body.id, force: true });

    helpSlug = `${runToken}-help`;
    const cms = await request(app.getHttpServer())
      .post('/api/v1/admin/cms/content')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        country_code: 'TQ',
        content_type: 'ARTICLE',
        slug: helpSlug,
        title: `${runToken} Help Zinc Guide`,
        body: `Non-clinical help content about zinc supplements (${runToken}).`,
        category_slug: 'getting-started',
      });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/cms/content/${cms.body.id}/submit-review`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ country_code: 'TQ' });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/cms/content/${cms.body.id}/publish`)
      .set('Authorization', `Bearer ${publisher.token}`)
      .set('Idempotency-Key', `r13b-pub-${suffix}`)
      .send({ country_code: 'TQ' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('unified discovery, suggest, isolation, blocklist, facets, limits, and no sensitive leakage', async () => {
    const disabled = await request(app.getHttpServer()).get('/api/v1/discovery/search?country=XX&q=zinc');
    expect(disabled.status).toBe(200);
    expect(disabled.body.country_enabled).toBe(false);
    expect(disabled.body.data).toEqual([]);

    const empty = await request(app.getHttpServer()).get('/api/v1/discovery/search?country=TQ&q=');
    expect(empty.status).toBe(200);
    expect(empty.body.data).toEqual([]);

    const unified = await request(app.getHttpServer()).get(
      `/api/v1/discovery/search?country=TQ&q=${encodeURIComponent(runToken)}&locale=en&types=commerce&types=help`,
    );
    expect(unified.status).toBe(200);
    expect(unified.body.country_enabled).toBe(true);
    expect(unified.body.discovery_enabled).toBe(true);
    assertNoSensitivePayload(unified.body);
    const types = unified.body.data.map((row: { type: string }) => row.type);
    expect(types).toEqual(expect.arrayContaining(['commerce', 'help']));
    expect(unified.body.data.some((row: { slug: string }) => row.slug === itemSlug)).toBe(true);
    expect(unified.body.data.some((row: { slug: string }) => row.slug === helpSlug)).toBe(true);

    const commerceOnly = await request(app.getHttpServer()).get(
      `/api/v1/discovery/search?country=TQ&q=${encodeURIComponent(`${runToken} Discovery Zinc`)}&types=commerce`,
    );
    expect(commerceOnly.status).toBe(200);
    expect(commerceOnly.body.data.every((row: { type: string }) => row.type === 'commerce')).toBe(true);
    expect(commerceOnly.body.data.some((row: { slug: string }) => row.slug === itemSlug)).toBe(true);

    const helpOnly = await request(app.getHttpServer()).get(
      `/api/v1/discovery/search?country=TQ&q=${encodeURIComponent(`${runToken} Help Zinc`)}&types=help`,
    );
    expect(helpOnly.status).toBe(200);
    expect(helpOnly.body.data.every((row: { type: string }) => row.type === 'help')).toBe(true);
    expect(helpOnly.body.data.some((row: { slug: string }) => row.slug === helpSlug)).toBe(true);

    const facet = await request(app.getHttpServer()).get(
      `/api/v1/discovery/search?country=TQ&q=${encodeURIComponent(`${runToken} Discovery Zinc`)}&types=commerce&brand=${encodeURIComponent(`${runToken} Brand`)}`,
    );
    expect(facet.status).toBe(200);
    expect(facet.body.data.length).toBeGreaterThan(0);

    const limited = await request(app.getHttpServer()).get(
      `/api/v1/discovery/search?country=TQ&q=${encodeURIComponent(`${runToken} Discovery Zinc`)}&limit=1`,
    );
    expect(limited.status).toBe(200);
    expect(limited.body.data.length).toBeLessThanOrEqual(1);
    if (limited.body.meta.next_cursor) {
      const page2 = await request(app.getHttpServer()).get(
        `/api/v1/discovery/search?country=TQ&q=${encodeURIComponent(`${runToken} Discovery Zinc`)}&limit=1&cursor=${limited.body.meta.next_cursor}`,
      );
      expect(page2.status).toBe(200);
    }

    const shortSuggest = await request(app.getHttpServer()).get('/api/v1/discovery/suggest?country=TQ&q=z');
    expect(shortSuggest.status).toBe(200);
    expect(shortSuggest.body.data).toEqual([]);

    const suggest = await request(app.getHttpServer()).get(
      `/api/v1/discovery/suggest?country=TQ&q=${encodeURIComponent(runToken.slice(0, 8))}`,
    );
    expect(suggest.status).toBe(200);
    expect(suggest.body.data.length).toBeGreaterThan(0);
    expect(suggest.body.data.length).toBeLessThanOrEqual(10);

    const oversized = await request(app.getHttpServer()).get(
      `/api/v1/discovery/search?country=TQ&q=${'x'.repeat(201)}`,
    );
    expect(oversized.status).toBe(400);

    const invalid = await request(app.getHttpServer()).get('/api/v1/discovery/search?country=X');
    expect(invalid.status).toBe(400);

    const blockDoc = emptyPolicyDocument();
    blockDoc.services.pharmacy = true;
    enableMarketplaceVendorPack(blockDoc);
    blockDoc.search = { discovery_enabled: true, blocklist_terms: ['symptom'] };
    await prisma.policyPack.updateMany({
      where: { countryId, status: PolicyPackStatus.PUBLISHED },
      data: { document: blockDoc as never },
    });
    await app.get(PolicyCache).invalidate('TQ');
    const blocked = await request(app.getHttpServer()).get('/api/v1/discovery/search?country=TQ&q=symptom%20cure');
    expect(blocked.status).toBe(403);

    const disabledDiscovery = emptyPolicyDocument();
    disabledDiscovery.services.pharmacy = true;
    enableMarketplaceVendorPack(disabledDiscovery);
    disabledDiscovery.search = { discovery_enabled: false, blocklist_terms: [] };
    await prisma.policyPack.updateMany({
      where: { countryId, status: PolicyPackStatus.PUBLISHED },
      data: { document: disabledDiscovery as never },
    });
    await app.get(PolicyCache).invalidate('TQ');
    const discoveryOff = await request(app.getHttpServer()).get('/api/v1/discovery/search?country=TQ&q=zinc');
    expect(discoveryOff.status).toBe(200);
    expect(discoveryOff.body.discovery_enabled).toBe(false);
    expect(discoveryOff.body.data).toEqual([]);

    const enabledDoc = emptyPolicyDocument();
    enabledDoc.services.pharmacy = true;
    enableMarketplaceVendorPack(enabledDoc);
    await prisma.policyPack.updateMany({
      where: { countryId, status: PolicyPackStatus.PUBLISHED },
      data: { document: enabledDoc as never },
    });
    await app.get(PolicyCache).invalidate('TQ');

    const catalogAlias = await request(app.getHttpServer()).get(
      `/api/v1/catalog/search?country=TQ&q=${encodeURIComponent(`${runToken} Discovery Zinc`)}&locale=en`,
    );
    expect(catalogAlias.status).toBe(200);
    expect(catalogAlias.body.country_enabled).toBe(true);
    expect(Array.isArray(catalogAlias.body.data)).toBe(true);
  });
});
