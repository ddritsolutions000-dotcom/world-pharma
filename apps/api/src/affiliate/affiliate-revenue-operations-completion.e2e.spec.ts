import { INestApplication } from '@nestjs/common';
import {
  AffiliateLiabilityStatus,
  AffiliateReferralCodeStatus,
  InventoryLotStatus,
  LocationKind,
  OrganizationKind,
  OrganizationStatus,
  PolicyPackStatus,
  ShipmentStatus,
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
import { bootstrapSuperAdminByEmail, signIn as signInAudience } from '../test/sign-in';
import { SessionService } from '../identity/session.service';
import { FinanceService } from '../finance/finance.service';

const iso = 'A7';

async function issueAffiliateToken(
  app: INestApplication,
  prisma: PrismaService,
  personId: string,
  organizationId: string,
  countryId: string,
) {
  const account = await prisma.account.findUniqueOrThrow({ where: { personId } });
  const membership = await prisma.membership.findFirst({
    where: { personId, organizationId, status: 'ACTIVE', deletedAt: null },
    include: { role: true },
  });
  const issued = await app.get(SessionService).issue({
    personId,
    accountId: account.id,
    audience: 'customer',
    membershipId: membership?.id,
    organizationId,
    countryId,
    roles: membership ? [membership.role.code] : [],
  });
  return { token: issued.accessToken, personId };
}

describe('affiliate revenue operations completion (e2e)', () => {
  jest.setTimeout(240_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let finance: FinanceService;
  let countryId: string;

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

    const doc = emptyPolicyDocument();
    doc.services.pharmacy = true;
    enableMarketplaceVendorPack(doc);
    doc.payments.enabled = true;
    doc.payments.methods = ['CARD', 'COD'];
    doc.payments.gateway_refs = ['MOCK_PRIMARY'];
    doc.payments.currencies = ['XXX'];
    doc.shipping.domestic = true;
    doc.commerce = {
      platform_fee_bps: 200,
      platform_fee_flat_minor: 0,
      delivery_fee_minor: 4900,
      packaging_fee_minor: 0,
      handling_fee_minor: 0,
      payment_convenience_fee_minor: 0,
      free_delivery_threshold_minor: null,
      carrier_cost_estimate_minor: 6500,
      affiliate_commission_bps: 500,
    };
    doc.partner_types.AFFILIATE.enabled = true;
    doc.partner_types.AFFILIATE.join_public = true;

    let country = await prisma.country.findUnique({ where: { isoAlpha2: iso } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: iso,
          isoAlpha3: 'AX7',
          nameI18n: { en: 'Affiliate revenue test' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
          dataResidencyMode: 'shared',
        },
      });
    }
    if (country.publishedPolicyPackId) {
      await prisma.policyPack.update({
        where: { id: country.publishedPolicyPackId },
        data: { document: doc as never },
      });
    } else {
      const pack = await prisma.policyPack.create({
        data: {
          id: uuidv7(),
          countryId: country.id,
          version: Math.floor(Date.now() % 1_000_000) + Math.floor(Math.random() * 1000),
          status: PolicyPackStatus.PUBLISHED,
          document: doc as never,
          checksum: `aff-rev-${Date.now()}`,
          publishedAt: new Date(),
        },
      });
      await prisma.country.update({ where: { id: country.id }, data: { publishedPolicyPackId: pack.id } });
    }
    countryId = country.id;
    await app.get(PolicyCache).invalidate(iso);
  });

  afterAll(async () => {
    await app.close();
  });

  async function setupAffiliate(suffix: string) {
    const affOrg = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.AFFILIATE_ORG,
        legalName: `Aff Rev ${suffix}`,
        displayName: `Aff Rev ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
    });
    const affiliateCustomer = await signInAudience(app, `aff-rev-${suffix}@example.com`, 'customer');
    const orgRole = await prisma.role.findUniqueOrThrow({ where: { code: 'org_owner' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: affiliateCustomer.personId,
        roleId: orgRole.id,
        scope: 'organization',
        organizationId: affOrg.id,
        status: 'ACTIVE',
      },
    });
    const affiliateSession = await issueAffiliateToken(
      app,
      prisma,
      affiliateCustomer.personId,
      affOrg.id,
      countryId,
    );
    // Use alphanumeric suffix (not slice(-6)): patterned suffixes like
    // `${ts}-self` / `${ts}-inactive` collapse to colliding codes (e.g. REVactive).
    const codeToken = suffix.replace(/[^a-zA-Z0-9]/g, '').slice(-14).toUpperCase();
    const codeRes = await request(app.getHttpServer())
      .post('/api/v1/me/affiliate/codes')
      .set('Authorization', `Bearer ${affiliateSession.token}`)
      .set('Idempotency-Key', `aff-rev-code-${suffix}`)
      .send({ country_code: iso, code: `REV${codeToken}` });
    expect(codeRes.status).toBeLessThan(300);
    const linkRes = await request(app.getHttpServer())
      .post('/api/v1/me/affiliate/links')
      .set('Authorization', `Bearer ${affiliateSession.token}`)
      .set('Idempotency-Key', `aff-rev-link-${suffix}`)
      .send({ country_code: iso, referral_code_id: codeRes.body.id, label: 'Primary' });
    expect(linkRes.status).toBeLessThan(300);
    return {
      affOrg,
      affiliateSession,
      referralCode: codeRes.body.code as string,
      referralCodeId: codeRes.body.id as string,
      referralCodeVersion: codeRes.body.version as number,
      linkId: linkRes.body.id as string,
      affiliateCustomer,
    };
  }

  async function createAttributedOrder(
    suffix: string,
    referralCode: string,
    options?: {
      clickId?: string;
      recordClick?: boolean;
      customerEmail?: string;
      affiliatePersonId?: string;
      expectAttribution?: boolean;
    },
  ) {
    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.VENDOR,
        legalName: `Aff Rev Vendor ${suffix}`,
        displayName: `Aff Rev Vendor ${suffix}`,
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'Aff Rev WH',
        timezone: 'UTC',
      },
    });
    const admin = await bootstrapSuperAdminByEmail(app, prisma, `aff-rev-vadmin-${suffix}@example.com`);
    const vendorUser = await signInAudience(app, `aff-rev-vendor-${suffix}@example.com`, 'customer');
    const orgRole = await prisma.role.findUniqueOrThrow({ where: { code: 'org_owner' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: vendorUser.personId,
        roleId: orgRole.id,
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
      .send({ slug: `aff-rev-brand-${suffix}`, name: 'AffRevBrand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: `aff-rev-item-${suffix}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'AffRev zinc',
        countries: [{ country_code: iso }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku_code: `AFF-REV-SKU-${suffix}`, pack_size: '10' });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);
    const offer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set('Authorization', `Bearer ${vendorUser.token}`)
      .send({
        variant_id: variant.body.id,
        seller_org_id: vendor.id,
        country_code: iso,
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '20000',
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
        countryId,
        lotCode: `AFF-REV-LOT-${suffix}`,
        status: InventoryLotStatus.ACTIVE,
      },
    });
    await prisma.inventoryBalance.create({
      data: { id: uuidv7(), lotId: lot.id, onHand: 40, available: 40 },
    });

    const customer = options?.affiliatePersonId
      ? { token: (await signInAudience(app, options.customerEmail ?? `aff-rev-cust-${suffix}@example.com`, 'customer')).token }
      : await signInAudience(app, options?.customerEmail ?? `aff-rev-cust-${suffix}@example.com`, 'customer');

    if (options?.clickId && options.recordClick !== false) {
      const clickRes = await request(app.getHttpServer())
        .post('/api/v1/public/affiliate/click')
        .send({
          click_id: options.clickId,
          country_code: iso,
          referral_code: referralCode,
        });
      expect(clickRes.status).toBeLessThan(300);
      expect(clickRes.body.recorded === true || clickRes.body.duplicate === true).toBe(true);
    }

    await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${iso}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `aff-rev-add-${suffix}`)
      .send({ offer_id: offer.body.id, qty: 1 });

    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${iso}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `aff-rev-co-${suffix}`)
      .send({
        affiliate_code: referralCode,
        ...(options?.clickId ? { click_id: options.clickId } : {}),
      });
    expect(session.status).toBeLessThan(300);
    const expectAttribution = options?.expectAttribution !== false;
    if (options?.clickId && options.recordClick !== false) {
      const clickRecorded = await prisma.affiliateClick.findUnique({ where: { clickId: options.clickId } });
      if (clickRecorded && expectAttribution) {
        expect(session.body.affiliate?.payable).toBe(true);
      } else if (!clickRecorded) {
        expect(session.body.affiliate?.code).toBeFalsy();
      } else {
        expect(session.body.affiliate?.payable).toBe(false);
      }
    } else if (expectAttribution) {
      expect(session.body.affiliate?.payable).toBe(true);
    } else if (options?.clickId) {
      expect(session.body.affiliate?.code).toBeFalsy();
    } else {
      expect(session.body.affiliate?.payable).toBe(false);
    }

    const paid = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `aff-rev-pay-${suffix}`)
      .send({ method: 'CARD', scenario: 'success' });
    const order = await request(app.getHttpServer())
      .post('/api/v1/me/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `aff-rev-ord-${suffix}`)
      .send({ payment_intent_id: paid.body.id });
    expect(order.status).toBeLessThan(300);

    const liability = await prisma.affiliateLiability.findUnique({ where: { orderId: order.body.id } });

    return {
      admin,
      customer,
      orderId: order.body.id as string,
      paymentIntentId: paid.body.id as string,
      liability,
      orderTotalMinor: (
        await prisma.order.findUniqueOrThrow({ where: { id: order.body.id } })
      ).totalMinor,
    };
  }

  async function markDeliveredAndSync(orderId: string) {
    const shipment = await prisma.shipment.findFirstOrThrow({ where: { orderId } });
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: { status: ShipmentStatus.DELIVERED },
    });
    await finance.syncOrder(orderId);
  }

  it('runs full affiliate revenue journey with lifecycle, statement, refunds, and security', async () => {
    const suffix = `${Date.now()}`;
    const clickId = uuidv7();
    const affiliateA = await setupAffiliate(`${suffix}-a`);
    const affiliateB = await setupAffiliate(`${suffix}-b`);
    const admin = await bootstrapSuperAdminByEmail(app, prisma, `aff-rev-main-admin-${suffix}@example.com`);

    const orderA = await createAttributedOrder(`${suffix}-main`, affiliateA.referralCode, { clickId });
    expect(orderA.liability).not.toBeNull();
    const originalCommission = orderA.liability!.amountMinor;

    await finance.syncOrder(orderA.orderId);
    const dupCount = await prisma.affiliateLiability.count({ where: { orderId: orderA.orderId } });
    expect(dupCount).toBe(1);

    const earningsA = await request(app.getHttpServer())
      .get('/api/v1/me/affiliate/earnings')
      .set('Authorization', `Bearer ${affiliateA.affiliateSession.token}`);
    expect(earningsA.status).toBeLessThan(300);
    expect(earningsA.body.live_payout).toBe(false);
    expect(earningsA.body.payout_execution_enabled).toBe(false);
    expect(earningsA.body.summary.pending_minor).toBe(originalCommission.toString());
    expect(
      (earningsA.body.data as Array<{ order_id: string }>).some((row) => row.order_id === orderA.orderId),
    ).toBe(true);

    const steal = await request(app.getHttpServer())
      .get('/api/v1/me/affiliate/earnings')
      .set('Authorization', `Bearer ${affiliateB.affiliateSession.token}`);
    expect(
      (steal.body.data as Array<{ order_id: string }>).some((row) => row.order_id === orderA.orderId),
    ).toBe(false);

    const approve = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/affiliate/${orderA.orderId}/approve`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(approve.status).toBeLessThan(300);
    let liability = await prisma.affiliateLiability.findUniqueOrThrow({ where: { orderId: orderA.orderId } });
    expect(liability.status).toBe(AffiliateLiabilityStatus.APPROVED);

    await markDeliveredAndSync(orderA.orderId);
    liability = await prisma.affiliateLiability.findUniqueOrThrow({ where: { orderId: orderA.orderId } });
    expect(liability.status).toBe(AffiliateLiabilityStatus.PAYABLE);

    const statement = await request(app.getHttpServer())
      .get('/api/v1/me/affiliate/statement')
      .set('Authorization', `Bearer ${affiliateA.affiliateSession.token}`);
    expect(statement.status).toBeLessThan(300);
    expect(statement.body.live_payout).toBe(false);
    expect(
      (statement.body.data as Array<{ order_id: string; status: string }>).some(
        (row) => row.order_id === orderA.orderId && row.status === 'PAYABLE',
      ),
    ).toBe(true);

    const csv = await request(app.getHttpServer())
      .get('/api/v1/me/affiliate/statement/export.csv')
      .set('Authorization', `Bearer ${affiliateA.affiliateSession.token}`);
    expect(csv.status).toBe(200);
    expect(csv.text).toContain(orderA.orderId);

    const forgeApprove = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/affiliate/${orderA.orderId}/approve`)
      .set('Authorization', `Bearer ${affiliateA.affiliateSession.token}`);
    expect(forgeApprove.status).toBeGreaterThanOrEqual(400);

    const forgePayout = await request(app.getHttpServer())
      .post('/api/v1/admin/finance/payouts/00000000-0000-7000-8000-000000000001/execute')
      .set('Authorization', `Bearer ${affiliateA.affiliateSession.token}`);
    expect(forgePayout.status).toBeGreaterThanOrEqual(400);

    const partialSuffix = `${suffix}-partial`;
    const partialOrder = await createAttributedOrder(partialSuffix, affiliateA.referralCode);
    expect(partialOrder.liability).not.toBeNull();
    const partialOriginal = partialOrder.liability!.amountMinor;
    const partialAmount = partialOrder.orderTotalMinor / 2n;
    const partialRefund = await request(app.getHttpServer())
      .post(`/api/v1/admin/payments/${partialOrder.paymentIntentId}/refund`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set('Idempotency-Key', `aff-rev-partial-${suffix}`)
      .send({ amount_minor: partialAmount.toString() });
    expect(partialRefund.status).toBeLessThan(300);
    await finance.syncOrder(partialOrder.orderId);
    const partialLiability = await prisma.affiliateLiability.findUniqueOrThrow({
      where: { orderId: partialOrder.orderId },
    });
    expect(partialLiability.status).not.toBe(AffiliateLiabilityStatus.REVERSED);
    expect(partialLiability.amountMinor).toBeLessThan(partialOriginal);
    expect(partialLiability.amountMinor).toBeGreaterThan(0n);

    const dupRefund = await request(app.getHttpServer())
      .post(`/api/v1/admin/payments/${partialOrder.paymentIntentId}/refund`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set('Idempotency-Key', `aff-rev-partial-${suffix}`)
      .send({ amount_minor: partialAmount.toString() });
    expect(dupRefund.status).toBeLessThan(300);
    await finance.syncOrder(partialOrder.orderId);
    const afterDup = await prisma.affiliateLiability.findUniqueOrThrow({
      where: { orderId: partialOrder.orderId },
    });
    expect(afterDup.amountMinor).toBe(partialLiability.amountMinor);

    const fullSuffix = `${suffix}-full`;
    const fullOrder = await createAttributedOrder(fullSuffix, affiliateA.referralCode);
    const fullRefund = await request(app.getHttpServer())
      .post(`/api/v1/admin/payments/${fullOrder.paymentIntentId}/refund`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set('Idempotency-Key', `aff-rev-full-${suffix}`)
      .send({ amount_minor: fullOrder.orderTotalMinor.toString() });
    expect(fullRefund.status).toBeLessThan(300);
    await finance.syncOrder(fullOrder.orderId);
    const reversed = await prisma.affiliateLiability.findUniqueOrThrow({ where: { orderId: fullOrder.orderId } });
    expect(reversed.status).toBe(AffiliateLiabilityStatus.REVERSED);

    const cancelSuffix = `${suffix}-cancel`;
    const cancelOrder = await createAttributedOrder(cancelSuffix, affiliateA.referralCode);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/affiliate/${cancelOrder.orderId}/approve`)
      .set('Authorization', `Bearer ${admin.token}`);
    await prisma.order.update({ where: { id: cancelOrder.orderId }, data: { status: 'CANCELLED' } });
    await finance.syncOrder(cancelOrder.orderId);
    const cancelled = await prisma.affiliateLiability.findUniqueOrThrow({ where: { orderId: cancelOrder.orderId } });
    expect(cancelled.status).toBe(AffiliateLiabilityStatus.REVERSED);

    const selfSuffix = `${suffix}-self`;
    const selfSetup = await setupAffiliate(selfSuffix);
    const selfCustomer = await signInAudience(app, `aff-rev-self-cust-${suffix}@example.com`, 'customer');
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: selfCustomer.personId,
        roleId: (await prisma.role.findUniqueOrThrow({ where: { code: 'org_owner' } })).id,
        scope: 'organization',
        organizationId: selfSetup.affOrg.id,
        status: 'ACTIVE',
      },
    });
    const selfOrder = await createAttributedOrder(`${suffix}-selford`, selfSetup.referralCode, {
      customerEmail: `aff-rev-self-cust-${suffix}@example.com`,
      expectAttribution: false,
    });
    expect(selfOrder.liability).toBeNull();

    const inactiveSuffix = `${suffix}-inactive`;
    const inactiveSetup = await setupAffiliate(inactiveSuffix);
    await request(app.getHttpServer())
      .patch(`/api/v1/me/affiliate/codes/${inactiveSetup.referralCodeId}`)
      .set('Authorization', `Bearer ${inactiveSetup.affiliateSession.token}`)
      .send({
        country_code: iso,
        status: AffiliateReferralCodeStatus.INACTIVE,
        version: inactiveSetup.referralCodeVersion,
      });
    const inactiveOrder = await createAttributedOrder(`${suffix}-inactive-ord`, inactiveSetup.referralCode, {
      expectAttribution: false,
    });
    expect(inactiveOrder.liability).toBeNull();

    const wrongClickOrder = await createAttributedOrder(`${suffix}-wrong-click`, affiliateA.referralCode, {
      clickId: uuidv7(),
      recordClick: false,
      expectAttribution: false,
    });
    expect(wrongClickOrder.liability).toBeNull();

    const stats = await request(app.getHttpServer())
      .get(`/api/v1/me/affiliate/stats?country_code=${iso}`)
      .set('Authorization', `Bearer ${affiliateA.affiliateSession.token}`);
    expect(stats.body.payout_enabled).toBe(false);
    expect(stats.body.payout_status).toBe('external_gated');
    expect(stats.body.sandbox).toBe(true);
  });
});
