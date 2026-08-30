import { INestApplication } from '@nestjs/common';
import { PartnerStatus, PolicyPackStatus, VideoSessionStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { EventWorkerService } from '../events/worker.service';
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

describe('CR-320 video session notification recipient parity (e2e)', () => {
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

    const doc = emptyPolicyDocument();
    doc.partner_types.DOCTOR.enabled = true;
    doc.healthcare.doctor_onboarding_enabled = true;
    doc.healthcare.consultation_capability = true;
    doc.healthcare.appointments_enabled = true;
    doc.healthcare.telemedicine_eligibility = true;
    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'V9' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'V9',
          isoAlpha3: 'V99',
          nameI18n: { en: 'CR-320 video test' },
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
          checksum: 'cr320-video',
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

  it('notifies patient (not doctor) when doctor joins and starts the video session', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const doctor = await signIn(app, `cr320-doc-${suffix}@example.com`, 'doctor');
    const customer = await signIn(app, `cr320-cust-${suffix}@example.com`, 'customer');
    const otherPatient = await signIn(app, `cr320-other-${suffix}@example.com`, 'customer');

    await request(app.getHttpServer())
      .post('/api/v1/doctor/applications')
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ country_code: 'V9' });
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
        country_code: 'V9',
        starts_at: start.toISOString(),
        type: 'ONLINE',
      });
    expect(booked.status).toBe(200);
    const appointmentId = booked.body.id as string;

    await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/confirm`)
      .set('Authorization', `Bearer ${doctor.token}`);
    await request(app.getHttpServer())
      .post('/api/v1/consent/grants')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ recipient_partner_id: partner.id, purpose: 'consultation' });

    const customerJoin = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appointmentId}/video/join`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(customerJoin.status).toBe(200);

    const readyEvent = await prisma.outboxEvent.findFirst({
      where: { type: 'VIDEO_SESSION_READY', aggregateId: customerJoin.body.session_id },
      orderBy: { createdAt: 'desc' },
    });
    expect(readyEvent?.payload).toMatchObject({ customer_person_id: customer.personId });
    expect(readyEvent?.actorId).toBeNull();

    const doctorJoin = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/video/join`)
      .set('Authorization', `Bearer ${doctor.token}`);
    expect(doctorJoin.status).toBe(200);
    expect(doctorJoin.body.status).toBe(VideoSessionStatus.IN_PROGRESS);

    const joinedEvent = await prisma.outboxEvent.findFirst({
      where: {
        type: 'VIDEO_PARTICIPANT_JOINED',
        aggregateId: doctorJoin.body.session_id,
        payload: { path: ['actor_person_id'], equals: doctor.personId },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(joinedEvent?.payload).toMatchObject({
      customer_person_id: customer.personId,
      actor_person_id: doctor.personId,
      role: 'DOCTOR',
    });
    expect(joinedEvent?.actorId).toBeNull();

    const startedEvent = await prisma.outboxEvent.findFirst({
      where: { type: 'VIDEO_SESSION_STARTED', aggregateId: doctorJoin.body.session_id },
      orderBy: { createdAt: 'desc' },
    });
    expect(startedEvent?.payload).toMatchObject({
      customer_person_id: customer.personId,
      actor_person_id: doctor.personId,
    });
    expect(startedEvent?.actorId).toBeNull();

    await eventWorker.handle(joinedEvent!.id);
    await eventWorker.handle(joinedEvent!.id);
    await eventWorker.handle(startedEvent!.id);
    await eventWorker.handle(startedEvent!.id);

    const patientTitles = await inboxTitles(customer.token);
    expect(patientTitles.filter((title: string) => title === 'Participant joined video').length).toBe(1);
    expect(patientTitles.filter((title: string) => title === 'Video consult started').length).toBe(1);
    expect(await inboxTitles(doctor.token)).not.toContain('Participant joined video');
    expect(await inboxTitles(doctor.token)).not.toContain('Video consult started');
    expect(await inboxTitles(otherPatient.token)).not.toContain('Participant joined video');
    expect(await inboxTitles(otherPatient.token)).not.toContain('Video consult started');

    const createdEvent = await prisma.outboxEvent.findFirst({
      where: { type: 'VIDEO_SESSION_CREATED', aggregateId: doctorJoin.body.session_id },
    });
    expect(createdEvent).toBeTruthy();
    expect(createdEvent?.payload).not.toHaveProperty('customer_person_id');
  });
});
