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
import { activateImagingPartner, enableImagingPartnerPack } from '../test/imaging-partner';
import { bootstrapSuperAdminByEmail, signIn as signInAudience } from '../test/sign-in';

describe('R8-B customer imaging booking + sandbox pay (e2e)', () => {
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
          nameI18n: { en: 'R8B test' },
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
        checksum: `r8b-${suffix}`,
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
    const admin = await bootstrapSuperAdminByEmail(app, prisma, `r8b-admin-${suffix}@example.com`);
    const imagingUser = await signInAudience(app, `r8b-ia-${suffix}@example.com`);
    const otherImaging = await signInAudience(app, `r8b-ib-${suffix}@example.com`);
    const customerA = await signInAudience(app, `r8b-ca-${suffix}@example.com`);
    const customerB = await signInAudience(app, `r8b-cb-${suffix}@example.com`);

    const emptyDoc = emptyPolicyDocument();
    await publishPack(emptyDoc, `empty-${suffix}`);

    const imagingA = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.IMAGING_CENTER,
      legalName: `R8B Imaging A ${suffix}`,
      displayName: `R8B Imaging A ${suffix}`,
      actorId: admin.personId,
    });
    const imagingB = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.IMAGING_CENTER,
      legalName: `R8B Imaging B ${suffix}`,
      displayName: `R8B Imaging B ${suffix}`,
      actorId: admin.personId,
    });
    await prisma.organization.updateMany({
      where: { id: { in: [imagingA.id, imagingB.id] } },
      data: { status: OrganizationStatus.ACTIVE },
    });
    await attachOrgAdmin(imagingUser.personId, imagingA.id);
    await attachOrgAdmin(otherImaging.personId, imagingB.id);

    const country = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'XX' } });
    const locA = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: imagingA.id,
        countryId: country.id,
        kind: LocationKind.IMAGING,
        name: `Imaging A Center ${suffix}`,
        city: 'Testville',
        isActive: true,
      },
    });
    const locB = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: imagingB.id,
        countryId: country.id,
        kind: LocationKind.IMAGING,
        name: `Imaging B Center ${suffix}`,
        city: 'Othercity',
        isActive: true,
      },
    });

    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    const emptyBrowse = await request(app.getHttpServer())
      .get('/api/v1/me/imaging/catalog?country=XX')
      .set(auth(customerA.token));
    expect(emptyBrowse.status).toBe(200);
    expect(emptyBrowse.body.country_enabled).toBe(false);
    expect(emptyBrowse.body.data).toEqual([]);

    const enabledDoc = emptyPolicyDocument();
    enableImagingPartnerPack(enabledDoc);
    enabledDoc.payments.enabled = true;
    enabledDoc.payments.methods = ['CARD'];
    enabledDoc.payments.gateway_refs = ['MOCK_PRIMARY', 'MOCK_SECONDARY'];
    enabledDoc.payments.currencies = ['XXX'];
    await publishPack(enabledDoc, `imaging-${suffix}`);

    await activateImagingPartner(app, {
      imagingToken: imagingUser.token,
      adminToken: admin.token,
      imagingOrgId: imagingA.id,
    });
    await activateImagingPartner(app, {
      imagingToken: otherImaging.token,
      adminToken: admin.token,
      imagingOrgId: imagingB.id,
    });

    const item = await request(app.getHttpServer())
      .post('/api/v1/radiology/catalog/items')
      .set(auth(imagingUser.token))
      .send({
        slug: `r8b-imaging-${suffix}`,
        kind: 'IMAGING_STUDY',
        imaging_org_id: imagingA.id,
        title: 'Chest X-Ray',
        description: 'Commercial imaging listing — not medical advice',
        countries: [{ country_code: 'XX' }],
      });
    expect(item.status).toBe(201);

    const publishedItem = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set(auth(admin.token));
    expect(publishedItem.status).toBeLessThan(300);

    const variant = await request(app.getHttpServer())
      .post(`/api/v1/radiology/catalog/items/${item.body.id}/variants?imaging_org_id=${imagingA.id}`)
      .set(auth(imagingUser.token))
      .send({ sku_code: `IMG-${suffix}`, pack_size: '1 study' });
    expect(variant.status).toBe(201);

    const offer = await request(app.getHttpServer())
      .post('/api/v1/radiology/catalog/offers')
      .set(auth(imagingUser.token))
      .send({
        variant_id: variant.body.id,
        imaging_org_id: imagingA.id,
        country_code: 'XX',
        ownership: 'IMAGING_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '3500',
      });
    expect(offer.status).toBe(201);

    const published = await request(app.getHttpServer())
      .post(`/api/v1/radiology/catalog/offers/${offer.body.id}/publish`)
      .set(auth(imagingUser.token));
    expect([200, 201]).toContain(published.status);

    const browse = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/catalog?country=XX&q=r8b-imaging-${suffix}`)
      .set(auth(customerA.token));
    expect(browse.status).toBe(200);
    expect(browse.body.country_enabled).toBe(true);
    expect(browse.body.data.some((row: { slug: string }) => row.slug === `r8b-imaging-${suffix}`)).toBe(true);
    expect(JSON.stringify(browse.body)).not.toMatch(/diagnosis|clinical_note|dicom/i);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/catalog/r8b-imaging-${suffix}?country=XX`)
      .set(auth(customerA.token));
    expect(detail.status).toBe(200);
    expect(detail.body.offers[0].id).toBe(offer.body.id);

    const eligibility = await request(app.getHttpServer())
      .post('/api/v1/me/imaging/eligibility')
      .set(auth(customerA.token))
      .send({
        imaging_org_id: imagingA.id,
        offer_id: offer.body.id,
        country: 'XX',
      });
    expect(eligibility.status).toBe(201);
    expect(eligibility.body.eligible).toBe(true);
    expect(eligibility.body.referral_required).toBe(false);

    const slotStart = new Date(Date.now() + 86400000);
    slotStart.setUTCHours(9, 0, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

    const wrongLocation = await request(app.getHttpServer())
      .post('/api/v1/me/imaging/bookings')
      .set(auth(customerA.token))
      .set('Idempotency-Key', `r8b-wrong-loc-${suffix}`)
      .send({
        offer_id: offer.body.id,
        imaging_org_id: imagingA.id,
        imaging_location_id: locB.id,
        country: 'XX',
        prep_acknowledged: true,
        slot_starts_at: slotStart.toISOString(),
        slot_ends_at: slotEnd.toISOString(),
      });
    expect(wrongLocation.status).toBe(403);

    const idemKey = `r8b-book-${suffix}`;
    const booking = await request(app.getHttpServer())
      .post('/api/v1/me/imaging/bookings')
      .set(auth(customerA.token))
      .set('Idempotency-Key', idemKey)
      .send({
        offer_id: offer.body.id,
        imaging_org_id: imagingA.id,
        imaging_location_id: locA.id,
        country: 'XX',
        prep_acknowledged: true,
        slot_starts_at: slotStart.toISOString(),
        slot_ends_at: slotEnd.toISOString(),
      });
    expect(booking.status).toBe(201);
    expect(booking.body.status).toBe('BOOKED');
    expect(booking.body.boundary.creates_order).toBe(false);
    expect(booking.body.boundary.creates_study).toBe(false);
    expect(booking.body.boundary.live_money).toBe(false);

    const bookingIdem = await request(app.getHttpServer())
      .post('/api/v1/me/imaging/bookings')
      .set(auth(customerA.token))
      .set('Idempotency-Key', idemKey)
      .send({
        offer_id: offer.body.id,
        imaging_org_id: imagingA.id,
        imaging_location_id: locA.id,
        country: 'XX',
        prep_acknowledged: true,
      });
    expect(bookingIdem.status).toBe(201);
    expect(bookingIdem.body.id).toBe(booking.body.id);

    const crossCustomer = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${booking.body.id}`)
      .set(auth(customerB.token));
    expect(crossCustomer.status).toBe(403);

    const crossPay = await request(app.getHttpServer())
      .post(`/api/v1/me/imaging/bookings/${booking.body.id}/pay`)
      .set(auth(customerB.token))
      .set('Idempotency-Key', `r8b-pay-x-${suffix}`)
      .send({ scenario: 'success' });
    expect(crossPay.status).toBe(403);

    const imagingBSeeA = await request(app.getHttpServer())
      .get(`/api/v1/radiology/bookings?imaging_org_id=${imagingA.id}`)
      .set(auth(otherImaging.token));
    expect(imagingBSeeA.status).toBe(403);

    const imagingAList = await request(app.getHttpServer())
      .get(`/api/v1/radiology/bookings?imaging_org_id=${imagingA.id}`)
      .set(auth(imagingUser.token));
    expect(imagingAList.status).toBe(200);
    expect(imagingAList.body.data.some((row: { id: string }) => row.id === booking.body.id)).toBe(true);
    expect(JSON.stringify(imagingAList.body)).not.toMatch(/patient_id|diagnosis|dicom/i);

    const prep = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${booking.body.id}/preparation`)
      .set(auth(customerA.token));
    expect(prep.status).toBe(200);
    expect(prep.body.instructions).toBeDefined();

    const prepCrossCustomer = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${booking.body.id}/preparation`)
      .set(auth(customerB.token));
    expect(prepCrossCustomer.status).toBe(403);

    const progress = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${booking.body.id}/progress`)
      .set(auth(customerA.token));
    expect(progress.status).toBe(200);
    expect(progress.body.progress).toBe('SCHEDULED');

    const payFail = await request(app.getHttpServer())
      .post(`/api/v1/me/imaging/bookings/${booking.body.id}/pay`)
      .set(auth(customerA.token))
      .set('Idempotency-Key', `r8b-pay-fail-${suffix}`)
      .send({ scenario: 'failed' });
    expect([200, 201, 409]).toContain(payFail.status);

    const payFailIdem = await request(app.getHttpServer())
      .post(`/api/v1/me/imaging/bookings/${booking.body.id}/pay`)
      .set(auth(customerA.token))
      .set('Idempotency-Key', `r8b-pay-fail-${suffix}`)
      .send({ scenario: 'failed' });
    expect(payFailIdem.status).toBe(payFail.status);
    if (payFail.status < 300 && payFailIdem.status < 300) {
      expect(payFailIdem.body.id).toBe(payFail.body.id);
    }

    const afterFail = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${booking.body.id}`)
      .set(auth(customerA.token));
    expect(afterFail.status).toBe(200);
    expect(['BOOKED', 'PAYMENT_FAILED']).toContain(afterFail.body.status);

    const payOk = await request(app.getHttpServer())
      .post(`/api/v1/me/imaging/bookings/${booking.body.id}/pay`)
      .set(auth(customerA.token))
      .set('Idempotency-Key', `r8b-pay-ok-${suffix}`)
      .send({ scenario: 'success' });
    expect([200, 201]).toContain(payOk.status);
    expect(payOk.body.status).toBe('CAPTURED');
    expect(payOk.body.sandbox).toBe(true);
    expect(payOk.body.imaging_booking_id).toBe(booking.body.id);

    const confirmed = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${booking.body.id}`)
      .set(auth(customerA.token));
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe('CONFIRMED');
    expect(confirmed.body.payment_intent_id).toBeTruthy();

    const payConfirmed = await request(app.getHttpServer())
      .post(`/api/v1/me/imaging/bookings/${booking.body.id}/pay`)
      .set(auth(customerA.token))
      .set('Idempotency-Key', `r8b-pay-confirmed-${suffix}`)
      .send({ scenario: 'success' });
    expect(payConfirmed.status).toBe(409);

    const orders = await prisma.order.count({
      where: { paymentIntentId: payOk.body.id },
    });
    expect(orders).toBe(0);

    const slotConflict = await request(app.getHttpServer())
      .post('/api/v1/me/imaging/bookings')
      .set(auth(customerB.token))
      .set('Idempotency-Key', `r8b-slot-conflict-${suffix}`)
      .send({
        offer_id: offer.body.id,
        imaging_org_id: imagingA.id,
        imaging_location_id: locA.id,
        country: 'XX',
        prep_acknowledged: true,
        slot_starts_at: slotStart.toISOString(),
        slot_ends_at: slotEnd.toISOString(),
      });
    expect(slotConflict.status).toBe(409);

    const disabledDoc = emptyPolicyDocument();
    disabledDoc.services.imaging_center = false;
    disabledDoc.partner_types.IMAGING_CENTER.enabled = true;
    disabledDoc.payments.enabled = true;
    await publishPack(disabledDoc, `off-${suffix}`);

    const disabledBrowse = await request(app.getHttpServer())
      .get('/api/v1/me/imaging/catalog?country=XX')
      .set(auth(customerA.token));
    expect(disabledBrowse.status).toBe(200);
    expect(disabledBrowse.body.country_enabled).toBe(false);

    const referralDoc = emptyPolicyDocument();
    enableImagingPartnerPack(referralDoc);
    referralDoc.services.imaging_referral_required = true;
    referralDoc.payments.enabled = true;
    referralDoc.payments.methods = ['CARD'];
    referralDoc.payments.gateway_refs = ['MOCK_PRIMARY', 'MOCK_SECONDARY'];
    referralDoc.payments.currencies = ['XXX'];
    await publishPack(referralDoc, `referral-${suffix}`);

    const referralBlocked = await request(app.getHttpServer())
      .post('/api/v1/me/imaging/bookings')
      .set(auth(customerB.token))
      .set('Idempotency-Key', `r8b-no-referral-${suffix}`)
      .send({
        offer_id: offer.body.id,
        imaging_org_id: imagingA.id,
        imaging_location_id: locA.id,
        country: 'XX',
        prep_acknowledged: true,
        slot_starts_at: new Date(Date.now() + 172800000).toISOString(),
        slot_ends_at: new Date(Date.now() + 172800000 + 3600000).toISOString(),
      });
    expect(referralBlocked.status).toBeGreaterThanOrEqual(400);
  });
});
