import { INestApplication } from '@nestjs/common';
import {
  AffiliateLiabilityStatus,
  KycCaseStatus,
  OrganizationKind,
  OutboxStatus,
  PartnerStatus,
  PaymentAttemptStatus,
  PaymentIntentStatus,
  PaymentMethodFamily,
  RefundStatus,
  SupportTicketStatus,
  VendorPayableStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { applyTestIsolation } from '../test/isolate-runtime';
import { provisionSuperAdmin, signInAdmin, signInCustomer } from '../test/sign-in';

describe('main admin global operations control plane (e2e)', () => {
  jest.setTimeout(240_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let superToken: string;
  let superPersonId: string;
  let countryCode: string;
  let countryId: string;
  let currency: string;
  let customerEmail: string;
  let orderNumber: string;
  let orderId: string;
  let paymentId: string;
  let vendorName: string;
  let doctorName: string;
  let labName: string;
  let imagingName: string;
  let affiliateName: string;
  let paymentRef: string;
  let applicationId: string;
  let pendingApplicationId: string;
  let suspendedPartnerId: string;
  let supportTicketId: string;
  let kycDocumentId: string;

  async function provisionRole(emailPrefix: string, roleCode: string) {
    const email = `${emailPrefix}-${Date.now()}@example.com`;
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

  async function ensurePartnerType(code: string) {
    const existing = await prisma.partnerType.findUnique({ where: { code } });
    if (existing) {
      return existing;
    }
    return prisma.partnerType.create({
      data: {
        id: uuidv7(),
        code,
        name: code,
      },
    });
  }

  async function seedPartner(input: {
    type: string;
    name: string;
    status?: PartnerStatus;
  }) {
    await ensurePartnerType(input.type);
    const person = await signInCustomer(app, `s29-p-${input.type.toLowerCase()}-${Date.now()}@example.com`);
    const org = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind:
          input.type === 'LAB'
            ? OrganizationKind.LAB
            : input.type === 'IMAGING_CENTER'
              ? OrganizationKind.IMAGING_CENTER
              : input.type === 'DOCTOR'
                ? OrganizationKind.CLINIC
                : input.type === 'AFFILIATE'
                  ? OrganizationKind.AFFILIATE_ORG
                  : OrganizationKind.VENDOR,
        legalName: input.name,
        displayName: input.name,
        status: 'ACTIVE',
      },
    });
    const partner = await prisma.partner.create({
      data: {
        id: uuidv7(),
        personId: person.personId,
        partnerTypeCode: input.type,
        countryId,
        organizationId: org.id,
        status: input.status ?? PartnerStatus.ACTIVE,
        activatedAt: input.status === PartnerStatus.SUSPENDED ? null : new Date(),
        suspendedAt: input.status === PartnerStatus.SUSPENDED ? new Date() : null,
      },
    });
    const application = await prisma.partnerApplication.create({
      data: {
        id: uuidv7(),
        partnerId: partner.id,
        partnerTypeCode: input.type,
        countryId,
        status: input.status ?? PartnerStatus.ACTIVE,
        source: 'INTERNAL',
      },
    });
    return { partner, application, org, personId: person.personId };
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

    const country = await prisma.country.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { isoAlpha2: 'asc' },
    });
    expect(country).toBeTruthy();
    countryCode = country!.isoAlpha2;
    countryId = country!.id;
    currency = (country!.defaultCurrency || 'XXX').slice(0, 3);

    const admin = await provisionSuperAdmin(app, prisma, 's29-super');
    superToken = admin.token;
    superPersonId = admin.personId;

    customerEmail = `s29-cust-${Date.now()}@example.com`;
    const customer = await signInCustomer(app, customerEmail);

    vendorName = `S29 Vendor ${Date.now()}`;
    doctorName = `S29 Doctor ${Date.now()}`;
    labName = `S29 Lab ${Date.now()}`;
    imagingName = `S29 Imaging ${Date.now()}`;
    affiliateName = `S29 Affiliate ${Date.now()}`;

    const vendor = await seedPartner({ type: 'VENDOR', name: vendorName });
    await seedPartner({ type: 'DOCTOR', name: doctorName });
    await seedPartner({ type: 'LAB', name: labName });
    await seedPartner({ type: 'IMAGING_CENTER', name: imagingName });
    await seedPartner({ type: 'AFFILIATE', name: affiliateName });
    const suspended = await seedPartner({
      type: 'VENDOR',
      name: `S29 Suspended ${Date.now()}`,
      status: PartnerStatus.SUSPENDED,
    });
    suspendedPartnerId = suspended.partner.id;
    applicationId = vendor.application.id;

    const pending = await seedPartner({
      type: 'VENDOR',
      name: `S29 Pending ${Date.now()}`,
      status: PartnerStatus.UNDER_REVIEW,
    });
    pendingApplicationId = pending.application.id;
    await prisma.partner.update({
      where: { id: pending.partner.id },
      data: { status: PartnerStatus.UNDER_REVIEW, activatedAt: null },
    });
    await prisma.partnerApplication.update({
      where: { id: pendingApplicationId },
      data: { status: PartnerStatus.UNDER_REVIEW },
    });

    const kycCase = await prisma.kycCase.create({
      data: {
        id: uuidv7(),
        partnerId: pending.partner.id,
        applicationId: pendingApplicationId,
        countryId,
        status: KycCaseStatus.UNDER_REVIEW,
        submittedAt: new Date(),
      },
    });
    kycDocumentId = uuidv7();
    await prisma.partnerDocument.create({
      data: {
        id: kycDocumentId,
        kycCaseId: kycCase.id,
        countryId,
        documentTypeCode: 'BUSINESS_REGISTRATION',
        objectKey: `sandbox/s29/${kycDocumentId}`,
        contentType: 'application/pdf',
        byteSize: 12,
        checksumSha256: 'a'.repeat(64),
        originalName: 's29-kyc.pdf',
        status: 'UPLOADED',
      },
    });

    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.org.id,
        countryId,
        kind: 'VENDOR_WAREHOUSE',
        name: `S29 WH ${Date.now()}`,
        timezone: 'UTC',
      },
    });

    let cart = await prisma.cart.findUnique({
      where: {
        customerPersonId_countryId: {
          customerPersonId: customer.personId,
          countryId,
        },
      },
    });
    if (!cart) {
      cart = await prisma.cart.create({
        data: {
          id: uuidv7(),
          customerPersonId: customer.personId,
          countryId,
          sellerOrgId: vendor.org.id,
          currency,
        },
      });
    }

    const checkout = await prisma.checkoutSession.create({
      data: {
        id: uuidv7(),
        customerPersonId: customer.personId,
        countryId,
        cartId: cart.id,
        sellerOrgId: vendor.org.id,
        status: 'READY_FOR_PAYMENT',
        idempotencyKey: `s29-co-${Date.now()}`,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const quote = await prisma.checkoutQuote.create({
      data: {
        id: uuidv7(),
        sessionId: checkout.id,
        fingerprint: `s29-${Date.now()}`,
        currency,
        sellMinor: 2500n,
        totalMinor: 2500n,
        payload: {},
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    orderNumber = `S29-${Date.now()}`;
    orderId = uuidv7();
    paymentId = uuidv7();
    paymentRef = `mock_s29_${Date.now()}`;
    const gateway = await prisma.paymentGateway.findFirst({ where: { code: 'MOCK_PRIMARY' } });

    await prisma.paymentIntent.create({
      data: {
        id: paymentId,
        checkoutSessionId: checkout.id,
        checkoutQuoteId: quote.id,
        customerPersonId: customer.personId,
        countryId,
        method: PaymentMethodFamily.CARD,
        status: PaymentIntentStatus.CAPTURED,
        amountMinor: 2500n,
        currency,
        capturedMinor: 2500n,
        refundedMinor: 500n,
        idempotencyKey: `s29-intent-${paymentId}`,
        sandbox: true,
      },
    });
    if (gateway) {
      await prisma.paymentAttempt.create({
        data: {
          id: uuidv7(),
          intentId: paymentId,
          gatewayId: gateway.id,
          method: PaymentMethodFamily.CARD,
          status: PaymentAttemptStatus.SUCCEEDED,
          providerRef: paymentRef,
          routingJson: { gateway_code: 'MOCK_PRIMARY', environment: 'sandbox' },
          submitted: true,
        },
      });
    }
    await prisma.refund.create({
      data: {
        id: uuidv7(),
        intentId: paymentId,
        amountMinor: 500n,
        currency,
        status: RefundStatus.REFUNDED,
        reason: 's29_control_plane',
        idempotencyKey: `s29-refund-${paymentId}`,
      },
    });

    await prisma.order.create({
      data: {
        id: orderId,
        orderNumber,
        customerPersonId: customer.personId,
        sellerOrgId: vendor.org.id,
        countryId,
        checkoutSessionId: checkout.id,
        checkoutQuoteId: quote.id,
        paymentIntentId: paymentId,
        fulfillingLocationId: location.id,
        status: 'CONFIRMED',
        currency,
        goodsMinor: 2500n,
        totalMinor: 2500n,
        sandbox: true,
      },
    });

    await prisma.vendorPayable.create({
      data: {
        id: uuidv7(),
        orderId,
        sellerOrgId: vendor.org.id,
        countryId,
        amountMinor: 2000n,
        currency,
        status: VendorPayableStatus.PENDING,
        takeBpsFrozen: 1000,
        takeFlatFrozen: 0n,
      },
    });

    await prisma.affiliateLiability.create({
      data: {
        id: uuidv7(),
        orderId,
        amountMinor: 100n,
        currency,
        status: AffiliateLiabilityStatus.PENDING,
        clinicalBlocked: false,
        affiliateCode: 'S29AFF',
      },
    });

    await prisma.financialFact.create({
      data: {
        id: uuidv7(),
        orderId,
        paymentIntentId: paymentId,
        countryId,
        kind: 'VENDOR_PAYABLE',
        amountMinor: 2000n,
        currency,
        sourceKey: `s29-vendor-payable:${orderId}`,
      },
    });
    await prisma.financialFact.create({
      data: {
        id: uuidv7(),
        orderId,
        paymentIntentId: paymentId,
        countryId,
        kind: 'AFFILIATE',
        amountMinor: 100n,
        currency,
        sourceKey: `s29-affiliate:${orderId}`,
      },
    });
    await prisma.financialFact.create({
      data: {
        id: uuidv7(),
        orderId,
        paymentIntentId: paymentId,
        countryId,
        kind: 'REFUND',
        amountMinor: 500n,
        currency,
        sourceKey: `s29-refund:${paymentId}`,
      },
    });

    const queue =
      (await prisma.supportQueue.findFirst({ where: { countryId } })) ??
      (await prisma.supportQueue.create({
        data: {
          id: uuidv7(),
          countryId,
          code: `s29-q-${Date.now()}`,
          name: 'S29 Queue',
          active: true,
        },
      }));
    supportTicketId = uuidv7();
    await prisma.supportTicket.create({
      data: {
        id: supportTicketId,
        personId: customer.personId,
        countryId,
        queueId: queue.id,
        status: SupportTicketStatus.OPEN,
        subject: `S29 support ${Date.now()}`,
        referenceType: 'order',
        referenceId: orderId,
        sandbox: true,
      },
    });

    await prisma.outboxEvent.create({
      data: {
        id: uuidv7(),
        type: 'S29_TEST_EVENT',
        aggregateType: 'PaymentIntent',
        aggregateId: paymentId,
        producer: 'test',
        countryId,
        status: OutboxStatus.DEAD_LETTERED,
        payload: { sandbox: true },
        occurrenceKey: `s29-dl-${paymentId}`,
        attempts: 5,
        lastError: 'simulated dead letter',
        failedAt: new Date(),
      },
    });

    await prisma.securityEvent.create({
      data: {
        id: uuidv7(),
        type: 'PARTNER_STATUS_CHANGED',
        outcome: 'success',
        personId: superPersonId,
        metadata: { partner_id: suspendedPartnerId, to: 'SUSPENDED', sprint: 29 },
      },
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('covers dashboard search partners finance payment reliability security and role boundaries', async () => {
    const auth = { Authorization: `Bearer ${superToken}` };

    const snapshot = await request(app.getHttpServer())
      .get(`/api/v1/admin/control-plane/snapshot?country_code=${countryCode}`)
      .set(auth);
    expect(snapshot.status).toBe(200);
    expect(snapshot.body.commerce).toHaveProperty('orders_today');
    expect(snapshot.body.commerce).toHaveProperty('successful_payments_24h');
    expect(snapshot.body.commerce.active_vendors).toBeGreaterThanOrEqual(1);
    expect(snapshot.body.healthcare).toHaveProperty('doctors');
    expect(snapshot.body.healthcare).toHaveProperty('imaging_centers');
    expect(snapshot.body.logistics).toHaveProperty('active_shipments');
    expect(snapshot.body.finance.sandbox).toBe(true);
    expect(snapshot.body.finance.settlement_status).toBe('SANDBOX_NOT_SETTLED');
    expect(snapshot.body.finance.vendor_payables_open).toBeGreaterThanOrEqual(1);
    expect(snapshot.body.finance.affiliate_liabilities_open).toBeGreaterThanOrEqual(1);
    expect(snapshot.body.governance.kyc_pending).toBeGreaterThanOrEqual(1);
    expect(snapshot.body.reliability.outbox_dead_lettered).toBeGreaterThanOrEqual(1);
    expect(snapshot.body.country_code).toBe(countryCode);
    expect(snapshot.body.currency).toBeTruthy();
    expect(JSON.stringify(snapshot.body)).not.toMatch(/sk_live|webhook_secret|cvv|card_number/i);

    const searchCustomer = await request(app.getHttpServer())
      .get(
        `/api/v1/admin/search/entities?q=${encodeURIComponent(customerEmail.slice(0, 12))}&country_code=${countryCode}`,
      )
      .set(auth);
    expect(searchCustomer.status).toBe(200);
    expect(
      (searchCustomer.body.data as Array<{ entity_type: string }>).some((row) => row.entity_type === 'customer'),
    ).toBe(true);
    expect(JSON.stringify(searchCustomer.body)).not.toMatch(/prescription|clinical_note|dicom/i);

    const searchOrder = await request(app.getHttpServer())
      .get(`/api/v1/admin/search/entities?q=${encodeURIComponent(orderNumber)}&country_code=${countryCode}`)
      .set(auth);
    expect(searchOrder.status).toBe(200);
    expect(
      (searchOrder.body.data as Array<{ entity_type: string; href: string }>).some(
        (row) => row.entity_type === 'order' && row.href.includes('/orders?orderId='),
      ),
    ).toBe(true);

    for (const [q, type] of [
      [vendorName, 'vendor'],
      [doctorName, 'doctor'],
      [labName, 'lab'],
      [imagingName, 'imaging_center'],
      [affiliateName, 'affiliate'],
    ] as const) {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/search/entities?q=${encodeURIComponent(q.slice(0, 18))}&country_code=${countryCode}`)
        .set(auth);
      expect(res.status).toBe(200);
      expect(
        (res.body.data as Array<{ entity_type: string; label: string }>).some(
          (row) => row.entity_type === type || row.label.includes(q.slice(0, 10)),
        ),
      ).toBe(true);
    }

    const searchPayment = await request(app.getHttpServer())
      .get(`/api/v1/admin/search/entities?q=${encodeURIComponent(paymentRef)}&country_code=${countryCode}`)
      .set(auth);
    expect(searchPayment.status).toBe(200);
    expect(
      (searchPayment.body.data as Array<{ entity_type: string }>).some((row) => row.entity_type === 'payment'),
    ).toBe(true);

    const apps = await request(app.getHttpServer())
      .get('/api/v1/admin/partners/applications?limit=100')
      .set(auth);
    expect(apps.status).toBe(200);
    expect((apps.body.data as Array<{ id: string }>).some((row) => row.id === pendingApplicationId)).toBe(true);
    expect((apps.body.data as Array<{ id: string }>).some((row) => row.id === applicationId)).toBe(true);

    const onboarding = await request(app.getHttpServer())
      .get(`/api/v1/admin/partners/applications/${pendingApplicationId}/onboarding`)
      .set(auth);
    expect(onboarding.status).toBe(200);
    expect(onboarding.body).toBeTruthy();

    const appDetail = await request(app.getHttpServer())
      .get(`/api/v1/admin/partners/applications/${pendingApplicationId}`)
      .set(auth);
    expect(appDetail.status).toBe(200);
    expect(JSON.stringify(appDetail.body)).toMatch(/UNDER_REVIEW|kyc/i);

    const suspended = await prisma.partner.findUniqueOrThrow({ where: { id: suspendedPartnerId } });
    expect(suspended.status).toBe(PartnerStatus.SUSPENDED);

    const orders = await request(app.getHttpServer()).get('/api/v1/admin/orders').set(auth);
    expect(orders.status).toBe(200);
    expect(
      (orders.body.data as Array<{ order_number?: string }>).some((row) => row.order_number === orderNumber),
    ).toBe(true);

    const orderDetail = await request(app.getHttpServer()).get(`/api/v1/admin/orders/${orderId}`).set(auth);
    expect(orderDetail.status).toBe(200);
    expect(orderDetail.body.order_number ?? orderDetail.body.orderNumber).toBe(orderNumber);

    const payments = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments?country_code=${countryCode}`)
      .set(auth);
    expect(payments.status).toBe(200);
    expect(JSON.stringify(payments.body)).not.toMatch(/sk_live|webhook_secret|cvv|object_key/i);

    const paymentDetail = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/${paymentId}`)
      .set(auth);
    expect(paymentDetail.status).toBe(200);
    expect(paymentDetail.body.status ?? paymentDetail.body.intent?.status).toBeTruthy();
    expect(JSON.stringify(paymentDetail.body)).toMatch(/refund/i);
    expect(JSON.stringify(paymentDetail.body)).not.toMatch(/sk_live|webhook_secret|card_number/i);

    const finance = await request(app.getHttpServer()).get('/api/v1/admin/finance/dashboard').set(auth);
    expect(finance.status).toBe(200);
    expect(finance.body.sandbox).toBe(true);
    expect(finance.body.live_payout).toBe(false);

    const payables = await request(app.getHttpServer()).get('/api/v1/admin/finance/payables').set(auth);
    expect(payables.status).toBe(200);
    expect((payables.body.data as unknown[]).length).toBeGreaterThanOrEqual(1);

    const facts = await request(app.getHttpServer()).get('/api/v1/admin/finance/facts').set(auth);
    expect(facts.status).toBe(200);

    const countries = await request(app.getHttpServer())
      .get('/api/v1/admin/control-plane/countries')
      .set(auth);
    expect(countries.status).toBe(200);
    expect(
      (countries.body.data as Array<{ country_code: string }>).some((row) => row.country_code === countryCode),
    ).toBe(true);

    const countryDetail = await request(app.getHttpServer())
      .get(`/api/v1/admin/control-plane/countries/${countryCode}`)
      .set(auth);
    expect(countryDetail.status).toBe(200);
    expect(countryDetail.body.payments.sandbox).toBe(true);

    const reliability = await request(app.getHttpServer())
      .get('/api/v1/admin/control-plane/reliability/snapshot')
      .set(auth);
    expect(reliability.status).toBe(200);
    expect(reliability.body.outbox.dead_lettered).toBeGreaterThanOrEqual(1);

    const outbox = await request(app.getHttpServer())
      .get('/api/v1/admin/control-plane/reliability/outbox?status=DEAD_LETTERED')
      .set(auth);
    expect(outbox.status).toBe(200);
    expect((outbox.body.data as unknown[]).length).toBeGreaterThanOrEqual(1);

    const security = await request(app.getHttpServer())
      .get('/api/v1/admin/security-events?limit=50')
      .set(auth);
    expect(security.status).toBe(200);
    expect(
      (security.body.data as Array<{ type: string }>).some((row) => row.type === 'PARTNER_STATUS_CHANGED'),
    ).toBe(true);

    const support = await request(app.getHttpServer()).get('/api/v1/admin/support/tickets').set(auth);
    expect(support.status).toBe(200);
    expect((support.body.data as Array<{ id: string }>).some((row) => row.id === supportTicketId)).toBe(true);

    const financeAdmin = await provisionRole('s29-fin', 'company_finance');
    const opsAdmin = await provisionRole('s29-ops', 'company_operations');
    const supportAdmin = await provisionRole('s29-sup', 'company_support');
    const complianceAdmin = await provisionRole('s29-comp', 'company_compliance');

    const opsRefundDeny = await request(app.getHttpServer())
      .post(`/api/v1/admin/payments/${paymentId}/refund`)
      .set({
        Authorization: `Bearer ${opsAdmin.token}`,
        'Idempotency-Key': `s29-ops-ref-${Date.now()}`,
      })
      .send({});
    expect(opsRefundDeny.status).toBe(403);

    const financeCanReadPayments = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments?country_code=${countryCode}`)
      .set({ Authorization: `Bearer ${financeAdmin.token}` });
    expect(financeCanReadPayments.status).toBe(200);

    const opsPhiAudit = await request(app.getHttpServer())
      .get('/api/v1/admin/health/access-audits')
      .set({ Authorization: `Bearer ${opsAdmin.token}` });
    expect(opsPhiAudit.status).toBe(403);

    const opsKycDoc = await request(app.getHttpServer())
      .get(`/api/v1/admin/partners/documents/${kycDocumentId}`)
      .set({ Authorization: `Bearer ${opsAdmin.token}` });
    expect(opsKycDoc.status).toBe(403);

    const supportRx = await request(app.getHttpServer())
      .get('/api/v1/admin/prescriptions')
      .set({ Authorization: `Bearer ${supportAdmin.token}` });
    expect(supportRx.status).toBe(403);

    const financeRx = await request(app.getHttpServer())
      .get('/api/v1/admin/prescriptions')
      .set({ Authorization: `Bearer ${financeAdmin.token}` });
    expect(financeRx.status).toBe(403);

    const financePhi = await request(app.getHttpServer())
      .get('/api/v1/admin/health/access-audits')
      .set({ Authorization: `Bearer ${financeAdmin.token}` });
    expect(financePhi.status).toBe(403);

    const supportPartner = await request(app.getHttpServer())
      .post(`/api/v1/admin/partners/applications/${applicationId}/transition`)
      .set({ Authorization: `Bearer ${supportAdmin.token}` })
      .send({ to: 'SUSPENDED', reason: 'unauthorized' });
    expect(supportPartner.status).toBe(403);

    const supportKycDoc = await request(app.getHttpServer())
      .get(`/api/v1/admin/partners/documents/${kycDocumentId}`)
      .set({ Authorization: `Bearer ${supportAdmin.token}` });
    expect(supportKycDoc.status).toBe(403);

    const supportFinance = await request(app.getHttpServer())
      .post(`/api/v1/admin/payments/${paymentId}/refund`)
      .set({
        Authorization: `Bearer ${supportAdmin.token}`,
        'Idempotency-Key': `s29-sup-ref-${Date.now()}`,
      })
      .send({});
    expect(supportFinance.status).toBe(403);

    const complianceApps = await request(app.getHttpServer())
      .get('/api/v1/admin/partners/applications')
      .set({ Authorization: `Bearer ${complianceAdmin.token}` });
    expect(complianceApps.status).toBe(200);

    const complianceRx = await request(app.getHttpServer())
      .get('/api/v1/admin/prescriptions')
      .set({ Authorization: `Bearer ${complianceAdmin.token}` });
    expect(complianceRx.status).toBe(200);

    const complianceFinanceMutate = await request(app.getHttpServer())
      .post(`/api/v1/admin/payments/${paymentId}/refund`)
      .set({
        Authorization: `Bearer ${complianceAdmin.token}`,
        'Idempotency-Key': `s29-comp-ref-${Date.now()}`,
      })
      .send({});
    expect(complianceFinanceMutate.status).toBe(403);

    const otherCountry = await prisma.country.findFirst({
      where: { status: 'ACTIVE', isoAlpha2: { not: countryCode } },
    });
    if (otherCountry) {
      const scoped = await request(app.getHttpServer())
        .get(`/api/v1/admin/control-plane/snapshot?country_code=${otherCountry.isoAlpha2}`)
        .set(auth);
      expect(scoped.status).toBe(200);
      expect(scoped.body.country_code).toBe(otherCountry.isoAlpha2);
    }

    const suspend = await request(app.getHttpServer())
      .post(`/api/v1/admin/partners/applications/${applicationId}/transition`)
      .set({ ...auth, 'Idempotency-Key': `s29-suspend-${Date.now()}` })
      .send({ to: 'SUSPENDED', reason: 's29_control_plane_test' });
    expect([200, 409]).toContain(suspend.status);

    const auditAfter = await request(app.getHttpServer())
      .get('/api/v1/admin/security-events?limit=50')
      .set(auth);
    expect(auditAfter.status).toBe(200);
  });
});
