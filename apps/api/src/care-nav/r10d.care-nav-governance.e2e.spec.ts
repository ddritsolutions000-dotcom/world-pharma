import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { PolicyCache } from '../policy/cache';
import { applyTestIsolation } from '../test/isolate-runtime';
import { enableR10CHandoffPack } from '../test/enable-care-nav-pack';

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

async function signInComplianceAdmin(app: INestApplication, prisma: PrismaService, email: string) {
  const seed = await signIn(app, email);
  const role = await prisma.role.findUnique({ where: { code: 'company_compliance' } });
  await prisma.membership.create({
    data: {
      id: uuidv7(),
      personId: seed.personId,
      roleId: role!.id,
      scope: 'platform',
      status: 'ACTIVE',
    },
  });
  return signIn(app, email, 'admin');
}

const PHI_PATTERNS = [/chest\s+pain/i, /shortness\s+of\s+breath/i, /mild\s+headache/i, /Hemoglobin/i];

function assertNoPhi(body: unknown) {
  const text = JSON.stringify(body);
  for (const pattern of PHI_PATTERNS) {
    expect(text).not.toMatch(pattern);
  }
}

async function triageSession(app: INestApplication, token: string, complaint: string) {
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
  const triaged = await request(app.getHttpServer())
    .post(`/api/v1/care-nav/sessions/${sessionId}/complete-intake?country_code=XX`)
    .set('Authorization', `Bearer ${token}`);
  expect(triaged.status).toBe(201);
  return { sessionId, triaged: triaged.body };
}

