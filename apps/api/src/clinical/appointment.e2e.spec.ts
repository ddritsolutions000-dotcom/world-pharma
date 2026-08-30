import { INestApplication } from '@nestjs/common';
import { AppointmentStatus, PartnerStatus, PolicyPackStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { emptyPolicyDocument } from '../policy/empty-pack';
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

describe('P2-HC-2 appointment / encounter foundation (e2e)', () => {
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
    doc.healthcare.consultation_capability = true;
    doc.healthcare.appointments_enabled = true;
    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'AQ' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'AQ',
          isoAlpha3: 'AQQ',
          nameI18n: { en: 'Appointment test' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
          dataResidencyMode: 'shared',
        },
      });
      const pack = await prisma.policyPack.create({
        data: {
          id: uuidv7(),
          countryId: country.id,
          version: 1,
          status: PolicyPackStatus.PUBLISHED,
          document: doc as never,
          checksum: 'appointment-test',
          publishedAt: new Date(),
        },
      });
      await prisma.country.update({
        where: { id: country.id },
        data: { publishedPolicyPackId: pack.id },
      });
    } else {
      await prisma.policyPack.updateMany({
        where: { countryId: country.id, status: PolicyPackStatus.PUBLISHED },
        data: { document: doc as never },
      });
    }
    countryId = country.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('covers booking, isolation, conflicts, reschedule, encounter, consent, RLS, and events', async () => {
    const doctorA = await signIn(app, `apt-da-${Date.now()}@example.com`, 'doctor');
    const doctorB = await signIn(app, `apt-db-${Date.now()}@example.com`, 'doctor');
    const customer = await signIn(app, `apt-c-${Date.now()}@example.com`, 'customer');
    const vendor = await signIn(app, `apt-v-${Date.now()}@example.com`, 'customer');
    const adminEmail = `apt-adm-${Date.now()}@example.com`;
    const adminSeed = await signIn(app, adminEmail, 'customer');
    const role = await prisma.role.findUnique({ where: { code: 'super_admin' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: adminSeed.personId,
        roleId: role!.id,
        scope: 'platform',
        status: 'ACTIVE',
      },
    });
    const admin = await signIn(app, adminEmail, 'admin');

    const xx = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ doctor_profile_id: uuidv7(), country_code: 'XX', starts_at: nextMorningUtc().toISOString() });
    expect(xx.status).toBeGreaterThanOrEqual(400);

    await request(app.getHttpServer())
      .post('/api/v1/doctor/applications')
      .set('Authorization', `Bearer ${doctorA.token}`)
      .send({ country_code: 'AQ' });
    await request(app.getHttpServer())
      .post('/api/v1/doctor/applications')
      .set('Authorization', `Bearer ${doctorB.token}`)
      .send({ country_code: 'AQ' });

    const partnerA = await prisma.partner.findFirst({
      where: { personId: doctorA.personId, partnerTypeCode: 'DOCTOR' },
    });
    const partnerB = await prisma.partner.findFirst({
      where: { personId: doctorB.personId, partnerTypeCode: 'DOCTOR' },
    });
    await prisma.partner.update({ where: { id: partnerA!.id }, data: { status: PartnerStatus.ACTIVE } });
    await prisma.partner.update({ where: { id: partnerB!.id }, data: { status: PartnerStatus.ACTIVE } });
    const profileA = await prisma.doctorProfile.findUnique({ where: { partnerId: partnerA!.id } });
    const profileB = await prisma.doctorProfile.findUnique({ where: { partnerId: partnerB!.id } });

    const windows = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      start_local: '09:00',
      end_local: '17:00',
      slot_minutes: 30,
      buffer_minutes: 0,
    }));
    const availA = await request(app.getHttpServer())
      .put('/api/v1/doctor/me/availability/windows')
      .set('Authorization', `Bearer ${doctorA.token}`)
      .send({ timezone: 'UTC', windows });
    expect(availA.status).toBe(200);
    await request(app.getHttpServer())
      .put('/api/v1/doctor/me/availability/windows')
      .set('Authorization', `Bearer ${doctorB.token}`)
      .send({ timezone: 'UTC', windows });

    const inactive = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        doctor_profile_id: profileB!.id,
        country_code: 'AQ',
        starts_at: nextMorningUtc().toISOString(),
      });
    await prisma.partner.update({ where: { id: partnerB!.id }, data: { status: PartnerStatus.SUSPENDED } });
    const suspended = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        doctor_profile_id: profileB!.id,
        country_code: 'AQ',
        starts_at: nextMorningUtc().toISOString(),
      });
    expect(suspended.status).toBeGreaterThanOrEqual(400);

    const start = nextMorningUtc();
    const booked = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        doctor_profile_id: profileA!.id,
        country_code: 'AQ',
        starts_at: start.toISOString(),
        type: 'IN_PERSON',
        reason_category: 'follow_up',
      });
    expect(booked.status).toBe(200);
    expect(booked.body.status).toBe(AppointmentStatus.REQUESTED);
    const appointmentId = booked.body.id as string;

    const invalidSlot = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        doctor_profile_id: profileA!.id,
        country_code: 'AQ',
        starts_at: new Date(start.getTime() + 5 * 60_000).toISOString(),
      });
    expect(invalidSlot.status).toBeGreaterThanOrEqual(400);

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({
          doctor_profile_id: profileA!.id,
          country_code: 'AQ',
          starts_at: start.toISOString(),
        }),
      request(app.getHttpServer())
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({
          doctor_profile_id: profileA!.id,
          country_code: 'AQ',
          starts_at: start.toISOString(),
        }),
    ]);
    const conflictStatuses = [first.status, second.status];
    expect(conflictStatuses.some((status) => status >= 400)).toBe(true);

    const doctorListA = await request(app.getHttpServer())
      .get('/api/v1/doctor/appointments')
      .set('Authorization', `Bearer ${doctorA.token}`);
    expect(doctorListA.status).toBe(200);
    expect(doctorListA.body.appointments.some((row: { id: string }) => row.id === appointmentId)).toBe(true);

    const doctorListB = await request(app.getHttpServer())
      .get('/api/v1/doctor/appointments')
      .set('Authorization', `Bearer ${doctorB.token}`);
    expect(doctorListB.body.appointments.some((row: { id: string }) => row.id === appointmentId)).toBe(false);

    const other = await request(app.getHttpServer())
      .get(`/api/v1/doctor/appointments/${appointmentId}`)
      .set('Authorization', `Bearer ${doctorB.token}`);
    expect(other.status).toBeGreaterThanOrEqual(400);

    const customerList = await request(app.getHttpServer())
      .get('/api/v1/appointments')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(customerList.body.appointments.some((row: { id: string }) => row.id === appointmentId)).toBe(true);

    const vendorList = await request(app.getHttpServer())
      .get('/api/v1/appointments')
      .set('Authorization', `Bearer ${vendor.token}`);
    expect(vendorList.body.appointments?.some((row: { id: string }) => row.id === appointmentId) ?? false).toBe(false);

    const vendorAdmin = await request(app.getHttpServer())
      .get('/api/v1/admin/appointments')
      .set('Authorization', `Bearer ${vendor.token}`);
    expect(vendorAdmin.status).toBeGreaterThanOrEqual(400);

    const adminList = await request(app.getHttpServer())
      .get('/api/v1/admin/appointments')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(adminList.status).toBe(200);

    const confirmed = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/confirm`)
      .set('Authorization', `Bearer ${doctorA.token}`);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe(AppointmentStatus.CONFIRMED);

    const later = new Date(start.getTime() + 60 * 60_000);
    const rescheduled = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appointmentId}/reschedule`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ starts_at: later.toISOString() });
    expect(rescheduled.status).toBe(200);
    expect(rescheduled.body.status).toBe(AppointmentStatus.RESCHEDULED);
    expect(new Date(rescheduled.body.starts_at).getTime()).toBe(later.getTime());

    const oldSlot = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        doctor_profile_id: profileA!.id,
        country_code: 'AQ',
        starts_at: start.toISOString(),
      });
    expect(oldSlot.status).toBe(200);

    await request(app.getHttpServer())
      .post(`/api/v1/consent/grants`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ recipient_partner_id: partnerA!.id, purpose: 'consultation' });

    const checkedIn = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/check-in`)
      .set('Authorization', `Bearer ${doctorA.token}`);
    expect(checkedIn.status).toBe(200);
    expect(checkedIn.body.encounter).toBeTruthy();

    const started = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/start`)
      .set('Authorization', `Bearer ${doctorA.token}`);
    expect(started.status).toBe(200);
    expect(started.body.status).toBe(AppointmentStatus.IN_CONSULTATION);

    const completed = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/complete`)
      .set('Authorization', `Bearer ${doctorA.token}`);
    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe(AppointmentStatus.COMPLETED);

    const cancelled = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${oldSlot.body.id}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ reason_code: 'changed_mind' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe(AppointmentStatus.CANCELLED);

    const rls = await prisma.$queryRaw<{ relrowsecurity: boolean }[]>`
      SELECT relrowsecurity FROM pg_class WHERE relname = 'appointments'
    `;
    expect(rls[0]?.relrowsecurity).toBe(true);

    const events = await prisma.outboxEvent.findMany({
      where: { type: { in: ['APPOINTMENT_CREATED', 'APPOINTMENT_RESCHEDULED', 'ENCOUNTER_STARTED'] } },
      take: 20,
    });
    expect(events.length).toBeGreaterThan(0);
    expect(JSON.stringify(events)).not.toMatch(/clinical_note|prescription|lab_result/i);
    expect(countryId).toBeDefined();
    expect(profileB).toBeDefined();
  });
});
