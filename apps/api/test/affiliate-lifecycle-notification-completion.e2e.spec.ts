import { INestApplication } from '@nestjs/common';
import {
  AffiliateLiabilityStatus,
  AffiliateReferralCodeStatus,
  FinancialFactKind,
  OrganizationKind,
  OrganizationStatus,
  PartnerStatus,
  PaymentIntentStatus,
  PaymentMethodFamily,
  PolicyPackStatus,
  ShipmentStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../src/app/app.module';
import { PrismaService } from '../src/app/prisma.service';
import { ProblemFilter } from '../src/common/problem.filter';
import type { EventEnvelope } from '../src/events/envelope';
import { FinanceService } from '../src/finance/finance.service';
import { NotificationDispatchService } from '../src/platform/notification-dispatch.service';
import { NotificationService } from '../src/platform/notification.service';
import { emptyPolicyDocument } from '../src/policy/empty-pack';
import { applyTestIsolation } from '../src/test/isolate-runtime';
import { provisionSuperAdmin, signInAdmin, signInCustomer } from '../src/test/sign-in';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function envelopeFromOutbox(row: {
  id: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  producer: string;
  countryId: string | null;
  correlationId: string | null;
  actorId: string | null;
  payload: unknown;
  createdAt: Date;
}): EventEnvelope {
  return {
    eventId: row.id,
    eventName: row.type,
    eventVersion: 1,
    occurredAt: row.createdAt.toISOString(),
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    producer: row.producer,
    countryId: row.countryId,
    correlationId: row.correlationId,
    causationId: null,
    actorId: row.actorId,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    metadata: {},
  };
}

describe('affiliate lifecycle notification completion (e2e)', () => {
  jest.setTimeout(240_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let finance: FinanceService;
  let dispatch: NotificationDispatchService;
  let notifications: NotificationService;
  let superToken: string;
  let countryId: string;
  let countryCode: string;

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

  async function setupAffiliateOrg(suffix: string) {
    // Avoid OTP rate limits across many cases: unique high-entropy emails.
    const affiliate = await signInCustomer(app, `s32-aff-${suffix}-${Date.now()}-${Math.random()}@example.test`);
    const org = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.AFFILIATE_ORG,
        legalName: `S32 Aff ${suffix}`,
        displayName: `S32 Aff ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
    });
    const orgRole = await prisma.role.findUniqueOrThrow({ where: { code: 'org_owner' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: affiliate.personId,
        roleId: orgRole.id,
        scope: 'organization',
        organizationId: org.id,
        status: 'ACTIVE',
      },
    });
    const code = `S32${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 9999)}`.slice(0, 20);
    const referral = await prisma.affiliateReferralCode.create({
      data: {
        id: uuidv7(),
        organizationId: org.id,
        countryId,
        code,
        status: AffiliateReferralCodeStatus.ACTIVE,
        createdByPersonId: affiliate.personId,
      },
    });
    return { affiliate, org, referral, code };
  }

  /** Creates order+affiliate snapshot, then syncOrder to emit AFFILIATE_LIABILITY_CREATED. */
  async function seedViaSyncOrder(input: { affiliateCode: string; amountMinor?: bigint }) {
    const customer = await signInCustomer(app, `s32-cust-${uuidv7()}@example.test`);
    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.VENDOR,
        legalName: `S32 Vendor ${uuidv7().slice(0, 8)}`,
        displayName: 'S32 Vendor',
        status: OrganizationStatus.ACTIVE,
      },
    });
    const location = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: vendor.id,
        countryId,
        kind: 'VENDOR_WAREHOUSE',
        name: 'S32 WH',
        timezone: 'UTC',
      },
    });
    const cart = await prisma.cart.create({
      data: {
        id: uuidv7(),
        customerPersonId: customer.personId,
        countryId,
        sellerOrgId: vendor.id,
        currency: 'XXX',
      },
    });
    const checkout = await prisma.checkoutSession.create({
      data: {
        id: uuidv7(),
        customerPersonId: customer.personId,
        countryId,
        cartId: cart.id,
        sellerOrgId: vendor.id,
        status: 'READY_FOR_PAYMENT',
        idempotencyKey: `s32-co-${uuidv7()}`,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const quote = await prisma.checkoutQuote.create({
      data: {
        id: uuidv7(),
        sessionId: checkout.id,
        fingerprint: `s32-${Date.now()}`,
        currency: 'XXX',
        sellMinor: 10_000n,
        totalMinor: 10_000n,
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
        countryId,
        method: PaymentMethodFamily.CARD,
        status: PaymentIntentStatus.CAPTURED,
        amountMinor: 10_000n,
        capturedMinor: 10_000n,
        currency: 'XXX',
        idempotencyKey: `s32-pay-${uuidv7()}`,
        sandbox: true,
      },
    });
    const order = await prisma.order.create({
      data: {
        id: uuidv7(),
        orderNumber: `S32-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
        customerPersonId: customer.personId,
        sellerOrgId: vendor.id,
        countryId,
        checkoutSessionId: checkout.id,
        checkoutQuoteId: quote.id,
        paymentIntentId: intent.id,
        fulfillingLocationId: location.id,
        currency: 'XXX',
        goodsMinor: 10_000n,
        totalMinor: 10_000n,
        sandbox: true,
      },
    });
    await prisma.orderAffiliateSnapshot.create({
      data: {
        id: uuidv7(),
        orderId: order.id,
        affiliateCode: input.affiliateCode,
        estimateMinor: input.amountMinor ?? 500n,
        clinicalBlocked: false,
        payable: true,
      },
    });
    await finance.syncOrder(order.id);
    const liability = await prisma.affiliateLiability.findUniqueOrThrow({ where: { orderId: order.id } });
    return { customer, vendor, order, intent, liability, location };
  }

  async function dispatchOutbox(type: string, aggregateId: string) {
    const row = await prisma.outboxEvent.findFirst({
      where: { type, aggregateId },
      orderBy: { createdAt: 'desc' },
    });
    expect(row).toBeTruthy();
    await dispatch.handleDomainEvent(envelopeFromOutbox(row!));
    return row!;
  }

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
    dispatch = app.get(NotificationDispatchService);
    notifications = app.get(NotificationService);

    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'XX' } });
    if (!country) {
      throw new Error('XX country seed required');
    }
    const doc = emptyPolicyDocument();
    doc.partner_types.AFFILIATE.enabled = true;
    doc.partner_types.AFFILIATE.join_public = true;
    if (!country.publishedPolicyPackId) {
      const pack = await prisma.policyPack.create({
        data: {
          id: uuidv7(),
          countryId: country.id,
          version: 1,
          status: PolicyPackStatus.PUBLISHED,
          document: doc as never,
          checksum: `s32-${Date.now()}`,
          publishedAt: new Date(),
        },
      });
      country = await prisma.country.update({
        where: { id: country.id },
        data: { publishedPolicyPackId: pack.id },
      });
    } else {
      await prisma.policyPack.update({
        where: { id: country.publishedPolicyPackId },
        data: { document: doc as never },
      });
    }
    countryId = country.id;
    countryCode = country.isoAlpha2;
    const admin = await provisionSuperAdmin(app, prisma, 's32-super');
    superToken = admin.token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('activation emits PARTNER_STATUS_CHANGED to outbox and creates one notification', async () => {
    const person = await signInCustomer(app, `s32-act-${uuidv7()}@example.test`);
    const partner = await prisma.partner.create({
      data: {
        id: uuidv7(),
        personId: person.personId,
        partnerTypeCode: 'AFFILIATE',
        countryId,
        status: PartnerStatus.APPROVED,
      },
    });
    const application = await prisma.partnerApplication.create({
      data: {
        id: uuidv7(),
        partnerId: partner.id,
        partnerTypeCode: 'AFFILIATE',
        countryId,
        status: PartnerStatus.APPROVED,
        applicationFields: {},
      },
    });
    const org = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.AFFILIATE_ORG,
        legalName: 'S32 Activate Org',
        displayName: 'S32 Activate Org',
        status: OrganizationStatus.DRAFT,
      },
    });
    await prisma.partner.update({
      where: { id: partner.id },
      data: { organizationId: org.id },
    });

    const activate = await request(app.getHttpServer())
      .post(`/api/v1/admin/partners/applications/${application.id}/activate`)
      .set(auth(superToken))
      .send({ organization_id: org.id });
    expect(activate.status).toBeLessThan(300);

    const outbox = await prisma.outboxEvent.findFirst({
      where: { type: 'PARTNER_STATUS_CHANGED', aggregateId: partner.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(outbox).toBeTruthy();
    const payload = outbox!.payload as Record<string, unknown>;
    expect(payload.person_id).toBe(person.personId);
    expect(payload.to).toBe(PartnerStatus.ACTIVE);
    expect(payload.country_code).toBe(countryCode);

    await dispatch.handleDomainEvent(envelopeFromOutbox(outbox!));
    await dispatch.handleDomainEvent(envelopeFromOutbox(outbox!));

    const inbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set(auth(person.token));
    const notices = inbox.body.data.filter(
      (row: { title?: string; reference_id?: string }) =>
        row.title === 'Partner application updated' && row.reference_id === application.id,
    );
    expect(notices).toHaveLength(1);
    expect(notices[0].delivery_status).toBe('SANDBOX_DELIVERED');
    expect(notices[0].sandbox).toBe(true);
  });

  it('commission create/approve/payable/reverse emit outbox + notifications without duplicates', async () => {
    const { affiliate, code } = await setupAffiliateOrg(uuidv7().slice(0, 8));
    const seeded = await seedViaSyncOrder({ affiliateCode: code });

    expect(seeded.liability.status).toBe(AffiliateLiabilityStatus.PENDING);
    const createdOutbox = await dispatchOutbox('AFFILIATE_LIABILITY_CREATED', seeded.liability.id);
    expect((createdOutbox.payload as { affiliate_person_id?: string }).affiliate_person_id).toBe(
      affiliate.personId,
    );
    expect((createdOutbox.payload as { country_code?: string }).country_code).toBe(countryCode);
    await dispatch.handleDomainEvent(envelopeFromOutbox(createdOutbox));
    await finance.syncOrder(seeded.order.id); // idempotent create — no second outbox
    expect(
      await prisma.outboxEvent.count({
        where: { type: 'AFFILIATE_LIABILITY_CREATED', aggregateId: seeded.liability.id },
      }),
    ).toBe(1);
    let inbox = await notifications.listInbox(affiliate.personId);
    expect(
      inbox.filter(
        (row) =>
          row.event_type === 'AFFILIATE_LIABILITY_CREATED' && row.reference_id === seeded.liability.id,
      ),
    ).toHaveLength(1);

    await finance.approveAffiliate(seeded.order.id);
    expect(
      (await prisma.affiliateLiability.findUniqueOrThrow({ where: { orderId: seeded.order.id } })).status,
    ).toBe(AffiliateLiabilityStatus.APPROVED);
    const approveOutbox = await dispatchOutbox('AFFILIATE_APPROVED', seeded.liability.id);
    await dispatch.handleDomainEvent(envelopeFromOutbox(approveOutbox));
    await dispatch.handleDomainEvent(envelopeFromOutbox(approveOutbox));
    inbox = await notifications.listInbox(affiliate.personId);
    expect(inbox.filter((row) => row.event_type === 'AFFILIATE_APPROVED')).toHaveLength(1);
    expect(
      await prisma.securityEvent.findFirst({
        where: { type: 'AFFILIATE_LIABILITY_APPROVED' },
        orderBy: { createdAt: 'desc' },
      }),
    ).toBeTruthy();

    // Payable: shipment + approve path on a fresh order
    const seeded2 = await seedViaSyncOrder({ affiliateCode: code });
    await prisma.shipment.create({
      data: {
        id: uuidv7(),
        orderId: seeded2.order.id,
        groupId: (
          await prisma.fulfillmentGroup.create({
            data: { id: uuidv7(), orderId: seeded2.order.id, locationId: seeded2.location.id },
          })
        ).id,
        locationId: seeded2.location.id,
        sellerOrgId: seeded2.vendor.id,
        countryId,
        customerPersonId: seeded2.customer.personId,
        status: ShipmentStatus.DELIVERED,
      },
    });
    await finance.approveAffiliate(seeded2.order.id);
    const payableLiability = await prisma.affiliateLiability.findUniqueOrThrow({
      where: { orderId: seeded2.order.id },
    });
    expect(payableLiability.status).toBe(AffiliateLiabilityStatus.PAYABLE);
    const payableOutbox = await dispatchOutbox('AFFILIATE_PAYABLE', payableLiability.id);
    await dispatch.handleDomainEvent(envelopeFromOutbox(payableOutbox));
    await dispatch.handleDomainEvent(envelopeFromOutbox(payableOutbox));
    inbox = await notifications.listInbox(affiliate.personId);
    expect(
      inbox.filter((row) => row.event_type === 'AFFILIATE_PAYABLE' && row.reference_id === payableLiability.id),
    ).toHaveLength(1);

    await finance.reverseAffiliate(seeded.order.id);
    expect(
      (await prisma.affiliateLiability.findUniqueOrThrow({ where: { orderId: seeded.order.id } })).status,
    ).toBe(AffiliateLiabilityStatus.REVERSED);
    await expect(finance.approveAffiliate(seeded.order.id)).rejects.toMatchObject({ code: 'AFFILIATE_REVERSED' });
    const reverseOutbox = await dispatchOutbox('AFFILIATE_REVERSED', seeded.liability.id);
    await dispatch.handleDomainEvent(envelopeFromOutbox(reverseOutbox));
    await dispatch.handleDomainEvent(envelopeFromOutbox(reverseOutbox));
    inbox = await notifications.listInbox(affiliate.personId);
    expect(
      inbox.filter((row) => row.event_type === 'AFFILIATE_REVERSED' && row.reference_id === seeded.liability.id),
    ).toHaveLength(1);
    expect((await finance.reverseAffiliate(seeded.order.id)).idempotent).toBe(true);
    expect(
      await prisma.outboxEvent.count({
        where: { type: 'AFFILIATE_REVERSED', aggregateId: seeded.liability.id },
      }),
    ).toBe(1);
    expect(
      await prisma.securityEvent.findFirst({
        where: { type: 'AFFILIATE_LIABILITY_REVERSED' },
        orderBy: { createdAt: 'desc' },
      }),
    ).toBeTruthy();
  });

  it('partial refund adjusts amount without reverse; full refund reverses once', async () => {
    const { affiliate, code } = await setupAffiliateOrg(uuidv7().slice(0, 8));
    const seeded = await seedViaSyncOrder({ affiliateCode: code, amountMinor: 1000n });

    await prisma.paymentIntent.update({
      where: { id: seeded.intent.id },
      data: { refundedMinor: 2_000n },
    });
    await finance.syncOrder(seeded.order.id);
    let liability = await prisma.affiliateLiability.findUniqueOrThrow({ where: { orderId: seeded.order.id } });
    expect(liability.status).toBe(AffiliateLiabilityStatus.PENDING);
    expect(liability.amountMinor).toBe(800n);
    expect(
      await prisma.outboxEvent.count({
        where: { type: 'AFFILIATE_REVERSED', aggregateId: seeded.liability.id },
      }),
    ).toBe(0);

    await prisma.paymentIntent.update({
      where: { id: seeded.intent.id },
      data: { refundedMinor: 10_000n },
    });
    await finance.syncOrder(seeded.order.id);
    await finance.syncOrder(seeded.order.id);
    liability = await prisma.affiliateLiability.findUniqueOrThrow({ where: { orderId: seeded.order.id } });
    expect(liability.status).toBe(AffiliateLiabilityStatus.REVERSED);
    expect(
      await prisma.outboxEvent.count({
        where: { type: 'AFFILIATE_REVERSED', aggregateId: seeded.liability.id },
      }),
    ).toBe(1);
    const row = await dispatchOutbox('AFFILIATE_REVERSED', seeded.liability.id);
    await dispatch.handleDomainEvent(envelopeFromOutbox(row));
    const inbox = await notifications.listInbox(affiliate.personId);
    expect(
      inbox.filter((n) => n.event_type === 'AFFILIATE_REVERSED' && n.reference_id === seeded.liability.id),
    ).toHaveLength(1);
  });

  it('isolates recipients; finance ops can see affiliate metadata; facts stay idempotent', async () => {
    const { affiliate, code } = await setupAffiliateOrg(uuidv7().slice(0, 8));
    const seeded = await seedViaSyncOrder({ affiliateCode: code });
    const vendorUser = await signInCustomer(app, `s32-vend-${uuidv7()}@example.test`);

    await finance.approveAffiliate(seeded.order.id);
    const outbox = await dispatchOutbox('AFFILIATE_APPROVED', seeded.liability.id);
    await dispatch.handleDomainEvent(envelopeFromOutbox(outbox));

    const affInbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set(auth(affiliate.token));
    expect(affInbox.body.data.some((row: { event_type?: string }) => row.event_type === 'AFFILIATE_APPROVED')).toBe(
      true,
    );

    const customerInbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set(auth(seeded.customer.token));
    expect(
      customerInbox.body.data.some((row: { event_type?: string }) => row.event_type === 'AFFILIATE_APPROVED'),
    ).toBe(false);

    const vendorInbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set(auth(vendorUser.token));
    expect(vendorInbox.body.data.some((row: { event_type?: string }) => row.event_type === 'AFFILIATE_APPROVED')).toBe(
      false,
    );

    const financeRole = await provisionRole('s32-fin', 'company_finance');
    const ops = await request(app.getHttpServer())
      .get('/api/v1/admin/notifications/ops/records?event_type=AFFILIATE_APPROVED')
      .set(auth(financeRole.token));
    expect(ops.status).toBe(200);
    expect(ops.body.message_bodies_included).toBe(false);
    expect(
      ops.body.data.some(
        (row: { event_type?: string; reference_id?: string; country_code?: string; recipient_category?: string }) =>
          row.event_type === 'AFFILIATE_APPROVED' &&
          row.reference_id === seeded.liability.id &&
          row.country_code === countryCode &&
          row.recipient_category === 'affiliate',
      ),
    ).toBe(true);

    const adminOps = await request(app.getHttpServer())
      .get(`/api/v1/admin/notifications/ops/records?event_type=AFFILIATE_APPROVED&country_code=${countryCode}`)
      .set(auth(superToken));
    expect(adminOps.status).toBe(200);

    expect(
      await prisma.financialFact.count({
        where: { sourceKey: `affiliate:${seeded.order.id}`, kind: FinancialFactKind.AFFILIATE },
      }),
    ).toBe(1);
  });
});
