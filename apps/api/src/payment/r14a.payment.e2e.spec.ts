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
import { seedCheckoutInventory } from '../test/seed-checkout-inventory';
import { ProblemException } from '../common/problem';
import { MockPaymentGatewayAdapter } from './mock.adapter';
import { PaymentGatewayRegistry } from './gateway.registry';
import { PaymentWebhookRegistry } from './webhook.registry';
import { SandboxWebhookAdapter } from './sandbox.webhook.adapter';
import {
  assertLiveProductionPrerequisites,
  assertPaymentSubmitAllowed,
  isProductionCountryAuthorized,
} from './payment.config';
import { signSandboxPayload } from './hmac';

async function signIn(app: INestApplication, email: string, audience: 'admin' | 'customer' = 'customer') {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

describe('R14-A payment foundation', () => {
  describe('provider-neutral guards (unit)', () => {
    it('dispatches registered sandbox gateways and rejects unknown codes', () => {
      const mock = new MockPaymentGatewayAdapter();
      const registry = new PaymentGatewayRegistry(mock);
      expect(registry.resolve('MOCK_PRIMARY', 'sandbox')).toBe(mock);
      expect(() => registry.resolve('STRIPE_LIVE', 'sandbox')).toThrow(ProblemException);
    });

    it('rejects production MOCK gateway environment rows', () => {
      const mock = new MockPaymentGatewayAdapter();
      const registry = new PaymentGatewayRegistry(mock);
      expect(() => registry.resolve('MOCK_PRIMARY', 'production')).toThrow(ProblemException);
    });

    it('fail-closes production path without country authorization', () => {
      delete process.env['PAYMENT_PRODUCTION_COUNTRIES'];
      expect(isProductionCountryAuthorized('US')).toBe(false);
      expect(() =>
        assertLiveProductionPrerequisites('test', { gatewayCode: 'STRIPE_LIVE', countryIso2: 'US' }),
      ).toThrow(ProblemException);
    });

    it('fail-closes payment submit when live mode is disabled in production env', () => {
      process.env['PAYMENT_ENVIRONMENT'] = 'production';
      delete process.env['PAYMENT_LIVE_ENABLED'];
      expect(() => assertPaymentSubmitAllowed('submit')).toThrow(ProblemException);
      delete process.env['PAYMENT_ENVIRONMENT'];
    });

    it('resolves sandbox webhook handlers and rejects unknown providers', () => {
      const sandbox = new SandboxWebhookAdapter();
      const registry = new PaymentWebhookRegistry(sandbox);
      expect(registry.resolve('MOCK_PRIMARY', 'sandbox')).toBeDefined();
      expect(() => registry.resolve('STRIPE_LIVE', 'sandbox')).toThrow(ProblemException);
    });
  });

  describe('sandbox payment e2e', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let customerToken: string;
    let sessionId: string;
    let countryId: string;
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

      let country = await prisma.country.findUnique({ where: { isoAlpha2: 'MB' } });
      if (!country) {
        country = await prisma.country.create({
          data: {
            id: uuidv7(),
            isoAlpha2: 'MB',
            isoAlpha3: 'MBB',
            nameI18n: { en: 'R14A test' },
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
            checksum: 'r14a-test',
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
      await app.get(PolicyCache).invalidate('MB');

      const vendor = await prisma.organization.create({
        data: {
          id: uuidv7(),
          countryId: country.id,
          kind: OrganizationKind.VENDOR,
          legalName: 'R14A Vendor',
          displayName: 'R14A Vendor',
          status: 'ACTIVE',
        },
      });
      const location = await prisma.location.create({
        data: {
          id: uuidv7(),
          organizationId: vendor.id,
          countryId: country.id,
          kind: LocationKind.VENDOR_WAREHOUSE,
          name: 'R14A WH',
          timezone: 'UTC',
        },
      });
      const admin = await signIn(app, `r14a-admin-${Date.now()}@example.com`, 'admin');
      const role = await prisma.role.findUnique({ where: { code: 'super_admin' } });
      await prisma.membership.create({
        data: { id: uuidv7(), personId: admin.personId, roleId: role!.id, scope: 'platform', status: 'ACTIVE' },
      });
      const vendorUser = await signIn(app, `r14a-vendor-${Date.now()}@example.com`, 'admin');
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
        .send({ slug: `r14a-brand-${Date.now()}`, name: 'R14A' });
      const item = await request(app.getHttpServer())
        .post('/api/v1/admin/catalog/items')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          slug: `r14a-item-${Date.now()}`,
          kind: 'OTC',
          brand_id: brand.body.id,
          title: 'R14A item',
          countries: [{ country_code: 'MB' }],
        });
      const variant = await request(app.getHttpServer())
        .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ sku_code: `R14A-SKU-${Date.now()}`, pack_size: '10' });
      await request(app.getHttpServer())
        .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
        .set('Authorization', `Bearer ${admin.token}`);
      const offer = await request(app.getHttpServer())
        .post('/api/v1/vendor/catalog/offers')
        .set('Authorization', `Bearer ${vendorUser.token}`)
        .send({
          variant_id: variant.body.id,
          seller_org_id: vendor.id,
          country_code: 'MB',
          ownership: 'VENDOR_OWNED',
          currency: 'XXX',
          cost_minor: '100',
          sell_minor: '200',
        });
      await request(app.getHttpServer())
        .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/publish`)
        .set('Authorization', `Bearer ${vendorUser.token}`);
      await seedCheckoutInventory(app, {
        vendorToken: vendorUser.token,
        locationId: location.id,
        ownerOrgId: vendor.id,
        variantId: variant.body.id,
      });

      const customer = await signIn(app, `r14a-cust-${Date.now()}@example.com`, 'customer');
      customerToken = customer.token;
      await request(app.getHttpServer())
        .post('/api/v1/me/cart/items?country=MB')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', `r14a-add-${Date.now()}`)
        .send({ offer_id: offer.body.id, qty: 1 });
      const session = await request(app.getHttpServer())
        .post('/api/v1/me/checkout/sessions?country=MB')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', `r14a-co-${Date.now()}`)
        .send({});
      sessionId = session.body.id;
    });

    afterAll(async () => {
      await app.close();
    });

    it('captures via MOCK gateway and returns idempotent pay responses', async () => {
      const key = `r14a-pay-idem-${Date.now()}`;
      const first = await request(app.getHttpServer())
        .post(`/api/v1/me/checkout/sessions/${sessionId}/pay`)
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', key)
        .send({ method: 'CARD', scenario: 'success' });
      expect(first.status).toBe(201);
      expect(first.body.status).toBe('CAPTURED');
      const second = await request(app.getHttpServer())
        .post(`/api/v1/me/checkout/sessions/${sessionId}/pay`)
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', key)
        .send({ method: 'CARD', scenario: 'success' });
      expect(second.status).toBe(201);
      expect(second.body.id).toBe(first.body.id);
    });

    it('rejects webhooks with invalid signature and stale timestamp', async () => {
      const payload = JSON.stringify({
        event_id: `evt-bad-${Date.now()}`,
        type: 'payment.captured',
        provider_ref: 'mock_missing',
      });
      const badSig = await request(app.getHttpServer())
        .post(`/api/v1/webhooks/payments/${gatewayCode}`)
        .set('x-sandbox-signature', 'deadbeef')
        .set('Content-Type', 'application/json')
        .send(payload);
      expect(badSig.status).toBe(401);

      const staleTs = Math.floor(Date.now() / 1000) - 600;
      const stale = await request(app.getHttpServer())
        .post(`/api/v1/webhooks/payments/${gatewayCode}`)
        .set('x-sandbox-signature', signSandboxPayload(payload))
        .set('x-sandbox-timestamp', String(staleTs))
        .set('Content-Type', 'application/json')
        .send(payload);
      expect(stale.status).toBe(401);
    });

    it('accepts unknown provider_ref without duplicate financial effects', async () => {
      const payload = JSON.stringify({
        event_id: `evt-unknown-${Date.now()}`,
        type: 'payment.captured',
        provider_ref: 'mock_does_not_exist',
      });
      const hook = await request(app.getHttpServer())
        .post(`/api/v1/webhooks/payments/${gatewayCode}`)
        .set('x-sandbox-signature', signSandboxPayload(payload))
        .set('Content-Type', 'application/json')
        .send(payload);
      expect(hook.status).toBeLessThan(300);
      expect(hook.body.duplicate).not.toBe(true);
    });

    it('swallows illegal transition webhooks without duplicate capture transactions', async () => {
      const key = `r14a-fail-${Date.now()}`;
      await request(app.getHttpServer())
        .post('/api/v1/me/cart/items?country=MB')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', `r14a-add-fail-${Date.now()}`)
        .send({ offer_id: (await prisma.catalogOffer.findFirst({ where: { countryId } }))!.id, qty: 1 });
      const session2 = await request(app.getHttpServer())
        .post('/api/v1/me/checkout/sessions?country=MB')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', `r14a-co-fail-${Date.now()}`)
        .send({});
      const failed = await request(app.getHttpServer())
        .post(`/api/v1/me/checkout/sessions/${session2.body.id}/pay`)
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', key)
        .send({ method: 'CARD', scenario: 'failure' });
      expect(failed.body.status).toBe('FAILED');
      const attempt = await prisma.paymentAttempt.findFirst({ where: { intentId: failed.body.id } });
      const payload = JSON.stringify({
        event_id: `evt-illegal-${Date.now()}`,
        type: 'payment.captured',
        provider_ref: attempt?.providerRef,
      });
      const txBefore = await prisma.paymentTransaction.count({ where: { intentId: failed.body.id } });
      const hook = await request(app.getHttpServer())
        .post(`/api/v1/webhooks/payments/${gatewayCode}`)
        .set('x-sandbox-signature', signSandboxPayload(payload))
        .set('Content-Type', 'application/json')
        .send(payload);
      expect(hook.status).toBeLessThan(300);
      const txAfter = await prisma.paymentTransaction.count({ where: { intentId: failed.body.id } });
      expect(txAfter).toBe(txBefore);
    });

    it('blocks checkout pay when payments.enabled=false in country policy', async () => {
      const disabledDoc = emptyPolicyDocument();
      disabledDoc.services.pharmacy = true;
      enableMarketplaceVendorPack(disabledDoc);
      disabledDoc.payments.enabled = false;
      await prisma.policyPack.updateMany({
        where: { countryId, status: PolicyPackStatus.PUBLISHED },
        data: { document: disabledDoc as never },
      });
      await app.get(PolicyCache).invalidate('MB');
      const session = await request(app.getHttpServer())
        .post('/api/v1/me/checkout/sessions?country=MB')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', `r14a-disabled-${Date.now()}`)
        .send({});
      const denied = await request(app.getHttpServer())
        .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', `r14a-denied-${Date.now()}`)
        .send({ method: 'CARD', scenario: 'success' });
      expect(denied.status).toBe(409);
      expect(denied.body.code).toBe('PAYMENTS_DISABLED');
    });

    it('aligns order refund request with captured payment and emits PAYMENT_REFUND_REQUESTED', async () => {
      const enabledDoc = emptyPolicyDocument();
      enabledDoc.services.pharmacy = true;
      enableMarketplaceVendorPack(enabledDoc);
      enabledDoc.payments.enabled = true;
      enabledDoc.payments.methods = ['CARD'];
      enabledDoc.payments.gateway_refs = ['MOCK_PRIMARY'];
      enabledDoc.payments.currencies = ['XXX'];
      await prisma.policyPack.updateMany({
        where: { countryId, status: PolicyPackStatus.PUBLISHED },
        data: { document: enabledDoc as never },
      });
      await app.get(PolicyCache).invalidate('MB');

      await request(app.getHttpServer())
        .post('/api/v1/me/cart/items?country=MB')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', `r14a-ref-add-${Date.now()}`)
        .send({ offer_id: (await prisma.catalogOffer.findFirst({ where: { countryId } }))!.id, qty: 1 });
      const session = await request(app.getHttpServer())
        .post('/api/v1/me/checkout/sessions?country=MB')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', `r14a-ref-co-${Date.now()}`)
        .send({});
      const paid = await request(app.getHttpServer())
        .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', `r14a-ref-pay-${Date.now()}`)
        .send({ method: 'CARD', scenario: 'success' });
      const order = await prisma.order.findFirst({ where: { paymentIntentId: paid.body.id } });
      expect(order).toBeTruthy();
      await prisma.order.update({ where: { id: order!.id }, data: { status: 'DELIVERED' } });
      const refundReq = await request(app.getHttpServer())
        .post(`/api/v1/me/orders/${order!.id}/refund`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(refundReq.status).toBeLessThan(300);
      const event = await prisma.outboxEvent.findFirst({
        where: { type: 'PAYMENT_REFUND_REQUESTED', aggregateId: paid.body.id },
      });
      expect(event).toBeTruthy();
    });
  });
});
