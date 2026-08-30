import { INestApplication } from '@nestjs/common';
import { InventoryLotStatus, LocationKind, OrganizationKind, PromoCampaignStatus, CheckoutStatus } from '@prisma/client';
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

async function signIn(
  app: INestApplication,
  email: string,
  audience: 'admin' | 'customer' = 'customer',
) {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

async function grantRole(
  prisma: PrismaService,
  personId: string,
  roleCode: string,
  scope: 'platform' | 'country' = 'platform',
  countryId?: string,
) {
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  await prisma.membership.create({
    data: {
      id: uuidv7(),
      personId,
      roleId: role!.id,
      scope,
      countryId: scope === 'country' ? countryId : undefined,
      status: 'ACTIVE',
    },
  });
}

async function enablePharmacyPack(app: INestApplication, prisma: PrismaService, iso = 'XX') {
  const doc = emptyPolicyDocument();
  doc.services.pharmacy = true;
  enableMarketplaceVendorPack(doc);
  const country = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: iso } });
  await prisma.policyPack.updateMany({
    where: { countryId: country.id, status: 'PUBLISHED' },
    data: { document: doc as never },
  });
  await app.get(PolicyCache).invalidate(iso);
  return country;
}

async function seedCustomerCheckout(
  app: INestApplication,
  prisma: PrismaService,
  suffix: string,
  countryIso = 'XX',
) {
  const country = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: countryIso } });
  const vendor = await prisma.organization.create({
    data: {
      id: uuidv7(),
      countryId: country.id,
      kind: OrganizationKind.VENDOR,
      legalName: `Promo Vendor ${suffix}`,
      displayName: `Promo Vendor ${suffix}`,
      status: 'ACTIVE',
    },
  });
  const location = await prisma.location.create({
    data: {
      id: uuidv7(),
      organizationId: vendor.id,
      countryId: country.id,
      kind: LocationKind.VENDOR_WAREHOUSE,
      name: 'WH',
      timezone: 'UTC',
    },
  });
  const superAdmin = await signIn(app, `r12c-sa-${suffix}@example.com`, 'admin');
  const saRole = await prisma.role.findUnique({ where: { code: 'super_admin' } });
  await prisma.membership.create({
    data: { id: uuidv7(), personId: superAdmin.personId, roleId: saRole!.id, scope: 'platform', status: 'ACTIVE' },
  });
  const vendorUser = await signIn(app, `r12c-vendor-${suffix}@example.com`, 'admin');
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
    adminToken: superAdmin.token,
    sellerOrgId: vendor.id,
  });
  const brand = await request(app.getHttpServer())
    .post('/api/v1/admin/catalog/brands')
    .set('Authorization', `Bearer ${superAdmin.token}`)
    .send({ slug: `promo-brand-${suffix}`, name: 'PromoBrand' });
  const item = await request(app.getHttpServer())
    .post('/api/v1/admin/catalog/items')
    .set('Authorization', `Bearer ${superAdmin.token}`)
    .send({
      slug: `promo-item-${suffix}`,
      kind: 'OTC',
      brand_id: brand.body.id,
      title: 'Promo item',
      countries: [{ country_code: countryIso }],
    });
  const variant = await request(app.getHttpServer())
    .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
    .set('Authorization', `Bearer ${superAdmin.token}`)
    .send({ sku_code: `PROMO-SKU-${suffix}`, pack_size: '10' });
  await request(app.getHttpServer())
    .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
    .set('Authorization', `Bearer ${superAdmin.token}`);
  const offer = await request(app.getHttpServer())
    .post('/api/v1/vendor/catalog/offers')
    .set('Authorization', `Bearer ${vendorUser.token}`)
    .send({
      variant_id: variant.body.id,
      seller_org_id: vendor.id,
      country_code: countryIso,
      ownership: 'VENDOR_OWNED',
      currency: 'USD',
      cost_minor: '1000',
      sell_minor: '10000',
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
      lotCode: `LOT-${suffix}`,
      status: InventoryLotStatus.ACTIVE,
    },
  });
  await prisma.inventoryBalance.create({
    data: { id: uuidv7(), lotId: lot.id, onHand: 10, available: 10 },
  });
  const customer = await signIn(app, `r12c-cust-${suffix}@example.com`);
  const added = await request(app.getHttpServer())
    .post(`/api/v1/me/cart/items?country=${countryIso}`)
    .set('Authorization', `Bearer ${customer.token}`)
    .set('Idempotency-Key', `cart-${suffix}`)
    .send({ offer_id: offer.body.id, qty: 1 });
  expect(added.status).toBe(201);
  const cart = await prisma.cart.findFirstOrThrow({
    where: { customerPersonId: customer.personId, countryId: country.id },
  });
  const session = await prisma.checkoutSession.create({
    data: {
      id: uuidv7(),
      customerPersonId: customer.personId,
      countryId: country.id,
      cartId: cart.id,
      sellerOrgId: cart.sellerOrgId!,
      status: CheckoutStatus.VALIDATING,
      idempotencyKey: `co-${suffix}`,
      expiresAt: new Date(Date.now() + 900_000),
    },
  });
  return { customer, sessionId: session.id, countryId: country.id };
}

