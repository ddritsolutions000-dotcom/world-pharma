import { INestApplication } from '@nestjs/common';
import {
  AffiliateLiabilityStatus,
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

describe('affiliate acquisition to commission (e2e)', () => {
  jest.setTimeout(180_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let countryId: string;
  const iso = 'AF';

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
          isoAlpha3: 'AFX',
          nameI18n: { en: 'Affiliate test' },
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
          checksum: `aff-acq-${Date.now()}`,
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
        legalName: `Aff ${suffix}`,
        displayName: `Aff ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
    });
    const admin = await bootstrapSuperAdminByEmail(app, prisma, `aff-admin-${suffix}@example.com`);
    const affiliateCustomer = await signInAudience(app, `aff-partner-${suffix}@example.com`, 'customer');
    const orgRole = await prisma.role.findUnique({ where: { code: 'org_owner' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: affiliateCustomer.personId,
        roleId: orgRole!.id,
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
    const codeRes = await request(app.getHttpServer())
      .post('/api/v1/me/affiliate/codes')
      .set('Authorization', `Bearer ${affiliateSession.token}`)
      .set('Idempotency-Key', `aff-code-${suffix}`)
      .send({ country_code: iso, code: `AFF${suffix.slice(-6)}` });
    expect(codeRes.status).toBeLessThan(300);
    return { admin, affiliateSession, affOrg, referralCode: codeRes.body.code as string };
  }

  async function createAttributedOrder(suffix: string, referralCode: string) {
    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.VENDOR,
        legalName: `Aff Vendor ${suffix}`,
        displayName: `Aff Vendor ${suffix}`,
        status: 'ACTIVE',
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'Aff WH',
        timezone: 'UTC',
      },
    });
    const admin = await bootstrapSuperAdminByEmail(app, prisma, `aff-vadmin-${suffix}@example.com`);
    const vendorUser = await signInAudience(app, `aff-vendor-${suffix}@example.com`, 'customer');
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
      .send({ slug: `aff-brand-${suffix}`, name: 'AffBrand' });
    expect(brand.status).toBeLessThan(300);
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: `aff-item-${suffix}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'Aff zinc',
        countries: [{ country_code: iso }],
      });
    expect(item.status).toBeLessThan(300);
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku_code: `AFF-SKU-${suffix}`, pack_size: '10' });
    expect(variant.status).toBeLessThan(300);
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
        sell_minor: '2000',
      });
    expect(offer.status).toBeLessThan(300);
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
        lotCode: `AFF-LOT-${suffix}`,
        status: InventoryLotStatus.ACTIVE,
      },
    });
    await prisma.inventoryBalance.create({
      data: { id: uuidv7(), lotId: lot.id, onHand: 40, available: 40 },
    });
    const customer = await signInAudience(app, `aff-cust-${suffix}@example.com`, 'customer');
    const addCart = await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${iso}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `aff-add-${suffix}`)
      .send({ offer_id: offer.body.id, qty: 1 });
    expect(addCart.status).toBeLessThan(300);

    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${iso}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `aff-co-${suffix}`)
      .send({ affiliate_code: referralCode });
    expect(session.status).toBeLessThan(300);
    expect(session.body.affiliate?.payable).toBe(true);
    expect(BigInt(session.body.affiliate?.preview_minor ?? '0')).toBeGreaterThan(0n);

    const paid = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `aff-pay-${suffix}`)
      .send({ method: 'CARD', scenario: 'success' });
    const order = await request(app.getHttpServer())
      .post('/api/v1/me/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `aff-ord-${suffix}`)
      .send({ payment_intent_id: paid.body.id });
    expect(order.status).toBeLessThan(300);

    const snapshot = await prisma.orderAffiliateSnapshot.findFirstOrThrow({ where: { orderId: order.body.id } });
    expect(snapshot.payable).toBe(true);
    expect(snapshot.estimateMinor).toBeGreaterThan(0n);

    const liability = await prisma.affiliateLiability.findUnique({ where: { orderId: order.body.id } });
    expect(liability?.status).toBe(AffiliateLiabilityStatus.PENDING);
    expect(liability?.affiliateCode).toBe(referralCode);

    return { admin, customer, orderId: order.body.id as string, paymentIntentId: paid.body.id as string, liability, referralCode };
  }

  it('records commission from attributed sandbox order through to affiliate earnings', async () => {
    const suffix = `${Date.now()}`;
    const { admin, affiliateSession, referralCode } = await setupAffiliate(suffix);
    const { orderId, liability } = await createAttributedOrder(suffix, referralCode);

    const earnings = await request(app.getHttpServer())
      .get('/api/v1/me/affiliate/earnings')
      .set('Authorization', `Bearer ${affiliateSession.token}`);
    expect(earnings.status).toBeLessThan(300);
    expect(earnings.body.live_payout).toBe(false);
    expect((earnings.body.data as Array<{ order_id: string }>).some((row) => row.order_id === orderId)).toBe(true);

    const stats = await request(app.getHttpServer())
      .get(`/api/v1/me/affiliate/stats?country_code=${iso}`)
      .set('Authorization', `Bearer ${affiliateSession.token}`);
    expect(stats.body.conversions_total).toBeGreaterThanOrEqual(1);
    expect(stats.body.sandbox).toBe(true);

    const approve = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/affiliate/${orderId}/approve`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(approve.status).toBeLessThan(300);
    const approved = await prisma.affiliateLiability.findUniqueOrThrow({ where: { orderId } });
    expect(approved.status).toBe(AffiliateLiabilityStatus.APPROVED);

    const dupSync = await prisma.affiliateLiability.count({ where: { orderId } });
    expect(dupSync).toBe(1);
    expect(approved.amountMinor).toBe(liability!.amountMinor);
  });

  it('reverses commission on full refund and blocks cross-affiliate earnings access', async () => {
    const suffix = `ref-${Date.now()}`;
    const { admin, affiliateSession, referralCode } = await setupAffiliate(suffix);
    const other = await setupAffiliate(`${suffix}-b`);
    const { orderId, paymentIntentId } = await createAttributedOrder(suffix, referralCode);

    const steal = await request(app.getHttpServer())
      .get('/api/v1/me/affiliate/earnings')
      .set('Authorization', `Bearer ${other.affiliateSession.token}`);
    expect(steal.status).toBeLessThan(300);
    expect((steal.body.data as Array<{ order_id: string }>).some((row) => row.order_id === orderId)).toBe(false);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const refund = await request(app.getHttpServer())
      .post(`/api/v1/admin/payments/${paymentIntentId}/refund`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set('Idempotency-Key', `aff-ref-${suffix}`)
      .send({ amount_minor: order.totalMinor.toString() });
    expect(refund.status).toBeLessThan(300);

    const reversed = await prisma.affiliateLiability.findUniqueOrThrow({ where: { orderId } });
    expect(reversed.status).toBe(AffiliateLiabilityStatus.REVERSED);
  });

  it('rejects unauthenticated affiliate earnings', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/me/affiliate/earnings');
    expect(res.status).toBe(401);
  });
});
