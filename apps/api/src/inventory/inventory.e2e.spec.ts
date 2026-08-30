import { INestApplication } from '@nestjs/common';
import { LocationKind, OrganizationKind, PolicyPackStatus } from '@prisma/client';
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

async function signIn(app: INestApplication, email: string): Promise<{ token: string; personId: string }> {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({
      challenge_id: requested.body.challenge_id,
      code: requested.body.dev_code,
      audience: 'admin',
    });
  return { token: verified.body.access_token, personId: verified.body.person_id };
}

describe('inventory warehouse (e2e)', () => {
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

  it('posts GRN, prevents oversell, isolates vendors, and transfers same-country stock', async () => {
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
          nameI18n: { en: 'Inventory test' },
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
          checksum: 'inv-test',
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

    const vendorA = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: 'Inv Vendor A',
        displayName: 'Inv Vendor A',
        status: 'ACTIVE',
      },
    });
    const vendorB = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: 'Inv Vendor B',
        displayName: 'Inv Vendor B',
        status: 'ACTIVE',
      },
    });

    const admin = await signIn(app, `inv-admin-${Date.now()}@example.com`);
    const role = await prisma.role.findUnique({ where: { code: 'super_admin' } });
    await prisma.membership.create({
      data: { id: uuidv7(), personId: admin.personId, roleId: role!.id, scope: 'platform', status: 'ACTIVE' },
    });
    const vendorUser = await signIn(app, `inv-vendor-${Date.now()}@example.com`);
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
    const otherVendor = await signIn(app, `inv-vendor-b-${Date.now()}@example.com`);
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

    const locA1 = await request(app.getHttpServer())
      .post('/api/v1/admin/inventory/locations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        organization_id: vendorA.id,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'A Warehouse 1',
        timezone: 'UTC',
      });
    expect(locA1.status).toBe(201);
    const locA2 = await request(app.getHttpServer())
      .post('/api/v1/admin/inventory/locations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        organization_id: vendorA.id,
        kind: LocationKind.STORE,
        name: 'A Store 1',
        timezone: 'UTC',
      });
    expect(locA2.status).toBe(201);

    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: `inv-brand-${Date.now()}`, name: 'InvBrand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: `inv-zinc-${Date.now()}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'Zinc tabs',
        countries: [{ country_code: 'TQ' }],
      });
    expect(item.status).toBe(201);
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku_code: `INV-SKU-${Date.now()}`, pack_size: '10' });
    expect(variant.status).toBe(201);
    await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set('Authorization', `Bearer ${vendorUser.token}`)
      .send({
        variant_id: variant.body.id,
        seller_org_id: vendorA.id,
        country_code: 'TQ',
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '200',
      });

    const grn = await request(app.getHttpServer())
      .post('/api/v1/vendor/inventory/grn')
      .set('Authorization', `Bearer ${vendorUser.token}`)
      .send({
        location_id: locA1.body.id,
        owner_org_id: vendorA.id,
        idempotency_key: `grn-${Date.now()}`,
        lines: [
          {
            variant_id: variant.body.id,
            lot_code: 'LOT-A',
            expires_on: '2030-01-01',
            qty: 10,
            qty_accepted: 10,
          },
        ],
      });
    expect(grn.status).toBe(201);
    const posted = await request(app.getHttpServer())
      .post(`/api/v1/vendor/inventory/grn/${grn.body.id}/post`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    expect(posted.status).toBe(201);

    const lots = await request(app.getHttpServer())
      .get(`/api/v1/vendor/inventory/lots?owner_org_id=${vendorA.id}`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    expect(lots.status).toBe(200);
    expect(lots.body.data[0].available).toBe(10);
    expect(lots.body.data[0].on_hand).toBe(10);
    const lotId = lots.body.data[0].id as string;

    const steal = await request(app.getHttpServer())
      .get(`/api/v1/vendor/inventory/lots?owner_org_id=${vendorA.id}`)
      .set('Authorization', `Bearer ${otherVendor.token}`);
    expect(steal.status).toBe(403);

    const [r1, r2] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/admin/inventory/reservations')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          variant_id: variant.body.id,
          location_id: locA1.body.id,
          owner_org_id: vendorA.id,
          qty: 8,
          idempotency_key: `res-a-${Date.now()}`,
        }),
      request(app.getHttpServer())
        .post('/api/v1/admin/inventory/reservations')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          variant_id: variant.body.id,
          location_id: locA1.body.id,
          owner_org_id: vendorA.id,
          qty: 8,
          idempotency_key: `res-b-${Date.now()}`,
        }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);

    const dup = await request(app.getHttpServer())
      .post('/api/v1/admin/inventory/reservations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        variant_id: variant.body.id,
        location_id: locA1.body.id,
        owner_org_id: vendorA.id,
        qty: 1,
        idempotency_key: r1.status === 201 ? r1.body.idempotencyKey ?? r1.body.idempotency_key : r2.body.idempotencyKey,
      });
    expect(dup.status).toBe(201);

    const winner = r1.status === 201 ? r1 : r2;
    await request(app.getHttpServer())
      .post(`/api/v1/admin/inventory/reservations/${winner.body.id}/release`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ idempotency_key: `rel-${winner.body.id}` });

    const transfer = await request(app.getHttpServer())
      .post('/api/v1/vendor/inventory/transfers')
      .set('Authorization', `Bearer ${vendorUser.token}`)
      .send({
        from_location_id: locA1.body.id,
        to_location_id: locA2.body.id,
        owner_org_id: vendorA.id,
        idempotency_key: `xfer-${Date.now()}`,
        lines: [{ variant_id: variant.body.id, source_lot_id: lotId, qty: 2 }],
      });
    expect(transfer.status).toBe(201);
    expect(
      (
        await request(app.getHttpServer())
          .post(`/api/v1/vendor/inventory/transfers/${transfer.body.id}/reserve`)
          .set('Authorization', `Bearer ${vendorUser.token}`)
      ).status,
    ).toBe(201);
    expect(
      (
        await request(app.getHttpServer())
          .post(`/api/v1/vendor/inventory/transfers/${transfer.body.id}/dispatch`)
          .set('Authorization', `Bearer ${vendorUser.token}`)
      ).status,
    ).toBe(201);
    const received = await request(app.getHttpServer())
      .post(`/api/v1/vendor/inventory/transfers/${transfer.body.id}/receive`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    expect(received.status).toBe(201);
    expect(received.body.status).toBe('RECEIVED');

    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);
    const offer = await prisma.catalogOffer.findFirst({ where: { variantId: variant.body.id } });
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offer!.id}/publish`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    const product = await request(app.getHttpServer()).get(
      `/api/v1/catalog/items/${item.body.slug}?country=TQ`,
    );
    expect(product.status).toBe(200);
    expect(product.body.inventory.available).toBe(true);
    expect(JSON.stringify(product.body)).not.toMatch(/on_hand|lot_code|warehouse/i);

    const events = await prisma.outboxEvent.findMany({
      where: { type: { in: ['INVENTORY_RECEIVED', 'INVENTORY_RESERVED', 'INVENTORY_TRANSFERRED'] } },
    });
    expect(events.length).toBeGreaterThan(0);
  });
});
