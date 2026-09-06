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
import { signIn, provisionOrgAdmin, provisionSuperAdmin } from '../test/sign-in';
import { signSandboxPayload } from './hmac';

describe('payment sandbox (e2e)', () => {
  jest.setTimeout(120_000);
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

  it('captures sandbox CARD, blocks dual-charge after timeout, refunds, and never creates orders', async () => {
    const doc = emptyPolicyDocument();
    doc.services.pharmacy = true;
    enableMarketplaceVendorPack(doc);
    doc.payments.enabled = true;
    doc.payments.methods = ['CARD', 'COD'];
    doc.payments.gateway_refs = ['MOCK_PRIMARY', 'MOCK_FALLBACK'];
    doc.payments.currencies = ['XXX'];

    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'P2' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'P2',
          isoAlpha3: 'P22',
          nameI18n: { en: 'Pay test' },
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
          checksum: 'pay-test',
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
    await app.get(PolicyCache).invalidate('P2');

    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: 'Pay Vendor',
        displayName: 'Pay Vendor',
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId: country.id,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: `Pay WH ${Date.now()}`,
        timezone: 'UTC',
      },
    });
    const admin = await provisionSuperAdmin(app, prisma, 'pay-admin');
    const vendorUser = await provisionOrgAdmin(app, prisma, 'pay-vendor', vendor.id);

    await activateMarketplaceSeller(app, {
      vendorToken: vendorUser.token,
      adminToken: admin.token,
      sellerOrgId: vendor.id,
    });

    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: `pay-brand-${Date.now()}`, name: 'PayBrand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: `pay-zinc-${Date.now()}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'Pay zinc',
        countries: [{ country_code: 'P2' }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku_code: `PAY-SKU-${Date.now()}`, pack_size: '10' });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);
    const offer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set('Authorization', `Bearer ${vendorUser.token}`)
      .send({
        variant_id: variant.body.id,
        seller_org_id: vendor.id,
        country_code: 'P2',
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

    const customer = await signIn(app, `pay-cust-${Date.now()}@example.com`, 'customer');
    const other = await signIn(app, `pay-cust-b-${Date.now()}@example.com`, 'customer');

    await request(app.getHttpServer())
      .post('/api/v1/me/cart/items?country=P2')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `pay-add-${Date.now()}`)
      .send({ offer_id: offer.body.id, qty: 1 });
    const session = await request(app.getHttpServer())
      .post('/api/v1/me/checkout/sessions?country=P2')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `pay-co-${Date.now()}`)
      .send({});
    expect(session.status).toBe(201);

    const captured = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `pay-ok-${Date.now()}`)
      .send({ method: 'CARD', scenario: 'success' });
    expect(captured.status).toBe(201);
    expect(captured.body.status).toBe('CAPTURED');
    expect(captured.body.sandbox).toBe(true);
    expect(await prisma.order.count({ where: { paymentIntentId: captured.body.id } })).toBe(1);

    const steal = await request(app.getHttpServer())
      .get(`/api/v1/me/payments/intents/${captured.body.id}`)
      .set('Authorization', `Bearer ${other.token}`);
    expect(steal.status).toBe(403);

    const over = await request(app.getHttpServer())
      .post(`/api/v1/me/payments/intents/${captured.body.id}/refund`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `refund-over-${Date.now()}`)
      .send({ amount_minor: '999999' });
    expect(over.status).toBe(409);

    const refund = await request(app.getHttpServer())
      .post(`/api/v1/me/payments/intents/${captured.body.id}/refund`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `refund-ok-${Date.now()}`)
      .send({ amount_minor: '50' });
    expect(refund.status).toBeLessThan(300);

    await request(app.getHttpServer())
      .post('/api/v1/me/cart/items?country=P2')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `pay-add2-${Date.now()}`)
      .send({ offer_id: offer.body.id, qty: 1 });
    const session2 = await request(app.getHttpServer())
      .post('/api/v1/me/checkout/sessions?country=P2')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `pay-co2-${Date.now()}`)
      .send({});
    const timedOut = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session2.body.id}/pay`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `pay-to-${Date.now()}`)
      .send({ method: 'CARD', scenario: 'timeout' });
    expect(timedOut.body.status).toBe('UNKNOWN');
    const attempts = await prisma.paymentAttempt.findMany({ where: { intentId: timedOut.body.id } });
    expect(attempts).toHaveLength(1);

    const payload = JSON.stringify({
      event_id: `evt-${Date.now()}`,
      type: 'payment.captured',
      provider_ref: attempts[0]?.providerRef,
    });
    const hook = await request(app.getHttpServer())
      .post('/api/v1/webhooks/payments/MOCK_PRIMARY')
      .set('x-sandbox-signature', signSandboxPayload(payload))
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(hook.status).toBeLessThan(300);
    const dupHook = await request(app.getHttpServer())
      .post('/api/v1/webhooks/payments/MOCK_PRIMARY')
      .set('x-sandbox-signature', signSandboxPayload(payload))
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(dupHook.body.duplicate).toBe(true);

    const capturedAttempts = await prisma.paymentAttempt.findMany({ where: { intentId: captured.body.id } });
    const capturedProviderRef = capturedAttempts[0]?.providerRef;
    expect(capturedProviderRef).toBeTruthy();
    const txBefore = await prisma.paymentTransaction.count({
      where: { intentId: captured.body.id, kind: 'capture' },
    });
    const orderBefore = await prisma.order.count({ where: { paymentIntentId: captured.body.id } });
    const replayPayload = JSON.stringify({
      event_id: `evt-replay-${Date.now()}`,
      type: 'payment.captured',
      provider_ref: capturedProviderRef,
    });
    const replayHook = await request(app.getHttpServer())
      .post('/api/v1/webhooks/payments/MOCK_PRIMARY')
      .set('x-sandbox-signature', signSandboxPayload(replayPayload))
      .set('Content-Type', 'application/json')
      .send(replayPayload);
    expect(replayHook.status).toBeLessThan(300);
    expect(replayHook.body.duplicate).not.toBe(true);
    const txAfter = await prisma.paymentTransaction.count({
      where: { intentId: captured.body.id, kind: 'capture' },
    });
    const orderAfter = await prisma.order.count({ where: { paymentIntentId: captured.body.id } });
    expect(txAfter).toBe(txBefore);
    expect(orderAfter).toBe(orderBefore);
    expect(orderAfter).toBe(1);

    const stranger = await signIn(app, `pay-stranger-${Date.now()}@example.com`, 'customer');
    const denied = await request(app.getHttpServer())
      .get('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(denied.status).toBe(403);
  });

  it('returns 409 when checkout quantity exceeds available inventory', async () => {
    const doc = emptyPolicyDocument();
    doc.services.pharmacy = true;
    enableMarketplaceVendorPack(doc);
    doc.payments.enabled = true;
    doc.payments.methods = ['CARD'];
    doc.payments.gateway_refs = ['MOCK_PRIMARY'];
    doc.payments.currencies = ['XXX'];

    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'P3' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'P3',
          isoAlpha3: 'P33',
          nameI18n: { en: 'Pay stock test' },
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
          checksum: 'pay-stock-test',
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
    await app.get(PolicyCache).invalidate('P3');

    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: 'Pay Stock Vendor',
        displayName: 'Pay Stock Vendor',
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId: country.id,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: `Pay Stock WH ${Date.now()}`,
        timezone: 'UTC',
      },
    });
    const admin = await provisionSuperAdmin(app, prisma, 'pay-stock-admin');
    const vendorUser = await provisionOrgAdmin(app, prisma, 'pay-stock-vendor', vendor.id);
    await activateMarketplaceSeller(app, {
      vendorToken: vendorUser.token,
      adminToken: admin.token,
      sellerOrgId: vendor.id,
    });

    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: `pay-stock-brand-${Date.now()}`, name: 'PayStockBrand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: `pay-stock-item-${Date.now()}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'Pay stock item',
        countries: [{ country_code: 'P3' }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku_code: `PAY-STOCK-${Date.now()}`, pack_size: '10' });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);
    const offer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set('Authorization', `Bearer ${vendorUser.token}`)
      .send({
        variant_id: variant.body.id,
        seller_org_id: vendor.id,
        country_code: 'P3',
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
      qty: 1,
    });

    const customerA = await signIn(app, `pay-stock-a-${Date.now()}@example.com`, 'customer');
    const customerB = await signIn(app, `pay-stock-b-${Date.now()}@example.com`, 'customer');
    await request(app.getHttpServer())
      .post('/api/v1/me/cart/items?country=P3')
      .set('Authorization', `Bearer ${customerA.token}`)
      .set('Idempotency-Key', `pay-stock-add-a-${Date.now()}`)
      .send({ offer_id: offer.body.id, qty: 1 });
    await request(app.getHttpServer())
      .post('/api/v1/me/cart/items?country=P3')
      .set('Authorization', `Bearer ${customerB.token}`)
      .set('Idempotency-Key', `pay-stock-add-b-${Date.now()}`)
      .send({ offer_id: offer.body.id, qty: 1 });
    const firstSession = await request(app.getHttpServer())
      .post('/api/v1/me/checkout/sessions?country=P3')
      .set('Authorization', `Bearer ${customerA.token}`)
      .set('Idempotency-Key', `pay-stock-co-a-${Date.now()}`)
      .send({});
    expect(firstSession.status).toBe(201);
    const secondSession = await request(app.getHttpServer())
      .post('/api/v1/me/checkout/sessions?country=P3')
      .set('Authorization', `Bearer ${customerB.token}`)
      .set('Idempotency-Key', `pay-stock-co-b-${Date.now()}`)
      .send({});
    expect(secondSession.status).toBe(409);
    expect(JSON.stringify(secondSession.body)).toMatch(/Insufficient available quantity|OUT_OF_STOCK/i);
  });
});
