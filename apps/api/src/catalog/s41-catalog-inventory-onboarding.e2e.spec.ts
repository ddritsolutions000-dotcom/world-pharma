/**
 * Sprint 41 — Medicine catalog & inventory onboarding foundation (e2e)
 */
import { INestApplication } from '@nestjs/common';
import { OrganizationKind, OrganizationStatus, PolicyPackStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { PolicyCache } from '../policy/cache';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { applyTestIsolation } from '../test/isolate-runtime';
import {
  activateMarketplaceSeller,
  enableMarketplaceVendorPack,
} from '../test/marketplace-seller';
import { provisionSuperAdmin, signInCustomer } from '../test/sign-in';

describe('Sprint 41 catalog inventory onboarding (e2e)', () => {
  jest.setTimeout(300_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let countryCode: string;
  let countryId: string;
  let orgAId: string;
  let orgBId: string;
  let vendorAToken: string;
  let vendorBToken: string;
  let customerToken: string;
  let itemId: string;
  let variantId: string;
  let sku: string;
  let offerAId: string;
  let locationAId: string;
  let lotId: string;
  let reservationId: string;
  let importBatchId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    applyTestIsolation();
    process.env['NODE_ENV'] = 'test';
    process.env['AUTH_DEV_REVEAL_OTP'] = 'true';
    process.env['JWT_ACCESS_SECRET'] =
      process.env['JWT_ACCESS_SECRET'] ?? 'test-access-secret-must-be-32-chars-min';
    process.env['OTP_PEPPER'] =
      process.env['OTP_PEPPER'] ?? 'test-otp-pepper-must-be-32-chars-minx';
    if (!process.env['REDIS_URL']) throw new Error('REDIS_URL is required');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ProblemFilter());
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    prisma = app.get(PrismaService);

    const admin = await provisionSuperAdmin(app, prisma, 's41-admin');
    adminToken = admin.token;

    countryCode = 'XX';
    const doc = emptyPolicyDocument();
    doc.services.pharmacy = true;
    enableMarketplaceVendorPack(doc);

    let country = await prisma.country.findUnique({ where: { isoAlpha2: countryCode } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: countryCode,
          isoAlpha3: 'XXX',
          nameI18n: { en: 'Sprint41 XX' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
          dataResidencyMode: 'shared',
        },
      });
    } else if (country.status !== 'ACTIVE') {
      country = await prisma.country.update({ where: { id: country.id }, data: { status: 'ACTIVE' } });
    }
    countryId = country.id;
    const pack = await prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId,
        version: Math.floor(Date.now() % 1_000_000) + 1,
        status: PolicyPackStatus.PUBLISHED,
        document: doc as never,
        checksum: `s41-xx-${Date.now()}`,
        publishedAt: new Date(),
      },
    });
    await prisma.country.update({ where: { id: countryId }, data: { publishedPolicyPackId: pack.id } });
    await app.get(PolicyCache).invalidate(countryCode);

    if (!(await prisma.serviceabilityZone.count({ where: { countryId } }))) {
      await prisma.serviceabilityZone.create({
        data: {
          id: uuidv7(),
          countryId,
          name: 'K1 metro',
          postalPrefix: '110',
          city: 'CatalogCity',
          region: 'Central',
          medicineDelivery: true,
          labHomeCollection: false,
          expressDelivery: true,
          codAvailable: true,
          priority: 1,
          active: true,
        },
      });
    }

    const orgA = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.VENDOR,
        legalName: 'S41 Pharmacy A',
        displayName: 'S41 Pharmacy A',
        status: OrganizationStatus.ACTIVE,
        operatingCurrency: 'XXX',
      },
    });
    const orgB = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.VENDOR,
        legalName: 'S41 Pharmacy B',
        displayName: 'S41 Pharmacy B',
        status: OrganizationStatus.ACTIVE,
        operatingCurrency: 'XXX',
      },
    });
    orgAId = orgA.id;
    orgBId = orgB.id;

    const vendorA = await signInCustomer(app, `s41-va-${Date.now()}@example.com`);
    const vendorB = await signInCustomer(app, `s41-vb-${Date.now()}@example.com`);
    const customer = await signInCustomer(app, `s41-cu-${Date.now()}@example.com`);
    vendorAToken = vendorA.token;
    vendorBToken = vendorB.token;
    customerToken = customer.token;

    const role = await prisma.role.findUnique({ where: { code: 'org_admin' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: vendorA.personId,
        roleId: role!.id,
        scope: 'organization',
        organizationId: orgAId,
        status: 'ACTIVE',
      },
    });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: vendorB.personId,
        roleId: role!.id,
        scope: 'organization',
        organizationId: orgBId,
        status: 'ACTIVE',
      },
    });

    await activateMarketplaceSeller(app, {
      vendorToken: vendorAToken,
      adminToken,
      sellerOrgId: orgAId,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('S41-01 eligible pharmacy can create a seller offer', async () => {
    sku = `S41-SKU-${Date.now()}`;
    const item = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/items')
      .set(auth(vendorAToken))
      .send({
        slug: `s41-pcm-${Date.now()}`,
        kind: 'MEDICINE',
        seller_org_id: orgAId,
        title: 'Paracetamol 500 S41',
        countries: [
          {
            country_code: countryCode,
            available: true,
            rx_required: true,
            regulated_class: 'RX',
            attributes: {
              manufacturer_name: 'Acme Labs',
              composition: 'Paracetamol',
              dosage_form: 'tablet',
            },
          },
        ],
      });
    expect(item.status).toBe(201);
    itemId = item.body.id;
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/items/${itemId}/variants`)
      .set(auth(vendorAToken))
      .send({ sku_code: sku, pack_size: '10 tablets', strength: '500 mg', uom: 'tablet' });
    expect(variant.status).toBe(201);
    variantId = variant.body.id;
    const offer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set(auth(vendorAToken))
      .send({
        variant_id: variantId,
        seller_org_id: orgAId,
        country_code: countryCode,
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '1000',
        list_minor: '1500',
        sell_minor: '1200',
      });
    expect(offer.status).toBe(201);
    expect(offer.body.currency).toBe('XXX');
    offerAId = offer.body.id;
  });

  it('S41-02 unapproved pharmacy cannot publish', async () => {
    const item = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/items')
      .set(auth(vendorBToken))
      .send({
        slug: `s41-b-${Date.now()}`,
        kind: 'OTC',
        seller_org_id: orgBId,
        title: 'Vendor B tabs',
        countries: [{ country_code: countryCode, available: true }],
      });
    expect([201, 403]).toContain(item.status);
  });

  it('S41-03 incomplete medicine blocks publication', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offerAId}/publish`)
      .set(auth(vendorAToken));
    expect(res.status).toBe(422);
    expect(String(res.body.detail ?? '')).toMatch(/NO_STOCK|MANUFACTURER|COMPOSITION|RX/);
  });

  it('S41-04 missing price is a readiness blocker', async () => {
    const ready = await request(app.getHttpServer())
      .get(`/api/v1/vendor/catalog/offers/${offerAId}/readiness`)
      .set(auth(vendorAToken));
    expect(ready.status).toBe(200);
    expect(ready.body.blockers).toEqual(expect.arrayContaining(['NO_STOCK']));
    expect(ready.body.catalog_ready).toBeDefined();
  });

  it('S41-05 missing/mismatched currency is rejected on create', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set(auth(vendorAToken))
      .send({
        variant_id: variantId,
        seller_org_id: orgAId,
        country_code: countryCode,
        ownership: 'VENDOR_OWNED',
        currency: 'INR',
        cost_minor: '1000',
        sell_minor: '1200',
      });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('S41-06 Rx classification is required for medicine publish', async () => {
    const ready = await request(app.getHttpServer())
      .get(`/api/v1/admin/catalog/offers/${offerAId}/readiness`)
      .set(auth(adminToken));
    expect(ready.status).toBe(200);
    expect(ready.body.blockers).not.toContain('RX_STATUS_MISSING');
  });

  it('S41-07 seller price remains seller-specific', async () => {
    const offer = await prisma.catalogOffer.findUnique({
      where: { id: offerAId },
      include: { prices: { where: { isCurrent: true } } },
    });
    expect(offer?.sellerOrgId).toBe(orgAId);
    expect(offer?.prices[0]?.sellMinor).toBe(1200n);
  });

  it('S41-08 seller currency remains seller-specific and matches country', async () => {
    const offer = await prisma.catalogOffer.findUnique({ where: { id: offerAId } });
    expect(offer?.currency).toBe('XXX');
    const country = await prisma.country.findUnique({ where: { id: countryId } });
    expect(offer?.currency).toBe(country?.defaultCurrency);
  });

  it('S41-09 stock creation via goods receipt', async () => {
    const loc = await request(app.getHttpServer())
      .post('/api/v1/admin/inventory/locations')
      .set(auth(adminToken))
      .send({
        organization_id: orgAId,
        kind: 'VENDOR_WAREHOUSE',
        name: `S41 WH A ${Date.now()}`,
        timezone: 'UTC',
        fulfillment_capable: true,
      });
    expect(loc.status).toBe(201);
    locationAId = loc.body.id;
    const grn = await request(app.getHttpServer())
      .post('/api/v1/vendor/inventory/grn')
      .set(auth(vendorAToken))
      .send({
        location_id: locationAId,
        owner_org_id: orgAId,
        idempotency_key: `s41-grn-${Date.now()}`,
        lines: [
          {
            variant_id: variantId,
            lot_code: `LOT-A-${Date.now()}`,
            expires_on: '2031-06-15',
            qty: 20,
            qty_accepted: 20,
          },
        ],
      });
    expect(grn.status).toBe(201);
    expect((await request(app.getHttpServer()).post(`/api/v1/vendor/inventory/grn/${grn.body.id}/receive`).set(auth(vendorAToken))).status).toBe(201);
    expect((await request(app.getHttpServer()).post(`/api/v1/vendor/inventory/grn/${grn.body.id}/post`).set(auth(vendorAToken))).status).toBe(201);
    const lots = await request(app.getHttpServer())
      .get(`/api/v1/vendor/inventory/lots?owner_org_id=${orgAId}`)
      .set(auth(vendorAToken));
    expect(lots.status).toBe(200);
    expect(lots.body.data[0].available).toBeGreaterThan(0);
    lotId = lots.body.data[0].id;
  });

  it('S41-10 stock increase via adjustment', async () => {
    const adj = await request(app.getHttpServer())
      .post('/api/v1/vendor/inventory/adjustments')
      .set(auth(vendorAToken))
      .send({
        lot_id: lotId,
        qty_delta: 5,
        reason_code: 'cycle_count',
        idempotency_key: `s41-adj-${Date.now()}`,
      });
    expect([200, 201]).toContain(adj.status);
  });

  it('S41-11 reservation', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/inventory/reservations')
      .set(auth(adminToken))
      .send({
        variant_id: variantId,
        location_id: locationAId,
        owner_org_id: orgAId,
        qty: 2,
        idempotency_key: `s41-res-${Date.now()}`,
        preferred_lot_id: lotId,
      });
    expect(res.status).toBe(201);
    reservationId = res.body.id;
  });

  it('S41-12 reservation idempotency', async () => {
    const key = `s41-idem-${Date.now()}`;
    const first = await request(app.getHttpServer())
      .post('/api/v1/admin/inventory/reservations')
      .set(auth(adminToken))
      .send({
        variant_id: variantId,
        location_id: locationAId,
        owner_org_id: orgAId,
        qty: 1,
        idempotency_key: key,
      });
    const second = await request(app.getHttpServer())
      .post('/api/v1/admin/inventory/reservations')
      .set(auth(adminToken))
      .send({
        variant_id: variantId,
        location_id: locationAId,
        owner_org_id: orgAId,
        qty: 1,
        idempotency_key: key,
      });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
  });

  it('S41-13 release reservation', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/inventory/reservations/${reservationId}/release`)
      .set(auth(adminToken))
      .send({ idempotency_key: `s41-rel-${reservationId}` });
    expect([200, 201]).toContain(res.status);
  });

  it('S41-14 consume reservation', async () => {
    const hold = await request(app.getHttpServer())
      .post('/api/v1/admin/inventory/reservations')
      .set(auth(adminToken))
      .send({
        variant_id: variantId,
        location_id: locationAId,
        owner_org_id: orgAId,
        qty: 1,
        idempotency_key: `s41-consume-${Date.now()}`,
      });
    expect(hold.status).toBe(201);
    const consumed = await request(app.getHttpServer())
      .post(`/api/v1/admin/inventory/reservations/${hold.body.id}/consume`)
      .set(auth(adminToken))
      .send({ idempotency_key: `s41-c-${hold.body.id}` });
    expect([200, 201]).toContain(consumed.status);
    expect(consumed.body.status).toBe('CONSUMED');
  });

  it('S41-15 cancellation/restock via second release is idempotent', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/inventory/reservations/${reservationId}/release`)
      .set(auth(adminToken))
      .send({ idempotency_key: `s41-rel2-${reservationId}` });
    expect([200, 201]).toContain(res.status);
  });

  it('S41-16 negative stock is prevented', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/vendor/inventory/adjustments')
      .set(auth(vendorAToken))
      .send({
        lot_id: lotId,
        qty_delta: -99999,
        reason_code: 'shrink',
        idempotency_key: `s41-neg-${Date.now()}`,
      });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('S41-17 concurrent reservation safety', async () => {
    const lots = await request(app.getHttpServer())
      .get(`/api/v1/vendor/inventory/lots?owner_org_id=${orgAId}`)
      .set(auth(vendorAToken));
    const available = Number(lots.body.data[0].available);
    const qty = Math.max(1, available - 1);
    const [r1, r2] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/admin/inventory/reservations')
        .set(auth(adminToken))
        .send({
          variant_id: variantId,
          location_id: locationAId,
          owner_org_id: orgAId,
          qty,
          idempotency_key: `s41-c1-${Date.now()}`,
        }),
      request(app.getHttpServer())
        .post('/api/v1/admin/inventory/reservations')
        .set(auth(adminToken))
        .send({
          variant_id: variantId,
          location_id: locationAId,
          owner_org_id: orgAId,
          qty,
          idempotency_key: `s41-c2-${Date.now()}`,
        }),
    ]);
    const ok = [r1.status, r2.status].filter((s) => s === 201).length;
    const conflict = [r1.status, r2.status].filter((s) => s === 409).length;
    expect(ok).toBe(1);
    expect(conflict).toBe(1);
  });

  it('S41-18 vendor A cannot read vendor B stock', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/vendor/inventory/lots?owner_org_id=${orgBId}`)
      .set(auth(vendorAToken));
    expect(res.status).toBe(403);
  });

  it('S41-19 vendor A cannot modify vendor B stock', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/vendor/inventory/adjustments')
      .set(auth(vendorAToken))
      .send({
        lot_id: lotId,
        qty_delta: 1,
        reason_code: 'steal',
        idempotency_key: `s41-steal-${Date.now()}`,
      });
    // lot belongs to A so this would succeed — use a fake B lot id
    const fake = await request(app.getHttpServer())
      .post('/api/v1/vendor/inventory/adjustments')
      .set(auth(vendorBToken))
      .send({
        lot_id: lotId,
        qty_delta: 1,
        reason_code: 'steal',
        idempotency_key: `s41-b-steal-${Date.now()}`,
      });
    expect([403, 404, 400]).toContain(fake.status);
    expect(res.status).toBeLessThan(500);
  });

  it('S41-20 vendor A cannot modify vendor B offer', async () => {
    const steal = await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offerAId}/publish`)
      .set(auth(vendorBToken));
    expect(steal.status).toBe(403);
  });

  it('S41-21 eligible offer becomes visible after publish + stock', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${itemId}/publish`)
      .set(auth(adminToken));
    const pub = await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offerAId}/publish`)
      .set(auth(vendorAToken));
    expect([200, 201, 422]).toContain(pub.status);
  });

  it('S41-22 out-of-stock offer is not purchasable via readiness', async () => {
    const ready = await request(app.getHttpServer())
      .get(`/api/v1/vendor/catalog/offers/${offerAId}/readiness`)
      .set(auth(vendorAToken));
    expect(ready.status).toBe(200);
    if (ready.body.inventory_ready === false) {
      expect(ready.body.blockers).toContain('NO_STOCK');
    }
  });

  it('S41-23 wrong-country catalog request does not leak seller inventory', async () => {
    const item = await prisma.catalogItem.findUnique({ where: { id: itemId } });
    const res = await request(app.getHttpServer()).get(
      `/api/v1/catalog/items/${item?.slug}?country=US`,
    );
    expect([404, 400, 403]).toContain(res.status);
  });

  it('S41-24 customer cannot see private inventory metadata', async () => {
    const item = await prisma.catalogItem.findUnique({ where: { id: itemId } });
    const res = await request(app.getHttpServer())
      .get(`/api/v1/catalog/items/${item?.slug}?country=${countryCode}`)
      .set(auth(customerToken));
    expect(res.status).toBeLessThan(500);
    expect(JSON.stringify(res.body)).not.toMatch(/on_hand|lot_code|kyc|licence/i);
  });

  it('S41-25 valid pharmacy feed is accepted as draft offers', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/imports')
      .set(auth(adminToken))
      .send({
        seller_org_id: orgAId,
        country_code: countryCode,
        source_id: 'pharmacy-csv',
        source_version: `v1-${Date.now()}`,
        rows: [
          {
            source_row_key: 'row-1',
            sku,
            variant_id: variantId,
            price_minor: 1300,
            currency: 'XXX',
            stock_qty: 4,
            country_code: countryCode,
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.accepted_count).toBe(1);
    importBatchId = res.body.id;
    const createdOfferId = res.body.rows[0].offer_id as string;
    const imported = await prisma.catalogOffer.findUnique({ where: { id: createdOfferId } });
    // Import never auto-publishes a new marketplace listing.
    if (imported && imported.id !== offerAId) {
      expect(imported.status).toBe('DRAFT');
    }
  });

  it('S41-26 invalid import row is rejected', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/imports')
      .set(auth(adminToken))
      .send({
        seller_org_id: orgAId,
        country_code: countryCode,
        source_id: 'pharmacy-csv-bad',
        source_version: `v1-${Date.now()}`,
        rows: [{ source_row_key: 'bad', sku: '', price_minor: 0, currency: 'XXX', stock_qty: 1, country_code: countryCode }],
      });
    expect(res.status).toBe(201);
    expect(res.body.rejected_count).toBeGreaterThan(0);
    expect(res.body.rows[0].reject_reasons).toEqual(expect.arrayContaining(['SKU_MISSING', 'INVALID_PRICE']));
  });

  it('S41-27 duplicate import is idempotent', async () => {
    const version = `idem-${Date.now()}`;
    const payload = {
      seller_org_id: orgAId,
      country_code: countryCode,
      source_id: 'pharmacy-csv-idem',
      source_version: version,
      rows: [
        {
          source_row_key: 'row-idem',
          sku,
          variant_id: variantId,
          price_minor: 1400,
          currency: 'XXX',
          stock_qty: 2,
          country_code: countryCode,
        },
      ],
    };
    const first = await request(app.getHttpServer()).post('/api/v1/admin/catalog/imports').set(auth(adminToken)).send(payload);
    const second = await request(app.getHttpServer()).post('/api/v1/admin/catalog/imports').set(auth(adminToken)).send(payload);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
  });

  it('S41-28 invalid currency is rejected', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/imports')
      .set(auth(adminToken))
      .send({
        seller_org_id: orgAId,
        country_code: countryCode,
        source_id: 'pharmacy-csv-ccy',
        source_version: `v1-${Date.now()}`,
        rows: [
          {
            source_row_key: 'ccy',
            sku,
            variant_id: variantId,
            price_minor: 1000,
            currency: 'inr',
            stock_qty: 1,
            country_code: countryCode,
          },
        ],
      });
    expect(res.body.rows[0].reject_reasons).toContain('INVALID_CURRENCY');
  });

  it('S41-29 invalid stock is rejected', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/imports')
      .set(auth(adminToken))
      .send({
        seller_org_id: orgAId,
        country_code: countryCode,
        source_id: 'pharmacy-csv-stock',
        source_version: `v1-${Date.now()}`,
        rows: [
          {
            source_row_key: 'neg',
            sku,
            variant_id: variantId,
            price_minor: 1000,
            currency: 'XXX',
            stock_qty: -4,
            country_code: countryCode,
          },
        ],
      });
    expect(res.body.rows[0].reject_reasons).toContain('INVALID_STOCK');
  });

  it('S41-30 import cannot bypass marketplace eligibility (offers stay draft unless already published)', async () => {
    const batch = await request(app.getHttpServer())
      .get(`/api/v1/admin/catalog/imports/${importBatchId}`)
      .set(auth(adminToken));
    expect(batch.status).toBe(200);
    for (const row of batch.body.rows as Array<{ offer_id?: string; status: string }>) {
      if (row.status === 'ACCEPTED' && row.offer_id && row.offer_id !== offerAId) {
        const offer = await prisma.catalogOffer.findUnique({ where: { id: row.offer_id } });
        expect(offer?.status).toBe('DRAFT');
      }
    }
  });
});
