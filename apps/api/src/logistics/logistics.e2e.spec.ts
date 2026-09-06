import { INestApplication } from '@nestjs/common';
import { InventoryLotStatus, LocationKind, OrganizationKind, PolicyPackStatus, ShipmentStatus } from '@prisma/client';
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
import { signCarrierPayload } from './hmac';
import { LogisticsService } from './logistics.service';
import { EventWorkerService } from '../events/worker.service';

import { bootstrapSuperAdminByEmail, signIn as signInAudience } from '../test/sign-in';

describe('logistics mock carrier (e2e)', () => {
  jest.setTimeout(120_000);
  let app: INestApplication;
  let prisma: PrismaService;
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
    eventWorker = app.get(EventWorkerService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('books mock only, blocks dual book after UNKNOWN, rejects stale delivered downgrade, and isolates actors', async () => {
    const doc = emptyPolicyDocument();
    doc.services.pharmacy = true;
    enableMarketplaceVendorPack(doc);
    doc.payments.enabled = true;
    doc.payments.methods = ['CARD', 'COD'];
    doc.payments.gateway_refs = ['MOCK_PRIMARY'];
    doc.payments.currencies = ['XXX'];
    doc.shipping.domestic = true;

    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'LQ' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'LQ',
          isoAlpha3: 'LQQ',
          nameI18n: { en: 'Logistics test' },
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
          document: doc as never,
          checksum: 'logistics-test',
          publishedAt: new Date(),
        },
      });
      await prisma.country.update({ where: { id: country.id }, data: { publishedPolicyPackId: pack.id } });
    } else {
      await prisma.policyPack.updateMany({
        where: { countryId: country.id, status: PolicyPackStatus.PUBLISHED },
        data: { document: doc as never },
      });
    }
    await app.get(PolicyCache).invalidate('LQ');

    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: 'Log Vendor',
        displayName: 'Log Vendor',
        status: 'ACTIVE',
      },
    });
    const otherVendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: 'Other Log Vendor',
        displayName: 'Other Log Vendor',
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId: country.id,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'Log WH',
        timezone: 'UTC',
      },
    });
    const admin = await bootstrapSuperAdminByEmail(app, prisma, `log-admin-${Date.now()}@example.com`);
    const vendorUser = await signInAudience(app, `log-vendor-${Date.now()}@example.com`, 'customer');
    const otherVendorUser = await signInAudience(app, `log-vendor-b-${Date.now()}@example.com`, 'customer');
    const orgRole = await prisma.role.findUnique({ where: { code: 'org_owner' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: vendorUser.personId,
        roleId: orgRole!.id,
        scope: 'organization',
        organizationId: vendor.id,
        status: 'ACTIVE',
      },
    });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: otherVendorUser.personId,
        roleId: orgRole!.id,
        scope: 'organization',
        organizationId: otherVendor.id,
        status: 'ACTIVE',
      },
    });

    await activateMarketplaceSeller(app, {
      vendorToken: vendorUser.token,
      adminToken: admin.token,
      sellerOrgId: vendor.id,
    });

    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: `log-brand-${Date.now()}`, name: 'LogBrand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: `log-zinc-${Date.now()}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'Log zinc',
        countries: [{ country_code: 'LQ' }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku_code: `LOG-SKU-${Date.now()}`, pack_size: '10' });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);
    const offer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set('Authorization', `Bearer ${vendorUser.token}`)
      .send({
        variant_id: variant.body.id,
        seller_org_id: vendor.id,
        country_code: 'LQ',
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '200',
      });
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/publish`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    const lot = await prisma.inventoryLot.create({
      data: {
        id: uuidv7(),
        variantId: variant.body.id,
        locationId: location.id,
        ownerOrgId: vendor.id,
        countryId: country.id,
        lotCode: 'LOG-LOT',
        status: InventoryLotStatus.ACTIVE,
      },
    });
    await prisma.inventoryBalance.create({
      data: { id: uuidv7(), lotId: lot.id, onHand: 40, available: 40 },
    });

    const customer = await signInAudience(app, `log-cust-${Date.now()}@example.com`, 'customer');
    const other = await signInAudience(app, `log-cust-b-${Date.now()}@example.com`, 'customer');

    const deniedIntl = await request(app.getHttpServer()).get(
      '/api/v1/shipping/quotes?country=LQ&origin=LQ&dest=ZZ&currency=XXX',
    );
    expect(deniedIntl.status).toBeGreaterThanOrEqual(400);

    await request(app.getHttpServer())
      .post('/api/v1/me/cart/items?country=LQ')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `log-add-${Date.now()}`)
      .send({ offer_id: offer.body.id, qty: 1 });
    const session = await request(app.getHttpServer())
      .post('/api/v1/me/checkout/sessions?country=LQ')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `log-co-${Date.now()}`)
      .send({});
    const paid = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `log-pay-${Date.now()}`)
      .send({ method: 'CARD', scenario: 'success' });
    const created = await request(app.getHttpServer())
      .post('/api/v1/me/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `log-ord-${Date.now()}`)
      .send({ payment_intent_id: paid.body.id });
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${created.body.id}/accept`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${created.body.id}/pick/start`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${created.body.id}/pick/complete`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${created.body.id}/pack/complete`)
      .set('Authorization', `Bearer ${vendorUser.token}`);

    const shipment = await prisma.shipment.findFirstOrThrow({ where: { orderId: created.body.id } });
    expect(shipment.status === ShipmentStatus.LABEL_CREATED || shipment.status === ShipmentStatus.BOOKED).toBe(true);
    expect(shipment.trackingNumber).toBeTruthy();
    expect(['MOCK', 'MOCK_B', 'DHL', 'INDIA_POST', 'BLUEDART', 'DELHIVERY']).toContain(
      (shipment.routingJson as { carrierCode?: string } | null)?.carrierCode ?? 'MOCK',
    );
    const bookedCarrier = shipment.carrierId
      ? await prisma.carrier.findUnique({ where: { id: shipment.carrierId } })
      : null;
    expect(bookedCarrier?.environment).toBe('sandbox');

    const dupBook = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/admin/shipments/${shipment.id}/book`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ scenario: 'BOOK_SUCCESS' }),
      request(app.getHttpServer())
        .post(`/api/v1/admin/shipments/${shipment.id}/book`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ scenario: 'BOOK_SUCCESS' }),
    ]);
    expect(dupBook.every((row) => row.status < 300)).toBe(true);
    expect(await prisma.shipment.count({ where: { orderId: created.body.id } })).toBe(1);

    const customerShip = await request(app.getHttpServer())
      .get(`/api/v1/me/shipments/${shipment.id}`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(customerShip.status).toBeLessThan(300);
    expect(customerShip.body.message).toMatch(/mock/i);
    const steal = await request(app.getHttpServer())
      .get(`/api/v1/me/shipments/${shipment.id}`)
      .set('Authorization', `Bearer ${other.token}`);
    expect(steal.status).toBe(403);
    const otherVendorPeek = await request(app.getHttpServer())
      .get(`/api/v1/vendor/shipments/${shipment.id}`)
      .set('Authorization', `Bearer ${otherVendorUser.token}`);
    expect(otherVendorPeek.status).toBe(403);

    const payload = JSON.stringify({
      event_id: `evt-${shipment.id}`,
      code: 'delivered',
      shipment_ref: shipment.providerRef,
      sequence: 9,
      ts: new Date().toISOString(),
    });
    const delivered = await request(app.getHttpServer())
      .post('/api/v1/webhooks/carriers/mock')
      .set('x-sandbox-signature', signCarrierPayload(payload))
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(delivered.status).toBeLessThan(300);
    const dupHook = await request(app.getHttpServer())
      .post('/api/v1/webhooks/carriers/mock')
      .set('x-sandbox-signature', signCarrierPayload(payload))
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(dupHook.body.duplicate).toBe(true);
    const stale = JSON.stringify({
      event_id: `evt-stale-${shipment.id}`,
      code: 'in_transit',
      shipment_ref: shipment.providerRef,
      sequence: 1,
      ts: new Date().toISOString(),
    });
    const staleRes = await request(app.getHttpServer())
      .post('/api/v1/webhooks/carriers/mock')
      .set('x-sandbox-signature', signCarrierPayload(stale))
      .set('Content-Type', 'application/json')
      .send(stale);
    expect(staleRes.body.ignored === 'stale' || staleRes.status >= 400).toBe(true);
    const after = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(after.status).toBe(ShipmentStatus.DELIVERED);

    const deliveredEvent = await prisma.outboxEvent.findFirst({
      where: { type: 'SHIPMENT_DELIVERED', aggregateId: shipment.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(deliveredEvent?.payload).toMatchObject({ customer_person_id: customer.personId });
    await eventWorker.handle(deliveredEvent!.id);
    await eventWorker.handle(deliveredEvent!.id);

    const customerInbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(customerInbox.status).toBe(200);
    const deliveredNotifications = (customerInbox.body.data ?? customerInbox.body).filter(
      (row: { title: string }) => row.title === 'Shipment delivered',
    );
    expect(deliveredNotifications.length).toBe(1);

    const otherInbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set('Authorization', `Bearer ${other.token}`);
    const otherDelivered = (otherInbox.body.data ?? otherInbox.body).filter(
      (row: { title: string }) => row.title === 'Shipment delivered',
    );
    expect(otherDelivered.length).toBe(0);

    const otp = await request(app.getHttpServer())
      .post(`/api/v1/admin/shipments/${shipment.id}/otp`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({});
    expect(otp.body.hashed).toBe(true);
    const pod = await prisma.proofOfDelivery.findFirst({ where: { shipmentId: shipment.id } });
    expect(pod?.secretHash).not.toBe('123456');

    const recon = await request(app.getHttpServer())
      .post(`/api/v1/admin/shipments/${shipment.id}/reconcile`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({});
    expect(recon.body.actual_cost_minor === null || typeof recon.body.actual_cost_minor === 'string').toBe(true);
    if (recon.body.actual_cost_minor === '0' && recon.body.status === 'MATCHED') {
      throw new Error('missing cost must not become zero');
    }

    await request(app.getHttpServer())
      .post('/api/v1/me/cart/items?country=LQ')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `log-add2-${Date.now()}`)
      .send({ offer_id: offer.body.id, qty: 1 });
    const session2 = await request(app.getHttpServer())
      .post('/api/v1/me/checkout/sessions?country=LQ')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `log-co2-${Date.now()}`)
      .send({});
    const paid2 = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session2.body.id}/pay`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `log-pay2-${Date.now()}`)
      .send({ method: 'CARD', scenario: 'success' });
    const created2 = await request(app.getHttpServer())
      .post('/api/v1/me/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `log-ord2-${Date.now()}`)
      .send({ payment_intent_id: paid2.body.id });
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${created2.body.id}/accept`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${created2.body.id}/pick/start`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${created2.body.id}/pick/complete`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    const packed2 = await request(app.getHttpServer())
      .post(`/api/v1/vendor/orders/${created2.body.id}/pack/complete`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    void packed2;
    const unknownShip = await prisma.shipment.findFirstOrThrow({ where: { orderId: created2.body.id } });
    await prisma.shipment.update({
      where: { id: unknownShip.id },
      data: { status: ShipmentStatus.BOOKING_FAILED, mockScenario: 'BOOK_TIMEOUT', carrierId: null },
    });
    const timeout = await request(app.getHttpServer())
      .post(`/api/v1/admin/shipments/${unknownShip.id}/book`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ scenario: 'BOOK_TIMEOUT' });
    expect(timeout.body.status).toBe('BOOKING_UNKNOWN');
    const blocked = await request(app.getHttpServer())
      .post(`/api/v1/admin/shipments/${unknownShip.id}/book`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ scenario: 'BOOK_SUCCESS' });
    expect(blocked.status).toBe(409);
    const logistics = app.get(LogisticsService);
    logistics.mockResolve(unknownShip.providerRef ?? `mock_${unknownShip.id}`, ShipmentStatus.BOOKING_FAILED);
    const reconFail = await request(app.getHttpServer())
      .post(`/api/v1/admin/shipments/${unknownShip.id}/reconcile`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({});
    void reconFail;
    const failover = await request(app.getHttpServer())
      .post(`/api/v1/admin/shipments/${unknownShip.id}/book`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ scenario: 'BOOK_SUCCESS' });
    expect(failover.status).toBeLessThan(300);
    expect(await prisma.shipment.count({ where: { orderId: created2.body.id } })).toBe(1);

    const rto = await request(app.getHttpServer())
      .post(`/api/v1/admin/shipments/${unknownShip.id}/rto`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({});
    expect(rto.body.disposition).toBe('QUARANTINE');

    const noPerm = await signInAudience(app, `log-noperm-${Date.now()}@example.com`, 'customer');
    const denied = await request(app.getHttpServer())
      .get('/api/v1/admin/shipments')
      .set('Authorization', `Bearer ${noPerm.token}`);
    expect(denied.status).toBe(403);

    expect(await prisma.outboxEvent.count({ where: { type: { in: ['VENDOR_PAID', 'AFFILIATE_PAID', 'SETTLEMENT_POSTED'] } } })).toBe(0);
  });
});
