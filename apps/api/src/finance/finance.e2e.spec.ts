import { INestApplication } from '@nestjs/common';
import {
  OfferOwnership,
  OfferStatus,
  OrganizationKind,
  PaymentIntentStatus,
  PaymentMethodFamily,
  PolicyPackStatus,
  PayoutStatus,
  VendorPayableStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { applyTestIsolation } from '../test/isolate-runtime';
import { FinanceService } from './finance.service';

async function signIn(app: INestApplication, email: string, audience: 'admin' | 'customer' = 'customer') {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

describe('finance ledger (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let finance: FinanceService;

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
    finance = app.get(FinanceService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('posts balanced journals, freezes take-rate, keeps NULL freight unknown, and blocks UNKNOWN payout retry', async () => {
    const doc = emptyPolicyDocument();
    doc.services.pharmacy = true;
    doc.payments.enabled = true;
    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'FQ' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'FQ',
          isoAlpha3: 'FQQ',
          nameI18n: { en: 'Finance test' },
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
          checksum: 'finance-test',
          publishedAt: new Date(),
        },
      });
      await prisma.country.update({ where: { id: country.id }, data: { publishedPolicyPackId: pack.id } });
    }
    await finance.ensureChart(country.id);
    const seller = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: 'Fin Vendor',
        displayName: 'Fin Vendor',
        status: 'ACTIVE',
      },
    });
    const brand = await prisma.catalogBrand.create({
      data: { id: uuidv7(), slug: `fin-b-${Date.now()}`, name: 'FinBrand' },
    });
    const item = await prisma.catalogItem.create({
      data: {
        id: uuidv7(),
        slug: `fin-i-${Date.now()}`,
        kind: 'OTC',
        brandId: brand.id,
        createdByOrgId: seller.id,
        status: 'PUBLISHED',
      },
    });
    const variant = await prisma.catalogVariant.create({
      data: { id: uuidv7(), itemId: item.id, skuCode: `FIN-${Date.now()}`, packSize: '1' },
    });
    const offer = await prisma.catalogOffer.create({
      data: {
        id: uuidv7(),
        variantId: variant.id,
        sellerOrgId: seller.id,
        countryId: country.id,
        ownership: OfferOwnership.VENDOR_OWNED,
        status: OfferStatus.PUBLISHED,
        currency: 'XXX',
      },
    });
    await prisma.priceVersion.create({
      data: {
        id: uuidv7(),
        offerId: offer.id,
        version: 1,
        currency: 'XXX',
        costMinor: 400n,
        sellMinor: 1000n,
        validFrom: new Date(),
        isCurrent: true,
      },
    });
    await prisma.commercialRule.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        sellerOrgId: seller.id,
        takeBps: 1200,
        takeFlatMinor: 0n,
        priority: 10,
        validFrom: new Date(),
      },
    });
    const customer = await signIn(app, `fin-c-${Date.now()}@example.com`);
    const admin = await signIn(app, `fin-a-${Date.now()}@example.com`, 'admin');
    const role = await prisma.role.findUnique({ where: { code: 'super_admin' } });
    await prisma.membership.create({
      data: { id: uuidv7(), personId: admin.personId, roleId: role!.id, scope: 'platform', status: 'ACTIVE' },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: seller.id,
        countryId: country.id,
        kind: 'VENDOR_WAREHOUSE',
        name: 'Fin WH',
        timezone: 'UTC',
      },
    });
    const cart = await prisma.cart.create({
      data: {
        id: uuidv7(),
        customerPersonId: customer.personId,
        countryId: country.id,
        sellerOrgId: seller.id,
      },
    });
    const checkout = await prisma.checkoutSession.create({
      data: {
        id: uuidv7(),
        customerPersonId: customer.personId,
        countryId: country.id,
        cartId: cart.id,
        sellerOrgId: seller.id,
        status: 'READY_FOR_PAYMENT',
        idempotencyKey: `fin-co-${Date.now()}`,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const quote = await prisma.checkoutQuote.create({
      data: {
        id: uuidv7(),
        sessionId: checkout.id,
        fingerprint: 'fin',
        currency: 'XXX',
        sellMinor: 1000n,
        totalMinor: 1000n,
        payload: {},
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const intent = await prisma.paymentIntent.create({
      data: {
        id: uuidv7(),
        checkoutSessionId: checkout.id,
        checkoutQuoteId: quote.id,
        customerPersonId: customer.personId,
        countryId: country.id,
        method: PaymentMethodFamily.CARD,
        status: PaymentIntentStatus.CAPTURED,
        amountMinor: 1000n,
        capturedMinor: 1000n,
        currency: 'XXX',
        idempotencyKey: `fin-pay-${Date.now()}`,
      },
    });
    const order = await prisma.order.create({
      data: {
        id: uuidv7(),
        orderNumber: `FIN-${Date.now()}`,
        customerPersonId: customer.personId,
        sellerOrgId: seller.id,
        countryId: country.id,
        checkoutSessionId: checkout.id,
        checkoutQuoteId: quote.id,
        paymentIntentId: intent.id,
        fulfillingLocationId: location.id,
        currency: 'XXX',
        goodsMinor: 1000n,
        totalMinor: 1000n,
      },
    });
    await prisma.orderItem.create({
      data: {
        id: uuidv7(),
        orderId: order.id,
        offerId: offer.id,
        variantId: variant.id,
        sku: 'FIN-SKU',
        title: 'Fin item',
        qty: 1,
        unitMinor: 1000n,
        lineMinor: 1000n,
        currency: 'XXX',
      },
    });
    await prisma.orderPromoSnapshot.create({
      data: {
        id: uuidv7(),
        orderId: order.id,
        discountMinor: 100n,
        funding: 'SPLIT',
        platformMinor: 60n,
        vendorMinor: 40n,
      },
    });
    await prisma.orderAffiliateSnapshot.create({
      data: {
        id: uuidv7(),
        orderId: order.id,
        affiliateCode: 'AFF1',
        estimateMinor: 20n,
        clinicalBlocked: false,
        payable: true,
      },
    });
    const group = await prisma.fulfillmentGroup.create({
      data: { id: uuidv7(), orderId: order.id, locationId: location.id },
    });
    const shipment = await prisma.shipment.create({
      data: {
        id: uuidv7(),
        orderId: order.id,
        groupId: group.id,
        locationId: location.id,
        sellerOrgId: seller.id,
        countryId: country.id,
        customerPersonId: customer.personId,
        status: 'LABEL_CREATED',
        currency: 'XXX',
      },
    });
    await finance.syncOrder(order.id);
    await finance.recordGatewayFee({
      paymentIntentId: intent.id,
      amountMinor: 30n,
      currency: 'XXX',
      sourceKey: `fee:${intent.id}`,
    });
    await prisma.carrierCost.create({
      data: { id: uuidv7(), shipmentId: shipment.id, kind: 'quoted', amountMinor: 50n, currency: 'XXX' },
    });
    await finance.syncCarrier(shipment.id);
    const beforeActual = await finance.getContribution(order.id);
    expect(beforeActual.actual_carrier_cost_minor).toBeNull();
    expect(beforeActual.status).toBe('PROVISIONAL');
    expect(beforeActual.not_net_profit).toBe(true);

    await prisma.carrierCost.create({
      data: { id: uuidv7(), shipmentId: shipment.id, kind: 'actual', amountMinor: 80n, currency: 'XXX' },
    });
    await finance.syncCarrier(shipment.id);

    const journals = await request(app.getHttpServer())
      .get('/api/v1/admin/finance/ledger')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(journals.status).toBe(200);
    for (const row of journals.body.data as Array<{ balanced: boolean }>) {
      expect(row.balanced).toBe(true);
    }
    const payable = await prisma.vendorPayable.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(payable.takeBpsFrozen).toBe(1200);
    await prisma.commercialRule.updateMany({ where: { sellerOrgId: seller.id }, data: { takeBps: 1500 } });
    await finance.syncOrder(order.id);
    expect((await prisma.vendorPayable.findUniqueOrThrow({ where: { orderId: order.id } })).takeBpsFrozen).toBe(1200);

    await finance.transitionPayable(payable.id, VendorPayableStatus.ELIGIBLE);
    await finance.transitionPayable(payable.id, VendorPayableStatus.APPROVED);
    const batch = await finance.openSettlement({ personId: admin.personId } as never, country.id, 'XXX');
    const otherAdmin = await signIn(app, `fin-a2-${Date.now()}@example.com`, 'admin');
    await prisma.membership.create({
      data: { id: uuidv7(), personId: otherAdmin.personId, roleId: role!.id, scope: 'platform', status: 'ACTIVE' },
    });
    await prisma.settlementPolicy.update({ where: { countryId: country.id }, data: { dualControl: true } });
    const selfApprove = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/settlements/${batch.id}/approve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({});
    expect(selfApprove.status).toBe(409);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/settlements/${batch.id}/approve`)
      .set('Authorization', `Bearer ${otherAdmin.token}`)
      .send({});
    const key = `payout-${order.id}`;
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/settlements/${batch.id}/payouts`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ idempotency_key: key, scenario: 'UNKNOWN' });
    const payoutRow = await prisma.payout.findUniqueOrThrow({ where: { idempotencyKey: key } });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/payouts/${payoutRow.id}/execute`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect((await prisma.payout.findUniqueOrThrow({ where: { id: payoutRow.id } })).status).toBe(PayoutStatus.UNKNOWN);
    const retry = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/payouts/${payoutRow.id}/execute`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(retry.status).toBe(409);
    expect((await finance.submitPayout({ personId: admin.personId } as never, batch.id, key, 'SUCCESS')).id).toBe(
      payoutRow.id,
    );

    expect(
      (
        await request(app.getHttpServer())
          .get('/api/v1/admin/finance/dashboard')
          .set('Authorization', `Bearer ${customer.token}`)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app.getHttpServer())
          .get(`/api/v1/vendor/settlements?seller_org_id=${seller.id}`)
          .set('Authorization', `Bearer ${customer.token}`)
      ).status,
    ).toBe(403);

    const contribution = await finance.getContribution(order.id);
    expect(contribution.actual_carrier_cost_minor).toBe('80');
    expect(contribution.gateway_fee_minor).toBe('30');
    expect(contribution.promo_cost_minor).toBe('60');
    expect(contribution.not_net_profit).toBe(true);
    const failedIntent = await prisma.paymentIntent.create({
      data: {
        id: uuidv7(),
        checkoutSessionId: checkout.id,
        checkoutQuoteId: quote.id,
        customerPersonId: customer.personId,
        countryId: country.id,
        method: PaymentMethodFamily.CARD,
        status: PaymentIntentStatus.FAILED,
        amountMinor: 500n,
        currency: 'XXX',
        idempotencyKey: `fin-fail-${Date.now()}`,
      },
    });
    await finance.syncPayment(failedIntent.id);
    expect(await prisma.financialFact.count({ where: { paymentIntentId: failedIntent.id, kind: 'CAPTURE' } })).toBe(0);
  });
});
