import { INestApplication } from '@nestjs/common';
import { AppointmentStatus, PartnerStatus, PolicyPackStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { EventWorkerService } from '../events/worker.service';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { PolicyCache } from '../policy/cache';
import { applyTestIsolation } from '../test/isolate-runtime';

async function signIn(app: INestApplication, email: string, audience: 'customer' | 'doctor' = 'customer') {
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

function nextMorningUtc() {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 1);
  start.setUTCHours(9, 0, 0, 0);
  return start;
}

describe('Doctor consultation operations completion (e2e)', () => {
  jest.setTimeout(180_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let eventWorker: EventWorkerService;
  let countryId: string;
  const countryCode = 'D3';

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
    eventWorker = app.get(EventWorkerService);

    const doc = emptyPolicyDocument();
    doc.partner_types.DOCTOR.enabled = true;
    doc.healthcare.doctor_onboarding_enabled = true;
    doc.healthcare.doctor_public_visibility = true;
    doc.healthcare.consultation_capability = true;
    doc.healthcare.appointments_enabled = true;
    doc.healthcare.telemedicine_eligibility = true;
    doc.healthcare.rx_prescribe_enabled = true;
    doc.healthcare.rx_amend_enabled = true;
    doc.healthcare.health_timeline_enabled = true;
    doc.healthcare.rx_allowed_restriction_codes = ['PACK_ALLOWED'];

    let country = await prisma.country.findUnique({ where: { isoAlpha2: countryCode } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: countryCode,
          isoAlpha3: 'D3X',
          nameI18n: { en: 'Doctor ops completion test' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
        },
      });
    }
    const pack = await prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        version: Math.floor(Date.now() % 1_000_000),
        status: PolicyPackStatus.PUBLISHED,
        document: doc as never,
        checksum: `d3-ops-${Date.now()}`,
        publishedAt: new Date(),
      },
    });
    await prisma.country.update({
      where: { id: country.id },
      data: { publishedPolicyPackId: pack.id },
    });
    await app.get(PolicyCache).invalidate(countryCode);
    countryId = country.id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function inboxTitles(token: string) {
    const res = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const rows = res.body.data ?? res.body;
    return rows.map((row: { title: string }) => row.title as string);
  }

  async function processLatestOutbox(appointmentId: string, type: string) {
    const event = await prisma.outboxEvent.findFirst({
      where: { aggregateId: appointmentId, type },
      orderBy: { createdAt: 'desc' },
    });
    expect(event).toBeTruthy();
    await eventWorker.handle(event!.id);
    return event;
  }

  it('runs booking → consultation → prescription → earnings with authorization boundaries', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const customer = await signIn(app, `d3-cus-${suffix}@example.com`);
    const doctor = await signIn(app, `d3-doc-${suffix}@example.com`, 'doctor');
    const otherDoctor = await signIn(app, `d3-other-${suffix}@example.com`, 'doctor');
    const otherCustomer = await signIn(app, `d3-other-cus-${suffix}@example.com`);

    await request(app.getHttpServer())
      .post('/api/v1/doctor/applications')
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ country_code: countryCode });
    await request(app.getHttpServer())
      .post('/api/v1/doctor/applications')
      .set('Authorization', `Bearer ${otherDoctor.token}`)
      .send({ country_code: countryCode });

    const partner = await prisma.partner.findFirstOrThrow({
      where: { personId: doctor.personId, partnerTypeCode: 'DOCTOR', countryId },
    });
    const otherPartner = await prisma.partner.findFirstOrThrow({
      where: { personId: otherDoctor.personId, partnerTypeCode: 'DOCTOR', countryId },
    });
    await prisma.partner.updateMany({
      where: { id: { in: [partner.id, otherPartner.id] } },
      data: { status: PartnerStatus.ACTIVE, activatedAt: new Date() },
    });
    const profile = await prisma.doctorProfile.findUniqueOrThrow({ where: { partnerId: partner.id } });
    await prisma.doctorProfile.update({
      where: { id: profile.id },
      data: {
        consultationConfig: {
          fee_minor: '5000',
          currency: 'XXX',
          platform_fee_bps: 1000,
        },
      },
    });

    const windows = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      start_local: '09:00',
      end_local: '17:00',
      slot_minutes: 30,
      buffer_minutes: 0,
    }));
    await request(app.getHttpServer())
      .put('/api/v1/doctor/me/availability/windows')
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ timezone: 'UTC', windows });

    const start = nextMorningUtc();
    const booked = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        doctor_profile_id: profile.id,
        country_code: countryCode,
        starts_at: start.toISOString(),
        type: 'ONLINE',
      });
    expect(booked.status).toBe(200);
    expect(booked.body.status).toBe(AppointmentStatus.REQUESTED);
    const appointmentId = booked.body.id as string;

    const createdEvent = await prisma.outboxEvent.findFirst({
      where: { aggregateId: appointmentId, type: 'APPOINTMENT_CREATED' },
    });
    expect(createdEvent?.payload).toMatchObject({
      doctor_person_id: doctor.personId,
      customer_person_id: customer.personId,
    });
    await eventWorker.handle(createdEvent!.id);
    expect(await inboxTitles(doctor.token)).toContain('Appointment requested');

    const doctorList = await request(app.getHttpServer())
      .get('/api/v1/doctor/appointments')
      .set('Authorization', `Bearer ${doctor.token}`);
    expect(doctorList.status).toBe(200);
    expect((doctorList.body.appointments as Array<{ id: string }>).some((row) => row.id === appointmentId)).toBe(true);

    const stealConfirm = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/confirm`)
      .set('Authorization', `Bearer ${otherDoctor.token}`);
    expect(stealConfirm.status).toBeGreaterThanOrEqual(400);

    const confirmed = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/confirm`)
      .set('Authorization', `Bearer ${doctor.token}`);
    expect(confirmed.status).toBe(200);
    await processLatestOutbox(appointmentId, 'APPOINTMENT_CONFIRMED');
    expect(await inboxTitles(customer.token)).toContain('Appointment confirmed');

    await request(app.getHttpServer())
      .post('/api/v1/consent/grants')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ recipient_partner_id: partner.id, purpose: 'consultation' });

    const checkedIn = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/check-in`)
      .set('Authorization', `Bearer ${doctor.token}`);
    expect(checkedIn.status).toBe(200);

    const started = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/start`)
      .set('Authorization', `Bearer ${doctor.token}`);
    expect(started.status).toBe(200);
    expect(started.body.status).toBe(AppointmentStatus.IN_CONSULTATION);

    const encounterId = started.body.encounter.id as string;

    const rxDraft = await request(app.getHttpServer())
      .post('/api/v1/doctor/prescriptions')
      .set('Authorization', `Bearer ${doctor.token}`)
      .set('Idempotency-Key', `d3-rx-${suffix}`)
      .send({
        encounter_id: encounterId,
        lines: [
          {
            clinical_concept_code: 'MED-D3-001',
            clinical_concept_label: 'Sandbox medicine',
            dosage_instructions: 'Once daily',
            quantity_authorized: '10',
          },
        ],
      });
    expect(rxDraft.status).toBe(200);
    const rxId = rxDraft.body.id as string;

    const issued = await request(app.getHttpServer())
      .post(`/api/v1/doctor/prescriptions/${rxId}/issue`)
      .set('Authorization', `Bearer ${doctor.token}`)
      .set('Idempotency-Key', `d3-issue-${suffix}`);
    expect(issued.status).toBe(200);

    const completed = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/complete`)
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ patient_summary: 'Sandbox consult completed with documented clinical summary.' });
    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe(AppointmentStatus.COMPLETED);

    const note = await prisma.encounterConsultNote.findUnique({ where: { encounterId } });
    expect(note?.patientSummary).toMatch(/documented clinical summary/i);

    await processLatestOutbox(appointmentId, 'ENCOUNTER_COMPLETED');
    expect(await inboxTitles(customer.token)).toContain('Consultation completed');

    const customerRx = await request(app.getHttpServer())
      .get(`/api/v1/customer/prescriptions/${rxId}`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(customerRx.status).toBe(200);
    expect(customerRx.body.status).toBe('ISSUED');

    const timeline = await request(app.getHttpServer())
      .get(`/api/v1/health/timeline?country_code=${countryCode}`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(timeline.status).toBe(200);
    expect(JSON.stringify(timeline.body)).toMatch(/Consultation summary|consult/i);

    const earnings = await request(app.getHttpServer())
      .get('/api/v1/doctor/earnings/summary')
      .set('Authorization', `Bearer ${doctor.token}`);
    expect(earnings.status).toBe(200);
    expect(earnings.body.sandbox).toBe(true);
    expect(earnings.body.live_payout).toBe(false);
    expect(earnings.body.completed_consult_count).toBeGreaterThanOrEqual(1);
    expect(earnings.body.doctor_payable_minor).toBe('4500');
    expect(earnings.body.settlement_status).toBe('SANDBOX_NOT_SETTLED');

    const earningsMutate = await request(app.getHttpServer())
      .post('/api/v1/doctor/earnings/summary')
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ doctor_payable_minor: '999999' });
    expect(earningsMutate.status).toBeGreaterThanOrEqual(404);

    const otherDoctorEarnings = await request(app.getHttpServer())
      .get('/api/v1/doctor/earnings/summary')
      .set('Authorization', `Bearer ${otherDoctor.token}`);
    expect(otherDoctorEarnings.status).toBe(200);
    expect(otherDoctorEarnings.body.completed_consult_count).toBe(0);

    const customerStealComplete = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/complete`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ patient_summary: 'Customer must not complete.' });
    expect(customerStealComplete.status).toBeGreaterThanOrEqual(400);

    const duplicateComplete = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/complete`)
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ patient_summary: 'Duplicate completion attempt.' });
    expect(duplicateComplete.status).toBe(200);
    expect(duplicateComplete.body.status).toBe(AppointmentStatus.COMPLETED);

    const customerOtherRx = await request(app.getHttpServer())
      .get(`/api/v1/customer/prescriptions/${rxId}`)
      .set('Authorization', `Bearer ${otherCustomer.token}`);
    expect(customerOtherRx.status).toBeGreaterThanOrEqual(400);

    const cancelBooked = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        doctor_profile_id: profile.id,
        country_code: countryCode,
        starts_at: new Date(start.getTime() + 3_600_000).toISOString(),
        type: 'IN_PERSON',
      });
    expect(cancelBooked.status).toBe(200);
    const cancelId = cancelBooked.body.id as string;

    const cancelled = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${cancelId}/cancel`)
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ reason_code: 'doctor_cancelled' });
    expect(cancelled.status).toBe(200);
    await processLatestOutbox(cancelId, 'APPOINTMENT_CANCELLED');
    expect(await inboxTitles(customer.token)).toContain('Appointment cancelled');

    const completeCancelled = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${cancelId}/complete`)
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ patient_summary: 'Should not complete cancelled appointment.' });
    expect(completeCancelled.status).toBe(409);

    const duplicateCancel = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${cancelId}/cancel`)
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ reason_code: 'doctor_cancelled' });
    expect(duplicateCancel.status).toBe(200);
    expect(duplicateCancel.body.status).toBe(AppointmentStatus.CANCELLED);
  });
});