describe('R10-D care navigation governance (e2e)', () => {
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
    await enableR10CHandoffPack(prisma, policyCache, 'XX');
  });

  afterAll(async () => {
    await app.close();
  });

  it('admin audit: authorized list/detail metadata-only; unauthorized denied', async () => {
    const suffix = `${Date.now().toString(36)}`;
    const customer = await signIn(app, `r10d-cust-${suffix}@example.com`);
    const { sessionId } = await triageSession(app, customer.token, 'mild headache for two days');

    const noPerm = await signIn(app, `r10d-noperm-${suffix}@example.com`, 'admin');
    const denied = await request(app.getHttpServer())
      .get('/api/v1/admin/care-nav/sessions')
      .set('Authorization', `Bearer ${noPerm.token}`);
    expect(denied.status).toBe(403);

    const admin = await signInComplianceAdmin(app, prisma, `r10d-admin-${suffix}@example.com`);
    const list = await request(app.getHttpServer())
      .get('/api/v1/admin/care-nav/sessions')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.data)).toBe(true);
    const row = list.body.data.find((item: { id: string }) => item.id === sessionId);
    expect(row).toBeTruthy();
    expect(row.person_id).toBe(customer.personId);
    expect(row.chief_complaint_summary).toBeUndefined();
    assertNoPhi(list.body);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/care-nav/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.id).toBe(sessionId);
    expect(detail.body.assessments?.[0]?.explanation_key).toBeTruthy();
    assertNoPhi(detail.body);
  });

  it('clinician override: rematch audited + idempotent; terminate on completed denied', async () => {
    const suffix = `${Date.now().toString(36)}`;
    const customer = await signIn(app, `r10d-rem-${suffix}@example.com`);
    const { sessionId } = await triageSession(app, customer.token, 'mild cough for one week');
    const admin = await signInComplianceAdmin(app, prisma, `r10d-rem-admin-${suffix}@example.com`);

    const missingReason = await request(app.getHttpServer())
      .post(`/api/v1/admin/care-nav/sessions/${sessionId}/override`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ action: 'REMATCH', country_code: 'XX' });
    expect(missingReason.status).toBe(400);

    const idemKey = `r10d-rematch-${suffix}`;
    const rematch = await request(app.getHttpServer())
      .post(`/api/v1/admin/care-nav/sessions/${sessionId}/override`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        action: 'REMATCH',
        country_code: 'XX',
        reason: 'Governance review requested new provider set',
        idempotency_key: idemKey,
      });
    expect(rematch.status).toBe(201);
    expect(rematch.body.action).toBe('REMATCH');
    expect(rematch.body.new_state.match_set_version).toBe(2);

    const dup = await request(app.getHttpServer())
      .post(`/api/v1/admin/care-nav/sessions/${sessionId}/override`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        action: 'REMATCH',
        country_code: 'XX',
        reason: 'Governance review requested new provider set',
        idempotency_key: idemKey,
      });
    expect(dup.status).toBe(201);
    expect(dup.body.id).toBe(rematch.body.id);

    const overrideCount = await prisma.careNavOverride.count({ where: { sessionId } });
    expect(overrideCount).toBe(1);

    const security = await prisma.securityEvent.findFirst({
      where: { type: 'CARE_NAV_OVERRIDE_APPLIED', personId: admin.personId },
      orderBy: { createdAt: 'desc' },
    });
    expect(security?.metadata).toMatchObject({ session_id: sessionId, action: 'REMATCH' });
    assertNoPhi(security?.metadata);

    const terminate = await request(app.getHttpServer())
      .post(`/api/v1/admin/care-nav/sessions/${sessionId}/override`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        action: 'TERMINATE',
        country_code: 'XX',
        reason: 'Governance closure after review complete',
      });
    expect(terminate.status).toBe(201);
    expect(terminate.body.new_state.status).toBe('TERMINATED');

    const rematchTerminated = await request(app.getHttpServer())
      .post(`/api/v1/admin/care-nav/sessions/${sessionId}/override`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        action: 'REMATCH',
        country_code: 'XX',
        reason: 'Should fail on terminated session',
      });
    expect(rematchTerminated.status).toBe(409);
  });

  it('safety: red-flag override rematch does not unlock customer booking', async () => {
    const suffix = `${Date.now().toString(36)}`;
    const customer = await signIn(app, `r10d-rf-${suffix}@example.com`);
    const { sessionId } = await triageSession(app, customer.token, 'chest pain and shortness of breath');
    const admin = await signInComplianceAdmin(app, prisma, `r10d-rf-admin-${suffix}@example.com`);

    const rematch = await request(app.getHttpServer())
      .post(`/api/v1/admin/care-nav/sessions/${sessionId}/override`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        action: 'REMATCH',
        country_code: 'XX',
        reason: 'Governance rematch without unlocking booking',
      });
    expect(rematch.status).toBe(201);
    expect(rematch.body.new_state.red_flag).toBe(true);

    const recs = await request(app.getHttpServer())
      .get(`/api/v1/care-nav/sessions/${sessionId}/recommendations?country_code=XX`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(recs.status).toBe(403);

    const handoff = await request(app.getHttpServer())
      .post(`/api/v1/care-nav/sessions/${sessionId}/handoff/appointment?country_code=XX`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        doctor_profile_id: uuidv7(),
        starts_at: new Date(Date.now() + 86_400_000).toISOString(),
        authorized: true,
      });
    expect(handoff.status).toBe(403);
  });

  it('security: customer cannot call admin override; malformed session id fails closed', async () => {
    const suffix = `${Date.now().toString(36)}`;
    const customer = await signIn(app, `r10d-sec-${suffix}@example.com`);
    const admin = await signInComplianceAdmin(app, prisma, `r10d-sec-admin-${suffix}@example.com`);

    const customerOverride = await request(app.getHttpServer())
      .post('/api/v1/admin/care-nav/sessions/not-a-uuid/override')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        action: 'TERMINATE',
        country_code: 'XX',
        reason: 'customer must not override',
      });
    expect([401, 403]).toContain(customerOverride.status);

    const malformed = await request(app.getHttpServer())
      .post('/api/v1/admin/care-nav/sessions/not-a-uuid/override')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        action: 'TERMINATE',
        country_code: 'XX',
        reason: 'malformed session identifier test',
      });
    expect(malformed.status).toBe(400);
  });
});
