import { INestApplication } from '@nestjs/common';
import { LoyaltyProgramStatus, OfferStatus, OrganizationKind, OrganizationStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { SessionService } from '../identity/session.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PolicyCache } from '../policy/cache';
import { ProblemFilter } from '../common/problem.filter';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { applyTestIsolation } from '../test/isolate-runtime';

async function issueToken(app: INestApplication, prisma: PrismaService, personId: string) {
  const account = await prisma.account.findUniqueOrThrow({ where: { personId } });
  const issued = await app.get(SessionService).issue({
    personId,
    accountId: account.id,
    audience: 'customer',
    roles: [],
  });
  return { token: issued.accessToken, personId };
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

describe('R12-E wishlist + loyalty', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    applyTestIsolation();
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

  it('wishlist CRUD, isolation, loyalty pack gating', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const country = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'XX' } });
    const doc = emptyPolicyDocument();
    doc.services.pharmacy = true;
    doc.crm.loyalty = { enabled: false };
    await prisma.policyPack.updateMany({
      where: { countryId: country.id, status: 'PUBLISHED' },
      data: { document: doc as never },
    });
    await app.get(PolicyCache).invalidate('XX');

    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: `Wishlist Vendor ${suffix}`,
        displayName: `Wishlist Vendor ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
    });
    const brand = await prisma.catalogBrand.create({
      data: { id: uuidv7(), slug: `wl-brand-${suffix}`, name: 'Wishlist Brand' },
    });
    const item = await prisma.catalogItem.create({
      data: {
        id: uuidv7(),
        slug: `wl-item-${suffix}`,
        kind: 'OTC',
        brandId: brand.id,
        createdByOrgId: vendor.id,
        status: 'PUBLISHED',
        translations: {
          create: { id: uuidv7(), locale: 'en', title: 'Wishlist Zinc', description: 'Test item' },
        },
      },
    });
    const variant = await prisma.catalogVariant.create({
      data: {
        id: uuidv7(),
        itemId: item.id,
        skuCode: `WL-SKU-${suffix}`,
        packSize: '10',
      },
    });
    const offer = await prisma.catalogOffer.create({
      data: {
        id: uuidv7(),
        variantId: variant.id,
        sellerOrgId: vendor.id,
        countryId: country.id,
        ownership: 'VENDOR_OWNED',
        status: OfferStatus.PUBLISHED,
        currency: 'XXX',
        publishedAt: new Date(),
      },
    });
    await prisma.priceVersion.create({
      data: {
        id: uuidv7(),
        offerId: offer.id,
        version: 1,
        currency: 'XXX',
        costMinor: 100n,
        sellMinor: 250n,
        validFrom: new Date(),
        isCurrent: true,
      },
    });

    const customerA = await seedPerson(prisma, `wl-a-${suffix}@example.com`, country.id);
    const customerB = await seedPerson(prisma, `wl-b-${suffix}@example.com`, country.id);
    const userA = await issueToken(app, prisma, customerA);
    const userB = await issueToken(app, prisma, customerB);

    const empty = await request(app.getHttpServer())
      .get('/api/v1/me/wishlist?country_code=XX')
      .set('Authorization', `Bearer ${userA.token}`);
    expect(empty.status).toBe(200);
    expect(empty.body.data).toEqual([]);

    const add = await request(app.getHttpServer())
      .post('/api/v1/me/wishlist')
      .set('Authorization', `Bearer ${userA.token}`)
      .set('Idempotency-Key', `wl-add-${suffix}`)
      .send({ country_code: 'XX', catalog_offer_id: offer.id });
    expect(add.status).toBe(201);
    expect(add.body.duplicate).toBe(false);
    expect(add.body.catalog_offer_id).toBe(offer.id);

    const dup = await request(app.getHttpServer())
      .post('/api/v1/me/wishlist')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ country_code: 'XX', catalog_offer_id: offer.id });
    expect(dup.status).toBe(201);
    expect(dup.body.duplicate).toBe(true);

    const list = await request(app.getHttpServer())
      .get('/api/v1/me/wishlist?country_code=XX')
      .set('Authorization', `Bearer ${userA.token}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);

    const cross = await request(app.getHttpServer())
      .get('/api/v1/me/wishlist?country_code=XX')
      .set('Authorization', `Bearer ${userB.token}`);
    expect(cross.status).toBe(200);
    expect(cross.body.data).toHaveLength(0);

    const unauth = await request(app.getHttpServer()).get('/api/v1/me/wishlist?country_code=XX');
    expect(unauth.status).toBe(401);

    const badOffer = await request(app.getHttpServer())
      .post('/api/v1/me/wishlist')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ country_code: 'XX', catalog_offer_id: uuidv7() });
    expect(badOffer.status).toBe(404);

    const removeDenied = await request(app.getHttpServer())
      .delete(`/api/v1/me/wishlist?country_code=XX&catalog_offer_id=${offer.id}`)
      .set('Authorization', `Bearer ${userB.token}`);
    expect(removeDenied.status).toBe(404);

    const removeOk = await request(app.getHttpServer())
      .delete(`/api/v1/me/wishlist?country_code=XX&catalog_offer_id=${offer.id}`)
      .set('Authorization', `Bearer ${userA.token}`);
    expect(removeOk.status).toBe(200);
    expect(removeOk.body.removed).toBe(true);

    const balanceOff = await request(app.getHttpServer())
      .get('/api/v1/me/loyalty/balance?country_code=XX')
      .set('Authorization', `Bearer ${userA.token}`);
    expect(balanceOff.status).toBe(200);
    expect(balanceOff.body.enabled).toBe(false);

    const ledgerOff = await request(app.getHttpServer())
      .get('/api/v1/me/loyalty/ledger?country_code=XX')
      .set('Authorization', `Bearer ${userA.token}`);
    expect(ledgerOff.status).toBe(403);

    doc.crm.loyalty = { enabled: true };
    await prisma.policyPack.updateMany({
      where: { countryId: country.id, status: 'PUBLISHED' },
      data: { document: doc as never },
    });
    await app.get(PolicyCache).invalidate('XX');

    await prisma.loyaltyProgram.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        code: `WL-${suffix}`,
        name: 'Wishlist Test Program',
        status: LoyaltyProgramStatus.ACTIVE,
        pointsPerCurrencyMinor: 100,
      },
    });

    const balanceOn = await request(app.getHttpServer())
      .get('/api/v1/me/loyalty/balance?country_code=XX')
      .set('Authorization', `Bearer ${userA.token}`);
    expect(balanceOn.status).toBe(200);
    expect(balanceOn.body.enabled).toBe(true);
    expect(balanceOn.body.balance_points).toBe(0);

    const orderId = uuidv7();
    const loyalty = app.get(LoyaltyService);
    const accrue = await loyalty.accrueForPaidOrder({
      orderId,
      personId: customerA,
      countryId: country.id,
      countryCode: 'XX',
      totalMinor: 500n,
    });
    expect(accrue.accrued).toBe(true);
    expect('points' in accrue && accrue.points).toBe(5);

    const dupAccrue = await loyalty.accrueForPaidOrder({
      orderId,
      personId: customerA,
      countryId: country.id,
      countryCode: 'XX',
      totalMinor: 500n,
    });
    expect('duplicate' in dupAccrue && dupAccrue.duplicate).toBe(true);

    const balanceAfter = await request(app.getHttpServer())
      .get('/api/v1/me/loyalty/balance?country_code=XX')
      .set('Authorization', `Bearer ${userA.token}`);
    expect(balanceAfter.body.balance_points).toBe(5);
  });
});
