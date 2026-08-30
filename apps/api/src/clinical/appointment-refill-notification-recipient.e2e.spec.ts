import { INestApplication } from '@nestjs/common';
import {
  ClinicalRelationshipKind,
  ClinicalRelationshipStatus,
  ConsentGrantStatus,
  DispensingCaseStatus,
  PartnerStatus,
  PolicyPackStatus,
  PrescriptionStatus,
  RefillRequestStatus,
} from '@prisma/client';
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

async function signIn(
  app: INestApplication,
  email: string,
  audience: 'admin' | 'customer' | 'doctor' = 'customer',
) {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

function nextMorningUtc() {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 1);
  start.setUTCHours(9, 0, 0, 0);
  return start;
}

describe('CR-319 appointment/refill notification recipient parity (e2e)', () => {
  jest.setTimeout(120_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let eventWorker: EventWorkerService;

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

  async function seedAppointmentCountry(countryCode: string, suffix: string) {
    const doc = emptyPolicyDocument();
    doc.partner_types.DOCTOR.enabled = true;
    doc.healthcare.doctor_onboarding_enabled = true;
    doc.healthcare.consultation_capability = true;
    doc.healthcare.appointments_enabled = true;

    let country = await prisma.country.findUnique({ where: { isoAlpha2: countryCode } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: countryCode,
          isoAlpha3: `${countryCode}X`,
          nameI18n: { en: `CR319 ${countryCode}` },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
          dataResidencyMode: 'shared',
        },
      });
    }
    await prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        version: Math.floor(Date.now() % 1_000_000),
        status: PolicyPackStatus.PUBLISHED,
        document: doc as never,
        checksum: `cr319-apt-${suffix}`,
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
    return country.id;
  }

  it('notifies patient (not doctor) when doctor confirms an appointment', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const countryId = await seedAppointmentCountry('A9', suffix);
    const doctor = await signIn(app, `cr319-doc-${suffix}@example.com`, 'doctor');
    const customer = await signIn(app, `cr319-pat-${suffix}@example.com`, 'customer');
    const otherPatient = await signIn(app, `cr319-other-${suffix}@example.com`, 'customer');

    await request(app.getHttpServer())
      .post('/api/v1/doctor/applications')
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ country_code: 'A9' });
    const partner = await prisma.partner.findFirstOrThrow({
      where: { personId: doctor.personId, partnerTypeCode: 'DOCTOR' },
    });
    await prisma.partner.update({ where: { id: partner.id }, data: { status: PartnerStatus.ACTIVE } });
    const profile = await prisma.doctorProfile.findUniqueOrThrow({ where: { partnerId: partner.id } });

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
        country_code: 'A9',
        starts_at: start.toISOString(),
        type: 'IN_PERSON',
      });
    expect(booked.status).toBe(200);
    const appointmentId = booked.body.id as string;

    const confirmed = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/confirm`)
      .set('Authorization', `Bearer ${doctor.token}`);
    expect(confirmed.status).toBe(200);

    const confirmEvent = await prisma.outboxEvent.findFirst({
      where: { aggregateId: appointmentId, type: 'APPOINTMENT_CONFIRMED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(confirmEvent?.payload).toMatchObject({
      customer_person_id: customer.personId,
      actor_person_id: doctor.personId,
    });
    expect(confirmEvent?.actorId).toBeNull();

    await eventWorker.handle(confirmEvent!.id);
    await eventWorker.handle(confirmEvent!.id);

    const patientTitles = await inboxTitles(customer.token);
    expect(patientTitles.filter((title: string) => title === 'Appointment confirmed').length).toBe(1);
    expect(await inboxTitles(doctor.token)).not.toContain('Appointment confirmed');
    expect(await inboxTitles(otherPatient.token)).not.toContain('Appointment confirmed');

    const encounterEvent = await prisma.outboxEvent.findFirst({
      where: { type: 'ENCOUNTER_STARTED', aggregateId: appointmentId },
    });
    expect(encounterEvent).toBeNull();
    expect(countryId).toBeDefined();
  });

  it('notifies patient when doctor rejects a refill request', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const countryCode = 'R9';
    const doc = emptyPolicyDocument();
    doc.partner_types.DOCTOR.enabled = true;
    doc.healthcare.rx_refill_enabled = true;
    doc.healthcare.rx_dispense_enabled = true;
    doc.healthcare.rx_refill_require_doctor_reauth = true;

    let country = await prisma.country.findUnique({ where: { isoAlpha2: countryCode } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: countryCode,
          isoAlpha3: 'R99',
          nameI18n: { en: 'CR319 refill' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
          dataResidencyMode: 'shared',
        },
      });
    }
    await prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        version: Math.floor(Date.now() % 1_000_000),
        status: PolicyPackStatus.PUBLISHED,
        document: doc as never,
        checksum: `cr319-refill-${suffix}`,
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
    await app.get(PolicyCache).invalidate(countryCode);

    const doctor = await signIn(app, `cr319-rdoc-${suffix}@example.com`, 'doctor');
    const customer = await signIn(app, `cr319-rcust-${suffix}@example.com`, 'customer');
    const otherPatient = await signIn(app, `cr319-rother-${suffix}@example.com`, 'customer');

    const partner = await prisma.partner.create({
      data: {
        id: uuidv7(),
        personId: doctor.personId,
        countryId: country.id,
        partnerTypeCode: 'DOCTOR',
        status: PartnerStatus.ACTIVE,
        activatedAt: new Date(),
      },
    });
    const profile = await prisma.doctorProfile.create({
      data: {
        id: uuidv7(),
        partnerId: partner.id,
        personId: doctor.personId,
        countryId: country.id,
        displayName: 'CR319 Doc',
        professionalName: 'Dr CR319',
      },
    });
    await prisma.clinicalRelationship.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        patientPersonId: customer.personId,
        doctorPartnerId: partner.id,
        kind: ClinicalRelationshipKind.CARE,
        status: ClinicalRelationshipStatus.ACTIVE,
      },
    });
    await prisma.consentGrant.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        subjectPersonId: customer.personId,
        recipientPartnerId: partner.id,
        purpose: 'consultation',
        scope: {},
        status: ConsentGrantStatus.ACTIVE,
        grantedAt: new Date(),
        grantedByPersonId: customer.personId,
      },
    });

    const startsAt = new Date();
    const appointment = await prisma.appointment.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        customerPersonId: customer.personId,
        doctorProfileId: profile.id,
        doctorPartnerId: partner.id,
        type: 'ONLINE',
        status: 'CHECKED_IN',
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        timezone: 'UTC',
      },
    });
    const encounter = await prisma.encounter.create({
      data: {
        id: uuidv7(),
        appointmentId: appointment.id,
        countryId: country.id,
        customerPersonId: customer.personId,
        doctorProfileId: profile.id,
        doctorPartnerId: partner.id,
        status: 'STARTED',
        startedAt: new Date(),
      },
    });

    const rxId = uuidv7();
    const versionId = uuidv7();
    await prisma.prescription.create({
      data: {
        id: rxId,
        countryId: country.id,
        patientPersonId: customer.personId,
        doctorPartnerId: partner.id,
        doctorProfileId: profile.id,
        encounterId: encounter.id,
        createdByPersonId: doctor.personId,
        status: PrescriptionStatus.ISSUED,
      },
    });
    await prisma.prescriptionVersion.create({
      data: {
        id: versionId,
        prescriptionId: rxId,
        versionNumber: 1,
        sealedAt: new Date(),
        validFrom: new Date(Date.now() - 60_000),
        validUntil: new Date(Date.now() + 365 * 24 * 60 * 60_000),
        createdByPersonId: doctor.personId,
      },
    });
    await prisma.prescription.update({
      where: { id: rxId },
      data: { currentVersionId: versionId },
    });
    await prisma.dispensingCase.create({
      data: {
        id: uuidv7(),
        prescriptionId: rxId,
        prescriptionVersionId: versionId,
        countryId: country.id,
        status: DispensingCaseStatus.DISPENSED,
      },
    });

    const refillId = uuidv7();
    await prisma.refillRequest.create({
      data: {
        id: refillId,
        prescriptionId: rxId,
        prescriptionVersionId: versionId,
        customerPersonId: customer.personId,
        countryId: country.id,
        status: RefillRequestStatus.PENDING_REAUTH,
        idempotencyKey: `cr319-refill-${suffix}`,
      },
    });

    const rejected = await request(app.getHttpServer())
      .post(`/api/v1/doctor/refill-requests/${refillId}/reject`)
      .set('Authorization', `Bearer ${doctor.token}`)
      .set('Idempotency-Key', `cr319-reject-${suffix}`)
      .send({ reason_code: 'not_appropriate' });
    expect(rejected.status).toBeLessThan(300);

    const rejectEvent = await prisma.outboxEvent.findFirst({
      where: { aggregateId: refillId, type: 'REFILL_REJECTED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(rejectEvent?.payload).toMatchObject({
      customer_person_id: customer.personId,
      actor_person_id: doctor.personId,
    });
    expect(rejectEvent?.actorId).toBeNull();

    await eventWorker.handle(rejectEvent!.id);
    await eventWorker.handle(rejectEvent!.id);

    const patientTitles = await inboxTitles(customer.token);
    expect(patientTitles.filter((title: string) => title === 'Refill not authorized').length).toBe(1);
    expect(await inboxTitles(doctor.token)).not.toContain('Refill not authorized');
    expect(await inboxTitles(otherPatient.token)).not.toContain('Refill not authorized');
  });
});
