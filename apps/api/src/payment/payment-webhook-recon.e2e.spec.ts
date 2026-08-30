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
import { ProblemException } from '../common/problem';
import { PaymentGatewayRegistry } from './gateway.registry';
import { MockPaymentGatewayAdapter } from './mock.adapter';
import { PaymentWebhookRegistry } from './webhook.registry';
import { SandboxWebhookAdapter } from './sandbox.webhook.adapter';
import { signSandboxPayload, SANDBOX_WEBHOOK_MAX_SKEW_SEC } from './hmac';

async function signIn(app: INestApplication, email: string, audience: 'admin' | 'customer' = 'customer') {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

describe('R14-A payment webhook reconciliation', () => {
  jest.setTimeout(120_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let customerToken: string;
  let adminToken: string;
  let countryId: string;
  let offerId: string;
  let inventoryLotId: string;
  let gatewayCode = 'MOCK_PRIMARY';

  beforeAll(async () => {
    applyTestIsolation();
    process.env['NODE_ENV'] = 'test';
    process.env['AUTH_DEV_REVEAL_OTP'] = 'true';
    process.env['JWT_ACCESS_SECRET'] =
      process.env['JWT_ACCESS_SECRET'] ?? 'test-access-secret-must-be-32-chars-min';
    process.env['OTP_PEPPER'] =
      process.env['OTP_PEPPER'] ?? 'test-otp-pepper-must-be-32-chars-minx';
    delete process.env['PAYMENT_ENVIRONMENT'];
    delete process.env['PAYMENT_LIVE_ENABLED'];
    if (!process.env['REDIS_URL']) {
      throw new Error('REDIS_URL is required');
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ProblemFilter());
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    prisma = app.get(PrismaService);

    const doc = emptyPolicyDocument();
    doc.services.pharmacy = true;
    enableMarketplaceVendorPack(doc);
    doc.payments.enabled = true;
    doc.payments.methods = ['CARD'];
    doc.payments.gateway_refs = ['MOCK_PRIMARY'];
    doc.payments.currencies = ['XXX'];

    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'WR' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'WR',
          isoAlpha3: 'WRR',
          nameI18n: { en: 'Webhook recon test' },
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
          checksum: 'webhook-recon',
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
    await app.get(PolicyCache).invalidate('WR');

    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: 'Webhook Vendor',
        displayName: 'Webhook Vendor',
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId: country.id,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'Webhook WH',
        timezone: 'UTC',
      },
    });
    const admin = await signIn(app, `wh-admin-${Date.now()}@example.com`, 'admin');
    adminToken = admin.token;
    const role = await prisma.role.findUnique({ where: { code: 'super_admin' } });
    await prisma.membership.create({
      data: { id: uuidv7(), personId: admin.personId, roleId: role!.id, scope: 'platform', status: 'ACTIVE' },
    });
    const vendorUser = await signIn(app, `wh-vendor-${Date.now()}@example.com`, 'admin');
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
      .send({ slug: `wh-brand-${Date.now()}`, name: 'WhBrand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: `wh-item-${Date.now()}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'Wh item',
        countries: [{ country_code: 'WR' }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku_code: `WH-SKU-${Date.now()}`, pack_size: '10' });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);
    const offer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set('Authorization', `Bearer ${vendorUser.token}`)
      .send({
        variant_id: variant.body.id,
        seller_org_id: vendor.id,
        country_code: 'WR',
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

    const customer = await signIn(app, `wh-cust-${Date.now()}@example.com`, 'customer');
    customerToken = customer.token;
  });

  beforeEach(async () => {
    await prisma.inboxReceipt.deleteMany();
    if (inventoryLotId) {
      await prisma.inventoryBalance.updateMany({
        where: { lotId: inventoryLotId },
        data: {
          onHand: 50,
          reserved: 0,
          damaged: 0,
          expired: 0,
          quarantined: 0,
          returned: 0,
          inTransit: 0,
          available: 50,
        },
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  async function payIntent(scenario: string) {
    await request(app.getHttpServer())
      .post('/api/v1/me/cart/items?country=WR')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `wh-add-${Date.now()}`)
      .send({ offer_id: offerId, qty: 1 });
    const session = await request(app.getHttpServer())
      .post('/api/v1/me/checkout/sessions?country=WR')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `wh-co-${Date.now()}`)
      .send({});
    const paid = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `wh-pay-${Date.now()}`)
      .send({ method: 'CARD', scenario });
    expect(paid.status).toBeLessThan(300);
    const attempt = await prisma.paymentAttempt.findFirst({ where: { intentId: paid.body.id } });
    return { intentId: paid.body.id as string, providerRef: attempt!.providerRef as string, status: paid.body.status as string };
  }

  async function postWebhook(
    payload: Record<string, unknown>,
    opts: { signature?: string; timestamp?: string; gateway?: string } = {},
  ) {
    const raw = JSON.stringify(payload);
    const gw = opts.gateway ?? gatewayCode;
    const req = request(app.getHttpServer())
      .post(`/api/v1/webhooks/payments/${gw}`)
      .set('Content-Type', 'application/json');
    if (opts.signature !== undefined) {
      if (opts.signature) req.set('x-sandbox-signature', opts.signature);
    } else {
      req.set('x-sandbox-signature', signSandboxPayload(raw));
    }
    if (opts.timestamp !== undefined) {
      if (opts.timestamp) req.set('x-sandbox-timestamp', opts.timestamp);
    }
    return req.send(raw);
  }

  it('1: valid sandbox webhook resolves UNKNOWN to CAPTURED', async () => {
    const { providerRef, intentId } = await payIntent('timeout');
    const payload = { event_id: `evt-valid-${Date.now()}`, type: 'payment.captured', provider_ref: providerRef };
    const hook = await postWebhook(payload, { timestamp: String(Math.floor(Date.now() / 1000)) });
    expect(hook.status).toBeLessThan(300);
    expect(hook.body.duplicate).not.toBe(true);
    const intent = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
    expect(intent?.status).toBe(PaymentIntentStatus.CAPTURED);
  });

  it('2/3: duplicate webhook with same event_id is idempotent', async () => {
    const { providerRef } = await payIntent('timeout');
    const eventId = `evt-dup-${Date.now()}`;
    const payload = { event_id: eventId, type: 'payment.captured', provider_ref: providerRef };
    const first = await postWebhook(payload);
    expect(first.status).toBeLessThan(300);
    const second = await postWebhook(payload);
    expect(second.body.duplicate).toBe(true);
    expect(await prisma.paymentWebhookEvent.count({ where: { providerEventId: eventId } })).toBe(1);
  });

  it('4: duplicate webhook with equivalent payload does not duplicate capture transactions', async () => {
    const { providerRef, intentId } = await payIntent('success');
    const txBefore = await prisma.paymentTransaction.count({ where: { intentId, kind: 'capture' } });
    const payloadA = { event_id: `evt-eq-a-${Date.now()}`, type: 'payment.captured', provider_ref: providerRef };
    const payloadB = { event_id: `evt-eq-b-${Date.now()}`, type: 'payment.captured', provider_ref: providerRef };
    await postWebhook(payloadA);
    await postWebhook(payloadB);
    const txAfter = await prisma.paymentTransaction.count({ where: { intentId, kind: 'capture' } });
    expect(txAfter).toBe(txBefore);
  });

  it('5: invalid signature is rejected before mutation', async () => {
    const payload = { event_id: `evt-bad-sig-${Date.now()}`, type: 'payment.captured', provider_ref: 'mock_x' };
    const res = await postWebhook(payload, { signature: 'deadbeef' });
    expect(res.status).toBe(401);
    expect(await prisma.paymentWebhookEvent.count({ where: { providerEventId: payload.event_id as string } })).toBe(0);
  });

  it('6: missing signature is rejected', async () => {
    const payload = { event_id: `evt-no-sig-${Date.now()}`, type: 'payment.captured', provider_ref: 'mock_x' };
    const res = await postWebhook(payload, { signature: '' });
    expect(res.status).toBe(401);
  });

  it('7/10: valid and missing timestamps follow sandbox contract', async () => {
    const payload = { event_id: `evt-ts-ok-${Date.now()}`, type: 'payment.captured', provider_ref: 'mock_missing' };
    const withTs = await postWebhook(payload, { timestamp: String(Math.floor(Date.now() / 1000)) });
    expect(withTs.status).toBeLessThan(300);
    const withoutTs = await postWebhook({
      event_id: `evt-no-ts-${Date.now()}`,
      type: 'payment.captured',
      provider_ref: 'mock_missing',
    });
    expect(withoutTs.status).toBeLessThan(300);
  });

  it('8: expired timestamp is rejected', async () => {
    const payload = { event_id: `evt-stale-ts-${Date.now()}`, type: 'payment.captured', provider_ref: 'mock_x' };
    const stale = Math.floor(Date.now() / 1000) - SANDBOX_WEBHOOK_MAX_SKEW_SEC - 10;
    const res = await postWebhook(payload, { timestamp: String(stale) });
    expect(res.status).toBe(401);
  });

  it('9: far-future timestamp is rejected', async () => {
    const payload = { event_id: `evt-future-ts-${Date.now()}`, type: 'payment.captured', provider_ref: 'mock_x' };
    const future = Math.floor(Date.now() / 1000) + SANDBOX_WEBHOOK_MAX_SKEW_SEC + 10;
    const res = await postWebhook(payload, { timestamp: String(future) });
    expect(res.status).toBe(401);
  });

  it('11: stale webhook cannot regress CAPTURED payment', async () => {
    const { providerRef, intentId } = await payIntent('success');
    const payload = { event_id: `evt-stale-${Date.now()}`, type: 'payment.authorized', provider_ref: providerRef };
    const hook = await postWebhook(payload);
    expect(hook.status).toBeLessThan(300);
    const intent = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
    expect(intent?.status).toBe(PaymentIntentStatus.CAPTURED);
  });

  it('12: illegal transition webhook is accepted but does not mutate FAILED payment', async () => {
    const { providerRef, intentId } = await payIntent('failure');
    const txBefore = await prisma.paymentTransaction.count({ where: { intentId } });
    const payload = { event_id: `evt-illegal-${Date.now()}`, type: 'payment.captured', provider_ref: providerRef };
    const hook = await postWebhook(payload);
    expect(hook.status).toBeLessThan(300);
    const intent = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
    expect(intent?.status).toBe(PaymentIntentStatus.FAILED);
    expect(await prisma.paymentTransaction.count({ where: { intentId } })).toBe(txBefore);
  });

  it('13: out-of-order authorized then captured reaches CAPTURED once', async () => {
    const { providerRef, intentId } = await payIntent('authorize');
    await postWebhook({
      event_id: `evt-auth-${Date.now()}`,
      type: 'payment.authorized',
      provider_ref: providerRef,
    });
    await postWebhook({
      event_id: `evt-cap-${Date.now()}`,
      type: 'payment.captured',
      provider_ref: providerRef,
    });
    const intent = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
    expect(intent?.status).toBe(PaymentIntentStatus.CAPTURED);
    expect(await prisma.paymentTransaction.count({ where: { intentId, kind: 'capture' } })).toBe(1);
  });

  it('14: unknown gateway webhook fails closed', async () => {
    const payload = { event_id: `evt-unk-gw-${Date.now()}`, type: 'payment.captured', provider_ref: 'mock_x' };
    const res = await postWebhook(payload, { gateway: 'STRIPE_NOT_REGISTERED' });
    expect(res.status).toBe(404);
  });

  it('15: production MOCK webhook registry remains forbidden', () => {
    const registry = new PaymentWebhookRegistry(new SandboxWebhookAdapter());
    expect(() => registry.resolve('MOCK_PRIMARY', 'production')).toThrow(ProblemException);
    try {
      registry.resolve('MOCK_PRIMARY', 'production');
    } catch (err) {
      expect((err as ProblemException).code).toBe('MOCK_GATEWAY_PRODUCTION_FORBIDDEN');
    }
  });

  it('16: reconciliation success applies gateway status via canonical path', async () => {
    const { intentId, providerRef } = await payIntent('timeout');
    app.get(MockPaymentGatewayAdapter).resolve(providerRef, 'captured');
    const recon = await request(app.getHttpServer())
      .post(`/api/v1/admin/payments/${intentId}/reconcile`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(recon.status).toBeLessThan(300);
    expect(recon.body.status).toBe('MATCHED');
    const intent = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
    expect(intent?.status).toBe(PaymentIntentStatus.CAPTURED);
  });

  it('17: repeated reconciliation is idempotent', async () => {
    const { intentId, providerRef } = await payIntent('success');
    app.get(MockPaymentGatewayAdapter).resolve(providerRef, 'captured');
    const first = await request(app.getHttpServer())
      .post(`/api/v1/admin/payments/${intentId}/reconcile`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(first.status).toBeLessThan(300);
    const reconBefore = await prisma.paymentReconciliation.count({ where: { intentId } });
    const txBefore = await prisma.paymentTransaction.count({ where: { intentId, kind: 'capture' } });
    const second = await request(app.getHttpServer())
      .post(`/api/v1/admin/payments/${intentId}/reconcile`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(second.status).toBeLessThan(300);
    expect(second.body.duplicate).toBe(true);
    expect(await prisma.paymentReconciliation.count({ where: { intentId } })).toBe(reconBefore);
    expect(await prisma.paymentTransaction.count({ where: { intentId, kind: 'capture' } })).toBe(txBefore);
  });

  it('18: reconciliation with unknown gateway routing fails closed', async () => {
    const { intentId } = await payIntent('success');
    const attempt = await prisma.paymentAttempt.findFirst({ where: { intentId } });
    await prisma.paymentAttempt.update({
      where: { id: attempt!.id },
      data: { routingJson: { gateway_code: 'STRIPE_NOT_REGISTERED', gateway_environment: 'sandbox' } },
    });
    const recon = await request(app.getHttpServer())
      .post(`/api/v1/admin/payments/${intentId}/reconcile`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(recon.status).toBe(409);
  });

  it('19: reconciliation requires admin reconcile permission', async () => {
    const { intentId } = await payIntent('success');
    const stranger = await signIn(app, `wh-stranger-${Date.now()}@example.com`, 'admin');
    const denied = await request(app.getHttpServer())
      .post(`/api/v1/admin/payments/${intentId}/reconcile`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(denied.status).toBe(403);
  });

  it('20: webhook for unknown provider_ref stores event without financial side effects', async () => {
    const txBefore = await prisma.paymentTransaction.count();
    const payload = { event_id: `evt-no-ref-${Date.now()}`, type: 'payment.captured', provider_ref: 'mock_missing_ref' };
    const hook = await postWebhook(payload);
    expect(hook.status).toBeLessThan(300);
    expect(await prisma.paymentTransaction.count()).toBe(txBefore);
  });
});
