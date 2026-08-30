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

describe('R6-B vendor catalog & commercial rules (e2e)', () => {
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

  it('creates catalog offers for own vendor only and isolates commercial rules', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const admin = await signIn(app, `r6b-admin-${suffix}@example.com`, 'admin');
    const vendorA = await signIn(app, `r6b-va-${suffix}@example.com`);
    const vendorB = await signIn(app, `r6b-vb-${suffix}@example.com`);

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

    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'TB' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'TB',
          isoAlpha3: 'TBB',
          nameI18n: { en: 'R6B test' },
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
        checksum: `r6b-${suffix}`,
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
    await app.get(PolicyCache).invalidate('TB');

    const orgA = await orgs.create({
      countryCode: 'TB',
      kind: OrganizationKind.VENDOR,
      legalName: `R6B A ${suffix}`,
      displayName: `R6B A ${suffix}`,
      actorId: admin.personId,
    });
    const orgB = await orgs.create({
      countryCode: 'TB',
      kind: OrganizationKind.VENDOR,
      legalName: `R6B B ${suffix}`,
      displayName: `R6B B ${suffix}`,
      actorId: admin.personId,
    });
    await prisma.organization.updateMany({
      where: { id: { in: [orgA.id, orgB.id] } },
      data: { status: OrganizationStatus.ACTIVE },
    });
    await attachOrgAdmin(vendorA.personId, orgA.id);
    await attachOrgAdmin(vendorB.personId, orgB.id);

    await activateMarketplaceSeller(app, {
      vendorToken: vendorA.token,
      adminToken: admin.token,
      sellerOrgId: orgA.id,
    });

    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/rules')
      .set(auth(admin.token))
      .send({ country_code: 'TB', take_bps: 300, take_flat_minor: '0', priority: 1 });
    await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/rules')
      .set(auth(admin.token))
      .send({
        country_code: 'TB',
        seller_org_id: orgA.id,
        take_bps: 400,
        take_flat_minor: '10',
        priority: 5,
      });
    await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/rules')
      .set(auth(admin.token))
      .send({
        country_code: 'TB',
        seller_org_id: orgB.id,
        take_bps: 999,
        take_flat_minor: '99',
        priority: 9,
      });

    const rulesA = await request(app.getHttpServer())
      .get(`/api/v1/vendor/catalog/commercial-rules?seller_org_id=${orgA.id}`)
      .set(auth(vendorA.token));
    expect(rulesA.status).toBe(200);
    expect(Array.isArray(rulesA.body.data)).toBe(true);
    expect(rulesA.body.data.every((row: { take_bps: number }) => row.take_bps !== 999)).toBe(true);
    expect(rulesA.body.data.some((row: { seller_org_id: string | null }) => row.seller_org_id === orgA.id)).toBe(
      true,
    );
    expect(JSON.stringify(rulesA.body)).not.toMatch(/diagnosis|clinical_note|prescription/i);

    const rulesCross = await request(app.getHttpServer())
      .get(`/api/v1/vendor/catalog/commercial-rules?seller_org_id=${orgB.id}`)
      .set(auth(vendorA.token));
    expect(rulesCross.status).toBe(403);

    const item = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/items')
      .set(auth(vendorA.token))
      .send({
        slug: `r6b-item-${suffix}`,
        kind: 'OTC',
        seller_org_id: orgA.id,
        title: 'R6B Vitamin',
        countries: [{ country_code: 'TB' }],
      });
    expect(item.status).toBe(201);
    expect(item.body.id).toBeTruthy();

    const stealItem = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/items')
      .set(auth(vendorA.token))
      .send({
        slug: `r6b-steal-${suffix}`,
        kind: 'OTC',
        seller_org_id: orgB.id,
        title: 'Steal',
        countries: [{ country_code: 'TB' }],
      });
    expect(stealItem.status).toBe(403);

    const variant = await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/items/${item.body.id}/variants`)
      .set(auth(vendorA.token))
      .send({ sku_code: `R6B-${suffix}`, pack_size: '10' });
    expect(variant.status).toBe(201);

    const offer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set(auth(vendorA.token))
      .send({
        variant_id: variant.body.id,
        seller_org_id: orgA.id,
        country_code: 'TB',
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '250',
      });
    expect(offer.status).toBe(201);

    const stealOffer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set(auth(vendorA.token))
      .send({
        variant_id: variant.body.id,
        seller_org_id: orgB.id,
        country_code: 'TB',
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '250',
      });
    expect(stealOffer.status).toBe(403);

    const stealPublish = await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/publish`)
      .set(auth(vendorB.token));
    expect(stealPublish.status).toBe(403);

    const publish = await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/publish`)
      .set(auth(vendorA.token));
    expect(publish.status).toBeLessThan(400);

    const price = await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/prices`)
      .set(auth(vendorA.token))
      .send({ cost_minor: '110', sell_minor: '260' });
    expect(price.status).toBeLessThan(400);

    const stealPrice = await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/prices`)
      .set(auth(vendorB.token))
      .send({ cost_minor: '1', sell_minor: '2' });
    expect(stealPrice.status).toBe(403);

    const list = await request(app.getHttpServer())
      .get(`/api/v1/vendor/catalog/offers?seller_org_id=${orgA.id}`)
      .set(auth(vendorA.token));
    expect(list.status).toBe(200);
    expect(list.body.data.some((row: { id: string }) => row.id === offer.body.id)).toBe(true);
    expect(list.body.data[0]).toHaveProperty('sell_minor');
    expect(list.body.data[0]).not.toHaveProperty('sellMinor');

    const finance = await request(app.getHttpServer())
      .get('/api/v1/admin/finance/dashboard')
      .set(auth(vendorA.token));
    expect(finance.status).toBeGreaterThanOrEqual(400);
  });
});
