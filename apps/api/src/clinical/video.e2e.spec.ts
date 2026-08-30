import { INestApplication } from '@nestjs/common';
import {
  AppointmentStatus,
  EncounterStatus,
  PartnerStatus,
  PolicyPackStatus,
  VideoSessionStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { redactValue } from '../common/redact';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { applyTestIsolation } from '../test/isolate-runtime';
import { livekitConfig } from './livekit-token';

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

describe('P2-HC-3 teleconsult video foundation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
    doc.healthcare.telemedicine_eligibility = true;
    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'VQ' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'VQ',
          isoAlpha3: 'VQQ',
          nameI18n: { en: 'Video test' },
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
          checksum: 'video-test',
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

  it('covers join auth, tokens, recording-off, reconnect, webhooks, RLS, and denials', async () => {
    const doctorA = await signIn(app, `vid-da-${Date.now()}@example.com`, 'doctor');
    const doctorB = await signIn(app, `vid-db-${Date.now()}@example.com`, 'doctor');
    const customer = await signIn(app, `vid-c-${Date.now()}@example.com`, 'customer');
    const otherCustomer = await signIn(app, `vid-c2-${Date.now()}@example.com`, 'customer');
    const vendor = await signIn(app, `vid-v-${Date.now()}@example.com`, 'customer');
    const adminEmail = `vid-adm-${Date.now()}@example.com`;
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

    await request(app.getHttpServer())
      .post('/api/v1/doctor/applications')
      .set('Authorization', `Bearer ${doctorA.token}`)
      .send({ country_code: 'VQ' });
    await request(app.getHttpServer())
      .post('/api/v1/doctor/applications')
      .set('Authorization', `Bearer ${doctorB.token}`)
      .send({ country_code: 'VQ' });
    const partnerA = await prisma.partner.findFirst({
      where: { personId: doctorA.personId, partnerTypeCode: 'DOCTOR' },
    });
    const partnerB = await prisma.partner.findFirst({
      where: { personId: doctorB.personId, partnerTypeCode: 'DOCTOR' },
    });
    await prisma.partner.update({ where: { id: partnerA!.id }, data: { status: PartnerStatus.ACTIVE } });
    await prisma.partner.update({ where: { id: partnerB!.id }, data: { status: PartnerStatus.ACTIVE } });
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
    await request(app.getHttpServer())
      .put('/api/v1/doctor/me/availability/windows')
      .set('Authorization', `Bearer ${doctorB.token}`)
      .send({ timezone: 'UTC', windows });

    const start = nextMorningUtc();
    const booked = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        doctor_profile_id: profileA!.id,
        country_code: 'VQ',
        starts_at: start.toISOString(),
        type: 'ONLINE',
      });
    expect(booked.status).toBe(200);
    const appointmentId = booked.body.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/confirm`)
      .set('Authorization', `Bearer ${doctorA.token}`);
    const consent = await request(app.getHttpServer())
      .post('/api/v1/consent/grants')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ recipient_partner_id: partnerA!.id, purpose: 'consultation' });
    expect(consent.status).toBe(200);

    const inPerson = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        doctor_profile_id: profileA!.id,
        country_code: 'VQ',
        starts_at: new Date(start.getTime() + 30 * 60_000).toISOString(),
        type: 'IN_PERSON',
      });
    await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${inPerson.body.id}/confirm`)
      .set('Authorization', `Bearer ${doctorA.token}`);
    const inPersonJoin = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${inPerson.body.id}/video/join`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(inPersonJoin.status).toBeGreaterThanOrEqual(400);

    const vendorJoin = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appointmentId}/video/join`)
      .set('Authorization', `Bearer ${vendor.token}`);
    expect(vendorJoin.status).toBeGreaterThanOrEqual(400);
    const otherJoin = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appointmentId}/video/join`)
      .set('Authorization', `Bearer ${otherCustomer.token}`);
    expect(otherJoin.status).toBeGreaterThanOrEqual(400);
    const doctorBJoin = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/video/join`)
      .set('Authorization', `Bearer ${doctorB.token}`);
    expect(doctorBJoin.status).toBeGreaterThanOrEqual(400);
    const adminJoin = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appointmentId}/video/join`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(adminJoin.status).toBeGreaterThanOrEqual(400);

    const customerJoin = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appointmentId}/video/join`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(customerJoin.status).toBe(200);
    expect(customerJoin.body.recording_enabled).toBe(false);
    expect(customerJoin.body.token).toBeTruthy();
    expect(String(customerJoin.body.token)).toMatch(/^mock\.customer\./);
    expect(new Date(customerJoin.body.token_expires_at).getTime() - Date.now()).toBeLessThanOrEqual(95_000);
    expect(JSON.stringify(customerJoin.body)).not.toMatch(/LIVEKIT_API_SECRET|apiSecret|api_secret/i);
    const doctorJoin = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/video/join`)
      .set('Authorization', `Bearer ${doctorA.token}`);
    expect(doctorJoin.status).toBe(200);
    expect(String(doctorJoin.body.token)).toMatch(/^mock\.doctor\./);
    expect(doctorJoin.body.session_id).toBe(customerJoin.body.session_id);
    expect(doctorJoin.body.status).toBe(VideoSessionStatus.IN_PROGRESS);

    const reconnect = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appointmentId}/video/join`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(reconnect.status).toBe(200);
    expect(reconnect.body.session_id).toBe(customerJoin.body.session_id);
    const sessions = await prisma.videoSession.findMany({ where: { appointmentId } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.recordingEnabled).toBe(false);

    const leave = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appointmentId}/video/leave`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(leave.body.encounter_completed).toBe(false);
    const encounter = await prisma.encounter.findUnique({ where: { appointmentId } });
    expect(encounter?.status).not.toBe(EncounterStatus.COMPLETED);

    const hook = {
      event_id: `evt-${appointmentId}`,
      event_type: 'room_finished',
      room_id: sessions[0]!.providerRoomId,
      ts: new Date().toISOString(),
    };
    const hookA = await request(app.getHttpServer())
      .post('/api/v1/webhooks/video/livekit')
      .set('x-mock-video-webhook', 'test')
      .send(hook);
    expect(hookA.status).toBe(201);
    const hookB = await request(app.getHttpServer())
      .post('/api/v1/webhooks/video/livekit')
      .set('x-mock-video-webhook', 'test')
      .send(hook);
    expect(hookB.body.duplicate).toBe(true);

    const staleHook = await request(app.getHttpServer())
      .post('/api/v1/webhooks/video/livekit')
      .set('x-mock-video-webhook', 'test')
      .send({
        event_id: `evt-stale-${appointmentId}`,
        event_type: 'room_finished',
        room_id: sessions[0]!.providerRoomId,
        ts: new Date(Date.now() - 10 * 60_000).toISOString(),
      });
    expect(staleHook.status).toBe(409);
    expect(staleHook.body.code).toBe('WEBHOOK_REPLAY');

    const afterEnd = await prisma.videoSession.findUnique({ where: { id: sessions[0]!.id } });
    expect(afterEnd?.status).toBe(VideoSessionStatus.ENDED);
    const staleAfterEnd = await request(app.getHttpServer())
      .post('/api/v1/webhooks/video/livekit')
      .set('x-mock-video-webhook', 'test')
      .send({
        event_id: `evt-late-${appointmentId}`,
        event_type: 'room_finished',
        room_id: sessions[0]!.providerRoomId,
        ts: new Date().toISOString(),
      });
    expect(staleAfterEnd.status).toBe(201);
    const stillEnded = await prisma.videoSession.findUnique({ where: { id: sessions[0]!.id } });
    expect(stillEnded?.status).toBe(VideoSessionStatus.ENDED);

    const adminList = await request(app.getHttpServer())
      .get('/api/v1/admin/video-sessions')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(adminList.status).toBe(200);
    expect(JSON.stringify(adminList.body)).not.toMatch(/mock\.customer\.|mock\.doctor\./);

    const noConsentStart = new Date(start.getTime() + 60 * 60_000);
    const noConsentBook = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${otherCustomer.token}`)
      .send({
        doctor_profile_id: profileA!.id,
        country_code: 'VQ',
        starts_at: noConsentStart.toISOString(),
        type: 'ONLINE',
      });
    await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${noConsentBook.body.id}/confirm`)
      .set('Authorization', `Bearer ${doctorA.token}`);
    const missingConsent = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${noConsentBook.body.id}/video/join`)
      .set('Authorization', `Bearer ${otherCustomer.token}`);
    expect(missingConsent.status).toBeGreaterThanOrEqual(400);

    await request(app.getHttpServer())
      .post(`/api/v1/consent/grants/${consent.body.id}/revoke`)
      .set('Authorization', `Bearer ${customer.token}`);
    const revoked = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appointmentId}/video/join`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(revoked.status).toBeGreaterThanOrEqual(400);

    const cancelledBook = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        doctor_profile_id: profileA!.id,
        country_code: 'VQ',
        starts_at: new Date(start.getTime() + 90 * 60_000).toISOString(),
        type: 'ONLINE',
      });
    await request(app.getHttpServer())
      .post(`/api/v1/appointments/${cancelledBook.body.id}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ reason_code: 'changed_mind' });
    const cancelledJoin = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${cancelledBook.body.id}/video/join`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(cancelledJoin.status).toBeGreaterThanOrEqual(400);

    await prisma.videoSession.update({
      where: { id: sessions[0]!.id },
      data: { expiresAt: new Date(Date.now() - 1000), status: VideoSessionStatus.READY },
    });
    const expiredJoin = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appointmentId}/video/join`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(expiredJoin.status).toBeGreaterThanOrEqual(400);

    const off = emptyPolicyDocument();
    off.partner_types.DOCTOR.enabled = true;
    off.healthcare.doctor_onboarding_enabled = true;
    off.healthcare.consultation_capability = true;
    off.healthcare.appointments_enabled = true;
    off.healthcare.telemedicine_eligibility = false;
    await prisma.policyPack.updateMany({
      where: { countryId: sessions[0]!.countryId, status: PolicyPackStatus.PUBLISHED },
      data: { document: off as never },
    });
    await prisma.videoSession.update({
      where: { id: sessions[0]!.id },
      data: { expiresAt: new Date(Date.now() + 3600_000), status: VideoSessionStatus.READY },
    });
    const policyOff = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appointmentId}/video/join`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(policyOff.status).toBeGreaterThanOrEqual(400);

    const rls = await prisma.$queryRaw<{ relrowsecurity: boolean }[]>`
      SELECT relrowsecurity FROM pg_class WHERE relname = 'video_sessions'
    `;
    expect(rls[0]?.relrowsecurity).toBe(true);
    const audits = await prisma.videoJoinAudit.findMany({ where: { sessionId: sessions[0]!.id } });
    expect(audits.length).toBeGreaterThan(0);
    const events = await prisma.outboxEvent.findMany({
      where: { type: { in: ['VIDEO_SESSION_CREATED', 'VIDEO_PARTICIPANT_JOINED', 'VIDEO_SESSION_STARTED'] } },
    });
    expect(events.length).toBeGreaterThan(0);
    expect(JSON.stringify(events)).not.toMatch(/mock\.customer\.|mock\.doctor\.|LIVEKIT_API_SECRET/i);
    expect(redactValue({ token: 'secret-token', livekit_api_secret: 'x' })).toEqual({
      token: '[redacted]',
      livekit_api_secret: '[redacted]',
    });
    expect(livekitConfig()).toBeNull();
    expect(AppointmentStatus.CONFIRMED).toBeDefined();
  });
});
