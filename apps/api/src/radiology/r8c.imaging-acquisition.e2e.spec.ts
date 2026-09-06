import { INestApplication } from '@nestjs/common';
import {
  ImagingStudyStatus,
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

describe('R8-C imaging acquisition + sandbox study lifecycle (e2e)', () => {
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
          nameI18n: { en: 'R8C test' },
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
        checksum: `r8c-${suffix}`,
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

  async function bookAndConfirm(input: {
    customerToken: string;
    offerId: string;
    imagingOrgId: string;
    imagingLocationId: string;
    suffix: string;
    slotOffsetMs?: number;
  }) {
    const slotStart = new Date(Date.now() + (input.slotOffsetMs ?? 86400000));
    slotStart.setUTCHours(9, 0, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);
    const booking = await request(app.getHttpServer())
      .post('/api/v1/me/imaging/bookings')
      .set('Authorization', `Bearer ${input.customerToken}`)
      .set('Idempotency-Key', `r8c-book-${input.suffix}`)
      .send({
        offer_id: input.offerId,
        imaging_org_id: input.imagingOrgId,
        imaging_location_id: input.imagingLocationId,
        country: 'XX',
        prep_acknowledged: true,
        slot_starts_at: slotStart.toISOString(),
        slot_ends_at: slotEnd.toISOString(),
      });
    expect(booking.status).toBe(201);
    const pay = await request(app.getHttpServer())
      .post(`/api/v1/me/imaging/bookings/${booking.body.id}/pay`)
      .set('Authorization', `Bearer ${input.customerToken}`)
      .set('Idempotency-Key', `r8c-pay-${input.suffix}`)
      .send({ scenario: 'success' });
    expect([200, 201]).toContain(pay.status);
    return { bookingId: booking.body.id as string, payIntentId: pay.body.id as string };
  }

  it('enqueues study on pay, check-in, acquisition lifecycle, isolation, idempotency, PHI minimization', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const admin = await bootstrapSuperAdminByEmail(app, prisma, `r8c-admin-${suffix}@example.com`);
    const imagingUser = await signInAudience(app, `r8c-ia-${suffix}@example.com`);
    const techA = await signInAudience(app, `r8c-tech-a-${suffix}@example.com`);
    const techB = await signInAudience(app, `r8c-tech-b-${suffix}@example.com`);
    const customerA = await signInAudience(app, `r8c-ca-${suffix}@example.com`);
    const customerB = await signInAudience(app, `r8c-cb-${suffix}@example.com`);

    const enabledDoc = emptyPolicyDocument();
    enableImagingPartnerPack(enabledDoc);
    enabledDoc.payments.enabled = true;
    enabledDoc.payments.methods = ['CARD'];
    enabledDoc.payments.gateway_refs = ['MOCK_PRIMARY', 'MOCK_SECONDARY'];
    enabledDoc.payments.currencies = ['XXX'];
    await publishPack(enabledDoc, `imaging-${suffix}`);

    const imagingA = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.IMAGING_CENTER,
      legalName: `R8C Imaging A ${suffix}`,
      displayName: `R8C Imaging A ${suffix}`,
      actorId: admin.personId,
    });
    const imagingB = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.IMAGING_CENTER,
      legalName: `R8C Imaging B ${suffix}`,
      displayName: `R8C Imaging B ${suffix}`,
      actorId: admin.personId,
    });
    await prisma.organization.updateMany({
      where: { id: { in: [imagingA.id, imagingB.id] } },
      data: { status: OrganizationStatus.ACTIVE },
    });
    await attachOrgAdmin(imagingUser.personId, imagingA.id);
    await attachOrgAdmin(techA.personId, imagingA.id);
    await attachOrgAdmin(techB.personId, imagingB.id);

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
    await prisma.location.create({
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

    await activateImagingPartner(app, {
      imagingToken: imagingUser.token,
      adminToken: admin.token,
      imagingOrgId: imagingA.id,
    });
    await activateImagingPartner(app, {
      imagingToken: techB.token,
      adminToken: admin.token,
      imagingOrgId: imagingB.id,
    });

    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    const item = await request(app.getHttpServer())
      .post('/api/v1/radiology/catalog/items')
      .set(auth(imagingUser.token))
      .send({
        slug: `r8c-imaging-${suffix}`,
        kind: 'IMAGING_STUDY',
        imaging_org_id: imagingA.id,
        title: 'Chest X-Ray',
        description: 'Commercial imaging listing — not medical advice',
        countries: [{ country_code: 'XX' }],
      });
    expect(item.status).toBe(201);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set(auth(admin.token));
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/radiology/catalog/items/${item.body.id}/variants?imaging_org_id=${imagingA.id}`)
      .set(auth(imagingUser.token))
      .send({ sku_code: `IMG-${suffix}`, pack_size: '1 study' });
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
    await request(app.getHttpServer())
      .post(`/api/v1/radiology/catalog/offers/${offer.body.id}/publish`)
      .set(auth(imagingUser.token));

    const { bookingId: mainBookingId, payIntentId } = await bookAndConfirm({
      customerToken: customerA.token,
      offerId: offer.body.id,
      imagingOrgId: imagingA.id,
      imagingLocationId: locA.id,
      suffix: `main-${suffix}`,
    });

    const confirmed = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${mainBookingId}`)
      .set(auth(customerA.token));
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe('CONFIRMED');

    const studyAfterPay = await prisma.imagingStudy.findUnique({ where: { imagingBookingId: mainBookingId } });
    expect(studyAfterPay).toBeTruthy();
    expect(studyAfterPay!.status).toBe(ImagingStudyStatus.SCHEDULED);
    expect(studyAfterPay!.sandbox).toBe(true);

    const progressScheduled = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${mainBookingId}/progress`)
      .set(auth(customerA.token));
    expect(progressScheduled.status).toBe(200);
    expect(progressScheduled.body.progress).toBe('STUDY_SCHEDULED');
    expect(JSON.stringify(progressScheduled.body)).not.toMatch(/diagnosis|findings/i);

    const checkIn1 = await request(app.getHttpServer())
      .post('/api/v1/radiology/check-in')
      .set(auth(imagingUser.token))
      .send({
        imaging_org_id: imagingA.id,
        imaging_booking_id: mainBookingId,
        assignee_person_id: techA.personId,
      });
    expect(checkIn1.status).toBeLessThan(300);
    expect(checkIn1.body.status).toBe('CHECKED_IN');
    expect(checkIn1.body.assignee_person_id).toBe(techA.personId);
    expect(JSON.stringify(checkIn1.body)).not.toMatch(/diagnosis|findings/i);

    const studyCountBefore = await prisma.imagingStudy.count({ where: { imagingBookingId: mainBookingId } });
    expect(studyCountBefore).toBe(1);

    const checkIn2 = await request(app.getHttpServer())
      .post('/api/v1/radiology/check-in')
      .set(auth(imagingUser.token))
      .send({
        imaging_org_id: imagingA.id,
        imaging_booking_id: mainBookingId,
        assignee_person_id: techA.personId,
      });
    expect(checkIn2.status).toBeLessThan(300);
    expect(checkIn2.body.id).toBe(checkIn1.body.id);
    expect(checkIn2.body.status).toBe('CHECKED_IN');

    const studyCountAfter = await prisma.imagingStudy.count({ where: { imagingBookingId: mainBookingId } });
    expect(studyCountAfter).toBe(1);

    const studyId = checkIn1.body.id as string;

    const techBCrossOrgList = await request(app.getHttpServer())
      .get(`/api/v1/radiology/studies?imaging_org_id=${imagingA.id}`)
      .set(auth(techB.token));
    expect(techBCrossOrgList.status).toBe(403);

    const techBCrossOrgGet = await request(app.getHttpServer())
      .get(`/api/v1/radiology/studies/${studyId}?imaging_org_id=${imagingA.id}`)
      .set(auth(techB.token));
    expect(techBCrossOrgGet.status).toBe(403);

    const { bookingId: unassignedBookingId } = await bookAndConfirm({
      customerToken: customerA.token,
      offerId: offer.body.id,
      imagingOrgId: imagingA.id,
      imagingLocationId: locA.id,
      suffix: `unassigned-${suffix}`,
      slotOffsetMs: 172800000,
    });
    const checkInUnassigned = await request(app.getHttpServer())
      .post('/api/v1/radiology/check-in')
      .set(auth(imagingUser.token))
      .send({
        imaging_org_id: imagingA.id,
        imaging_booking_id: unassignedBookingId,
      });
    expect(checkInUnassigned.status).toBeLessThan(300);
    expect(checkInUnassigned.body.assignee_person_id).toBeNull();
    const unassignedStudyId = checkInUnassigned.body.id as string;

    const startUnassigned = await request(app.getHttpServer())
      .post(`/api/v1/radiology/studies/${unassignedStudyId}/start?imaging_org_id=${imagingA.id}`)
      .set(auth(imagingUser.token))
      .set('Idempotency-Key', `r8c-start-unassigned-${suffix}`);
    expect(startUnassigned.status).toBe(403);

    const assignTech = await request(app.getHttpServer())
      .post(`/api/v1/radiology/studies/${unassignedStudyId}/assign`)
      .set(auth(imagingUser.token))
      .send({
        imaging_org_id: imagingA.id,
        assignee_person_id: techA.personId,
      });
    expect(assignTech.status).toBeLessThan(300);
    expect(assignTech.body.assignee_person_id).toBe(techA.personId);

    const completeWithoutStart = await request(app.getHttpServer())
      .post(`/api/v1/radiology/studies/${unassignedStudyId}/complete`)
      .set(auth(techA.token))
      .send({
        imaging_org_id: imagingA.id,
        equipment_code: 'XR-UNIT-1',
        modality_code: 'XR',
      });
    expect(completeWithoutStart.status).toBe(409);

    const progressCheckedIn = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${mainBookingId}/progress`)
      .set(auth(customerA.token));
    expect(progressCheckedIn.status).toBe(200);
    expect(progressCheckedIn.body.progress).toBe('CHECKED_IN');

    const start1 = await request(app.getHttpServer())
      .post(`/api/v1/radiology/studies/${studyId}/start?imaging_org_id=${imagingA.id}`)
      .set(auth(techA.token))
      .set('Idempotency-Key', `r8c-start-main-${suffix}`);
    expect(start1.status).toBeLessThan(300);
    expect(start1.body.status).toBe('ACQUISITION_IN_PROGRESS');
    expect(JSON.stringify(start1.body)).not.toMatch(/diagnosis|findings/i);

    const startDup = await request(app.getHttpServer())
      .post(`/api/v1/radiology/studies/${studyId}/start?imaging_org_id=${imagingA.id}`)
      .set(auth(techA.token))
      .set('Idempotency-Key', `r8c-start-main-dup-${suffix}`);
    expect(startDup.status).toBeLessThan(300);
    expect(startDup.body.id).toBe(studyId);
    expect(startDup.body.status).toBe('ACQUISITION_IN_PROGRESS');

    const progressInProgress = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${mainBookingId}/progress`)
      .set(auth(customerA.token));
    expect(progressInProgress.status).toBe(200);
    expect(progressInProgress.body.progress).toBe('ACQUISITION_IN_PROGRESS');

    const crossCustomerProgress = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${mainBookingId}/progress`)
      .set(auth(customerB.token));
    expect(crossCustomerProgress.status).toBe(403);

    const completeMain = await request(app.getHttpServer())
      .post(`/api/v1/radiology/studies/${studyId}/complete`)
      .set(auth(techA.token))
      .send({
        imaging_org_id: imagingA.id,
        equipment_code: 'XR-UNIT-1',
        modality_code: 'XR',
      });
    expect(completeMain.status).toBeLessThan(300);
    expect(completeMain.body.status).toBe('ACQUIRED');
    expect(completeMain.body.acquisition.sandbox_object_ref).toMatch(/^(sandbox|private):\/\//);
    expect(JSON.stringify(completeMain.body)).not.toMatch(/diagnosis|findings/i);

    const progressAcquired = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${mainBookingId}/progress`)
      .set(auth(customerA.token));
    expect(progressAcquired.status).toBe(200);
    expect(progressAcquired.body.progress).toBe('INTERPRETATION_IN_PROGRESS');
    expect(progressAcquired.body.boundary.acquisition).toBe(true);
    expect(progressAcquired.body.boundary.interpretation).toBe(true);
    expect(progressAcquired.body.boundary.report).toBe(false);
    expect(JSON.stringify(progressAcquired.body)).not.toMatch(/diagnosis|findings/i);

    const { bookingId: failBookingId } = await bookAndConfirm({
      customerToken: customerB.token,
      offerId: offer.body.id,
      imagingOrgId: imagingA.id,
      imagingLocationId: locA.id,
      suffix: `fail-${suffix}`,
      slotOffsetMs: 259200000,
    });
    const checkInFail = await request(app.getHttpServer())
      .post('/api/v1/radiology/check-in')
      .set(auth(imagingUser.token))
      .send({
        imaging_org_id: imagingA.id,
        imaging_booking_id: failBookingId,
        assignee_person_id: techA.personId,
      });
    expect(checkInFail.status).toBeLessThan(300);
    const failStudyId = checkInFail.body.id as string;

    await request(app.getHttpServer())
      .post(`/api/v1/radiology/studies/${failStudyId}/start?imaging_org_id=${imagingA.id}`)
      .set(auth(techA.token))
      .set('Idempotency-Key', `r8c-start-fail-${suffix}`);

    const failAcquisition = await request(app.getHttpServer())
      .post(`/api/v1/radiology/studies/${failStudyId}/fail`)
      .set(auth(techA.token))
      .send({
        imaging_org_id: imagingA.id,
        failure_code: 'PATIENT_MOTION',
      });
    expect(failAcquisition.status).toBeLessThan(300);
    expect(failAcquisition.body.status).toBe('ACQUISITION_FAILED');
    expect(failAcquisition.body.acquisition.failure_code).toBe('PATIENT_MOTION');

    const progressFail = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${failBookingId}/progress`)
      .set(auth(customerB.token));
    expect(progressFail.status).toBe(200);
    expect(progressFail.body.progress).toBe('ACQUISITION_EXCEPTION');

    const cancelledBook = await request(app.getHttpServer())
      .post('/api/v1/me/imaging/bookings')
      .set(auth(customerB.token))
      .set('Idempotency-Key', `r8c-cancel-book-${suffix}`)
      .send({
        offer_id: offer.body.id,
        imaging_org_id: imagingA.id,
        imaging_location_id: locA.id,
        country: 'XX',
        prep_acknowledged: true,
        slot_starts_at: new Date(Date.now() + 345600000).toISOString(),
        slot_ends_at: new Date(Date.now() + 345600000 + 3600000).toISOString(),
      });
    expect(cancelledBook.status).toBe(201);

    const cancelBooking = await request(app.getHttpServer())
      .post(`/api/v1/me/imaging/bookings/${cancelledBook.body.id}/cancel`)
      .set(auth(customerB.token))
      .send({ reason_code: 'customer_changed_mind' });
    expect(cancelBooking.status).toBeLessThan(300);
    expect(cancelBooking.body.status).toBe('CANCELLED');

    const checkInCancelled = await request(app.getHttpServer())
      .post('/api/v1/radiology/check-in')
      .set(auth(imagingUser.token))
      .send({
        imaging_org_id: imagingA.id,
        imaging_booking_id: cancelledBook.body.id,
        assignee_person_id: techA.personId,
      });
    expect(checkInCancelled.status).toBe(409);

    const payConfirmed = await request(app.getHttpServer())
      .post(`/api/v1/me/imaging/bookings/${mainBookingId}/pay`)
      .set(auth(customerA.token))
      .set('Idempotency-Key', `r8c-pay-confirmed-${suffix}`)
      .send({ scenario: 'success' });
    expect(payConfirmed.status).toBe(409);

    const staffList = await request(app.getHttpServer())
      .get(`/api/v1/radiology/studies?imaging_org_id=${imagingA.id}`)
      .set(auth(imagingUser.token));
    expect(staffList.status).toBe(200);
    expect(staffList.body.data.some((row: { id: string }) => row.id === studyId)).toBe(true);
    expect(JSON.stringify(staffList.body)).not.toMatch(/diagnosis|findings/i);

    const orders = await prisma.order.count({ where: { paymentIntentId: payIntentId } });
    expect(orders).toBe(0);
  });
});
