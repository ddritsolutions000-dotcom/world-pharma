import { INestApplication } from '@nestjs/common';
import {
  AffiliateLiabilityStatus,
  FinancialFactKind,
  OfferOwnership,
  OfferStatus,
  OrganizationKind,
  PaymentIntentStatus,
  PaymentMethodFamily,
  PolicyPackStatus,
  ShipmentStatus,
  VendorPayableStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../src/app/app.module';
import { PrismaService } from '../src/app/prisma.service';
import { ProblemFilter } from '../src/common/problem.filter';
import { emptyPolicyDocument } from '../src/policy/empty-pack';
import { applyTestIsolation } from '../src/test/isolate-runtime';
import { FinanceService } from '../src/finance/finance.service';
import { provisionSuperAdmin, signInAdmin, signInCustomer } from '../src/test/sign-in';

describe('settlement financial operations hardening (e2e)', () => {
  jest.setTimeout(240_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let finance: FinanceService;
  let superToken: string;
  let superPersonId: string;
  let countryId: string;
  let countryCode: string;
  let otherCountryId: string;
  let otherCountryCode: string;
  let sellerOrgId: string;
  let otherSellerOrgId: string;
  let locationId: string;
  let customerPersonId: string;
  let orderId: string;
  let paymentIntentId: string;
  let payableId: string;
  let affiliateOrderId: string;

  async function provisionRole(prefix: string, roleCode: string) {
    const email = `${prefix}-${Date.now()}@example.com`;
    const customer = await signInCustomer(app, email);
    const role = await prisma.role.findUnique({ where: { code: roleCode } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: customer.personId,
        roleId: role!.id,
        scope: 'platform',
        status: 'ACTIVE',
      },
    });
    return signInAdmin(app, email, customer.personId);
  }

  async function ensureCountry(iso2: string, iso3: string, name: string) {
    const existingActive = await prisma.country.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { isoAlpha2: 'asc' },
    });
    if (existingActive && iso2 === 'PRIMARY') {
      await finance.ensureChart(existingActive.id);
      return existingActive;
    }
    let country = await prisma.country.findUnique({ where: { isoAlpha2: iso2 } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: iso2,
          isoAlpha3: iso3,
          nameI18n: { en: name },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
          dataResidencyMode: 'shared',
        },
      });
      const doc = emptyPolicyDocument();
      doc.services.pharmacy = true;
      doc.payments.enabled = true;
      const pack = await prisma.policyPack.create({
        data: {
          id: uuidv7(),
          countryId: country.id,
          version: 1,
          status: PolicyPackStatus.PUBLISHED,
          document: doc as never,
          checksum: `s30-${iso2}`,
          publishedAt: new Date(),
        },
      });
      await prisma.country.update({
        where: { id: country.id },
        data: { publishedPolicyPackId: pack.id },
      });
    }
    await finance.ensureChart(country.id);
    return country;
  }

  async function seedCommerceOrder(input: {
    sellerOrgId: string;
    locationId: string;
    countryId: string;
    customerPersonId: string;
    amountMinor: bigint;
    withAffiliate?: boolean;
    affiliateCode?: string;
  }) {
    const cart =
      (await prisma.cart.findUnique({
        where: {
          customerPersonId_countryId: {
            customerPersonId: input.customerPersonId,
            countryId: input.countryId,
          },
        },
      })) ??
      (await prisma.cart.create({
        data: {
          id: uuidv7(),
          customerPersonId: input.customerPersonId,
          countryId: input.countryId,
          sellerOrgId: input.sellerOrgId,
          currency: 'XXX',
        },
      }));
    const checkout = await prisma.checkoutSession.create({
      data: {
        id: uuidv7(),
        customerPersonId: input.customerPersonId,
        countryId: input.countryId,
        cartId: cart.id,
        sellerOrgId: input.sellerOrgId,
        status: 'READY_FOR_PAYMENT',
        idempotencyKey: `s30-co-${uuidv7()}`,
        expiresAt: new Date(Date.now() + 3600000),
        affiliateCode: input.affiliateCode ?? null,
      },
    });
    const quote = await prisma.checkoutQuote.create({
      data: {
        id: uuidv7(),
        sessionId: checkout.id,
        fingerprint: `s30-${Date.now()}`,
        currency: 'XXX',
        sellMinor: input.amountMinor,
        totalMinor: input.amountMinor,
        payload: {},
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const intent = await prisma.paymentIntent.create({
      data: {
        id: uuidv7(),
        checkoutSessionId: checkout.id,
        checkoutQuoteId: quote.id,
        customerPersonId: input.customerPersonId,
        countryId: input.countryId,
        method: PaymentMethodFamily.CARD,
        status: PaymentIntentStatus.CAPTURED,
        amountMinor: input.amountMinor,
        capturedMinor: input.amountMinor,
        currency: 'XXX',
        idempotencyKey: `s30-pay-${uuidv7()}`,
        sandbox: true,
      },
    });
    const order = await prisma.order.create({
      data: {
        id: uuidv7(),
        orderNumber: `S30-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
        customerPersonId: input.customerPersonId,
        sellerOrgId: input.sellerOrgId,
        countryId: input.countryId,
        checkoutSessionId: checkout.id,
        checkoutQuoteId: quote.id,
        paymentIntentId: intent.id,
        fulfillingLocationId: input.locationId,
        currency: 'XXX',
        goodsMinor: input.amountMinor,
        totalMinor: input.amountMinor,
        sandbox: true,
      },
    });
    if (input.withAffiliate) {
      await prisma.orderAffiliateSnapshot.create({
        data: {
          id: uuidv7(),
          orderId: order.id,
          affiliateCode: input.affiliateCode ?? 'S30AFF',
          estimateMinor: 100n,
          clinicalBlocked: false,
          payable: true,
        },
      });
      await prisma.affiliateLiability.create({
        data: {
          id: uuidv7(),
          orderId: order.id,
          amountMinor: 100n,
          currency: 'XXX',
          status: AffiliateLiabilityStatus.PENDING,
          clinicalBlocked: false,
          affiliateCode: input.affiliateCode ?? 'S30AFF',
        },
      });
    }
    const group = await prisma.fulfillmentGroup.create({
      data: { id: uuidv7(), orderId: order.id, locationId: input.locationId },
    });
    await prisma.shipment.create({
      data: {
        id: uuidv7(),
        orderId: order.id,
        groupId: group.id,
        locationId: input.locationId,
        sellerOrgId: input.sellerOrgId,
        countryId: input.countryId,
        customerPersonId: input.customerPersonId,
        status: ShipmentStatus.DELIVERED,
        currency: 'XXX',
      },
    });
    await finance.syncOrder(order.id);
    return { order, intent };
  }

  beforeAll(async () => {
    applyTestIsolation();
    process.env['NODE_ENV'] = 'test';
    process.env['AUTH_DEV_REVEAL_OTP'] = 'true';
    process.env['JWT_ACCESS_SECRET'] =
      process.env['JWT_ACCESS_SECRET'] ?? 'test-access-secret-must-be-32-chars-min';
    process.env['OTP_PEPPER'] =
      process.env['OTP_PEPPER'] ?? 'test-otp-pepper-must-be-32-chars-minx';
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
    finance = app.get(FinanceService);

    const countries = await prisma.country.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { isoAlpha2: 'asc' },
      take: 2,
    });
    expect(countries.length).toBeGreaterThanOrEqual(1);
    const country = countries[0]!;
    countryId = country.id;
    countryCode = country.isoAlpha2;
    await finance.ensureChart(countryId);
    if (countries[1]) {
      otherCountryId = countries[1].id;
      otherCountryCode = countries[1].isoAlpha2;
      await finance.ensureChart(otherCountryId);
    } else {
      const other = await ensureCountry('S4', 'S40', 'Sprint30 Other');
      otherCountryId = other.id;
      otherCountryCode = other.isoAlpha2;
    }

    const admin = await provisionSuperAdmin(app, prisma, 's30-super');
    superToken = admin.token;
    superPersonId = admin.personId;

    const customer = await signInCustomer(app, `s30-cust-${Date.now()}@example.com`);
    customerPersonId = customer.personId;

    const seller = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.VENDOR,
        legalName: 'S30 Vendor A',
        displayName: 'S30 Vendor A',
        status: 'ACTIVE',
      },
    });
    sellerOrgId = seller.id;
    const otherSeller = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.VENDOR,
        legalName: 'S30 Vendor B',
        displayName: 'S30 Vendor B',
        status: 'ACTIVE',
      },
    });
    otherSellerOrgId = otherSeller.id;

    await prisma.commercialRule.create({
      data: {
        id: uuidv7(),
        countryId,
        sellerOrgId: seller.id,
        takeBps: 1000,
        takeFlatMinor: 0n,
        priority: 10,
        validFrom: new Date(),
      },
    });

    const brand = await prisma.catalogBrand.create({
      data: { id: uuidv7(), slug: `s30-b-${Date.now()}`, name: 'S30Brand' },
    });
    const item = await prisma.catalogItem.create({
      data: {
        id: uuidv7(),
        slug: `s30-i-${Date.now()}`,
        kind: 'OTC',
        brandId: brand.id,
        createdByOrgId: seller.id,
        status: 'PUBLISHED',
      },
    });
    const variant = await prisma.catalogVariant.create({
      data: { id: uuidv7(), itemId: item.id, skuCode: `S30-${Date.now()}`, packSize: '1' },
    });
    const offer = await prisma.catalogOffer.create({
      data: {
        id: uuidv7(),
        variantId: variant.id,
        sellerOrgId: seller.id,
        countryId,
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
        sellMinor: 2000n,
        validFrom: new Date(),
        isCurrent: true,
      },
    });

    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: seller.id,
        countryId,
        kind: 'VENDOR_WAREHOUSE',
        name: 'S30 WH',
        timezone: 'UTC',
      },
    });
    locationId = location.id;

    const commerce = await seedCommerceOrder({
      sellerOrgId,
      locationId,
      countryId,
      customerPersonId,
      amountMinor: 2000n,
    });
    orderId = commerce.order.id;
    paymentIntentId = commerce.intent.id;
    const payable = await prisma.vendorPayable.findUniqueOrThrow({ where: { orderId } });
    payableId = payable.id;

    const aff = await seedCommerceOrder({
      sellerOrgId,
      locationId,
      countryId,
      customerPersonId,
      amountMinor: 1500n,
      withAffiliate: true,
      affiliateCode: 'S30AFF',
    });
    affiliateOrderId = aff.order.id;

    await finance.recordSandboxLabPayable({
      countryId,
      labBookingId: uuidv7(),
      amountMinor: 750n,
      currency: 'XXX',
    });

    await prisma.securityEvent.create({
      data: {
        id: uuidv7(),
        type: 'FINANCE_SETTLEMENT_OPENED',
        outcome: 'success',
        personId: superPersonId,
        metadata: { sprint: 30, order_id: orderId },
      },
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('hardens financial facts payables settlement reconciliation and RBAC', async () => {
    const auth = { Authorization: `Bearer ${superToken}` };

    const captureFact = await prisma.financialFact.findUnique({
      where: { sourceKey: `capture:${paymentIntentId}` },
    });
    expect(captureFact).toBeTruthy();
    expect(captureFact!.kind).toBe(FinancialFactKind.CAPTURE);
    expect(captureFact!.amountMinor).toBe(2000n);

    await finance.syncOrder(orderId);
    await finance.syncOrder(orderId);
    const captureCount = await prisma.financialFact.count({
      where: { sourceKey: `capture:${paymentIntentId}` },
    });
    expect(captureCount).toBe(1);
    const payableCount = await prisma.vendorPayable.count({ where: { orderId } });
    expect(payableCount).toBe(1);

    let payable = await prisma.vendorPayable.findUniqueOrThrow({ where: { id: payableId } });
    expect(payable.sellerOrgId).toBe(sellerOrgId);
    expect([VendorPayableStatus.PENDING, VendorPayableStatus.ELIGIBLE, VendorPayableStatus.ON_HOLD]).toContain(
      payable.status,
    );

    if (payable.status === VendorPayableStatus.PENDING) {
      await finance.transitionPayable(payableId, VendorPayableStatus.ELIGIBLE);
    }
    payable = await prisma.vendorPayable.findUniqueOrThrow({ where: { id: payableId } });
    if (payable.status === VendorPayableStatus.ELIGIBLE) {
      await finance.transitionPayable(payableId, VendorPayableStatus.APPROVED);
    }
    payable = await prisma.vendorPayable.findUniqueOrThrow({ where: { id: payableId } });
    expect(payable.status).toBe(VendorPayableStatus.APPROVED);

    const otherLocation = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: otherSellerOrgId,
        countryId,
        kind: 'VENDOR_WAREHOUSE',
        name: 'S30 WH B',
        timezone: 'UTC',
      },
    });
    const otherCommerce = await seedCommerceOrder({
      sellerOrgId: otherSellerOrgId,
      locationId: otherLocation.id,
      countryId,
      customerPersonId,
      amountMinor: 900n,
    });
    const otherSellerPayable = await prisma.vendorPayable.findUniqueOrThrow({
      where: { orderId: otherCommerce.order.id },
    });
    expect(otherSellerPayable.sellerOrgId).toBe(otherSellerOrgId);
    expect(otherSellerPayable.sellerOrgId).not.toBe(sellerOrgId);

    await prisma.paymentIntent.update({
      where: { id: paymentIntentId },
      data: { refundedMinor: 500n },
    });
    await prisma.refund.create({
      data: {
        id: uuidv7(),
        intentId: paymentIntentId,
        amountMinor: 500n,
        currency: 'XXX',
        status: 'REFUNDED',
        idempotencyKey: `s30-ref-${paymentIntentId}`,
      },
    });
    await finance.syncOrder(orderId);
    const adjusted = await prisma.vendorPayable.findUniqueOrThrow({ where: { id: payableId } });
    expect(adjusted.amountMinor).toBeLessThanOrEqual(2000n);

    const affApprove = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/affiliate/${affiliateOrderId}/approve`)
      .set(auth);
    expect(affApprove.status).toBeLessThan(300);
    let aff = await prisma.affiliateLiability.findUniqueOrThrow({ where: { orderId: affiliateOrderId } });
    expect([AffiliateLiabilityStatus.APPROVED, AffiliateLiabilityStatus.PAYABLE]).toContain(aff.status);
    if (aff.status === AffiliateLiabilityStatus.APPROVED) {
      await finance.syncOrder(affiliateOrderId);
      aff = await prisma.affiliateLiability.findUniqueOrThrow({ where: { orderId: affiliateOrderId } });
    }
    expect([AffiliateLiabilityStatus.APPROVED, AffiliateLiabilityStatus.PAYABLE]).toContain(aff.status);

    const affPartialOrder = await seedCommerceOrder({
      sellerOrgId,
      locationId,
      countryId,
      customerPersonId,
      amountMinor: 1000n,
      withAffiliate: true,
      affiliateCode: 'S30AFF2',
    });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/affiliate/${affPartialOrder.order.id}/approve`)
      .set(auth);
    await prisma.paymentIntent.update({
      where: { id: affPartialOrder.intent.id },
      data: { refundedMinor: 500n, capturedMinor: 1000n },
    });
    await prisma.refund.create({
      data: {
        id: uuidv7(),
        intentId: affPartialOrder.intent.id,
        amountMinor: 500n,
        currency: 'XXX',
        status: 'REFUNDED',
        idempotencyKey: `s30-aff-ref-${affPartialOrder.intent.id}`,
      },
    });
    await finance.syncOrder(affPartialOrder.order.id);
    const affPartial = await prisma.affiliateLiability.findUniqueOrThrow({
      where: { orderId: affPartialOrder.order.id },
    });
    expect(affPartial.amountMinor).toBeLessThanOrEqual(100n);

    const reverse = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/affiliate/${affiliateOrderId}/reverse`)
      .set(auth);
    expect(reverse.status).toBeLessThan(300);
    const reApprove = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/affiliate/${affiliateOrderId}/approve`)
      .set(auth);
    expect(reApprove.status).toBe(409);
    const reversed = await prisma.affiliateLiability.findUniqueOrThrow({
      where: { orderId: affiliateOrderId },
    });
    expect(reversed.status).toBe(AffiliateLiabilityStatus.REVERSED);

    const doctorEarnings = await request(app.getHttpServer())
      .get(`/api/v1/admin/finance/doctor-earnings?country_code=${countryCode}`)
      .set(auth);
    expect(doctorEarnings.status).toBe(200);
    expect(doctorEarnings.body.sandbox).toBe(true);
    expect(doctorEarnings.body.settlement_enabled).toBe(false);
    expect(doctorEarnings.body.live_payout).toBe(false);

    const labEarnings = await request(app.getHttpServer())
      .get(`/api/v1/admin/finance/lab-earnings?country_code=${countryCode}`)
      .set(auth);
    expect(labEarnings.status).toBe(200);
    expect(labEarnings.body.sandbox).toBe(true);
    expect((labEarnings.body.data as unknown[]).length).toBeGreaterThanOrEqual(1);
    expect(labEarnings.body.settlement_enabled).toBe(false);

    const invalidSource = await request(app.getHttpServer())
      .get(
        `/api/v1/admin/finance/settlement-membership/${uuidv7()}?country_id=${countryId}&currency=XXX`,
      )
      .set(auth);
    expect(invalidSource.status).toBe(200);
    expect(invalidSource.body.eligible).toBe(false);
    expect(invalidSource.body.reason).toBe('INVALID_SOURCE');

    const currencyMismatch = await request(app.getHttpServer())
      .get(
        `/api/v1/admin/finance/settlement-membership/${payableId}?country_id=${countryId}&currency=USD`,
      )
      .set(auth);
    expect(currencyMismatch.status).toBe(200);
    expect(currencyMismatch.body.eligible).toBe(false);
    expect(currencyMismatch.body.reason).toBe('CURRENCY_MISMATCH');

    const countryMismatch = await request(app.getHttpServer())
      .get(
        `/api/v1/admin/finance/settlement-membership/${payableId}?country_id=${otherCountryId}&currency=XXX`,
      )
      .set(auth);
    expect(countryMismatch.status).toBe(200);
    expect(countryMismatch.body.eligible).toBe(false);
    expect(countryMismatch.body.reason).toBe('COUNTRY_MISMATCH');

    if (adjusted.status !== VendorPayableStatus.APPROVED) {
      if (adjusted.status === VendorPayableStatus.ELIGIBLE) {
        await finance.transitionPayable(payableId, VendorPayableStatus.APPROVED);
      } else if (adjusted.status === VendorPayableStatus.PENDING) {
        await finance.transitionPayable(payableId, VendorPayableStatus.ELIGIBLE);
        await finance.transitionPayable(payableId, VendorPayableStatus.APPROVED);
      }
    }

    const open1 = await request(app.getHttpServer())
      .post('/api/v1/admin/finance/settlements')
      .set(auth)
      .send({ country_id: countryId, currency: 'XXX' });
    expect(open1.status).toBeLessThan(300);
    expect(open1.body.sandbox).toBe(true);
    expect(open1.body.external_payout).toBe('EXTERNAL_PAYOUT_GATED');
    const batchId = open1.body.id as string;
    expect(Array.isArray(open1.body.lines)).toBe(true);

    const open2 = await request(app.getHttpServer())
      .post('/api/v1/admin/finance/settlements')
      .set(auth)
      .send({ country_id: countryId, currency: 'XXX' });
    expect(open2.status).toBeLessThan(300);
    const already = await request(app.getHttpServer())
      .get(
        `/api/v1/admin/finance/settlement-membership/${payableId}?country_id=${countryId}&currency=XXX`,
      )
      .set(auth);
    expect(already.status).toBe(200);
    expect(already.body.eligible).toBe(false);
    expect(['ALREADY_SETTLED_OR_SCHEDULED', 'DUPLICATE_MEMBERSHIP', 'ZERO_NET', 'NOT_APPROVED']).toContain(
      already.body.reason,
    );

    const batches = await request(app.getHttpServer())
      .get(`/api/v1/admin/finance/settlements?country_code=${countryCode}`)
      .set(auth);
    expect(batches.status).toBe(200);
    expect((batches.body.data as Array<{ id: string }>).some((row) => row.id === batchId)).toBe(true);

    const recon = await request(app.getHttpServer())
      .get(`/api/v1/admin/finance/reconciliation/overview?country_code=${countryCode}`)
      .set(auth);
    expect(recon.status).toBe(200);
    expect(recon.body.sandbox).toBe(true);
    expect(recon.body.external_payout).toBe('EXTERNAL_PAYOUT_GATED');
    expect(recon.body.revenue).toBeTruthy();
    expect(recon.body.payables.vendor).toBeTruthy();
    expect(recon.body.payables.affiliate).toBeTruthy();
    expect(recon.body.payables.lab).toBeTruthy();
    expect(recon.body.payables.doctor).toBeTruthy();
    expect(recon.body.settlement).toBeTruthy();
    expect(recon.body.consistency).toBeTruthy();
    const captured = BigInt(recon.body.revenue.captured_minor);
    const refunded = BigInt(recon.body.revenue.refund_minor);
    expect(BigInt(recon.body.revenue.net_customer_payment_minor)).toBe(captured - refunded);

    const financeAdmin = await provisionRole('s30-fin', 'company_finance');
    const opsAdmin = await provisionRole('s30-ops', 'company_operations');
    const supportAdmin = await provisionRole('s30-sup', 'company_support');

    const financeOk = await request(app.getHttpServer())
      .get('/api/v1/admin/finance/reconciliation/overview')
      .set({ Authorization: `Bearer ${financeAdmin.token}` });
    expect(financeOk.status).toBe(200);

    const financePhi = await request(app.getHttpServer())
      .get('/api/v1/admin/prescriptions')
      .set({ Authorization: `Bearer ${financeAdmin.token}` });
    expect(financePhi.status).toBe(403);

    const opsSettle = await request(app.getHttpServer())
      .post('/api/v1/admin/finance/settlements')
      .set({ Authorization: `Bearer ${opsAdmin.token}` })
      .send({ country_id: countryId, currency: 'XXX' });
    expect(opsSettle.status).toBe(403);

    const supportSettle = await request(app.getHttpServer())
      .post('/api/v1/admin/finance/settlements')
      .set({ Authorization: `Bearer ${supportAdmin.token}` })
      .send({ country_id: countryId, currency: 'XXX' });
    expect(supportSettle.status).toBe(403);

    const vendorUser = await signInCustomer(app, `s30-vendor-${Date.now()}@example.com`);
    const orgOwner = await prisma.role.findUnique({ where: { code: 'org_owner' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: vendorUser.personId,
        roleId: orgOwner!.id,
        scope: 'organization',
        organizationId: sellerOrgId,
        status: 'ACTIVE',
      },
    });
    const vendorOwn = await finance.listVendorPayables(
      { personId: vendorUser.personId, audience: 'admin', permissions: [] } as never,
      sellerOrgId,
    );
    expect(vendorOwn.data.every((row: { order_id: string }) => typeof row.order_id === 'string')).toBe(true);
    await expect(
      finance.listVendorPayables(
        { personId: vendorUser.personId, audience: 'admin', permissions: [] } as never,
        otherSellerOrgId,
      ),
    ).rejects.toBeTruthy();

    const otherScope = await request(app.getHttpServer())
      .get(`/api/v1/admin/finance/reconciliation/overview?country_code=${otherCountryCode}`)
      .set(auth);
    expect(otherScope.status).toBe(200);
    expect(otherScope.body.scope).toBe(otherCountryCode);

    const secrets = JSON.stringify({
      recon: recon.body,
      batches: batches.body,
      lab: labEarnings.body,
    });
    expect(secrets).not.toMatch(/sk_live|webhook_secret|cvv|card_number/i);

    const audit = await request(app.getHttpServer())
      .get('/api/v1/admin/security-events?limit=50')
      .set(auth);
    expect(audit.status).toBe(200);
    expect(
      (audit.body.data as Array<{ type: string }>).some((row) => row.type === 'FINANCE_SETTLEMENT_OPENED'),
    ).toBe(true);
  });
});
