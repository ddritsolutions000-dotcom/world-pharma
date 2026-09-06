import { INestApplication } from '@nestjs/common';
import { AppointmentStatus, PartnerStatus, PolicyPackStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
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

describe('Doctor consultation lifecycle (e2e)', () => {
  jest.setTimeout(120_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let countryId: string;

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

    const doc = emptyPolicyDocument();
    doc.partner_types.DOCTOR.enabled = true;
    doc.healthcare.doctor_onboarding_enabled = true;
    doc.healthcare.doctor_public_visibility = true;
    doc.healthcare.consultation_capability = true;
    doc.healthcare.appointments_enabled = true;
    doc.healthcare.telemedicine_eligibility = true;
    doc.healthcare.rx_prescribe_enabled = true;
    doc.healthcare.rx_amend_enabled = true;
    doc.healthcare.rx_allowed_restriction_codes = ['PACK_ALLOWED'];

    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'DL' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'DL',
          isoAlpha3: 'DLL',
          nameI18n: { en: 'Doctor lifecycle test' },
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
        checksum: `dc-${Date.now()}`,
        publishedAt: new Date(),
      },
    });
    await prisma.country.update({
      where: { id: country.id },
      data: { publishedPolicyPackId: pack.id },
    });
    await app.get(PolicyCache).invalidate('DL');
    countryId = country.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('blocks cross-doctor access and invalid transitions after booking', async () => {
    const suffix = `${Date.now().toString(36)}`;
    const customer = await signIn(app, `dc-${suffix}-cus@example.com`);
    const doctorA = await signIn(app, `dc-${suffix}-doc-a@example.com`, 'doctor');
    const doctorB = await signIn(app, `dc-${suffix}-doc-b@example.com`, 'doctor');

    await request(app.getHttpServer())
      .post('/api/v1/doctor/applications')
      .set('Authorization', `Bearer ${doctorA.token}`)
      .send({ country_code: 'DL' });
    await request(app.getHttpServer())
      .post('/api/v1/doctor/applications')
      .set('Authorization', `Bearer ${doctorB.token}`)
      .send({ country_code: 'DL' });

    const partnerA = await prisma.partner.findFirst({
      where: { personId: doctorA.personId, partnerTypeCode: 'DOCTOR', countryId },
    });
    const partnerB = await prisma.partner.findFirst({
      where: { personId: doctorB.personId, partnerTypeCode: 'DOCTOR', countryId },
    });
    await prisma.partner.updateMany({
      where: { id: { in: [partnerA!.id, partnerB!.id] } },
      data: { status: PartnerStatus.ACTIVE, activatedAt: new Date() },
    });
    const profileA = await prisma.doctorProfile.findUnique({ where: { partnerId: partnerA!.id } });

    const windows = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      start_local: '09:00',
      end_local: '17:00',
      slot_minutes: 30,
      buffer_minutes: 0,
    }));
    await request(app.getHttpServer())
      .put('/api/v1/doctor/me/availability/windows')
      .set('Authorization', `Bearer ${doctorA.token}`)
      .send({ timezone: 'UTC', windows });

    const start = nextMorningUtc();
    const booked = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        doctor_profile_id: profileA!.id,
        country_code: 'DL',
        starts_at: start.toISOString(),
        type: 'ONLINE',
      });
    expect(booked.status).toBe(200);
    expect(booked.body.status).toBe(AppointmentStatus.REQUESTED);
    const appointmentId = booked.body.id as string;

    const stealConfirm = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/confirm`)
      .set('Authorization', `Bearer ${doctorB.token}`);
    expect(stealConfirm.status).toBeGreaterThanOrEqual(400);

    const checkInBeforeConfirm = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/check-in`)
      .set('Authorization', `Bearer ${doctorA.token}`);
    expect(checkInBeforeConfirm.status).toBe(409);

    const confirmed = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/confirm`)
      .set('Authorization', `Bearer ${doctorA.token}`);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe(AppointmentStatus.CONFIRMED);

    await request(app.getHttpServer())
      .post('/api/v1/consent/grants')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ recipient_partner_id: partnerA!.id, purpose: 'consultation' });

    const checkedIn = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/check-in`)
      .set('Authorization', `Bearer ${doctorA.token}`);
    expect(checkedIn.status).toBe(200);

    const started = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/start`)
      .set('Authorization', `Bearer ${doctorA.token}`);
    expect(started.status).toBe(200);

    const completed = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/complete`)
      .set('Authorization', `Bearer ${doctorA.token}`)
      .send({ patient_summary: 'Sandbox consult completed with documented summary.' });
    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe(AppointmentStatus.COMPLETED);

    const restart = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/start`)
      .set('Authorization', `Bearer ${doctorA.token}`);
    expect(restart.status).toBe(409);
  });
});
