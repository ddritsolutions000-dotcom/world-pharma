import { INestApplication } from '@nestjs/common';
import {
  InventoryLotStatus,
  LocationKind,
  OrganizationKind,
  OrganizationStatus,
  PolicyPackStatus,
} from '@prisma/client';
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

const PHI_LEAK =
  /diagnosis|clinical_note|prescription_instruction|dosage|encounter|patient_id|customer_person_id|raw_clinical|fhir/i;

describe('R6-D vendor order detail & fulfillment (e2e)', () => {
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

  it('isolates vendor orders, returns Rx-safe DTO, and authorizes fulfillment', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const admin = await signIn(app, `r6d-admin-${suffix}@example.com`, 'customer');
    const vendorA = await signIn(app, `r6d-va-${suffix}@example.com`);
    const vendorB = await signIn(app, `r6d-vb-${suffix}@example.com`);
    const customer = await signIn(app, `r6d-cust-${suffix}@example.com`);

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

    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'TD' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'TD',
          isoAlpha3: 'TDD',
          nameI18n: { en: 'R6D test' },
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
    doc.payments.enabled = true;
    doc.payments.methods = ['CARD', 'COD'];
    doc.payments.gateway_refs = ['MOCK_PRIMARY'];
    doc.payments.currencies = ['XXX'];
    doc.shipping.domestic = true;
    await prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        version: Math.floor(Date.now() % 1_000_000),
        status: PolicyPackStatus.PUBLISHED,
        document: doc as never,
        checksum: `r6d-${suffix}`,
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
    await app.get(PolicyCache).invalidate('TD');

    const orgA = await orgs.create({
      countryCode: 'TD',
      kind: OrganizationKind.VENDOR,
      legalName: `R6D A ${suffix}`,
      displayName: `R6D A ${suffix}`,
      actorId: admin.personId,
    });
    const orgB = await orgs.create({
      countryCode: 'TD',
      kind: OrganizationKind.VENDOR,
      legalName: `R6D B ${suffix}`,
      displayName: `R6D B ${suffix}`,
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

    const locA = await request(app.getHttpServer())
      .post('/api/v1/admin/inventory/locations')
      .set(auth(admin.token))
      .send({
        organization_id: orgA.id,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: `R6D WH ${suffix}`,
        timezone: 'UTC',
      });
    expect(locA.status).toBe(201);

    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set(auth(admin.token))
      .send({ slug: `r6d-brand-${suffix}`, name: 'R6D Brand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set(auth(admin.token))
      .send({
        slug: `r6d-item-${suffix}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'R6D Tabs',
        countries: [{ country_code: 'TD' }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set(auth(admin.token))
      .send({ sku_code: `R6D-SKU-${suffix}`, pack_size: '10' });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set(auth(admin.token));
    const offer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set(auth(vendorA.token))
      .send({
        variant_id: variant.body.id,
        seller_org_id: orgA.id,
        country_code: 'TD',
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '250',
      });
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/publish`)
      .set(auth(vendorA.token));

    const lot = await prisma.inventoryLot.create({
      data: {
        id: uuidv7(),
        variantId: variant.body.id,
        locationId: locA.body.id,
        ownerOrgId: orgA.id,
        countryId: country.id,
        lotCode: `R6D-${suffix}`,
        status: InventoryLotStatus.ACTIVE,
      },
    });
    await prisma.inventoryBalance.create({
      data: { id: uuidv7(), lotId: lot.id, onHand: 40, available: 40 },
    });

    await request(app.getHttpServer())
      .post('/api/v1/me/cart/items?country=TD')
      .set(auth(customer.token))
      .set('Idempotency-Key', `r6d-add-${suffix}`)
      .send({ offer_id: offer.body.id, qty: 1 });
    const session = await request(app.getHttpServer())
      .post('/api/v1/me/checkout/sessions?country=TD')
      .set(auth(customer.token))
      .set('Idempotency-Key', `r6d-co-${suffix}`)
      .send({});
    const paid = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set(auth(customer.token))
      .set('Idempotency-Key', `r6d-pay-${suffix}`)
      .send({ method: 'CARD', scenario: 'success' });
    expect(paid.status).toBe(201);

    const created = await request(app.getHttpServer())
      .post('/api/v1/me/orders')
      .set(auth(customer.token))
      .set('Idempotency-Key', `r6d-ord-${suffix}`)
      .send({ payment_intent_id: paid.body.id });
    expect(created.status).toBeLessThan(300);
    const orderId = created.body.id as string;

    // Simulate Rx-origin linkage without clinical payload (opaque ids only).
    const opaqueRx = uuidv7();
    await prisma.order.update({
      where: { id: orderId },
      data: { prescriptionId: opaqueRx },
    });

    const listA = await request(app.getHttpServer())
      .get(`/api/v1/vendor/orders?seller_org_id=${orgA.id}`)
      .set(auth(vendorA.token));
    expect(listA.status).toBe(200);
    expect(listA.body.data.some((row: { id: string }) => row.id === orderId)).toBe(true);
    expect(JSON.stringify(listA.body)).not.toMatch(PHI_LEAK);

    const listCross = await request(app.getHttpServer())
      .get(`/api/v1/vendor/orders?seller_org_id=${orgA.id}`)
      .set(auth(vendorB.token));
    expect(listCross.status).toBe(403);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/vendor/orders/${orderId}`)
      .set(auth(vendorA.token));
    expect(detail.status).toBe(200);
    expect(detail.body.rx_origin).toBe(true);
    expect(detail.body.prescription_id).toBe(opaqueRx);
    expect(detail.body.order_number).toBeTruthy();
    expect(detail.body.items?.length).toBeGreaterThan(0);
    expect(detail.body.ship_to?.city).toBeTruthy();
    expect(detail.body.shipments?.length).toBeGreaterThan(0);
    expect(detail.body).not.toHaveProperty('payment');
    expect(detail.body).not.toHaveProperty('pricing');
    expect(detail.body).not.toHaveProperty('dispensing_case_id');
    expect(detail.body).not.toHaveProperty('customer_person_id');
    expect(JSON.stringify(detail.body)).not.toMatch(PHI_LEAK);

    const stealDetail = await request(app.getHttpServer())
      .get(`/api/v1/vendor/orders/${orderId}`)
      .set(auth(vendorB.token));
    expect([403, 404]).toContain(stealDetail.status);

    const stealPick = await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/pick/start`)
      .set(auth(vendorB.token));
    expect([403, 404]).toContain(stealPick.status);

    const pickBeforeAccept = await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/pick/start`)
      .set(auth(vendorA.token));
    expect(pickBeforeAccept.status).toBe(409);
    expect(pickBeforeAccept.body.code).toBe('VENDOR_ACCEPT_REQUIRED');

    const accept = await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/accept`)
      .set(auth(vendorA.token));
    expect(accept.status).toBeLessThan(300);
    expect(accept.body.vendor_accepted).toBe(true);

    const pickStart = await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/pick/start`)
      .set(auth(vendorA.token));
    expect(pickStart.status).toBeLessThan(300);
    expect(pickStart.body.status).toBe('PICKING');
    expect(pickStart.body.rx_origin).toBe(true);
    expect(JSON.stringify(pickStart.body)).not.toMatch(PHI_LEAK);

    const pickDone = await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/pick/complete`)
      .set(auth(vendorA.token));
    expect(pickDone.body.status).toBe('PICKED');

    const packDone = await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/pack/complete`)
      .set(auth(vendorA.token));
    expect(packDone.body.status).toBe('READY_TO_SHIP');
    expect(packDone.body.shipments?.[0]?.status).toBeTruthy();

    const customerView = await request(app.getHttpServer())
      .get(`/api/v1/me/orders/${orderId}`)
      .set(auth(customer.token));
    expect(customerView.status).toBe(200);
    expect(customerView.body.status).toBe('READY_TO_SHIP');

    const events = await prisma.outboxEvent.findMany({
      where: { aggregateId: orderId, type: { startsWith: 'ORDER_' } },
      take: 20,
    });
    expect(events.length).toBeGreaterThan(0);
    const outboxClinicalLeak =
      /diagnosis|clinical_note|prescription_instruction|dosage|encounter|patient_id|raw_clinical|fhir/i;
    expect(JSON.stringify(events)).not.toMatch(outboxClinicalLeak);
  });

  it('vendor reject cancels allocated orders and blocks later fulfillment', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const admin = await signIn(app, `r6d-rej-admin-${suffix}@example.com`, 'customer');
    const vendorA = await signIn(app, `r6d-rej-va-${suffix}@example.com`);
    const customer = await signIn(app, `r6d-rej-c-${suffix}@example.com`);

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

    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'TR' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'TR',
          isoAlpha3: 'TRR',
          nameI18n: { en: 'R6D reject test' },
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
    doc.payments.enabled = true;
    doc.payments.methods = ['CARD', 'COD'];
    doc.payments.gateway_refs = ['MOCK_PRIMARY'];
    doc.payments.currencies = ['XXX'];
    doc.shipping.domestic = true;
    await prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        version: Math.floor(Date.now() % 1_000_000) + 2,
        status: PolicyPackStatus.PUBLISHED,
        document: doc as never,
        checksum: `r6d-rej-${suffix}`,
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
    await app.get(PolicyCache).invalidate('TR');

    const orgA = await orgs.create({
      countryCode: 'TR',
      kind: OrganizationKind.VENDOR,
      legalName: `R6D Reject ${suffix}`,
      displayName: `R6D Reject ${suffix}`,
      actorId: admin.personId,
    });
    await prisma.organization.update({ where: { id: orgA.id }, data: { status: OrganizationStatus.ACTIVE } });
    await attachOrgAdmin(vendorA.personId, orgA.id);
    await activateMarketplaceSeller(app, {
      vendorToken: vendorA.token,
      adminToken: admin.token,
      sellerOrgId: orgA.id,
    });

    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const locA = await request(app.getHttpServer())
      .post('/api/v1/admin/inventory/locations')
      .set(auth(admin.token))
      .send({
        organization_id: orgA.id,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: `R6D Reject WH ${suffix}`,
        timezone: 'UTC',
      });
    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set(auth(admin.token))
      .send({ slug: `r6d-rej-brand-${suffix}`, name: 'R6D Reject Brand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set(auth(admin.token))
      .send({
        slug: `r6d-rej-item-${suffix}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'R6D Reject Tabs',
        countries: [{ country_code: 'TR' }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set(auth(admin.token))
      .send({ sku_code: `R6D-REJ-${suffix}`, pack_size: '10' });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set(auth(admin.token));
    const offer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set(auth(vendorA.token))
      .send({
        variant_id: variant.body.id,
        seller_org_id: orgA.id,
        country_code: 'TR',
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '250',
      });
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/publish`)
      .set(auth(vendorA.token));
    const lot = await prisma.inventoryLot.create({
      data: {
        id: uuidv7(),
        variantId: variant.body.id,
        locationId: locA.body.id,
        ownerOrgId: orgA.id,
        countryId: country.id,
        lotCode: `R6D-REJ-${suffix}`,
        status: InventoryLotStatus.ACTIVE,
      },
    });
    await prisma.inventoryBalance.create({
      data: { id: uuidv7(), lotId: lot.id, onHand: 40, available: 40 },
    });

    await request(app.getHttpServer())
      .post('/api/v1/me/cart/items?country=TR')
      .set(auth(customer.token))
      .set('Idempotency-Key', `r6d-rej-add-${suffix}`)
      .send({ offer_id: offer.body.id, qty: 1 });
    const session = await request(app.getHttpServer())
      .post('/api/v1/me/checkout/sessions?country=TR')
      .set(auth(customer.token))
      .set('Idempotency-Key', `r6d-rej-co-${suffix}`)
      .send({});
    const paid = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set(auth(customer.token))
      .set('Idempotency-Key', `r6d-rej-pay-${suffix}`)
      .send({ method: 'CARD', scenario: 'success' });
    const created = await request(app.getHttpServer())
      .post('/api/v1/me/orders')
      .set(auth(customer.token))
      .set('Idempotency-Key', `r6d-rej-ord-${suffix}`)
      .send({ payment_intent_id: paid.body.id });
    const orderId = created.body.id as string;

    const rejected = await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/reject`)
      .set(auth(vendorA.token))
      .send({ reason: 'OUT_OF_STOCK', idempotency_key: `rej-${suffix}` });
    expect(rejected.status).toBeLessThan(300);
    expect(rejected.body.status).toBe('CANCELLED');

    const rejectAgain = await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/reject`)
      .set(auth(vendorA.token))
      .send({ reason: 'OUT_OF_STOCK', idempotency_key: `rej-${suffix}` });
    expect(rejectAgain.status).toBeLessThan(300);
    expect(rejectAgain.body.status).toBe('CANCELLED');

    const pickAfterReject = await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${orderId}/pick/start`)
      .set(auth(vendorA.token));
    expect(pickAfterReject.status).toBe(409);
  });
});
