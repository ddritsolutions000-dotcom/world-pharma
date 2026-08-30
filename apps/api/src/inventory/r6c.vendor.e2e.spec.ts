import { INestApplication } from '@nestjs/common';
import { LocationKind, OrganizationKind, OrganizationStatus, PolicyPackStatus } from '@prisma/client';
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
import { enableMarketplaceVendorPack } from '../test/marketplace-seller';

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

describe('R6-C vendor inventory ops (e2e)', () => {
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

  it('isolates inventory mutations, lots, expiry, adjustments, and audit events', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const admin = await signIn(app, `r6c-admin-${suffix}@example.com`, 'admin');
    const vendorA = await signIn(app, `r6c-va-${suffix}@example.com`);
    const vendorB = await signIn(app, `r6c-vb-${suffix}@example.com`);

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

    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'TC' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'TC',
          isoAlpha3: 'TCC',
          nameI18n: { en: 'R6C test' },
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
        checksum: `r6c-${suffix}`,
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
    await app.get(PolicyCache).invalidate('TC');

    const orgA = await orgs.create({
      countryCode: 'TC',
      kind: OrganizationKind.VENDOR,
      legalName: `R6C A ${suffix}`,
      displayName: `R6C A ${suffix}`,
      actorId: admin.personId,
    });
    const orgB = await orgs.create({
      countryCode: 'TC',
      kind: OrganizationKind.VENDOR,
      legalName: `R6C B ${suffix}`,
      displayName: `R6C B ${suffix}`,
      actorId: admin.personId,
    });
    const pharmacy = await orgs.create({
      countryCode: 'TC',
      kind: OrganizationKind.PHARMACY_OWNED,
      legalName: `R6C Pharmacy ${suffix}`,
      displayName: `R6C Pharmacy ${suffix}`,
      actorId: admin.personId,
    });
    await prisma.organization.updateMany({
      where: { id: { in: [orgA.id, orgB.id, pharmacy.id] } },
      data: { status: OrganizationStatus.ACTIVE },
    });
    await attachOrgAdmin(vendorA.personId, orgA.id);
    await attachOrgAdmin(vendorB.personId, orgB.id);

    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    const denyStoreKind = await request(app.getHttpServer())
      .post('/api/v1/vendor/inventory/locations')
      .set(auth(vendorA.token))
      .send({
        organization_id: orgA.id,
        kind: LocationKind.STORE,
        name: 'Should fail store',
      });
    expect(denyStoreKind.status).toBe(400);

    const locA = await request(app.getHttpServer())
      .post('/api/v1/vendor/inventory/locations')
      .set(auth(vendorA.token))
      .send({
        organization_id: orgA.id,
        name: `A WH ${suffix}`,
        fulfillment_capable: true,
      });
    expect(locA.status).toBe(201);
    expect(locA.body.kind).toBe(LocationKind.VENDOR_WAREHOUSE);
    expect(locA.body.organization_id).toBe(orgA.id);

    const stealLoc = await request(app.getHttpServer())
      .post('/api/v1/vendor/inventory/locations')
      .set(auth(vendorA.token))
      .send({
        organization_id: orgB.id,
        name: 'Steal B warehouse',
      });
    expect(stealLoc.status).toBe(403);

    const locB = await request(app.getHttpServer())
      .post('/api/v1/vendor/inventory/locations')
      .set(auth(vendorB.token))
      .send({
        organization_id: orgB.id,
        name: `B WH ${suffix}`,
      });
    expect(locB.status).toBe(201);

    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set(auth(admin.token))
      .send({ slug: `r6c-brand-${suffix}`, name: 'R6C Brand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set(auth(admin.token))
      .send({
        slug: `r6c-item-${suffix}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'R6C Tabs',
        countries: [{ country_code: 'TC' }],
      });
    expect(item.status).toBe(201);
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set(auth(admin.token))
      .send({ sku_code: `R6C-SKU-${suffix}`, pack_size: '10' });
    expect(variant.status).toBe(201);

    const grn = await request(app.getHttpServer())
      .post('/api/v1/vendor/inventory/grn')
      .set(auth(vendorA.token))
      .send({
        location_id: locA.body.id,
        owner_org_id: orgA.id,
        idempotency_key: `r6c-grn-${suffix}`,
        lines: [
          {
            variant_id: variant.body.id,
            lot_code: `LOT-${suffix}`,
            expires_on: '2031-06-15',
            qty: 20,
            qty_accepted: 20,
          },
        ],
      });
    expect(grn.status).toBe(201);

    const stealReceive = await request(app.getHttpServer())
      .post(`/api/v1/vendor/inventory/grn/${grn.body.id}/receive`)
      .set(auth(vendorB.token));
    expect([403, 404]).toContain(stealReceive.status);

    const stealPost = await request(app.getHttpServer())
      .post(`/api/v1/vendor/inventory/grn/${grn.body.id}/post`)
      .set(auth(vendorB.token));
    expect([403, 404]).toContain(stealPost.status);

    expect(
      (
        await request(app.getHttpServer())
          .post(`/api/v1/vendor/inventory/grn/${grn.body.id}/receive`)
          .set(auth(vendorA.token))
      ).status,
    ).toBe(201);
    expect(
      (
        await request(app.getHttpServer())
          .post(`/api/v1/vendor/inventory/grn/${grn.body.id}/post`)
          .set(auth(vendorA.token))
      ).status,
    ).toBe(201);

    const lotsA = await request(app.getHttpServer())
      .get(`/api/v1/vendor/inventory/lots?owner_org_id=${orgA.id}`)
      .set(auth(vendorA.token));
    expect(lotsA.status).toBe(200);
    expect(lotsA.body.data).toHaveLength(1);
    expect(lotsA.body.data[0].available).toBe(20);
    expect(lotsA.body.data[0].on_hand).toBe(20);
    expect(String(lotsA.body.data[0].expires_on)).toContain('2031');
    expect(lotsA.body.data[0].lot_code).toBe(`LOT-${suffix}`);
    expect(JSON.stringify(lotsA.body)).not.toMatch(/diagnosis|clinical_note|prescription_instruction|patient/i);

    const lotsCross = await request(app.getHttpServer())
      .get(`/api/v1/vendor/inventory/lots?owner_org_id=${orgA.id}`)
      .set(auth(vendorB.token));
    expect(lotsCross.status).toBe(403);

    const lotsBAsA = await request(app.getHttpServer())
      .get(`/api/v1/vendor/inventory/lots?owner_org_id=${orgB.id}`)
      .set(auth(vendorA.token));
    expect(lotsBAsA.status).toBe(403);

    const lotId = lotsA.body.data[0].id as string;

    const stealAdjust = await request(app.getHttpServer())
      .post('/api/v1/vendor/inventory/adjustments')
      .set(auth(vendorB.token))
      .send({
        lot_id: lotId,
        qty_delta: -1,
        reason_code: 'steal',
        idempotency_key: `r6c-steal-adj-${suffix}`,
      });
    expect([403, 404]).toContain(stealAdjust.status);

    const adjust = await request(app.getHttpServer())
      .post('/api/v1/vendor/inventory/adjustments')
      .set(auth(vendorA.token))
      .send({
        lot_id: lotId,
        qty_delta: -3,
        reason_code: 'cycle_count',
        idempotency_key: `r6c-adj-${suffix}`,
      });
    expect(adjust.status).toBe(201);
    expect(adjust.body.available).toBe(17);

    const movements = await request(app.getHttpServer())
      .get(`/api/v1/vendor/inventory/movements?owner_org_id=${orgA.id}`)
      .set(auth(vendorA.token));
    expect(movements.status).toBe(200);
    expect(movements.body.data.some((row: { reason_code: string }) => row.reason_code === 'cycle_count')).toBe(
      true,
    );
    expect(JSON.stringify(movements.body)).not.toMatch(/diagnosis|clinical_note|phi/i);

    const movesCross = await request(app.getHttpServer())
      .get(`/api/v1/vendor/inventory/movements?owner_org_id=${orgA.id}`)
      .set(auth(vendorB.token));
    expect(movesCross.status).toBe(403);

    const locA2 = await request(app.getHttpServer())
      .post('/api/v1/vendor/inventory/locations')
      .set(auth(vendorA.token))
      .send({ organization_id: orgA.id, name: `A WH2 ${suffix}` });
    expect(locA2.status).toBe(201);

    const stealXfer = await request(app.getHttpServer())
      .post('/api/v1/vendor/inventory/transfers')
      .set(auth(vendorB.token))
      .send({
        from_location_id: locA.body.id,
        to_location_id: locA2.body.id,
        owner_org_id: orgA.id,
        idempotency_key: `r6c-steal-xfer-${suffix}`,
        lines: [{ variant_id: variant.body.id, source_lot_id: lotId, qty: 1 }],
      });
    expect(stealXfer.status).toBe(403);

    const crossOrgXfer = await request(app.getHttpServer())
      .post('/api/v1/vendor/inventory/transfers')
      .set(auth(vendorA.token))
      .send({
        from_location_id: locA.body.id,
        to_location_id: locB.body.id,
        owner_org_id: orgA.id,
        idempotency_key: `r6c-cross-xfer-${suffix}`,
        lines: [{ variant_id: variant.body.id, source_lot_id: lotId, qty: 1 }],
      });
    expect([400, 403, 404, 409, 422]).toContain(crossOrgXfer.status);

    const transfer = await request(app.getHttpServer())
      .post('/api/v1/vendor/inventory/transfers')
      .set(auth(vendorA.token))
      .send({
        from_location_id: locA.body.id,
        to_location_id: locA2.body.id,
        owner_org_id: orgA.id,
        idempotency_key: `r6c-xfer-${suffix}`,
        lines: [{ variant_id: variant.body.id, source_lot_id: lotId, qty: 2 }],
      });
    expect(transfer.status).toBe(201);

    const stealReserve = await request(app.getHttpServer())
      .post(`/api/v1/vendor/inventory/transfers/${transfer.body.id}/reserve`)
      .set(auth(vendorB.token));
    expect([403, 404]).toContain(stealReserve.status);

    for (const action of ['reserve', 'dispatch', 'receive'] as const) {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/vendor/inventory/transfers/${transfer.body.id}/${action}`)
        .set(auth(vendorA.token));
      expect(res.status).toBe(201);
    }

    const pharmacyLocDeny = await request(app.getHttpServer())
      .post('/api/v1/vendor/inventory/locations')
      .set(auth(vendorA.token))
      .send({
        organization_id: pharmacy.id,
        name: 'Pharmacy impersonation',
      });
    expect(pharmacyLocDeny.status).toBe(403);

    const adjustedEvents = await prisma.outboxEvent.findMany({
      where: {
        type: 'INVENTORY_ADJUSTED',
        aggregateId: lotId,
      },
      take: 5,
    });
    expect(adjustedEvents.length).toBeGreaterThan(0);
    expect(JSON.stringify(adjustedEvents)).not.toMatch(/diagnosis|clinical_note|patient_id/i);

    const receivedEvents = await prisma.outboxEvent.findMany({
      where: { type: 'INVENTORY_RECEIVED', aggregateId: grn.body.id },
      take: 5,
    });
    expect(receivedEvents.length).toBeGreaterThan(0);
  });
});
