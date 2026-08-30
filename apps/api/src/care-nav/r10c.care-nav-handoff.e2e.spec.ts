import { INestApplication } from '@nestjs/common';
import { CareNavSessionStatus, PartnerStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { PolicyCache } from '../policy/cache';
import { applyTestIsolation } from '../test/isolate-runtime';
import { enableCareNavigationPack, enableR10CHandoffPack } from '../test/enable-care-nav-pack';

async function signIn(app: INestApplication, email: string) {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({
      challenge_id: requested.body.challenge_id,
      code: requested.body.dev_code,
      audience: 'customer',
    });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

async function signInDoctor(app: INestApplication, email: string) {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({
      challenge_id: requested.body.challenge_id,
      code: requested.body.dev_code,
      audience: 'doctor',
    });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

let slotCursor = 0;

async function firstAvailableSlot(
  app: INestApplication,
  token: string,
  profileId: string,
  skip = 0,
) {
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 14);
  const slots = await request(app.getHttpServer())
    .get(
      `/api/v1/care/doctors/${profileId}/slots?country_code=XX&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
    )
    .set({ Authorization: `Bearer ${token}` });
  expect(slots.status).toBe(200);
  expect(slots.body.slots.length).toBeGreaterThan(skip);
  return slots.body.slots[skip].starts_at as string;
}

async function nextAvailableSlot(
  app: INestApplication,
  token: string,
  profileId: string,
) {
  const slot = await firstAvailableSlot(app, token, profileId, slotCursor);
  slotCursor += 1;
  return slot;
}

async function postHandoff(
  app: INestApplication,
  token: string,
  sessionId: string,
  body: {
    doctor_profile_id: string;
    starts_at?: string;
    type?: string;
    authorized: boolean;
  },
  idempotencyKey?: string,
) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const startsAt =
      body.starts_at ??
      (await nextAvailableSlot(app, token, body.doctor_profile_id));
    const req = request(app.getHttpServer())
      .post(`/api/v1/care-nav/sessions/${sessionId}/handoff/appointment?country_code=XX`)
      .set({ Authorization: `Bearer ${token}` })
      .send({ ...body, starts_at: startsAt });
    if (idempotencyKey) {
      req.set('X-Idempotency-Key', idempotencyKey);
    }
    const res = await req;
    if (res.status === 200) {
      return res;
    }
    if (res.status === 409 || res.status === 500) {
      continue;
    }
    return res;
  }
  throw new Error('handoff did not succeed after slot retries');
}

const PHI_PATTERNS = [/chest\s+pain/i, /shortness\s+of\s+breath/i, /Hemoglobin/i];

function assertNoPhi(body: unknown) {
  const text = JSON.stringify(body);
  for (const pattern of PHI_PATTERNS) {
    expect(text).not.toMatch(pattern);
  }
}

async function completeIntake(app: INestApplication, token: string, complaint: string) {
  const created = await request(app.getHttpServer())
    .post('/api/v1/care-nav/sessions')
    .set('Authorization', `Bearer ${token}`)
    .send({ country_code: 'XX', chief_complaint: complaint });
  expect(created.status).toBe(201);
  const sessionId = created.body.id as string;

  await request(app.getHttpServer())
    .post(`/api/v1/care-nav/sessions/${sessionId}/answers?country_code=XX`)
    .set('Authorization', `Bearer ${token}`)
    .send({ question_key: 'duration', answer_text: '2 days' });

  await request(app.getHttpServer())
    .post(`/api/v1/care-nav/sessions/${sessionId}/answers?country_code=XX`)
    .set('Authorization', `Bearer ${token}`)
    .send({ question_key: 'symptom_change', answer_text: 'same' });

  const triaged = await request(app.getHttpServer())
    .post(`/api/v1/care-nav/sessions/${sessionId}/complete-intake?country_code=XX`)
    .set('Authorization', `Bearer ${token}`);
  expect(triaged.status).toBe(201);
  return { sessionId, triaged: triaged.body };
}

describe('R10-C care navigation match + handoff (e2e)', () => {
  jest.setTimeout(180_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let policyCache: PolicyCache;
  let doctorProfileId: string;

  beforeAll(async () => {
    slotCursor = Math.floor(Date.now() / 60_000) % 120;
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
    policyCache = app.get(PolicyCache);
    await enableR10CHandoffPack(prisma, policyCache, 'XX');

    const xxCountry = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'XX' } });
    const suffix = `${Date.now().toString(36)}`;
    const doctor = await signInDoctor(app, `r10c-doc-${suffix}@example.com`);
    await request(app.getHttpServer())
      .post('/api/v1/doctor/applications')
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ country_code: 'XX' });

    const partner = await prisma.partner.findFirst({
      where: { personId: doctor.personId, partnerTypeCode: 'DOCTOR' },
    });
    await prisma.partner.update({
      where: { id: partner!.id },
      data: { status: PartnerStatus.ACTIVE, countryId: xxCountry.id },
    });
    const profile = await prisma.doctorProfile.findUniqueOrThrow({ where: { partnerId: partner!.id } });
    doctorProfileId = profile.id;
    await prisma.doctorProfile.update({
      where: { id: profile.id },
      data: {
        countryId: xxCountry.id,
        specialties: ['general_practice'],
        onlineCapable: true,
        displayName: 'Dr R10C Test',
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
  });

  afterAll(async () => {
    await enableCareNavigationPack(prisma, policyCache, false);
    await app.close();
  });

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('matches deterministically, explains, and hands off via AppointmentService', async () => {
    const suffix = `${Date.now().toString(36)}`;
    const customer = await signIn(app, `r10c-cust-${suffix}@example.com`);
    const { sessionId } = await completeIntake(app, customer.token, 'mild headache for two days');

    const match = await request(app.getHttpServer())
      .get(`/api/v1/care-nav/sessions/${sessionId}/recommendations?country_code=XX`)
      .set(auth(customer.token));
    expect(match.status).toBe(200);
    expect(match.body.status).toBe('MATCHED');
    expect(match.body.recommendations.length).toBeGreaterThan(0);
    expect(match.body.recommendations[0].explanation_key).toContain('care_nav.match');
    expect(match.body.tele_available).toBe(true);
    assertNoPhi(match.body);

    const rematch = await request(app.getHttpServer())
      .get(`/api/v1/care-nav/sessions/${sessionId}/recommendations?country_code=XX`)
      .set(auth(customer.token));
    expect(rematch.status).toBe(200);
    expect(rematch.body.recommendations[0].doctor_profile_id).toBe(match.body.recommendations[0].doctor_profile_id);

    const idemKey = `r10c-handoff-${suffix}`;
    const handoff = await postHandoff(
      app,
      customer.token,
      sessionId,
      {
        doctor_profile_id: match.body.recommendations[0].doctor_profile_id,
        type: 'IN_PERSON',
        authorized: true,
      },
      idemKey,
    );
    expect(handoff.status).toBe(200);
    expect(handoff.body.handoff_completed).toBe(true);
    expect(handoff.body.appointment_id).toBeTruthy();
    assertNoPhi(handoff.body);

    const dup = await postHandoff(
      app,
      customer.token,
      sessionId,
      {
        doctor_profile_id: match.body.recommendations[0].doctor_profile_id,
        type: 'IN_PERSON',
        authorized: true,
      },
      idemKey,
    );
    expect(dup.status).toBe(200);
    expect(dup.body.appointment_id).toBe(handoff.body.appointment_id);

    const status = await request(app.getHttpServer())
      .get(`/api/v1/care-nav/sessions/${sessionId}/handoff/status?country_code=XX`)
      .set(auth(customer.token));
    expect(status.status).toBe(200);
    expect(status.body.handoff_completed).toBe(true);
    expect(status.body.tele.recording_enabled).toBe(false);

    const outbox = await prisma.outboxEvent.findFirst({
      where: { occurrenceKey: `care_nav_handoff:${sessionId}` },
    });
    expect(outbox?.type).toBe('CARE_NAV_HANDOFF_BOOKED');
    assertNoPhi(outbox?.payload);

    const session = await prisma.careNavigationSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.status).toBe(CareNavSessionStatus.COMPLETED);
    expect(session.appointmentId).toBe(handoff.body.appointment_id);
  });

  it('blocks red-flag sessions from matching and handoff', async () => {
    const suffix = `${Date.now().toString(36)}-rf`;
    const customer = await signIn(app, `r10c-red-${suffix}@example.com`);
    const { sessionId, triaged } = await completeIntake(
      app,
      customer.token,
      'chest pain and shortness of breath',
    );
    expect(triaged.assessment.red_flag).toBe(true);
    expect(triaged.assessment.booking_handoff_allowed).toBe(false);

    const match = await request(app.getHttpServer())
      .get(`/api/v1/care-nav/sessions/${sessionId}/recommendations?country_code=XX`)
      .set(auth(customer.token));
    expect(match.status).toBe(403);
    assertNoPhi(match.body);

    const handoff = await request(app.getHttpServer())
      .post(`/api/v1/care-nav/sessions/${sessionId}/handoff/appointment?country_code=XX`)
      .set(auth(customer.token))
      .send({
        doctor_profile_id: doctorProfileId,
        starts_at: new Date(Date.now() + 86_400_000).toISOString(),
        authorized: true,
      });
    expect(handoff.status).toBe(403);
    assertNoPhi(handoff.body);
  });

  it('security negatives: isolation, disabled pack, unauthenticated, wrong provider', async () => {
    const suffix = `${Date.now().toString(36)}`;
    const customerA = await signIn(app, `r10c-a-${suffix}@example.com`);
    const customerB = await signIn(app, `r10c-b-${suffix}@example.com`);
    const { sessionId } = await completeIntake(app, customerA.token, 'mild cough');

    const cross = await request(app.getHttpServer())
      .get(`/api/v1/care-nav/sessions/${sessionId}/recommendations?country_code=XX`)
      .set(auth(customerB.token));
    expect(cross.status).toBe(404);
    assertNoPhi(cross.body);

    const unauth = await request(app.getHttpServer()).get(
      `/api/v1/care-nav/sessions/${sessionId}/recommendations?country_code=XX`,
    );
    expect(unauth.status).toBe(401);

    await enableCareNavigationPack(prisma, policyCache, false);
    const disabled = await request(app.getHttpServer())
      .get(`/api/v1/care-nav/sessions/${sessionId}/recommendations?country_code=XX`)
      .set(auth(customerA.token));
    expect(disabled.status).toBe(403);
    await enableR10CHandoffPack(prisma, policyCache, 'XX');

    const match = await request(app.getHttpServer())
      .get(`/api/v1/care-nav/sessions/${sessionId}/recommendations?country_code=XX`)
      .set(auth(customerA.token));
    expect(match.status).toBe(200);

    const badDoctorSlot = await nextAvailableSlot(app, customerA.token, doctorProfileId);
    const badDoctor = await request(app.getHttpServer())
      .post(`/api/v1/care-nav/sessions/${sessionId}/handoff/appointment?country_code=XX`)
      .set(auth(customerA.token))
      .send({
        doctor_profile_id: '00000000-0000-4000-8000-000000000099',
        starts_at: badDoctorSlot,
        authorized: true,
      });
    expect(badDoctor.status).toBe(403);
  });

  it('tele path when ONLINE selected and unavailable when pack off', async () => {
    const suffix = `${Date.now().toString(36)}-tele`;
    const customer = await signIn(app, `r10c-tele-${suffix}@example.com`);
    const { sessionId } = await completeIntake(app, customer.token, 'mild headache');

    const match = await request(app.getHttpServer())
      .get(`/api/v1/care-nav/sessions/${sessionId}/recommendations?country_code=XX`)
      .set(auth(customer.token));
    expect(match.status).toBe(200);

    const online = await postHandoff(app, customer.token, sessionId, {
      doctor_profile_id: match.body.recommendations[0].doctor_profile_id,
      type: 'ONLINE',
      authorized: true,
    });
    expect(online.status).toBe(200);
    expect(online.body.tele.path).toBe('online');
    expect(online.body.tele.video_join_route).toContain('/video/join');
    expect(online.body.tele.recording_enabled).toBe(false);

    await enableCareNavigationPack(prisma, policyCache, true);
    const doc = structuredClone(
      (await prisma.policyPack.findFirst({
        where: { country: { isoAlpha2: 'XX' }, status: 'PUBLISHED' },
        orderBy: { publishedAt: 'desc' },
      }))!.document as object,
    ) as { healthcare?: { telemedicine_eligibility?: boolean; care_navigation_enabled?: boolean; appointments_enabled?: boolean; consultation_capability?: boolean } };
    doc.healthcare!.telemedicine_eligibility = false;
    doc.healthcare!.care_navigation_enabled = true;
    doc.healthcare!.appointments_enabled = true;
    doc.healthcare!.consultation_capability = true;
    await prisma.policyPack.updateMany({
      where: { country: { isoAlpha2: 'XX' }, status: 'PUBLISHED' },
      data: { document: doc as never },
    });
    await policyCache.invalidate('XX');

    const customer2 = await signIn(app, `r10c-tele2-${suffix}@example.com`);
    const intake2 = await completeIntake(app, customer2.token, 'mild headache');
    const match2 = await request(app.getHttpServer())
      .get(`/api/v1/care-nav/sessions/${intake2.sessionId}/recommendations?country_code=XX`)
      .set(auth(customer2.token));
    expect(match2.body.tele_available).toBe(false);

    const inPerson = await postHandoff(app, customer2.token, intake2.sessionId, {
      doctor_profile_id: match2.body.recommendations[0].doctor_profile_id,
      type: 'IN_PERSON',
      authorized: true,
    });
    expect(inPerson.status).toBe(200);
    expect(inPerson.body.tele.path).toBe('in_person_default');

    await enableR10CHandoffPack(prisma, policyCache, 'XX');
  });
});
