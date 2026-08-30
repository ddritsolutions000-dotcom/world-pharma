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
import { assertObservabilityResponseSafe } from './payment-observability';
import { MockPaymentGatewayAdapter } from './mock.adapter';
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

describe('R14-A payment admin observability', () => {
  jest.setTimeout(120_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let customerToken: string;
  let adminToken: string;
  let strangerToken: string;
  let countryId: string;
  let otherCountryId: string;
  let offerId: string;
  let inventoryLotId: string;
  const countryCode = 'WR';

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

    let country = await prisma.country.findUnique({ where: { isoAlpha2: countryCode } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: countryCode,
          isoAlpha3: 'WRR',
          nameI18n: { en: 'Observability test' },
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
          checksum: 'observability',
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
    await app.get(PolicyCache).invalidate(countryCode);

    let other = await prisma.country.findUnique({ where: { isoAlpha2: 'XO' } });
    if (!other) {
      other = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'XO',
          isoAlpha3: 'XOO',
          nameI18n: { en: 'Other country' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
          dataResidencyMode: 'shared',
        },
      });
    }
    otherCountryId = other.id;

    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: 'Obs Vendor',
        displayName: 'Obs Vendor',
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId: country.id,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'Obs WH',
        timezone: 'UTC',
      },
    });
    const admin = await signIn(app, `obs-admin-${Date.now()}@example.com`, 'admin');
    adminToken = admin.token;
    const role = await prisma.role.findUnique({ where: { code: 'super_admin' } });
    await prisma.membership.create({
      data: { id: uuidv7(), personId: admin.personId, roleId: role!.id, scope: 'platform', status: 'ACTIVE' },
    });
    const vendorUser = await signIn(app, `obs-vendor-${Date.now()}@example.com`, 'admin');
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
    const stranger = await signIn(app, `obs-stranger-${Date.now()}@example.com`, 'admin');
    strangerToken = stranger.token;
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: stranger.personId,
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
      .send({ slug: `obs-brand-${Date.now()}`, name: 'ObsBrand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: `obs-item-${Date.now()}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'Obs item',
        countries: [{ country_code: countryCode }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku_code: `OBS-SKU-${Date.now()}`, pack_size: '10' });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);
    const offer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set('Authorization', `Bearer ${vendorUser.token}`)
      .send({
        variant_id: variant.body.id,
        seller_org_id: vendor.id,
        country_code: countryCode,
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

    const customer = await signIn(app, `obs-cust-${Date.now()}@example.com`, 'customer');
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
    await app?.close();
  });

  async function payIntent(scenario = 'success') {
    await request(app.getHttpServer())
      .post('/api/v1/me/cart/items?country=WR')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `obs-add-${Date.now()}`)
      .send({ offer_id: offerId, qty: 1 });
    const session = await request(app.getHttpServer())
      .post('/api/v1/me/checkout/sessions?country=WR')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `obs-co-${Date.now()}`)
      .send({});
    const paid = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `obs-pay-${Date.now()}`)
      .send({ method: 'CARD', scenario });
    expect(paid.status).toBeLessThan(300);
    const attempt = await prisma.paymentAttempt.findFirst({ where: { intentId: paid.body.id } });
    return {
      intentId: paid.body.id as string,
      providerRef: attempt!.providerRef as string,
      status: paid.body.status as string,
      orderId: (await prisma.order.findFirst({ where: { paymentIntentId: paid.body.id } }))?.id,
    };
  }

  async function postWebhook(payload: Record<string, unknown>, signature?: string) {
    const raw = JSON.stringify(payload);
    const req = request(app.getHttpServer())
      .post('/api/v1/webhooks/payments/MOCK_PRIMARY')
      .set('Content-Type', 'application/json');
    if (signature === undefined) {
      req.set('x-sandbox-signature', signSandboxPayload(raw));
    } else if (signature) {
      req.set('x-sandbox-signature', signature);
    }
    return req.send(raw);
  }

  it('1: authorized admin can view payment observability', async () => {
    const { intentId } = await payIntent('success');
    const list = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments?country_code=${countryCode}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.some((row: { id: string }) => row.id === intentId)).toBe(true);
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/${intentId}/observability?country_code=${countryCode}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.payment.id).toBe(intentId);
    assertObservabilityResponseSafe(detail.body);
  });

  it('2: unauthorized user is denied', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments?country_code=${countryCode}`)
      .set('Authorization', `Bearer ${strangerToken}`);
    expect(res.status).toBe(403);
  });

  it('3/4: country isolation on observability detail', async () => {
    const { intentId } = await payIntent('success');
    const wrong = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/${intentId}/observability?country_code=XO`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(wrong.status).toBe(404);
    const list = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments?country_code=XO`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.some((row: { id: string }) => row.id === intentId)).toBe(false);
    expect(otherCountryId).toBeTruthy();
  });

  it('5/6: payment status and safe failure classification', async () => {
    const captured = await payIntent('success');
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/${captured.intentId}/observability?country_code=${countryCode}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.body.payment.status).toBe(PaymentIntentStatus.CAPTURED);
    expect(detail.body.payment.gateway_code).toBe('MOCK_PRIMARY');
    expect(detail.body.payment.order_id).toBeTruthy();

    const failed = await payIntent('failed');
    const failedDetail = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/${failed.intentId}/observability?country_code=${countryCode}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(failedDetail.body.payment.status).toBe(PaymentIntentStatus.FAILED);
    expect(failedDetail.body.payment.failure_classification).toBeTruthy();
    expect(JSON.stringify(failedDetail.body)).not.toMatch(/4111|cvv|pan/i);
  });

  it('7: webhook duplicate is visible as processed single row', async () => {
    const { providerRef, intentId } = await payIntent('timeout');
    const eventId = `evt-obs-dup-${Date.now()}`;
    const payload = { event_id: eventId, type: 'payment.captured', provider_ref: providerRef };
    await postWebhook(payload);
    const dup = await postWebhook(payload);
    expect(dup.body.duplicate).toBe(true);
    const hooks = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/webhooks?country_code=${countryCode}&intent_id=${intentId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(hooks.status).toBe(200);
    const match = hooks.body.data.filter((row: { provider_event_id: string }) => row.provider_event_id === eventId);
    expect(match).toHaveLength(1);
    expect(match[0].processing_status).toBe('processed');
    assertObservabilityResponseSafe(hooks.body);
  });

  it('8: rejected webhook record is visible with safe reason', async () => {
    const gateway = await prisma.paymentGateway.findUnique({ where: { code: 'MOCK_PRIMARY' } });
    const rejected = await prisma.paymentWebhookEvent.create({
      data: {
        id: uuidv7(),
        gatewayId: gateway!.id,
        providerEventId: `evt-rejected-${Date.now()}`,
        eventType: 'rejected.signature_invalid',
        signatureOk: false,
        processed: false,
        payloadCipher: 'sha256:deadbeef',
      },
    });
    const row = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/webhooks/${rejected.id}?country_code=${countryCode}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(row.status).toBe(200);
    expect(row.body.data.processing_status).toBe('rejected');
    expect(row.body.data.rejection_reason).toBe('signature_invalid');
    expect(row.body.data).not.toHaveProperty('payload_cipher');
    assertObservabilityResponseSafe(row.body);
  });

  it('9/10: reconciliation break and unknown queue visibility', async () => {
    const { intentId, providerRef } = await payIntent('success');
    await prisma.paymentTransaction.deleteMany({ where: { intentId, kind: 'capture' } });
    app.get(MockPaymentGatewayAdapter).resolve(providerRef, 'captured');
    const recon = await request(app.getHttpServer())
      .post(`/api/v1/admin/payments/${intentId}/reconcile`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(recon.status).toBeLessThan(300);
    expect(recon.body.status).toBe('BREAK');
    expect(recon.body.break_type).toBe('missing_transaction');
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/${intentId}/observability?country_code=${countryCode}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.body.reconciliations.some((row: { break_type: string }) => row.break_type === 'missing_transaction')).toBe(true);

    await prisma.paymentIntent.update({ where: { id: intentId }, data: { status: PaymentIntentStatus.UNKNOWN } });
    const unknown = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/unknown?country_code=${countryCode}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(unknown.status).toBe(200);
    expect(unknown.body.data.some((row: { id: string }) => row.id === intentId)).toBe(true);
    expect(unknown.body.data[0].failure_classification).toBe('unknown_state');
  });

  it('11: audit timeline is ordered chronologically', async () => {
    const { intentId } = await payIntent('success');
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/${intentId}/observability?country_code=${countryCode}`)
      .set('Authorization', `Bearer ${adminToken}`);
    const times = detail.body.audit_timeline.map((row: { occurred_at: string }) => row.occurred_at);
    const sorted = [...times].sort();
    expect(times).toEqual(sorted);
    expect(detail.body.audit_timeline.length).toBeGreaterThan(0);
  });

  it('12-14: sensitive fields are absent from API responses', async () => {
    const { intentId } = await payIntent('success');
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/${intentId}/observability?country_code=${countryCode}`)
      .set('Authorization', `Bearer ${adminToken}`);
    const serialized = JSON.stringify(detail.body);
    expect(serialized).not.toMatch(/payload_cipher|x-sandbox-signature|sk_live|webhook-secret/i);
    assertObservabilityResponseSafe(detail.body);
  });

  it('15: production MOCK remains blocked at webhook registry', async () => {
    const payload = JSON.stringify({ event_id: 'evt-mock-prod', type: 'payment.captured' });
    const res = await request(app.getHttpServer())
      .post('/api/v1/webhooks/payments/MOCK_PRODUCTION')
      .set('x-sandbox-signature', signSandboxPayload(payload))
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
