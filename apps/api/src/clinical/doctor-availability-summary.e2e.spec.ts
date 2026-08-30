import { INestApplication } from '@nestjs/common';
import { PartnerStatus, PolicyPackStatus } from '@prisma/client';
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

async function onboardDoctor(app: INestApplication, token: string, countryCode: string) {
  const joined = await request(app.getHttpServer())
    .post('/api/v1/doctor/applications')
    .set('Authorization', `Bearer ${token}`)
    .send({ country_code: countryCode });
  expect(joined.status).toBe(200);
  const partner = await request(app.getHttpServer())
    .get('/api/v1/doctor/me')
    .set('Authorization', `Bearer ${token}`);
  expect(partner.status).toBe(200);
  return partner.body;
}

describe('R2 doctor availability summary (e2e)', () => {
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
    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'AV' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'AV',
          isoAlpha3: 'AVL',
          nameI18n: { en: 'Availability summary test' },
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
          checksum: 'availability-summary-test',
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

  it('returns configured:false when doctor has no availability windows', async () => {
    const doctor = await signIn(app, `avail-empty-${Date.now()}@example.com`, 'doctor');
    await onboardDoctor(app, doctor.token, 'AV');

    const summary = await request(app.getHttpServer())
      .get('/api/v1/doctor/me/availability')
      .set('Authorization', `Bearer ${doctor.token}`);
    expect(summary.status).toBe(200);
    expect(summary.body).toEqual({
      configured: false,
      timezone: expect.any(String),
      window_count: 0,
      exception_count: 0,
    });
    expect(summary.body.note).toBeUndefined();
    expect(JSON.stringify(summary.body)).not.toContain('not implemented');
  });

  it('returns configured:true after windows are saved and matches /windows', async () => {
    const doctor = await signIn(app, `avail-config-${Date.now()}@example.com`, 'doctor');
    await onboardDoctor(app, doctor.token, 'AV');

    const windows = [0, 1, 2, 3, 4].map((weekday) => ({
      weekday,
      start_local: '09:00',
      end_local: '17:00',
      slot_minutes: 30,
      buffer_minutes: 0,
    }));
    const saved = await request(app.getHttpServer())
      .put('/api/v1/doctor/me/availability/windows')
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ timezone: 'Europe/Berlin', windows });
    expect(saved.status).toBe(200);

    const canonical = await request(app.getHttpServer())
      .get('/api/v1/doctor/me/availability/windows')
      .set('Authorization', `Bearer ${doctor.token}`);
    expect(canonical.status).toBe(200);
    expect(canonical.body.windows).toHaveLength(5);
    expect(canonical.body.timezone).toBe('Europe/Berlin');

    const summary = await request(app.getHttpServer())
      .get('/api/v1/doctor/me/availability')
      .set('Authorization', `Bearer ${doctor.token}`);
    expect(summary.status).toBe(200);
    expect(summary.body).toEqual({
      configured: true,
      timezone: 'Europe/Berlin',
      window_count: canonical.body.windows.length,
      exception_count: canonical.body.exceptions.length,
    });
    expect(summary.body.note).toBeUndefined();
  });

  it('embeds the same summary on GET /doctor/me', async () => {
    const doctor = await signIn(app, `avail-me-${Date.now()}@example.com`, 'doctor');
    await onboardDoctor(app, doctor.token, 'AV');

    await request(app.getHttpServer())
      .put('/api/v1/doctor/me/availability/windows')
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({
        timezone: 'UTC',
        windows: [{ weekday: 1, start_local: '10:00', end_local: '12:00', slot_minutes: 30 }],
      });

    const [summary, me] = await Promise.all([
      request(app.getHttpServer())
        .get('/api/v1/doctor/me/availability')
        .set('Authorization', `Bearer ${doctor.token}`),
      request(app.getHttpServer())
        .get('/api/v1/doctor/me')
        .set('Authorization', `Bearer ${doctor.token}`),
    ]);
    expect(summary.status).toBe(200);
    expect(me.status).toBe(200);
    expect(me.body.availability).toEqual(summary.body);
  });

  it('rejects non-doctor and unauthenticated access', async () => {
    const customer = await signIn(app, `avail-cust-${Date.now()}@example.com`, 'customer');
    const doctor = await signIn(app, `avail-doc-${Date.now()}@example.com`, 'doctor');
    await onboardDoctor(app, doctor.token, 'AV');

    const unauth = await request(app.getHttpServer()).get('/api/v1/doctor/me/availability');
    expect(unauth.status).toBeGreaterThanOrEqual(401);

    const customerDenied = await request(app.getHttpServer())
      .get('/api/v1/doctor/me/availability')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(customerDenied.status).toBeGreaterThanOrEqual(400);
  });

  it('isolates availability summary per doctor partner (tenant boundary)', async () => {
    const doctorA = await signIn(app, `avail-iso-a-${Date.now()}@example.com`, 'doctor');
    const doctorB = await signIn(app, `avail-iso-b-${Date.now()}@example.com`, 'doctor');
    await onboardDoctor(app, doctorA.token, 'AV');
    await onboardDoctor(app, doctorB.token, 'AV');

    const partnerA = await prisma.partner.findFirst({
      where: { personId: doctorA.personId, partnerTypeCode: 'DOCTOR' },
    });
    const partnerB = await prisma.partner.findFirst({
      where: { personId: doctorB.personId, partnerTypeCode: 'DOCTOR' },
    });
    await prisma.partner.update({ where: { id: partnerA!.id }, data: { status: PartnerStatus.ACTIVE } });
    await prisma.partner.update({ where: { id: partnerB!.id }, data: { status: PartnerStatus.ACTIVE } });

    await request(app.getHttpServer())
      .put('/api/v1/doctor/me/availability/windows')
      .set('Authorization', `Bearer ${doctorA.token}`)
      .send({
        timezone: 'UTC',
        windows: [0, 1, 2].map((weekday) => ({
          weekday,
          start_local: '08:00',
          end_local: '16:00',
          slot_minutes: 30,
        })),
      });

    const summaryA = await request(app.getHttpServer())
      .get('/api/v1/doctor/me/availability')
      .set('Authorization', `Bearer ${doctorA.token}`);
    const summaryB = await request(app.getHttpServer())
      .get('/api/v1/doctor/me/availability')
      .set('Authorization', `Bearer ${doctorB.token}`);

    expect(summaryA.body.configured).toBe(true);
    expect(summaryA.body.window_count).toBe(3);
    expect(summaryB.body.configured).toBe(false);
    expect(summaryB.body.window_count).toBe(0);
    expect(summaryA.body.partner_id).toBeUndefined();
    expect(summaryB.body.partner_id).toBeUndefined();
  });

  it('regression: summary reflects live window changes (not stale placeholder)', async () => {
    const doctor = await signIn(app, `avail-reg-${Date.now()}@example.com`, 'doctor');
    await onboardDoctor(app, doctor.token, 'AV');

    const before = await request(app.getHttpServer())
      .get('/api/v1/doctor/me/availability')
      .set('Authorization', `Bearer ${doctor.token}`);
    expect(before.body.configured).toBe(false);
    expect(before.body.window_count).toBe(0);

    await request(app.getHttpServer())
      .put('/api/v1/doctor/me/availability/windows')
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({
        timezone: 'UTC',
        windows: [{ weekday: 3, start_local: '09:00', end_local: '10:00', slot_minutes: 15 }],
      });

    const after = await request(app.getHttpServer())
      .get('/api/v1/doctor/me/availability')
      .set('Authorization', `Bearer ${doctor.token}`);
    expect(after.body.configured).toBe(true);
    expect(after.body.window_count).toBe(1);
    expect(JSON.stringify(after.body)).not.toContain('Availability scheduling is not implemented');
  });
});
