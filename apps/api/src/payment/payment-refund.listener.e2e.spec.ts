import { INestApplication } from '@nestjs/common';
import {
  LocationKind,
  OrganizationKind,
  PaymentIntentStatus,
  PolicyPackStatus,
} from '@prisma/client';
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
import { seedCheckoutInventory } from '../test/seed-checkout-inventory';
import { OutboxService } from '../events/outbox.service';
import { EventWorkerService } from '../events/worker.service';
import { PaymentRefundListenerService } from './payment-refund.listener';
import { ProblemException } from '../common/problem';
import { PaymentGatewayRegistry } from './gateway.registry';
import { MockPaymentGatewayAdapter } from './mock.adapter';

async function signIn(app: INestApplication, email: string, audience: 'admin' | 'customer' = 'customer') {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

describe('PAYMENT_REFUND_REQUESTED listener', () => {
  jest.setTimeout(120_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let outbox: OutboxService;
  let worker: EventWorkerService;
  let listener: PaymentRefundListenerService;
  let customerToken: string;
  let customerPersonId: string;
  let countryId: string;
  let offerId: string;
  let inventoryLotId: string;

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
    outbox = app.get(OutboxService);
    worker = app.get(EventWorkerService);
    listener = app.get(PaymentRefundListenerService);

    const doc = emptyPolicyDocument();
    doc.services.pharmacy = true;
    enableMarketplaceVendorPack(doc);
    doc.payments.enabled = true;
    doc.payments.methods = ['CARD'];
    doc.payments.gateway_refs = ['MOCK_PRIMARY'];
    doc.payments.currencies = ['XXX'];

    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'MA' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'MA',
          isoAlpha3: 'MAA',
          nameI18n: { en: 'Refund listener test' },
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
          checksum: 'refund-listener',
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
    countryId = country.id;
    await app.get(PolicyCache).invalidate('MA');

    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: 'Refund Vendor',
        displayName: 'Refund Vendor',
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId: country.id,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'Refund WH',
        timezone: 'UTC',
      },
    });
    const admin = await signIn(app, `refund-admin-${Date.now()}@example.com`, 'admin');
    const role = await prisma.role.findUnique({ where: { code: 'super_admin' } });
    await prisma.membership.create({
      data: { id: uuidv7(), personId: admin.personId, roleId: role!.id, scope: 'platform', status: 'ACTIVE' },
    });
    const vendorUser = await signIn(app, `refund-vendor-${Date.now()}@example.com`, 'admin');
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
    await activateMarketplaceSeller(app, {
      vendorToken: vendorUser.token,
      adminToken: admin.token,
      sellerOrgId: vendor.id,
    });
    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: `ref-brand-${Date.now()}`, name: 'RefBrand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: `ref-item-${Date.now()}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'Ref item',
        countries: [{ country_code: 'MA' }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku_code: `REF-SKU-${Date.now()}`, pack_size: '10' });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);
    const offer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set('Authorization', `Bearer ${vendorUser.token}`)
      .send({
        variant_id: variant.body.id,
        seller_org_id: vendor.id,
        country_code: 'MA',
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '200',
      });
    offerId = offer.body.id;
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/publish`)
      .set('Authorization', `Bearer ${vendorUser.token}`);
    const seeded = await seedCheckoutInventory(app, {
      vendorToken: vendorUser.token,
      locationId: location.id,
      ownerOrgId: vendor.id,
      variantId: variant.body.id,
      qty: 50,
    });
    inventoryLotId = seeded.lotId;

    const customer = await signIn(app, `refund-cust-${Date.now()}@example.com`, 'customer');
    customerToken = customer.token;
    customerPersonId = customer.personId;
  });

  beforeEach(async () => {
    await prisma.inboxReceipt.deleteMany();
    await prisma.inventoryBalance.updateMany({
      where: { lotId: inventoryLotId },
      data: { onHand: 50, available: 50 },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  async function payAndGetOrder() {
    const add = await request(app.getHttpServer())
      .post('/api/v1/me/cart/items?country=MA')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `ref-add-${Date.now()}`)
      .send({ offer_id: offerId, qty: 1 });
    expect(add.status).toBeLessThan(300);
    const session = await request(app.getHttpServer())
      .post('/api/v1/me/checkout/sessions?country=MA')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `ref-co-${Date.now()}`)
      .send({});
    expect(session.status).toBe(201);
    expect(session.body.id).toBeDefined();
    const paid = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `ref-pay-${Date.now()}`)
      .send({ method: 'CARD', scenario: 'success' });
    expect(paid.status).toBe(201);
    expect(paid.body.amount_minor).toBeDefined();
    const order = await prisma.order.findFirst({ where: { paymentIntentId: paid.body.id } });
    expect(order).toBeTruthy();
    return { intentId: paid.body.id as string, orderId: order!.id as string, amountMinor: BigInt(paid.body.amount_minor) };
  }

  async function enqueueRefundRequested(orderId: string, intentId: string) {
    return outbox.enqueue(prisma, {
      type: 'PAYMENT_REFUND_REQUESTED',
      aggregateType: 'PaymentIntent',
      aggregateId: intentId,
      producer: 'order',
      countryId,
      actorId: customerPersonId,
      payload: { order_id: orderId, payment_intent_id: intentId, sandbox: true },
      occurrenceKey: `payment-refund-requested:${orderId}:${intentId}`,
    });
  }

  it('A: processes valid PAYMENT_REFUND_REQUESTED and refunds payment once', async () => {
    const { intentId, orderId, amountMinor } = await payAndGetOrder();
    const row = await enqueueRefundRequested(orderId, intentId);
    await worker.handle(row.id);
    const intent = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
    expect(intent?.refundedMinor).toBe(amountMinor);
    const refunds = await prisma.refund.count({ where: { intentId } });
    expect(refunds).toBe(1);
    const refundedEvent = await prisma.outboxEvent.findFirst({
      where: { type: 'PAYMENT_REFUNDED', aggregateId: intentId },
    });
    expect(refundedEvent).toBeTruthy();
  });

  it('B/C: duplicate worker delivery is idempotent', async () => {
    const { intentId, orderId, amountMinor } = await payAndGetOrder();
    const row = await enqueueRefundRequested(orderId, intentId);
    await worker.handle(row.id);
    await worker.handle(row.id);
    const txCount = await prisma.paymentTransaction.count({ where: { intentId, kind: 'refund' } });
    expect(txCount).toBe(1);
    const intent = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
    expect(intent?.refundedMinor).toBe(amountMinor);
  });

  it('D: missing order link fails safely without refund side effect', async () => {
    const { intentId } = await payAndGetOrder();
    const row = await outbox.enqueue(prisma, {
      type: 'PAYMENT_REFUND_REQUESTED',
      aggregateType: 'PaymentIntent',
      aggregateId: intentId,
      producer: 'order',
      countryId,
      actorId: customerPersonId,
      payload: { order_id: uuidv7(), payment_intent_id: intentId, sandbox: true },
      occurrenceKey: `missing-order:${intentId}`,
    });
    await expect(worker.handle(row.id)).rejects.toThrow();
    expect(await prisma.refund.count({ where: { intentId } })).toBe(0);
  });

  it('E: invalid payment state rejects refund side effect', async () => {
    const { intentId, orderId } = await payAndGetOrder();
    await prisma.paymentIntent.update({
      where: { id: intentId },
      data: { status: PaymentIntentStatus.AUTHORIZED },
    });
    const row = await enqueueRefundRequested(orderId, intentId);
    await expect(worker.handle(row.id)).rejects.toThrow();
    expect(await prisma.refund.count({ where: { intentId } })).toBe(0);
  });

  it('F/H: rejects MOCK gateway in production environment', () => {
    const registry = new PaymentGatewayRegistry(new MockPaymentGatewayAdapter());
    process.env['PAYMENT_ENVIRONMENT'] = 'production';
    delete process.env['PAYMENT_LIVE_ENABLED'];
    expect(() => registry.resolve('MOCK_PRIMARY', 'production')).toThrow(ProblemException);
    delete process.env['PAYMENT_ENVIRONMENT'];
  });

  it('G: allows MOCK gateway refund in sandbox via listener', async () => {
    const { intentId, orderId } = await payAndGetOrder();
    const row = await enqueueRefundRequested(orderId, intentId);
    await listener.handle({
      eventId: row.id,
      eventName: 'PAYMENT_REFUND_REQUESTED',
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      aggregateType: 'PaymentIntent',
      aggregateId: intentId,
      producer: 'order',
      countryId,
      correlationId: null,
      causationId: null,
      actorId: customerPersonId,
      payload: { order_id: orderId, payment_intent_id: intentId, sandbox: true },
      metadata: {},
    });
    expect(await prisma.refund.count({ where: { intentId } })).toBe(1);
  });

  it('I: retries after transient failure without duplicate refund transactions', async () => {
    const { intentId, orderId } = await payAndGetOrder();
    const row = await enqueueRefundRequested(orderId, intentId);
    const mock = app.get(MockPaymentGatewayAdapter);
    const originalRefund = mock.refund.bind(mock);
    let calls = 0;
    const refundSpy = jest.spyOn(mock, 'refund').mockImplementation(async (input) => {
      calls += 1;
      if (calls === 1) {
        throw new Error('transient gateway');
      }
      return originalRefund(input);
    });
    try {
      await expect(worker.handle(row.id)).rejects.toThrow('transient gateway');
      await prisma.outboxEvent.update({ where: { id: row.id }, data: { status: 'PENDING', availableAt: new Date() } });
      await worker.handle(row.id);
      expect(await prisma.paymentTransaction.count({ where: { intentId, kind: 'refund' } })).toBe(1);
    } finally {
      refundSpy.mockRestore();
    }
  });

  it('J: rejects country scope mismatch', async () => {
    const { intentId, orderId } = await payAndGetOrder();
    const row = await outbox.enqueue(prisma, {
      type: 'PAYMENT_REFUND_REQUESTED',
      aggregateType: 'PaymentIntent',
      aggregateId: intentId,
      producer: 'order',
      countryId: uuidv7(),
      actorId: customerPersonId,
      payload: { order_id: orderId, payment_intent_id: intentId, sandbox: true },
      occurrenceKey: `scope:${intentId}`,
    });
    await expect(worker.handle(row.id)).rejects.toThrow();
    expect(await prisma.refund.count({ where: { intentId } })).toBe(0);
  });

  it('K: order refund request emits event and listener completes payment refund', async () => {
    const { intentId, orderId } = await payAndGetOrder();
    await prisma.order.update({ where: { id: orderId }, data: { status: 'DELIVERED' } });
    const refundReq = await request(app.getHttpServer())
      .post(`/api/v1/me/orders/${orderId}/refund`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(refundReq.status).toBeLessThan(300);
    const event = await prisma.outboxEvent.findFirst({
      where: { type: 'PAYMENT_REFUND_REQUESTED', aggregateId: intentId },
    });
    expect(event).toBeTruthy();
    await worker.handle(event!.id);
    expect(await prisma.refund.count({ where: { intentId } })).toBe(1);
  });

  it('L: direct payment refund API still works', async () => {
    const { intentId } = await payAndGetOrder();
    const refund = await request(app.getHttpServer())
      .post(`/api/v1/me/payments/intents/${intentId}/refund`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `direct-refund-${Date.now()}`)
      .send({});
    expect(refund.status).toBeLessThan(300);
    expect(await prisma.refund.count({ where: { intentId } })).toBe(1);
  });
});
