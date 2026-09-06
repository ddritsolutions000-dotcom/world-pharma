import { INestApplication } from '@nestjs/common';
import { CatalogLifecycle, OfferStatus, OrganizationKind, OrganizationStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { SessionService } from '../identity/session.service';
import { ProblemFilter } from '../common/problem.filter';
import { applyTestIsolation } from '../test/isolate-runtime';

async function issueToken(
  app: INestApplication,
  prisma: PrismaService,
  personId: string,
  audience: 'customer' | 'admin',
  roles: string[] = [],
) {
  const account = await prisma.account.findUniqueOrThrow({ where: { personId } });
  const issued = await app.get(SessionService).issue({
    personId,
    accountId: account.id,
    audience,
    roles,
  });
  return issued.accessToken;
}

async function grantRole(prisma: PrismaService, personId: string, roleCode: string) {
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
  await prisma.membership.create({
    data: {
      id: uuidv7(),
      personId,
      roleId: role.id,
      scope: 'platform',
      status: 'ACTIVE',
    },
  });
}

async function seedPerson(prisma: PrismaService, email: string, countryId: string) {
  const personId = uuidv7();
  await prisma.person.create({
    data: {
      id: personId,
      status: 'ACTIVE',
      primaryCountryId: countryId,
      account: { create: { id: uuidv7(), status: 'ACTIVE' } },
      identifiers: {
        create: {
          id: uuidv7(),
          type: 'EMAIL',
          valueNormalized: email.toLowerCase(),
          verifiedAt: new Date(),
        },
      },
    },
  });
  return personId;
}

async function seedPublishedItem(
  prisma: PrismaService,
  input: {
    suffix: string;
    countryId: string;
    vendorId: string;
    brandId: string;
    categoryId: string;
    title: string;
    priceMinor: bigint;
    currency?: string;
  },
) {
  const item = await prisma.catalogItem.create({
    data: {
      id: uuidv7(),
      slug: `sub-${input.suffix}`,
      kind: 'OTC',
      brandId: input.brandId,
      categoryId: input.categoryId,
      createdByOrgId: input.vendorId,
      status: CatalogLifecycle.PUBLISHED,
      translations: {
        create: { id: uuidv7(), locale: 'en', title: input.title, description: input.title },
      },
      countries: {
        create: { id: uuidv7(), countryId: input.countryId, available: true, rxRequired: false },
      },
    },
  });
  const variant = await prisma.catalogVariant.create({
    data: { id: uuidv7(), itemId: item.id, skuCode: `SKU-${input.suffix}`, packSize: '10' },
  });
  const offer = await prisma.catalogOffer.create({
    data: {
      id: uuidv7(),
      variantId: variant.id,
      sellerOrgId: input.vendorId,
      countryId: input.countryId,
      ownership: 'VENDOR_OWNED',
      status: OfferStatus.PUBLISHED,
      currency: input.currency ?? 'XXX',
      publishedAt: new Date(),
    },
  });
  await prisma.priceVersion.create({
    data: {
      id: uuidv7(),
      offerId: offer.id,
      currency: input.currency ?? 'XXX',
      sellMinor: input.priceMinor,
      costMinor: input.priceMinor,
      isCurrent: true,
      version: 1,
      validFrom: new Date(),
    },
  });
  return item;
}

describe('Medicine substitute configured edges (e2e)', () => {
  jest.setTimeout(120_000);
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    applyTestIsolation();
    process.env['AUTH_DEV_REVEAL_OTP'] = 'true';
    if (!process.env['REDIS_URL']) {
      throw new Error('REDIS_URL is required');
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ProblemFilter());
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns configured substitute on public lookup and excludes inactive/wrong-country edges', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const countryXx = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'XX' } });
    const countryOther =
      (await prisma.country.findUnique({ where: { isoAlpha2: 'US' } }))
      ?? (await prisma.country.findUnique({ where: { isoAlpha2: 'AE' } }))
      ?? countryXx;

    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: countryXx.id,
        kind: OrganizationKind.VENDOR,
        legalName: `Sub Vendor ${suffix}`,
        displayName: `Sub Vendor ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
    });
    const brand = await prisma.catalogBrand.create({
      data: { id: uuidv7(), slug: `sub-brand-${suffix}`, name: 'Sub Brand' },
    });
    const category = await prisma.catalogCategory.create({
      data: { id: uuidv7(), slug: `sub-cat-${suffix}`, name: 'Substitute Cat' },
    });

    const categoryB = await prisma.catalogCategory.create({
      data: { id: uuidv7(), slug: `sub-cat-b-${suffix}`, name: 'Substitute Cat B' },
    });

    const original = await seedPublishedItem(prisma, {
      suffix: `orig-${suffix}`,
      countryId: countryXx.id,
      vendorId: vendor.id,
      brandId: brand.id,
      categoryId: category.id,
      title: 'Original Med',
      priceMinor: 500n,
    });
    const configuredSub = await seedPublishedItem(prisma, {
      suffix: `cfg-${suffix}`,
      countryId: countryXx.id,
      vendorId: vendor.id,
      brandId: brand.id,
      categoryId: category.id,
      title: 'Configured Substitute',
      priceMinor: 300n,
    });
    const inactiveSub = await seedPublishedItem(prisma, {
      suffix: `inactive-${suffix}`,
      countryId: countryXx.id,
      vendorId: vendor.id,
      brandId: brand.id,
      categoryId: categoryB.id,
      title: 'Inactive Substitute',
      priceMinor: 200n,
    });
    const otherCountrySub = await seedPublishedItem(prisma, {
      suffix: `other-${suffix}`,
      countryId: countryOther.id,
      vendorId: vendor.id,
      brandId: brand.id,
      categoryId: category.id,
      title: 'India Only Substitute',
      priceMinor: 250n,
    });

    const adminPerson = await seedPerson(prisma, `sub-admin-${suffix}@example.com`, countryXx.id);
    await grantRole(prisma, adminPerson, 'company_operations');
    const adminToken = await issueToken(app, prisma, adminPerson, 'admin', ['company_operations']);

    const unauthorized = await seedPerson(prisma, `sub-norole-${suffix}@example.com`, countryXx.id);
    const unauthorizedToken = await issueToken(app, prisma, unauthorized, 'customer', []);

    const createRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/substitutes/edges?country_code=XX`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        from_item_id: original.id,
        to_item_id: configuredSub.id,
        relationship_type: 'GENERIC',
        reason: 'admin configured',
        strength: 200,
      });
    expect(createRes.status).toBe(200);

    await prisma.medicineSubstituteEdge.create({
      data: {
        id: uuidv7(),
        countryId: countryXx.id,
        fromItemId: original.id,
        toItemId: inactiveSub.id,
        relationshipType: 'GENERIC',
        strength: 50,
        active: false,
        reason: 'inactive test',
        createdById: adminPerson,
      },
    });
    await prisma.medicineSubstituteEdge.create({
      data: {
        id: uuidv7(),
        countryId: countryOther.id,
        fromItemId: original.id,
        toItemId: otherCountrySub.id,
        relationshipType: 'GENERIC',
        strength: 50,
        active: true,
        reason: 'wrong country',
        createdById: adminPerson,
      },
    });

    const denied = await request(app.getHttpServer())
      .post(`/api/v1/admin/substitutes/edges?country_code=XX`)
      .set('Authorization', `Bearer ${unauthorizedToken}`)
      .send({
        from_item_id: original.id,
        to_item_id: configuredSub.id,
        relationship_type: 'GENERIC',
        reason: 'should fail',
      });
    expect(denied.status).toBe(403);

    const publicRes = await request(app.getHttpServer()).get(
      `/api/v1/public/catalog/items/${original.id}/substitutes?country_code=XX`,
    );
    expect(publicRes.status).toBe(200);
    const ids = (publicRes.body.substitutes as Array<{ id: string; reason?: string }>).map((row) => row.id);
    expect(ids[0]).toBe(configuredSub.id);
    expect(ids).toContain(configuredSub.id);
    expect(ids).not.toContain(inactiveSub.id);
    if (countryOther.id !== countryXx.id) {
      expect(ids).not.toContain(otherCountrySub.id);
    }
    expect(new Set(ids).size).toBe(ids.length);
    expect(publicRes.body.substitutes.every((row: { reason?: string }) => row.reason === undefined)).toBe(true);

    await prisma.medicineSubstituteEdge.create({
      data: {
        id: uuidv7(),
        countryId: countryXx.id,
        fromItemId: original.id,
        toItemId: configuredSub.id,
        relationshipType: 'BRAND',
        strength: 10,
        active: true,
        reason: 'duplicate edge type',
        createdById: adminPerson,
      },
    });

    const publicAgain = await request(app.getHttpServer()).get(
      `/api/v1/public/catalog/items/${original.id}/substitutes?country_code=XX`,
    );
    expect(publicAgain.status).toBe(200);
    const dupIds = (publicAgain.body.substitutes as Array<{ id: string }>).map((row) => row.id);
    expect(dupIds.filter((id) => id === configuredSub.id)).toHaveLength(1);
  });
});
