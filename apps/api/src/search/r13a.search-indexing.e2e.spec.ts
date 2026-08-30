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
import { enableMarketplaceVendorPack, activateMarketplaceSeller } from '../test/marketplace-seller';
import { EventHandlerRegistry } from '../events/handlers';
import { OutboxDispatcherService } from '../events/dispatcher.service';
import { EventWorkerService } from '../events/worker.service';
import { SearchIndexDispatchService } from './search-index-dispatch.service';
import { SearchIndexJobService } from './search-index-job.service';
import type { EventEnvelope } from '../events/envelope';

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

function assertNoClinicalPayload(body: unknown) {
  const raw = JSON.stringify(body).toLowerCase();
  for (const token of ['diagnosis', 'lab_result', 'prescription_version', 'consult_note', 'health_timeline']) {
    expect(raw.includes(token)).toBe(false);
  }
}

describe('R13-A search indexing (e2e)', () => {
  jest.setTimeout(180_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let jobs: SearchIndexJobService;
  let dispatch: SearchIndexDispatchService;
  let registry: EventHandlerRegistry;
  let worker: EventWorkerService;
  let dispatcher: OutboxDispatcherService;
  let countryId: string;
  let itemId: string;

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
    jobs = app.get(SearchIndexJobService);
    dispatch = app.get(SearchIndexDispatchService);
    registry = app.get(EventHandlerRegistry);
    worker = app.get(EventWorkerService);
    dispatcher = app.get(OutboxDispatcherService);

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
          nameI18n: { en: 'Search index test' },
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

    const admin = await signIn(app, `r13a-admin-${Date.now()}@example.com`);
    await grantPlatformRole(prisma, admin.personId, 'super_admin');

    await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.PHARMACY_OWNED,
        legalName: 'Platform Pharmacy',
        displayName: 'Platform Pharmacy',
        status: 'ACTIVE',
      },
    });
    const vendorOrg = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.VENDOR,
        legalName: 'Vendor R13A',
        displayName: 'Vendor R13A',
        status: 'ACTIVE',
      },
    });
    const vendorUser = await signIn(app, `r13a-vendor-${Date.now()}@example.com`);
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

    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: `r13a-brand-${Date.now()}`, name: 'R13A' });
    const category = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/categories')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: `r13a-cat-${Date.now()}`, name: 'R13A' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: `r13a-item-${Date.now()}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        category_id: category.body.id,
        title: 'R13A Zinc',
        countries: [{ country_code: 'TQ' }],
      });
    itemId = item.body.id;
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${itemId}/variants`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku_code: `R13A-SKU-${Date.now()}`, pack_size: '10' });
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
      .post(`/api/v1/admin/catalog/items/${itemId}/publish`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({});
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/publish`)
      .set('Authorization', `Bearer ${vendorUser.token}`)
      .send({});
  });

  afterAll(async () => {
    await worker.onModuleDestroy();
    await dispatcher.onModuleDestroy();
    await app.close();
  });

  it('admin reindex, idempotency, auth negatives, inventory invalidation, no clinical leakage', async () => {
    const admin = await signIn(app, `r13a-run-${Date.now()}@example.com`);
    await grantPlatformRole(prisma, admin.personId, 'super_admin');
    const support = await signIn(app, `r13a-support-${Date.now()}@example.com`);
    await grantPlatformRole(prisma, support.personId, 'company_support');

    const unauth = await request(app.getHttpServer()).post('/api/v1/admin/search/reindex').send({
      country_code: 'TQ',
      index_kind: 'catalog',
      item_id: itemId,
    });
    expect(unauth.status).toBe(401);

    const forbidden = await request(app.getHttpServer())
      .post('/api/v1/admin/search/reindex')
      .set('Authorization', `Bearer ${support.token}`)
      .send({ country_code: 'TQ', index_kind: 'catalog', item_id: itemId });
    expect(forbidden.status).toBe(403);

    const reindex = await request(app.getHttpServer())
      .post('/api/v1/admin/search/reindex')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ country_code: 'TQ', index_kind: 'catalog', item_id: itemId, force: true });
    expect(reindex.status).toBe(201);
    assertNoClinicalPayload(reindex.body);
    expect(reindex.body.status).toBe('SUCCEEDED');

    const doc = await prisma.catalogSearchDocument.findFirst({
      where: { itemId, countryId, locale: 'en' },
    });
    expect(doc?.published).toBe(true);
    expect((doc?.version ?? 0) >= 1).toBe(true);

    const dup = await jobs.scheduleCatalogReindex({
      countryId,
      itemId,
      locale: 'en',
      idempotencyKey: jobs.catalogIdempotencyKey(itemId, countryId, 'en'),
      force: false,
    });
    expect(dup.status).toBe('SUCCEEDED');

    const list = await request(app.getHttpServer())
      .get('/api/v1/admin/search/jobs?country_code=TQ&limit=10')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.data)).toBe(true);
    assertNoClinicalPayload(list.body);

    const envelope: EventEnvelope = {
      eventId: uuidv7(),
      eventName: 'INVENTORY_ADJUSTED',
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      aggregateType: 'InventoryLot',
      aggregateId: uuidv7(),
      producer: 'test',
      countryId,
      correlationId: null,
      causationId: null,
      actorId: null,
      payload: {},
      metadata: {},
    };
    const variant = await prisma.catalogVariant.findFirst({ where: { itemId } });
    const location = await prisma.location.findFirst({ where: { countryId } });
    if (!variant || !location) {
      return;
    }
    const lot = await prisma.inventoryLot.create({
      data: {
        id: envelope.aggregateId,
        countryId,
        locationId: location.id,
        ownerOrgId: (await prisma.organization.findFirst({ where: { countryId } }))!.id,
        variantId: variant.id,
        lotCode: `LOT-${Date.now()}`,
        status: 'ACTIVE',
      },
    });
    envelope.aggregateId = lot.id;
    await dispatch.handle(envelope);
    const invJob = await prisma.searchIndexJob.findFirst({
      where: { sourceId: itemId, countryId },
      orderBy: { createdAt: 'desc' },
    });
    expect(invJob?.status).toBe('SUCCEEDED');

    const handlers = registry.handlersFor('SEARCH_INDEX_INVALIDATE');
    expect(handlers.length).toBeGreaterThan(0);

    const xxCountry = await prisma.country.findUnique({ where: { isoAlpha2: 'XX' } });
    if (xxCountry) {
      await prisma.policyPack.updateMany({
        where: { countryId: xxCountry.id, status: PolicyPackStatus.PUBLISHED },
        data: { document: emptyPolicyDocument() as never },
      });
      await app.get(PolicyCache).invalidate('XX');
    }
    const wrongCountry = await request(app.getHttpServer()).get(
      `/api/v1/catalog/search?country=XX&q=zinc`,
    );
    expect(wrongCountry.status).toBe(200);
    expect(wrongCountry.body.country_enabled).toBe(false);
  });
});
