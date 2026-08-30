import { INestApplication } from '@nestjs/common';
import { CareNavSessionStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { PolicyCache } from '../policy/cache';
import { applyTestIsolation } from '../test/isolate-runtime';
import { enableCareNavigationPack } from '../test/enable-care-nav-pack';

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

const PHI_PATTERNS = [/chest\s+pain/i, /shortness\s+of\s+breath/i, /Hemoglobin/i];

function assertNoPhi(body: unknown) {
  const text = JSON.stringify(body);
  for (const pattern of PHI_PATTERNS) {
    expect(text).not.toMatch(pattern);
  }
}

describe('R10-A care navigation kernel (e2e)', () => {
  jest.setTimeout(180_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let policyCache: PolicyCache;

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
    policyCache = app.get(PolicyCache);
    await enableCareNavigationPack(prisma, policyCache, true);
  });

  afterAll(async () => {
    await enableCareNavigationPack(prisma, policyCache, false);
    await app.close();
  });

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('happy path: create, idempotent create, answers, triage routine, red-flag path', async () => {
    const suffix = `${Date.now().toString(36)}`;
    const customer = await signIn(app, `r10a-cust-${suffix}@example.com`);
    const idemKey = `r10a-create-${suffix}`;

    const created = await request(app.getHttpServer())
      .post('/api/v1/care-nav/sessions')
      .set(auth(customer.token))
      .set('X-Idempotency-Key', idemKey)
      .send({ country_code: 'XX', chief_complaint: 'mild headache for two days' });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('INTAKE');
    const sessionId = created.body.id as string;

    const dup = await request(app.getHttpServer())
      .post('/api/v1/care-nav/sessions')
      .set(auth(customer.token))
      .set('X-Idempotency-Key', idemKey)
      .send({ country_code: 'XX', chief_complaint: 'mild headache for two days' });
    expect(dup.status).toBe(201);
    expect(dup.body.id).toBe(sessionId);

    const answer = await request(app.getHttpServer())
      .post(`/api/v1/care-nav/sessions/${sessionId}/answers?country_code=XX`)
      .set(auth(customer.token))
      .send({ question_key: 'duration', answer_text: '2 days' });
    expect(answer.status).toBe(200);

    const triaged = await request(app.getHttpServer())
      .post(`/api/v1/care-nav/sessions/${sessionId}/complete-intake?country_code=XX`)
      .set(auth(customer.token));
    expect(triaged.status).toBe(201);
    expect(triaged.body.status).toBe('TRIAGED');
    expect(triaged.body.assessment.urgency).toBe('ROUTINE');
    expect(triaged.body.assessment.red_flag).toBe(false);
    expect(triaged.body.assessment.booking_handoff_allowed).toBe(true);

    const assessment = await request(app.getHttpServer())
      .get(`/api/v1/care-nav/sessions/${sessionId}/assessment?country_code=XX`)
      .set(auth(customer.token));
    expect(assessment.status).toBe(200);
    expect(assessment.body.explanation_key).toBe('care_nav.explain.routine');

    const outbox = await prisma.outboxEvent.findFirst({
      where: { occurrenceKey: `care_nav_started:${sessionId}` },
    });
    expect(outbox?.type).toBe('CARE_NAV_SESSION_STARTED');
    assertNoPhi(outbox?.payload);

    const redSuffix = `${Date.now().toString(36)}-rf`;
    const redCustomer = await signIn(app, `r10a-red-${redSuffix}@example.com`);
    const redCreated = await request(app.getHttpServer())
      .post('/api/v1/care-nav/sessions')
      .set(auth(redCustomer.token))
      .send({
        country_code: 'XX',
        chief_complaint: 'chest pain and shortness of breath',
      });
    expect(redCreated.status).toBe(201);
    const redSessionId = redCreated.body.id as string;

    const redTriaged = await request(app.getHttpServer())
      .post(`/api/v1/care-nav/sessions/${redSessionId}/complete-intake?country_code=XX`)
      .set(auth(redCustomer.token));
    expect(redTriaged.status).toBe(201);
    expect(redTriaged.body.assessment.red_flag).toBe(true);
    expect(redTriaged.body.assessment.urgency).toBe('EMERGENT');
    expect(redTriaged.body.assessment.emergency_guidance_key).toBeTruthy();
    expect(redTriaged.body.assessment.booking_handoff_allowed).toBe(false);
  });

  it('security negatives: isolation, disabled pack, unauthenticated, malformed id, expired, invalid transition', async () => {
    const suffix = `${Date.now().toString(36)}`;
    const customerA = await signIn(app, `r10a-a-${suffix}@example.com`);
    const customerB = await signIn(app, `r10a-b-${suffix}@example.com`);

    const created = await request(app.getHttpServer())
      .post('/api/v1/care-nav/sessions')
      .set(auth(customerA.token))
      .send({ country_code: 'XX', chief_complaint: 'mild cough' });
    expect(created.status).toBe(201);
    const sessionId = created.body.id as string;

    const cross = await request(app.getHttpServer())
      .get(`/api/v1/care-nav/sessions/${sessionId}?country_code=XX`)
      .set(auth(customerB.token));
    expect(cross.status).toBe(404);
    assertNoPhi(cross.body);

    const unauth = await request(app.getHttpServer()).get(
      `/api/v1/care-nav/sessions/${sessionId}?country_code=XX`,
    );
    expect(unauth.status).toBe(401);

    const badId = await request(app.getHttpServer())
      .get('/api/v1/care-nav/sessions/not-a-uuid?country_code=XX')
      .set(auth(customerA.token));
    expect(badId.status).toBe(404);
    assertNoPhi(badId.body);

    await prisma.careNavigationSession.update({
      where: { id: sessionId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const expired = await request(app.getHttpServer())
      .post(`/api/v1/care-nav/sessions/${sessionId}/answers?country_code=XX`)
      .set(auth(customerA.token))
      .send({ question_key: 'x', answer_text: 'y' });
    expect(expired.status).toBe(403);
    assertNoPhi(expired.body);

    await prisma.careNavigationSession.update({
      where: { id: sessionId },
      data: { expiresAt: new Date(Date.now() + 60 * 60 * 1000), status: CareNavSessionStatus.TRIAGED },
    });
    const invalidTransition = await request(app.getHttpServer())
      .post(`/api/v1/care-nav/sessions/${sessionId}/complete-intake?country_code=XX`)
      .set(auth(customerA.token));
    expect(invalidTransition.status).toBe(409);

    await enableCareNavigationPack(prisma, policyCache, false);
    const disabled = await request(app.getHttpServer())
      .post('/api/v1/care-nav/sessions')
      .set(auth(customerB.token))
      .send({ country_code: 'XX', chief_complaint: 'test' });
    expect(disabled.status).toBe(403);
    await enableCareNavigationPack(prisma, policyCache, true);
  });
});