describe('R12-C promo kernel (e2e)', () => {
  jest.setTimeout(180_000);
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
    await enablePharmacyPack(app, prisma, 'XX');
  });

  afterAll(async () => {
    await app.close();
  });

  it('unauthenticated promo admin returns 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/admin/promo/campaigns?country_code=XX');
    expect(res.status).toBe(401);
  });

  it('unauthorized admin without promo:manage returns 403 on create', async () => {
    const suffix = Date.now().toString(36);
    const email = `r12c-no-promo-${suffix}@example.com`;
    await signIn(app, email);
    const admin = await signIn(app, email, 'admin');
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/promo/campaigns')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ country_code: 'XX', code: `NOP-${suffix}`, kind: 'PERCENT', percent_bps: 500 });
    expect(res.status).toBe(403);
  });

  it('admin create → activate → customer apply with authoritative discount', async () => {
    const suffix = Date.now().toString(36);
    const agentEmail = `r12c-agent-${suffix}@example.com`;
    const seeded = await signIn(app, agentEmail);
    await grantRole(prisma, seeded.personId, 'company_operations');
    const agent = await signIn(app, agentEmail, 'admin');

    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/promo/campaigns')
      .set('Authorization', `Bearer ${agent.token}`)
      .set('Idempotency-Key', `create-${suffix}`)
      .send({
        country_code: 'XX',
        code: `SAVE10-${suffix}`,
        kind: 'PERCENT',
        percent_bps: 1000,
        min_basket_minor: '0',
      });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('DRAFT');

    const activated = await request(app.getHttpServer())
      .patch(`/api/v1/admin/promo/campaigns/${created.body.id}`)
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ country_code: 'XX', status: 'ACTIVE', version: created.body.version });
    expect(activated.status).toBe(200);
    expect(activated.body.status).toBe('ACTIVE');

    const invalidTransition = await request(app.getHttpServer())
      .patch(`/api/v1/admin/promo/campaigns/${created.body.id}`)
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ country_code: 'XX', status: 'DRAFT', version: activated.body.version });
    expect(invalidTransition.status).toBe(409);

    const versionConflict = await request(app.getHttpServer())
      .patch(`/api/v1/admin/promo/campaigns/${created.body.id}`)
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ country_code: 'XX', status: 'PAUSED', version: created.body.version });
    expect(versionConflict.status).toBe(409);

    const { customer, sessionId } = await seedCustomerCheckout(app, prisma, suffix);

    await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${sessionId}/promo`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ promo_code: `SAVE10-${suffix}` });

    const quoted = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${sessionId}/quote`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `quote-${suffix}`);
    if (quoted.status !== 201) {
      throw new Error(`quote failed: ${quoted.status} ${JSON.stringify(quoted.body)}`);
    }
    expect(quoted.body.quote.discount_minor).toBe('1000');
    expect(quoted.body.quote.total_minor).toBe('9000');
    expect((quoted.body.quote.payload as { promo?: { code?: string } }).promo?.code).toBe(`SAVE10-${suffix}`.toUpperCase());

    const redemptions = await request(app.getHttpServer())
      .get(`/api/v1/admin/promo/campaigns/${created.body.id}/redemptions?country_code=XX`)
      .set('Authorization', `Bearer ${agent.token}`);
    expect(redemptions.status).toBe(200);
  });

  it('rejects inactive draft promo at quote time', async () => {
    const suffix = Date.now().toString(36);
    const code = `DRAFT-${suffix}`;
    const country = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'XX' } });
    await prisma.promoCampaign.create({
      data: {
        id: uuidv7(),
        code,
        kind: 'PERCENT',
        percentBps: 500,
        countryId: country.id,
        status: PromoCampaignStatus.DRAFT,
      },
    });

    const { customer, sessionId } = await seedCustomerCheckout(app, prisma, `draft-${suffix}`);

    await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${sessionId}/promo`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ promo_code: code });

    const quoted = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${sessionId}/quote`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `quote-draft-${suffix}`);
    expect(quoted.status).toBe(422);
    expect(quoted.body.code).toBe('PROMO_INVALID');
  });

  it('rejects wrong-country promo', async () => {
    const suffix = Date.now().toString(36);
    let other = await prisma.country.findUnique({ where: { isoAlpha2: 'YY' } });
    if (!other) {
      other = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'YY',
          isoAlpha3: 'YYY',
          nameI18n: { en: 'Other' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'USD',
          defaultTimezone: 'UTC',
          dataResidencyMode: 'shared',
        },
      });
    }
    const code = `YYONLY-${suffix}`;
    await prisma.promoCampaign.create({
      data: {
        id: uuidv7(),
        code,
        kind: 'PERCENT',
        percentBps: 500,
        countryId: other.id,
        status: PromoCampaignStatus.ACTIVE,
      },
    });

    const { customer, sessionId } = await seedCustomerCheckout(app, prisma, `wrong-${suffix}`);

    await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${sessionId}/promo`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ promo_code: code });

    const quoted = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${sessionId}/quote`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `quote-wrong-${suffix}`);
    expect(quoted.status).toBe(422);
    expect(quoted.body.code).toBe('PROMO_INVALID');
  });

  it('terminal EXPIRED promo cannot change status', async () => {
    const suffix = Date.now().toString(36);
    const agentEmail = `r12c-term-${suffix}@example.com`;
    const seeded = await signIn(app, agentEmail);
    await grantRole(prisma, seeded.personId, 'company_finance');
    const agent = await signIn(app, agentEmail, 'admin');
    const country = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'XX' } });
    const row = await prisma.promoCampaign.create({
      data: {
        id: uuidv7(),
        code: `EXP-${suffix}`,
        kind: 'PERCENT',
        percentBps: 100,
        countryId: country.id,
        status: PromoCampaignStatus.EXPIRED,
      },
    });
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/promo/campaigns/${row.id}`)
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ country_code: 'XX', status: 'ACTIVE', version: row.version });
    expect(res.status).toBe(409);
  });
});
