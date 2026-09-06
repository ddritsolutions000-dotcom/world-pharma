import { INestApplication } from '@nestjs/common';
import {
  InventoryLotStatus,
  LocationKind,
  OrganizationKind,
  OrganizationStatus,
  PolicyPackStatus,
  SettlementBatchStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { EventWorkerService } from '../events/worker.service';
import { OrganizationService } from '../partner/organization.service';
import { PolicyCache } from '../policy/cache';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { applyTestIsolation } from '../test/isolate-runtime';
import {
  activateMarketplaceSeller,
  enableMarketplaceVendorPack,
} from '../test/marketplace-seller';
import { provisionSuperAdmin, signIn } from '../test/sign-in';

describe('Sprint 17 vendor after-sales & finance (e2e)', () => {
  jest.setTimeout(360_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let orgs: OrganizationService;
  let eventWorker: EventWorkerService;

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
    eventWorker = app.get(EventWorkerService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function seedMarket(iso2: string) {
    const runId = uuidv7().slice(0, 8);
    const doc = emptyPolicyDocument();
    enableMarketplaceVendorPack(doc);
    doc.services.pharmacy = true;
    doc.payments.enabled = true;
    doc.payments.methods = ['CARD'];
    doc.payments.gateway_refs = ['MOCK_PRIMARY'];
    doc.payments.currencies = ['XXX'];
    doc.shipping.domestic = true;
    let country = await prisma.country.findUnique({ where: { isoAlpha2: iso2 } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: iso2,
          isoAlpha3: `${iso2}Z`,
          nameI18n: { en: `S17 ${iso2}` },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
        },
      });
    }
    await prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        version: Math.floor(Date.now() % 1_000_000),
        status: PolicyPackStatus.PUBLISHED,
        document: doc as never,
        checksum: `s17-${runId}`,
        publishedAt: new Date(),
      },
    });
    const pack = await prisma.policyPack.findFirst({
      where: { countryId: country.id, status: PolicyPackStatus.PUBLISHED },
      orderBy: { publishedAt: 'desc' },
    });
    if (pack) {
      await prisma.country.update({ where: { id: country.id }, data: { publishedPolicyPackId: pack.id } });
    }
    await app.get(PolicyCache).invalidate(iso2);
    return country;
  }

  async function seedSeller(iso2: string, countryId: string, label: string, onHand: number) {
    const unique = uuidv7().slice(0, 8);
    const admin = await provisionSuperAdmin(app, prisma, `s17-adm-${label}-${unique}`);
    const vendor = await signIn(app, `s17-v-${label}-${unique}@example.com`);
    const org = await orgs.create({
      countryCode: iso2,
      kind: OrganizationKind.VENDOR,
      legalName: `S17 ${label} ${unique}`,
      displayName: `S17 ${label} ${unique}`,
      actorId: admin.personId,
    });
    await prisma.organization.update({ where: { id: org.id }, data: { status: OrganizationStatus.ACTIVE } });
    const role = await prisma.role.findUnique({ where: { code: 'org_admin' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: vendor.personId,
        roleId: role!.id,
        scope: 'organization',
        organizationId: org.id,
        status: 'ACTIVE',
      },
    });
    await activateMarketplaceSeller(app, {
      vendorToken: vendor.token,
      adminToken: admin.token,
      sellerOrgId: org.id,
    });
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const loc = await request(app.getHttpServer())
      .post('/api/v1/admin/inventory/locations')
      .set(auth(admin.token))
      .send({
        organization_id: org.id,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: `WH ${label}`,
        timezone: 'UTC',
      });
    expect(loc.status).toBeLessThan(300);
    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set(auth(admin.token))
      .send({ slug: `s17-b-${label}-${unique}`, name: `Brand ${label}` });
    expect(brand.status).toBeLessThan(300);
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set(auth(admin.token))
      .send({
        slug: `s17-i-${label}-${unique}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: `Med ${label}`,
        countries: [{ country_code: iso2 }],
      });
    expect(item.status).toBeLessThan(300);
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set(auth(admin.token))
      .send({ sku_code: `S17-${label}-${unique}`, pack_size: '10' });
    expect(variant.status).toBeLessThan(300);
    const offer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set(auth(vendor.token))
      .send({
        variant_id: variant.body.id,
        seller_org_id: org.id,
        country_code: iso2,
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '300',
      });
    expect(offer.status).toBeLessThan(300);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/publish`)
      .set(auth(vendor.token))
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set(auth(admin.token))
      .expect(201);
    const lot = await prisma.inventoryLot.create({
      data: {
        id: uuidv7(),
        variantId: variant.body.id,
        locationId: loc.body.id,
        ownerOrgId: org.id,
        countryId,
        lotCode: `S17-${label}-${unique}`,
        status: InventoryLotStatus.ACTIVE,
      },
    });
    await prisma.inventoryBalance.create({
      data: { id: uuidv7(), lotId: lot.id, onHand, available: onHand },
    });
    return { org, vendor, admin, offerId: offer.body.id as string, lotId: lot.id, iso2 };
  }

  async function placeDeliveredOrder(customerToken: string, seller: Awaited<ReturnType<typeof seedSeller>>) {
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const idem = uuidv7();
    await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${seller.iso2}`)
      .set(auth(customerToken))
      .set('Idempotency-Key', `${idem}-add`)
      .send({ offer_id: seller.offerId, qty: 1 });
    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${seller.iso2}`)
      .set(auth(customerToken))
      .set('Idempotency-Key', `${idem}-co`)
      .send({});
    const paid = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set(auth(customerToken))
      .set('Idempotency-Key', `${idem}-pay`)
      .send({ method: 'CARD', scenario: 'success' });
    expect(paid.status).toBeLessThan(300);
    const created = await request(app.getHttpServer())
      .post('/api/v1/me/orders')
      .set(auth(customerToken))
      .set('Idempotency-Key', `${idem}-ord`)
      .send({ payment_intent_id: paid.body.id });
    expect(created.status).toBeLessThan(300);
    await prisma.order.update({ where: { id: created.body.id }, data: { status: 'DELIVERED' } });
    return created.body.id as string;
  }

  it('A–C: vendor team listing, authorization, and isolation', async () => {
    const country = await seedMarket('A1');
    const sellerA = await seedSeller('A1', country.id, 'teamA', 10);
    const sellerB = await seedSeller('A1', country.id, 'teamB', 10);
    const staff = await signIn(app, `s17-staff-${uuidv7()}@example.com`);
    const staffRole = await prisma.role.findUnique({ where: { code: 'org_staff' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: staff.personId,
        roleId: staffRole!.id,
        scope: 'organization',
        organizationId: sellerA.org.id,
        status: 'ACTIVE',
      },
    });
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    const listA = await request(app.getHttpServer())
      .get(`/api/v1/vendor/team/members?seller_org_id=${sellerA.org.id}`)
      .set(auth(sellerA.vendor.token));
    expect(listA.status).toBe(200);
    expect(listA.body.data.length).toBeGreaterThanOrEqual(2);

    const cross = await request(app.getHttpServer())
      .get(`/api/v1/vendor/team/members?seller_org_id=${sellerA.org.id}`)
      .set(auth(sellerB.vendor.token));
    expect(cross.status).toBe(403);

    const inviteDenied = await request(app.getHttpServer())
      .post('/api/v1/vendor/team/invitations')
      .set(auth(staff.token))
      .send({ seller_org_id: sellerA.org.id, role_code: 'org_staff', country_code: 'A1' });
    expect(inviteDenied.status).toBe(403);

    const invite = await request(app.getHttpServer())
      .post('/api/v1/vendor/team/invitations')
      .set(auth(sellerA.vendor.token))
      .send({ seller_org_id: sellerA.org.id, role_code: 'org_operations', country_code: 'A1' });
    expect(invite.status).toBeLessThan(300);
    expect(invite.body.invite_token).toBeTruthy();
  });

  it('D–H: return request, vendor queue, approve restock, damaged no-restock', async () => {
    const country = await seedMarket('A2');
    const seller = await seedSeller('A2', country.id, 'ret', 20);
    const customer = await signIn(app, `s17-cust-${uuidv7()}@example.com`);
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const orderId = await placeDeliveredOrder(customer.token, seller);
    const before = (await prisma.inventoryBalance.findUnique({ where: { lotId: seller.lotId } }))!.onHand;

    const requested = await request(app.getHttpServer())
      .post(`/api/v1/me/orders/${orderId}/returns`)
      .set(auth(customer.token))
      .send({ reason: 'WRONG_ITEM', note: 'Wrong pack' });
    expect(requested.status).toBeLessThan(300);
    expect(requested.body.status).toBe('RETURN_REQUESTED');

    const queue = await request(app.getHttpServer())
      .get(`/api/v1/vendor/returns?seller_org_id=${seller.org.id}`)
      .set(auth(seller.vendor.token));
    expect(queue.status).toBe(200);
    expect(queue.body.data.length).toBe(1);
    const returnId = queue.body.data[0].id as string;

    const otherSeller = await seedSeller('A2', country.id, 'steal', 5);
    const steal = await request(app.getHttpServer())
      .get(`/api/v1/vendor/returns?seller_org_id=${seller.org.id}`)
      .set(auth(otherSeller.vendor.token));
    expect(steal.status).toBe(403);

    const approved = await request(app.getHttpServer())
      .post(`/api/v1/vendor/returns/${orderId}/${returnId}/approve`)
      .set(auth(seller.vendor.token));
    expect(approved.status).toBeLessThan(300);
    expect(approved.body.status).toBe('RETURN_REQUESTED');
    const pickupRow = approved.body.returns?.find((r: { id: string }) => r.id === returnId);
    expect(pickupRow?.status).toBe('PICKUP_SCHEDULED');
    expect((await prisma.inventoryBalance.findUnique({ where: { lotId: seller.lotId } }))!.onHand).toBe(before);

    const received = await request(app.getHttpServer())
      .post(`/api/v1/vendor/returns/${orderId}/${returnId}/receive`)
      .set(auth(seller.vendor.token));
    expect(received.status).toBeLessThan(300);
    expect(received.body.status).toBe('RETURNED');
    expect((await prisma.inventoryBalance.findUnique({ where: { lotId: seller.lotId } }))!.onHand).toBe(before + 1);

    const orderId2 = await placeDeliveredOrder(customer.token, seller);
    await request(app.getHttpServer())
      .post(`/api/v1/me/orders/${orderId2}/returns`)
      .set(auth(customer.token))
      .send({ reason: 'DAMAGED', note: 'Crushed' });
    const queue2 = await request(app.getHttpServer())
      .get(`/api/v1/vendor/returns?seller_org_id=${seller.org.id}&status=REQUESTED`)
      .set(auth(seller.vendor.token));
    const return2 = queue2.body.data.find((row: { order_id: string }) => row.order_id === orderId2);
    const handBefore = (await prisma.inventoryBalance.findUnique({ where: { lotId: seller.lotId } }))!.onHand;
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/returns/${orderId2}/${return2.id}/approve`)
      .set(auth(seller.vendor.token))
      .expect(201);
    expect((await prisma.inventoryBalance.findUnique({ where: { lotId: seller.lotId } }))!.onHand).toBe(handBefore);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/returns/${orderId2}/${return2.id}/receive`)
      .set(auth(seller.vendor.token))
      .expect(201);
    expect((await prisma.inventoryBalance.findUnique({ where: { lotId: seller.lotId } }))!.onHand).toBe(handBefore);
  });

  it('I–K: payables, settlement batch visibility, finance isolation', async () => {
    const country = await seedMarket('A3');
    const sellerA = await seedSeller('A3', country.id, 'finA', 15);
    const sellerB = await seedSeller('A3', country.id, 'finB', 15);
    const customer = await signIn(app, `s17-fin-${uuidv7()}@example.com`);
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const orderId = await placeDeliveredOrder(customer.token, sellerA);

    const payables = await request(app.getHttpServer())
      .get(`/api/v1/vendor/payables?seller_org_id=${sellerA.org.id}`)
      .set(auth(sellerA.vendor.token));
    expect(payables.status).toBe(200);
    expect(payables.body.data.some((row: { order_id: string }) => row.order_id === orderId)).toBe(true);

    const summary = await request(app.getHttpServer())
      .get(`/api/v1/vendor/finance/summary?seller_org_id=${sellerA.org.id}`)
      .set(auth(sellerA.vendor.token));
    expect(summary.status).toBe(200);
    expect(BigInt(summary.body.total_payable_minor)).toBeGreaterThan(0n);

    const payable = await prisma.vendorPayable.findUniqueOrThrow({ where: { orderId } });
    const periodId = uuidv7();
    const batchId = uuidv7();
    const lineId = uuidv7();
    await prisma.settlementPeriod.create({
      data: {
        id: periodId,
        countryId: country.id,
        currency: 'XXX',
        startsAt: new Date('2026-01-01T00:00:00Z'),
        endsAt: new Date('2026-01-31T23:59:59Z'),
      },
    });
    await prisma.settlementBatch.create({
      data: {
        id: batchId,
        periodId,
        status: SettlementBatchStatus.APPROVED,
        currency: 'XXX',
        createdBy: sellerA.admin.personId,
      },
    });
    await prisma.settlementLine.create({
      data: {
        id: lineId,
        batchId,
        sellerOrgId: sellerA.org.id,
        vendorPayableId: payable.id,
        grossMinor: 300n,
        refundMinor: 0n,
        feeMinor: 36n,
        netMinor: 264n,
        currency: 'XXX',
      },
    });

    const settlements = await request(app.getHttpServer())
      .get(`/api/v1/vendor/settlements?seller_org_id=${sellerA.org.id}`)
      .set(auth(sellerA.vendor.token));
    expect(settlements.body.data.some((row: { id: string }) => row.id === lineId)).toBe(true);

    const crossPay = await request(app.getHttpServer())
      .get(`/api/v1/vendor/payables?seller_org_id=${sellerA.org.id}`)
      .set(auth(sellerB.vendor.token));
    expect(crossPay.status).toBe(403);
  });

  it('L: return notification delivered to vendor inbox', async () => {
    const country = await seedMarket('A4');
    const seller = await seedSeller('A4', country.id, 'ntf', 12);
    const customer = await signIn(app, `s17-ntf-${uuidv7()}@example.com`);
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const orderId = await placeDeliveredOrder(customer.token, seller);
    await request(app.getHttpServer())
      .post(`/api/v1/me/orders/${orderId}/returns`)
      .set(auth(customer.token))
      .send({ reason: 'OTHER_POLICY_ALLOWED' });
    const evt = await prisma.outboxEvent.findFirst({
      where: { type: 'ORDER_RETURN_REQUESTED', aggregateId: orderId },
      orderBy: { createdAt: 'desc' },
    });
    await eventWorker.handle(evt!.id);
    const inbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set(auth(seller.vendor.token));
    expect(inbox.body.data.some((row: { title: string }) => row.title === 'Return requested')).toBe(true);
  });
});
