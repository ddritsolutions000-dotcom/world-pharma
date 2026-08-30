import { INestApplication } from '@nestjs/common';
import {
  OrganizationKind,
  OrganizationStatus,
  PolicyPackStatus,
  SettlementBatchStatus,
  VendorPayableStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { OrganizationService } from '../partner/organization.service';
import { PolicyCache } from '../policy/cache';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { applyTestIsolation } from '../test/isolate-runtime';
import { enableMarketplaceVendorPack } from '../test/marketplace-seller';

async function signIn(app: INestApplication, email: string, audience: 'admin' | 'customer' = 'customer') {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({
      challenge_id: requested.body.challenge_id,
      code: requested.body.dev_code,
      audience,
    });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

const PHI_LEAK = /diagnosis|clinical_note|prescription_instruction|dosage|encounter|patient_id|customer_person_id/i;

describe('R6-E vendor settlements + support/notifications (e2e)', () => {
  jest.setTimeout(120_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let orgs: OrganizationService;

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
    orgs = app.get(OrganizationService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function attachOrgAdmin(personId: string, organizationId: string) {
    const role = await prisma.role.findUnique({ where: { code: 'org_admin' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId,
        roleId: role!.id,
        scope: 'organization',
        organizationId,
        status: 'ACTIVE',
      },
    });
  }

  it('isolates settlement detail, correlates support, and keeps sandbox finance boundary', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const admin = await signIn(app, `r6e-admin-${suffix}@example.com`, 'admin');
    const vendorA = await signIn(app, `r6e-va-${suffix}@example.com`);
    const vendorB = await signIn(app, `r6e-vb-${suffix}@example.com`);

    const superAdmin = await prisma.role.findUnique({ where: { code: 'super_admin' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: admin.personId,
        roleId: superAdmin!.id,
        scope: 'platform',
        status: 'ACTIVE',
      },
    });

    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'TE' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'TE',
          isoAlpha3: 'TEE',
          nameI18n: { en: 'R6E test' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
        },
      });
    }
    const doc = emptyPolicyDocument();
    enableMarketplaceVendorPack(doc);
    doc.services.pharmacy = true;
    doc.payments.enabled = true;
    doc.payments.methods = ['CARD'];
    doc.payments.gateway_refs = ['MOCK_PRIMARY'];
    doc.payments.currencies = ['XXX'];
    await prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        version: Math.floor(Date.now() % 1_000_000),
        status: PolicyPackStatus.PUBLISHED,
        document: doc as never,
        checksum: `r6e-${suffix}`,
        publishedAt: new Date(),
      },
    });
    const pack = await prisma.policyPack.findFirst({
      where: { countryId: country.id, status: PolicyPackStatus.PUBLISHED },
      orderBy: { publishedAt: 'desc' },
    });
    if (pack) {
      await prisma.country.update({
        where: { id: country.id },
        data: { publishedPolicyPackId: pack.id },
      });
    }
    await app.get(PolicyCache).invalidate('TE');
    await prisma.settlementPolicy.upsert({
      where: { countryId: country.id },
      create: {
        id: uuidv7(),
        countryId: country.id,
        holdDays: 0,
        dualControl: false,
      },
      update: { holdDays: 0, dualControl: false },
    });

    const orgA = await orgs.create({
      countryCode: 'TE',
      kind: OrganizationKind.VENDOR,
      legalName: `R6E A ${suffix}`,
      displayName: `R6E A ${suffix}`,
      actorId: admin.personId,
    });
    const orgB = await orgs.create({
      countryCode: 'TE',
      kind: OrganizationKind.VENDOR,
      legalName: `R6E B ${suffix}`,
      displayName: `R6E B ${suffix}`,
      actorId: admin.personId,
    });
    await prisma.organization.updateMany({
      where: { id: { in: [orgA.id, orgB.id] } },
      data: { status: OrganizationStatus.ACTIVE },
    });
    await attachOrgAdmin(vendorA.personId, orgA.id);
    await attachOrgAdmin(vendorB.personId, orgB.id);

    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    const orderId = uuidv7();
    const payableId = uuidv7();
    const periodId = uuidv7();
    const batchId = uuidv7();
    const lineId = uuidv7();

    // Minimal order row required by VendorPayable FK — commercial fields only.
    const cartId = uuidv7();
    const checkoutId = uuidv7();
    const quoteId = uuidv7();
    const intentId = uuidv7();
    const locationId = uuidv7();
    await prisma.location.create({
      data: {
        id: locationId,
        organizationId: orgA.id,
        countryId: country.id,
        kind: 'VENDOR_WAREHOUSE',
        name: `R6E WH ${suffix}`,
        timezone: 'UTC',
      },
    });
    await prisma.cart.create({
      data: {
        id: cartId,
        customerPersonId: vendorA.personId,
        countryId: country.id,
        sellerOrgId: orgA.id,
      },
    });
    await prisma.checkoutSession.create({
      data: {
        id: checkoutId,
        customerPersonId: vendorA.personId,
        countryId: country.id,
        cartId,
        sellerOrgId: orgA.id,
        status: 'READY_FOR_PAYMENT',
        idempotencyKey: `r6e-co-${suffix}`,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    await prisma.checkoutQuote.create({
      data: {
        id: quoteId,
        sessionId: checkoutId,
        fingerprint: 'r6e',
        currency: 'XXX',
        sellMinor: 1000n,
        totalMinor: 1000n,
        payload: {},
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    await prisma.paymentIntent.create({
      data: {
        id: intentId,
        checkoutSessionId: checkoutId,
        checkoutQuoteId: quoteId,
        customerPersonId: vendorA.personId,
        countryId: country.id,
        method: 'CARD',
        status: 'CAPTURED',
        amountMinor: 1000n,
        capturedMinor: 1000n,
        currency: 'XXX',
        idempotencyKey: `r6e-pay-${suffix}`,
      },
    });
    await prisma.order.create({
      data: {
        id: orderId,
        orderNumber: `R6E-${suffix}`,
        customerPersonId: vendorA.personId,
        sellerOrgId: orgA.id,
        countryId: country.id,
        checkoutSessionId: checkoutId,
        checkoutQuoteId: quoteId,
        paymentIntentId: intentId,
        fulfillingLocationId: locationId,
        status: 'DELIVERED',
        currency: 'XXX',
        goodsMinor: 1000n,
        totalMinor: 1000n,
      },
    });
    await prisma.vendorPayable.create({
      data: {
        id: payableId,
        orderId,
        sellerOrgId: orgA.id,
        countryId: country.id,
        amountMinor: 880n,
        currency: 'XXX',
        status: VendorPayableStatus.APPROVED,
        takeBpsFrozen: 1200,
        takeFlatFrozen: 0n,
      },
    });
    await prisma.settlementPeriod.create({
      data: {
        id: periodId,
        countryId: country.id,
        currency: 'XXX',
        startsAt: new Date('2026-01-01T00:00:00Z'),
        endsAt: new Date('2026-01-31T23:59:59Z'),
      },
    });
    await prisma.settlementBatch.create({
      data: {
        id: batchId,
        periodId,
        status: SettlementBatchStatus.APPROVED,
        currency: 'XXX',
        createdBy: admin.personId,
      },
    });
    await prisma.settlementLine.create({
      data: {
        id: lineId,
        batchId,
        sellerOrgId: orgA.id,
        vendorPayableId: payableId,
        grossMinor: 1000n,
        refundMinor: 0n,
        feeMinor: 120n,
        netMinor: 880n,
        currency: 'XXX',
      },
    });

    const listA = await request(app.getHttpServer())
      .get(`/api/v1/vendor/settlements?seller_org_id=${orgA.id}`)
      .set(auth(vendorA.token));
    expect(listA.status).toBe(200);
    expect(listA.body.data.some((row: { id: string }) => row.id === lineId)).toBe(true);
    expect(listA.body.data[0].live_payout).toBe(false);
    expect(listA.body.data[0].sandbox).toBe(true);
    expect(JSON.stringify(listA.body)).not.toMatch(PHI_LEAK);

    const listCross = await request(app.getHttpServer())
      .get(`/api/v1/vendor/settlements?seller_org_id=${orgA.id}`)
      .set(auth(vendorB.token));
    expect(listCross.status).toBe(403);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/vendor/settlements/${lineId}`)
      .set(auth(vendorA.token));
    expect(detail.status).toBe(200);
    expect(detail.body.order_id).toBe(orderId);
    expect(detail.body.live_payout).toBe(false);
    expect(detail.body.take_bps_frozen).toBe(1200);
    expect(JSON.stringify(detail.body)).not.toMatch(PHI_LEAK);

    const stealDetail = await request(app.getHttpServer())
      .get(`/api/v1/vendor/settlements/${lineId}`)
      .set(auth(vendorB.token));
    expect([403, 404]).toContain(stealDetail.status);

    const ticket = await request(app.getHttpServer())
      .post('/api/v1/vendor/support/tickets')
      .set(auth(vendorA.token))
      .send({
        seller_org_id: orgA.id,
        subject: 'Settlement question',
        body: 'Please clarify sandbox batch status.',
        reference_type: 'settlement_line',
        reference_id: lineId,
      });
    expect(ticket.status).toBeLessThan(300);
    expect(ticket.body.reference_type).toBe('settlement_line');
    expect(JSON.stringify(ticket.body)).not.toMatch(PHI_LEAK);

    const stealTicket = await request(app.getHttpServer())
      .post('/api/v1/vendor/support/tickets')
      .set(auth(vendorB.token))
      .send({
        seller_org_id: orgB.id,
        subject: 'Steal settlement',
        body: 'Attempt',
        reference_type: 'settlement_line',
        reference_id: lineId,
      });
    expect(stealTicket.status).toBe(403);

    const tickets = await request(app.getHttpServer())
      .get('/api/v1/vendor/support/tickets')
      .set(auth(vendorA.token));
    expect(tickets.status).toBe(200);
    expect(tickets.body.data.some((row: { id: string }) => row.id === ticket.body.id)).toBe(true);

    const prefs = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/preferences')
      .set(auth(vendorA.token));
    expect(prefs.status).toBe(200);
    expect(prefs.body.settlement_updates).toBe(true);
    expect(prefs.body.support_updates).toBe(true);

    const patched = await request(app.getHttpServer())
      .patch('/api/v1/me/notifications/preferences')
      .set(auth(vendorA.token))
      .send({ settlement_updates: false });
    expect(patched.status).toBe(200);
    expect(patched.body.settlement_updates).toBe(false);

    const inbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set(auth(vendorA.token));
    expect(inbox.status).toBe(200);
    expect(JSON.stringify(inbox.body)).not.toMatch(PHI_LEAK);

    const adminLines = await request(app.getHttpServer())
      .get(`/api/v1/admin/finance/settlement-lines?seller_org_id=${orgA.id}`)
      .set(auth(admin.token));
    expect(adminLines.status).toBe(200);
    expect(adminLines.body.live_payout).toBe(false);
    expect(adminLines.body.data.some((row: { id: string }) => row.id === lineId)).toBe(true);
  });
});
