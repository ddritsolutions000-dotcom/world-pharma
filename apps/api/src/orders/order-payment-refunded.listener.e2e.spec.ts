import { INestApplication } from '@nestjs/common';
import {
  InventoryLotStatus,
  LocationKind,
  OrderStatus,
  OrganizationKind,
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
import { OutboxService } from '../events/outbox.service';
import { EventWorkerService } from '../events/worker.service';
import { OrderPaymentRefundedListenerService } from './order-payment-refunded.listener';
import { signIn, provisionOrgAdmin, provisionSuperAdmin } from '../test/sign-in';

describe('PAYMENT_REFUNDED order status listener', () => {
  jest.setTimeout(120_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let outbox: OutboxService;
  let worker: EventWorkerService;
  let orderRefundedListener: OrderPaymentRefundedListenerService;
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
    orderRefundedListener = app.get(OrderPaymentRefundedListenerService);

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
          nameI18n: { en: 'Order refund status test' },
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
          checksum: 'order-refund-status',
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
        legalName: 'Order Refund Vendor',
        displayName: 'Order Refund Vendor',
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId: country.id,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'Order Refund WH',
        timezone: 'UTC',
      },
    });
    const admin = await provisionSuperAdmin(app, prisma, 'ord-ref-admin');
    const vendorUser = await provisionOrgAdmin(app, prisma, 'ord-ref-vendor', vendor.id);
    await activateMarketplaceSeller(app, {
      vendorToken: vendorUser.token,
      adminToken: admin.token,
      sellerOrgId: vendor.id,
    });
    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: `ors-brand-${Date.now()}`, name: 'OrsBrand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: `ors-item-${Date.now()}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'Ors item',
        countries: [{ country_code: 'MA' }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku_code: `ORS-SKU-${Date.now()}`, pack_size: '10' });
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
    const lot = await prisma.inventoryLot.create({
      data: {
        id: uuidv7(),
        variantId: variant.body.id,
        locationId: location.id,
        ownerOrgId: vendor.id,
        countryId: country.id,
        lotCode: 'ORS-LOT',
        status: InventoryLotStatus.ACTIVE,
      },
    });
    inventoryLotId = lot.id;
    await prisma.inventoryBalance.create({
      data: { id: uuidv7(), lotId: lot.id, onHand: 20, available: 20 },
    });

    const customer = await signIn(app, `ord-ref-cust-${Date.now()}@example.com`, 'customer');
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
      .set('Idempotency-Key', `ors-add-${Date.now()}`)
      .send({ offer_id: offerId, qty: 1 });
    expect(add.status).toBeLessThan(300);
    const session = await request(app.getHttpServer())
      .post('/api/v1/me/checkout/sessions?country=MA')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `ors-co-${Date.now()}`)
      .send({});
    expect(session.status).toBe(201);
    const paid = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `ors-pay-${Date.now()}`)
      .send({ method: 'CARD', scenario: 'success' });
    expect(paid.status).toBe(201);
    const order = await prisma.order.findFirst({ where: { paymentIntentId: paid.body.id } });
    expect(order).toBeTruthy();
    return {
      intentId: paid.body.id as string,
      orderId: order!.id as string,
      amountMinor: BigInt(paid.body.amount_minor),
    };
  }

  async function markRefundPending(orderId: string) {
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.REFUND_PENDING },
    });
  }

  async function latestPaymentRefundedEvent(intentId: string) {
    return prisma.outboxEvent.findFirst({
      where: { type: 'PAYMENT_REFUNDED', aggregateId: intentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async function processLatestPaymentRefunded(intentId: string) {
    const event = await latestPaymentRefundedEvent(intentId);
    expect(event).toBeTruthy();
    await worker.handle(event!.id);
    return event!;
  }

  async function refundPaymentPartial(intentId: string, amountMinor: string) {
    const refund = await request(app.getHttpServer())
      .post(`/api/v1/me/payments/intents/${intentId}/refund`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `partial-${Date.now()}-${amountMinor}`)
      .send({ amount_minor: amountMinor });
    expect(refund.status).toBeLessThan(300);
  }

  it('1: full refund syncs order to REFUNDED', async () => {
    const { intentId, orderId, amountMinor } = await payAndGetOrder();
    await markRefundPending(orderId);
    const refund = await request(app.getHttpServer())
      .post(`/api/v1/me/payments/intents/${intentId}/refund`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `full-${Date.now()}`)
      .send({});
    expect(refund.status).toBeLessThan(300);
    await processLatestPaymentRefunded(intentId);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe(OrderStatus.REFUNDED);
    const intent = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
    expect(intent?.refundedMinor).toBe(amountMinor);
  });

  it('2: partial refund syncs order to PARTIALLY_REFUNDED', async () => {
    const { intentId, orderId, amountMinor } = await payAndGetOrder();
    await markRefundPending(orderId);
    const partial = amountMinor / 2n;
    await refundPaymentPartial(intentId, partial.toString());
    await processLatestPaymentRefunded(intentId);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe(OrderStatus.PARTIALLY_REFUNDED);
  });

  it('3: multiple partial refunds keep PARTIALLY_REFUNDED until fully refunded', async () => {
    const { intentId, orderId, amountMinor } = await payAndGetOrder();
    await markRefundPending(orderId);
    const first = amountMinor / 3n;
    const second = amountMinor / 3n;
    await refundPaymentPartial(intentId, first.toString());
    await processLatestPaymentRefunded(intentId);
    await refundPaymentPartial(intentId, second.toString());
    await processLatestPaymentRefunded(intentId);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe(OrderStatus.PARTIALLY_REFUNDED);
    const intent = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
    expect(intent!.refundedMinor).toBeLessThan(amountMinor);
    expect(intent!.refundedMinor).toBeGreaterThan(0n);
  });

  it('4: final refund after partial refunds syncs order to REFUNDED', async () => {
    const { intentId, orderId, amountMinor } = await payAndGetOrder();
    await markRefundPending(orderId);
    await refundPaymentPartial(intentId, (amountMinor / 2n).toString());
    await processLatestPaymentRefunded(intentId);
    await request(app.getHttpServer())
      .post(`/api/v1/me/payments/intents/${intentId}/refund`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `final-${Date.now()}`)
      .send({});
    await processLatestPaymentRefunded(intentId);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe(OrderStatus.REFUNDED);
  });

  it('5: duplicate PAYMENT_REFUNDED delivery is idempotent', async () => {
    const { intentId, orderId } = await payAndGetOrder();
    await markRefundPending(orderId);
    await request(app.getHttpServer())
      .post(`/api/v1/me/payments/intents/${intentId}/refund`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `dup-${Date.now()}`)
      .send({});
    const event = await processLatestPaymentRefunded(intentId);
    const historyBefore = await prisma.orderStatusHistory.count({ where: { orderId } });
    await worker.handle(event.id);
    const historyAfter = await prisma.orderStatusHistory.count({ where: { orderId } });
    expect(historyAfter).toBe(historyBefore);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe(OrderStatus.REFUNDED);
  });

  it('6: already REFUNDED order does not regress on replay', async () => {
    const { intentId, orderId } = await payAndGetOrder();
    await markRefundPending(orderId);
    await request(app.getHttpServer())
      .post(`/api/v1/me/payments/intents/${intentId}/refund`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `replay-${Date.now()}`)
      .send({});
    const event = await processLatestPaymentRefunded(intentId);
    await orderRefundedListener.handle({
      eventId: event.id,
      eventName: 'PAYMENT_REFUNDED',
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      aggregateType: 'PaymentIntent',
      aggregateId: intentId,
      producer: 'payment',
      countryId,
      correlationId: null,
      causationId: null,
      actorId: customerPersonId,
      payload: { amount_minor: '1', currency: 'XXX', sandbox: true },
      metadata: {},
    });
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe(OrderStatus.REFUNDED);
  });

  it('7: missing payment intent fails safely', async () => {
    const missingIntentId = uuidv7();
    const row = await outbox.enqueue(prisma, {
      type: 'PAYMENT_REFUNDED',
      aggregateType: 'PaymentIntent',
      aggregateId: missingIntentId,
      producer: 'payment',
      countryId,
      actorId: customerPersonId,
      payload: { amount_minor: '500', currency: 'XXX', sandbox: true },
      occurrenceKey: `payment-refunded:missing-${missingIntentId}`,
    });
    await expect(worker.handle(row.id)).rejects.toThrow();
  });

  it('8: wrong country scope is blocked', async () => {
    const { intentId, orderId } = await payAndGetOrder();
    await markRefundPending(orderId);
    await request(app.getHttpServer())
      .post(`/api/v1/me/payments/intents/${intentId}/refund`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `scope-${Date.now()}`)
      .send({});
    const event = await latestPaymentRefundedEvent(intentId);
    expect(event).toBeTruthy();
    await prisma.outboxEvent.update({
      where: { id: event!.id },
      data: { countryId: uuidv7(), status: 'PENDING', availableAt: new Date() },
    });
    await expect(worker.handle(event!.id)).rejects.toThrow();
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe(OrderStatus.REFUND_PENDING);
  });

  it('9: order refund request path still completes payment and order refund status', async () => {
    const { intentId, orderId } = await payAndGetOrder();
    await prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.DELIVERED } });
    const refundReq = await request(app.getHttpServer())
      .post(`/api/v1/me/orders/${orderId}/refund`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(refundReq.status).toBeLessThan(300);
    const requested = await prisma.outboxEvent.findFirst({
      where: { type: 'PAYMENT_REFUND_REQUESTED', aggregateId: intentId },
    });
    expect(requested).toBeTruthy();
    await worker.handle(requested!.id);
    await processLatestPaymentRefunded(intentId);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe(OrderStatus.REFUNDED);
    expect(await prisma.refund.count({ where: { intentId } })).toBe(1);
  });

  it('10: direct HTTP payment refund still works without breaking payment state', async () => {
    const { intentId } = await payAndGetOrder();
    const refund = await request(app.getHttpServer())
      .post(`/api/v1/me/payments/intents/${intentId}/refund`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `direct-ors-${Date.now()}`)
      .send({});
    expect(refund.status).toBeLessThan(300);
    expect(await prisma.refund.count({ where: { intentId } })).toBe(1);
  });
});
