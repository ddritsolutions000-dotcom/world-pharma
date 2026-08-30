import { INestApplication } from '@nestjs/common';
import {
  InventoryLotStatus,
  OfferStatus,
  OrganizationKind,
  OrganizationStatus,
  PersonalizationEventKind,
  PolicyPackStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { CatalogSearchService } from '../catalog/search.service';
import { PolicyCache } from '../policy/cache';
import { ProblemFilter } from '../common/problem.filter';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { applyTestIsolation } from '../test/isolate-runtime';
import { activateMarketplaceSeller, enableMarketplaceVendorPack } from '../test/marketplace-seller';

async function signIn(app: INestApplication, email: string, audience: 'admin' | 'customer' = 'customer') {
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
    'symptom',
    'patients like you',
  ]) {
    expect(raw.includes(token)).toBe(false);
  }
}

describe('R13-D deterministic recommendations (e2e)', () => {
  jest.setTimeout(240_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let countryId: string;
  let categoryName: string;
  let primaryItemId: string;
  let relatedItemId: string;
  let coItemId: string;
  let draftItemId: string;
  let vendorOrgId: string;
  let locationId: string;
  let customerAToken: string;
  let customerBToken: string;
  let customerAPersonId: string;

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
    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'TR' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'TR',
          isoAlpha3: 'TRR',
          nameI18n: { en: 'Recommendations test' },
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
    await app.get(PolicyCache).invalidate('TR');

    const admin = await signIn(app, `r13d-admin-${Date.now()}@example.com`, 'admin');
    await grantPlatformRole(prisma, admin.personId, 'super_admin');
    const vendorUser = await signIn(app, `r13d-vendor-${Date.now()}@example.com`, 'customer');
    vendorOrgId = uuidv7();
    await prisma.organization.create({
      data: {
        id: vendorOrgId,
        countryId,
        kind: OrganizationKind.VENDOR,
        legalName: 'R13D Vendor',
        displayName: 'R13D Vendor',
        status: OrganizationStatus.ACTIVE,
      },
    });
    const orgRole = await prisma.role.findUnique({ where: { code: 'org_owner' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: vendorUser.personId,
        roleId: orgRole!.id,
        scope: 'organization',
        organizationId: vendorOrgId,
        status: 'ACTIVE',
      },
    });
    await activateMarketplaceSeller(app, {
      vendorToken: vendorUser.token,
      adminToken: admin.token,
      sellerOrgId: vendorOrgId,
    });
    locationId = uuidv7();
    await prisma.location.create({
      data: {
        id: locationId,
        organizationId: vendorOrgId,
        countryId,
        kind: 'VENDOR_WAREHOUSE',
        name: 'R13D WH',
        timezone: 'UTC',
      },
    });

    const suffix = Date.now().toString(36);
    categoryName = `R13D Vitamins ${suffix}`;
    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: `r13d-brand-${suffix}`, name: 'R13D Brand' });
    const category = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/categories')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: `r13d-cat-${suffix}`, name: categoryName });

    const seedItem = async (slug: string, title: string, publish = true) => {
      const item = await request(app.getHttpServer())
        .post('/api/v1/admin/catalog/items')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          slug,
          kind: 'OTC',
          brand_id: brand.body.id,
          category_id: category.body.id,
          title,
          countries: [{ country_code: 'TR' }],
        });
      const variant = await request(app.getHttpServer())
        .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ sku_code: `${slug}-sku`, pack_size: '10' });
      const offer = await request(app.getHttpServer())
        .post('/api/v1/vendor/catalog/offers')
        .set('Authorization', `Bearer ${vendorUser.token}`)
        .send({
          variant_id: variant.body.id,
          seller_org_id: vendorOrgId,
          country_code: 'TR',
          ownership: 'VENDOR_OWNED',
          currency: 'XXX',
          cost_minor: '100',
          sell_minor: '200',
        });
      if (publish) {
        await request(app.getHttpServer())
          .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
          .set('Authorization', `Bearer ${admin.token}`)
          .send({});
        await request(app.getHttpServer())
          .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/publish`)
          .set('Authorization', `Bearer ${vendorUser.token}`)
          .send({});
        const lot = await prisma.inventoryLot.create({
          data: {
            id: uuidv7(),
            variantId: variant.body.id,
            locationId,
            ownerOrgId: vendorOrgId,
            countryId,
            lotCode: `${slug}-lot`,
            status: InventoryLotStatus.ACTIVE,
          },
        });
        await prisma.inventoryBalance.create({
          data: { id: uuidv7(), lotId: lot.id, onHand: 10, available: 10 },
        });
        await app.get(CatalogSearchService).reindexItem(item.body.id, countryId, 'en');
      }
      return { itemId: item.body.id as string, variantId: variant.body.id as string, offerId: offer.body.id as string };
    };

    primaryItemId = (await seedItem(`r13d-primary-${suffix}`, 'R13D Primary Zinc')).itemId;
    relatedItemId = (await seedItem(`r13d-related-${suffix}`, 'R13D Related Vitamin C')).itemId;
    coItemId = (await seedItem(`r13d-co-${suffix}`, 'R13D Co Mineral')).itemId;
    draftItemId = (await seedItem(`r13d-draft-${suffix}`, 'R13D Draft Item', false)).itemId;

    const left = primaryItemId < coItemId ? primaryItemId : coItemId;
    const right = primaryItemId < coItemId ? coItemId : primaryItemId;
    await prisma.analyticsOrderItemPair.create({
      data: {
        id: uuidv7(),
        countryId,
        itemAId: left,
        itemBId: right,
        pairCount: 3,
        ruleVersion: 'rules_v1',
      },
    });

    const customerA = await signIn(app, `r13d-a-${suffix}@example.com`, 'customer');
    const customerB = await signIn(app, `r13d-b-${suffix}@example.com`, 'customer');
    customerAToken = customerA.token;
    customerBToken = customerB.token;
    customerAPersonId = customerA.personId;

    await prisma.personalizationEvent.createMany({
      data: [
        {
          id: uuidv7(),
          countryId,
          personId: customerAPersonId,
          catalogItemId: relatedItemId,
          source: 'pdp',
          sourceKey: `view-${relatedItemId}-a`,
          eventKind: PersonalizationEventKind.PRODUCT_VIEWED,
          occurredAt: new Date('2026-08-01T10:00:00Z'),
        },
        {
          id: uuidv7(),
          countryId,
          personId: customerAPersonId,
          catalogItemId: primaryItemId,
          source: 'pdp',
          sourceKey: `view-${primaryItemId}-a`,
          eventKind: PersonalizationEventKind.PRODUCT_VIEWED,
          occurredAt: new Date('2026-08-02T10:00:00Z'),
        },
      ],
    });

    const wishlistOffer = await prisma.catalogOffer.findFirst({
      where: { variant: { itemId: primaryItemId }, countryId, status: OfferStatus.PUBLISHED },
    });
    await prisma.wishlistItem.create({
      data: {
        id: uuidv7(),
        personId: customerAPersonId,
        countryId,
        catalogOfferId: wishlistOffer!.id,
      },
    });
    void draftItemId;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns related and co-occurrence recommendations with deterministic ordering', async () => {
    const first = await request(app.getHttpServer()).get(
      `/api/v1/catalog/items/${primaryItemId}/recommendations?country=TR&limit=5`,
    );
    expect(first.status).toBe(200);
    expect(first.body.country_enabled).toBe(true);
    expect(first.body.rule_version).toBe('rules_v1');
    assertNoSensitivePayload(first.body);
    const relatedIds = first.body.sections.related.data.map((row: { item_id: string }) => row.item_id);
    expect(relatedIds).toContain(relatedItemId);
    expect(relatedIds).not.toContain(primaryItemId);
    expect(relatedIds).not.toContain(draftItemId);
    const coIds = first.body.sections.frequently_bought_together.data.map((row: { item_id: string }) => row.item_id);
    expect(coIds).toContain(coItemId);

    const second = await request(app.getHttpServer()).get(
      `/api/v1/catalog/items/${primaryItemId}/recommendations?country=TR&limit=5`,
    );
    expect(second.body).toEqual(first.body);
  });

  it('returns personalized recently viewed and wishlist-adjacent lists with person isolation', async () => {
    const mine = await request(app.getHttpServer())
      .get('/api/v1/me/recommendations?country_code=TR&limit=5')
      .set('Authorization', `Bearer ${customerAToken}`);
    expect(mine.status).toBe(200);
    assertNoSensitivePayload(mine.body);
    const recentIds = mine.body.sections.recently_viewed.data.map((row: { item_id: string }) => row.item_id);
    expect(recentIds[0]).toBe(primaryItemId);
    expect(recentIds).toContain(relatedItemId);
    const adjacentIds = mine.body.sections.wishlist_adjacent.data.map((row: { item_id: string }) => row.item_id);
    expect(adjacentIds).toContain(relatedItemId);
    expect(adjacentIds).not.toContain(primaryItemId);

    const other = await request(app.getHttpServer())
      .get('/api/v1/me/recommendations?country_code=TR&limit=5')
      .set('Authorization', `Bearer ${customerBToken}`);
    expect(other.status).toBe(200);
    expect(other.body.sections.recently_viewed.data).toEqual([]);
    expect(other.body.sections.wishlist_adjacent.data).toEqual([]);
  });

  it('rejects unauthenticated personal recommendations and disabled country catalog recs', async () => {
    const unauth = await request(app.getHttpServer()).get('/api/v1/me/recommendations?country_code=TR');
    expect(unauth.status).toBe(401);

    const disabled = await request(app.getHttpServer()).get(
      `/api/v1/catalog/items/${primaryItemId}/recommendations?country=XX`,
    );
    expect(disabled.status).toBe(200);
    expect(disabled.body.country_enabled).toBe(false);
    expect(disabled.body.sections.related.data).toEqual([]);
  });

  it('returns 404 for unpublished item recommendations', async () => {
    const missing = await request(app.getHttpServer()).get(
      `/api/v1/catalog/items/${draftItemId}/recommendations?country=TR`,
    );
    expect(missing.status).toBe(404);
  });
});
