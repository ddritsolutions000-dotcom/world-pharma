import { INestApplication } from '@nestjs/common';
import {
  LocationKind,
  OrganizationKind,
  OrganizationStatus,
  PolicyPackStatus,
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
import { activateLabPartner, enableLabPartnerPack } from '../test/lab-partner';

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

describe('R7-B customer lab booking + sandbox pay (e2e)', () => {
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

  async function publishPack(doc: ReturnType<typeof emptyPolicyDocument>, suffix: string) {
    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'XX' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'XX',
          isoAlpha3: 'XXX',
          nameI18n: { en: 'R7B test' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
        },
      });
    }
    await prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        version: Math.floor(Date.now() % 1_000_000) + Math.floor(Math.random() * 1000),
        status: PolicyPackStatus.PUBLISHED,
        document: doc as never,
        checksum: `r7b-${suffix}`,
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
    await app.get(PolicyCache).invalidate('XX');
    return country;
  }

  it('discovers, books, pays sandbox, isolates tenants/locations, fail-closed packs', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const admin = await signIn(app, `r7b-admin-${suffix}@example.com`, 'admin');
    const labUser = await signIn(app, `r7b-la-${suffix}@example.com`);
    const otherLab = await signIn(app, `r7b-lb-${suffix}@example.com`);
    const customerA = await signIn(app, `r7b-ca-${suffix}@example.com`);
    const customerB = await signIn(app, `r7b-cb-${suffix}@example.com`);

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

    const emptyDoc = emptyPolicyDocument();
    await publishPack(emptyDoc, `empty-${suffix}`);

    const labA = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.LAB,
      legalName: `R7B Lab A ${suffix}`,
      displayName: `R7B Lab A ${suffix}`,
      actorId: admin.personId,
    });
    const labB = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.LAB,
      legalName: `R7B Lab B ${suffix}`,
      displayName: `R7B Lab B ${suffix}`,
      actorId: admin.personId,
    });
    await prisma.organization.updateMany({
      where: { id: { in: [labA.id, labB.id] } },
      data: { status: OrganizationStatus.ACTIVE },
    });
    await attachOrgAdmin(labUser.personId, labA.id);
    await attachOrgAdmin(otherLab.personId, labB.id);

    const country = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'XX' } });
    const locA = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: labA.id,
        countryId: country.id,
        kind: LocationKind.LAB,
        name: `Lab A Center ${suffix}`,
        city: 'Testville',
        isActive: true,
      },
    });
    const locB = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: labB.id,
        countryId: country.id,
        kind: LocationKind.LAB,
        name: `Lab B Center ${suffix}`,
        city: 'Othercity',
        isActive: true,
      },
    });

    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    const emptyBrowse = await request(app.getHttpServer())
      .get('/api/v1/me/lab/catalog?country=XX')
      .set(auth(customerA.token));
    expect(emptyBrowse.status).toBe(200);
    expect(emptyBrowse.body.country_enabled).toBe(false);
    expect(emptyBrowse.body.data).toEqual([]);

    const enabledDoc = emptyPolicyDocument();
    enableLabPartnerPack(enabledDoc, { home: true, center: true });
    enabledDoc.payments.enabled = true;
    enabledDoc.payments.methods = ['CARD'];
    enabledDoc.payments.gateway_refs = ['MOCK_PRIMARY', 'MOCK_SECONDARY'];
    enabledDoc.payments.currencies = ['XXX'];
    await publishPack(enabledDoc, `lab-${suffix}`);

    await activateLabPartner(app, {
      labToken: labUser.token,
      adminToken: admin.token,
      labOrgId: labA.id,
    });
    await activateLabPartner(app, {
      labToken: otherLab.token,
      adminToken: admin.token,
      labOrgId: labB.id,
    });

    const item = await request(app.getHttpServer())
      .post('/api/v1/lab/catalog/items')
      .set(auth(labUser.token))
      .send({
        slug: `r7b-lab-${suffix}`,
        kind: 'LAB_TEST',
        lab_org_id: labA.id,
        title: 'Lipid Panel',
        description: 'Commercial lab test listing — not medical advice',
        countries: [{ country_code: 'XX' }],
      });
    expect(item.status).toBe(201);

    const publishedItem = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set(auth(admin.token));
    expect(publishedItem.status).toBeLessThan(300);

    const variant = await request(app.getHttpServer())
      .post(`/api/v1/lab/catalog/items/${item.body.id}/variants?lab_org_id=${labA.id}`)
      .set(auth(labUser.token))
      .send({ sku_code: `R7B-${suffix}`, pack_size: '1 draw' });
    expect(variant.status).toBe(201);

    const offer = await request(app.getHttpServer())
      .post('/api/v1/lab/catalog/offers')
      .set(auth(labUser.token))
      .send({
        variant_id: variant.body.id,
        lab_org_id: labA.id,
        country_code: 'XX',
        ownership: 'LAB_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '2500',
      });
    expect(offer.status).toBe(201);

    const published = await request(app.getHttpServer())
      .post(`/api/v1/lab/catalog/offers/${offer.body.id}/publish`)
      .set(auth(labUser.token));
    expect([200, 201]).toContain(published.status);

    const browse = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/catalog?country=XX&q=r7b-lab-${suffix}`)
      .set(auth(customerA.token));
    expect(browse.status).toBe(200);
    expect(browse.body.country_enabled).toBe(true);
    expect(browse.body.data.some((row: { slug: string }) => row.slug === `r7b-lab-${suffix}`)).toBe(true);
    expect(JSON.stringify(browse.body)).not.toMatch(/clinical_note|patient_ssn|"prescription_/i);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/catalog/r7b-lab-${suffix}?country=XX`)
      .set(auth(customerA.token));
    expect(detail.status).toBe(200);
    expect(detail.body.offers[0].id).toBe(offer.body.id);

    const address = await prisma.customerAddress.create({
      data: {
        id: uuidv7(),
        customerPersonId: customerA.personId,
        countryId: country.id,
        recipientName: 'Customer A',
        city: 'Testville',
        line1: '1 Sample St',
        isDefault: true,
      },
    });

    const wrongLocation = await request(app.getHttpServer())
      .post('/api/v1/me/lab/bookings')
      .set(auth(customerA.token))
      .set('Idempotency-Key', `r7b-wrong-loc-${suffix}`)
      .send({
        offer_id: offer.body.id,
        collection_mode: 'CENTER',
        lab_org_id: labA.id,
        lab_location_id: locB.id,
        country: 'XX',
      });
    expect(wrongLocation.status).toBe(403);

    const idemKey = `r7b-book-${suffix}`;
    const booking = await request(app.getHttpServer())
      .post('/api/v1/me/lab/bookings')
      .set(auth(customerA.token))
      .set('Idempotency-Key', idemKey)
      .send({
        offer_id: offer.body.id,
        collection_mode: 'HOME',
        lab_org_id: labA.id,
        customer_address_id: address.id,
        country: 'XX',
        slot_starts_at: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(booking.status).toBe(201);
    expect(booking.body.status).toBe('BOOKED');
    expect(booking.body.boundary.creates_order).toBe(false);
    expect(booking.body.boundary.creates_specimen).toBe(false);
    expect(booking.body.boundary.live_money).toBe(false);

    const bookingIdem = await request(app.getHttpServer())
      .post('/api/v1/me/lab/bookings')
      .set(auth(customerA.token))
      .set('Idempotency-Key', idemKey)
      .send({
        offer_id: offer.body.id,
        collection_mode: 'HOME',
        lab_org_id: labA.id,
        customer_address_id: address.id,
        country: 'XX',
      });
    expect(bookingIdem.status).toBe(201);
    expect(bookingIdem.body.id).toBe(booking.body.id);

    const crossCustomer = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/bookings/${booking.body.id}`)
      .set(auth(customerB.token));
    expect(crossCustomer.status).toBe(403);

    const crossPay = await request(app.getHttpServer())
      .post(`/api/v1/me/lab/bookings/${booking.body.id}/pay`)
      .set(auth(customerB.token))
      .set('Idempotency-Key', `r7b-pay-x-${suffix}`)
      .send({ scenario: 'success' });
    expect(crossPay.status).toBe(403);

    const labBSeeA = await request(app.getHttpServer())
      .get(`/api/v1/lab/bookings?lab_org_id=${labA.id}`)
      .set(auth(otherLab.token));
    expect(labBSeeA.status).toBe(403);

    const labAList = await request(app.getHttpServer())
      .get(`/api/v1/lab/bookings?lab_org_id=${labA.id}`)
      .set(auth(labUser.token));
    expect(labAList.status).toBe(200);
    expect(labAList.body.data.some((row: { id: string }) => row.id === booking.body.id)).toBe(true);
    expect(JSON.stringify(labAList.body)).not.toMatch(/recipient_name|line1|"clinical_note"|patient_ssn/i);

    const payFail = await request(app.getHttpServer())
      .post(`/api/v1/me/lab/bookings/${booking.body.id}/pay`)
      .set(auth(customerA.token))
      .set('Idempotency-Key', `r7b-pay-fail-${suffix}`)
      .send({ scenario: 'failed' });
    expect([200, 201, 409]).toContain(payFail.status);

    const afterFail = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/bookings/${booking.body.id}`)
      .set(auth(customerA.token));
    expect(afterFail.status).toBe(200);
    expect(['BOOKED', 'PAYMENT_FAILED']).toContain(afterFail.body.status);

    const payOk = await request(app.getHttpServer())
      .post(`/api/v1/me/lab/bookings/${booking.body.id}/pay`)
      .set(auth(customerA.token))
      .set('Idempotency-Key', `r7b-pay-ok-${suffix}`)
      .send({ scenario: 'success' });
    expect([200, 201]).toContain(payOk.status);
    expect(payOk.body.status).toBe('CAPTURED');
    expect(payOk.body.sandbox).toBe(true);

    const confirmed = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/bookings/${booking.body.id}`)
      .set(auth(customerA.token));
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe('CONFIRMED');
    expect(confirmed.body.payment_intent_id).toBeTruthy();

    const orders = await prisma.order.count({
      where: { paymentIntentId: payOk.body.id },
    });
    expect(orders).toBe(0);

    const disabledDoc = emptyPolicyDocument();
    enableLabPartnerPack(disabledDoc, { home: false, center: false });
    disabledDoc.partner_types.LAB.enabled = true;
    disabledDoc.payments.enabled = true;
    await publishPack(disabledDoc, `off-${suffix}`);

    const disabledBrowse = await request(app.getHttpServer())
      .get('/api/v1/me/lab/catalog?country=XX')
      .set(auth(customerA.token));
    expect(disabledBrowse.status).toBe(200);
    expect(disabledBrowse.body.country_enabled).toBe(false);

    const centerBooking = await request(app.getHttpServer())
      .post('/api/v1/me/lab/bookings')
      .set(auth(customerA.token))
      .set('Idempotency-Key', `r7b-center-off-${suffix}`)
      .send({
        offer_id: offer.body.id,
        collection_mode: 'CENTER',
        lab_org_id: labA.id,
        lab_location_id: locA.id,
        country: 'XX',
      });
    expect(centerBooking.status).toBeGreaterThanOrEqual(400);
  });
});
