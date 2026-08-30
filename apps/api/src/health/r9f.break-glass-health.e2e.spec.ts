import { INestApplication } from '@nestjs/common';
import { BreakGlassReviewStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { OrganizationService } from '../partner/organization.service';
import { applyTestIsolation } from '../test/isolate-runtime';
import {
  ensureClinicalRelationship,
  publishLabHealthArtifactFixture,
  seedDoctorPartner,
} from '../test/publish-lab-health-artifact';

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

async function signInPlatformSuperAdmin(app: INestApplication, prisma: PrismaService, email: string) {
  const seed = await signIn(app, email);
  const superAdmin = await prisma.role.findUnique({ where: { code: 'super_admin' } });
  await prisma.membership.create({
    data: {
      id: uuidv7(),
      personId: seed.personId,
      roleId: superAdmin!.id,
      scope: 'platform',
      status: 'ACTIVE',
    },
  });
  return signIn(app, email, 'admin');
}

const PHI_PATTERNS = [/Hemoglobin/i, /"14"/, /results/i, /findings/i, /impression/i];

function assertNoPhi(body: unknown) {
  const text = JSON.stringify(body);
  for (const pattern of PHI_PATTERNS) {
    expect(text).not.toMatch(pattern);
  }
}

describe('R9-F break-glass health governance (e2e)', () => {
  jest.setTimeout(180_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let orgs: OrganizationService;

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
    orgs = app.get(OrganizationService);
  });

  afterAll(async () => {
    await app.close();
  });

  function doctorPayloadUrl(patientPersonId: string, artifactId: string, purpose: string) {
    return `/api/v1/health/patients/${patientPersonId}/artifacts/${artifactId}/payload?country_code=XX&purpose=${purpose}`;
  }

  it('full flow: consent → revoke → break-glass → access → admin metadata → review → expiry deny', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const ctx = await publishLabHealthArtifactFixture(app, prisma, orgs, suffix, (email, audience) =>
      signIn(app, email, audience),
    );
    const doctor = await signIn(app, `r9f-doc-${suffix}@example.com`, 'doctor');
    const partner = await seedDoctorPartner(prisma, ctx.country.id, doctor, suffix);
    await ensureClinicalRelationship(prisma, ctx.country.id, ctx.customerA.personId, partner.id);

    const admin = await signInPlatformSuperAdmin(app, prisma, `r9f-admin-${suffix}@example.com`);

    const grant = await request(app.getHttpServer())
      .post('/api/v1/consent/grants')
      .set(ctx.auth(ctx.customerA.token))
      .send({
        recipient_partner_id: partner.id,
        purpose: 'treatment',
        scope: ['LAB_REPORT'],
      });
    expect(grant.status).toBe(200);

    const allowed = await request(app.getHttpServer())
      .get(doctorPayloadUrl(ctx.customerA.personId, ctx.artifactId, 'treatment'))
      .set(ctx.auth(doctor.token));
    expect(allowed.status).toBe(200);
    expect(allowed.body.payload.results[0].value).toBe('14');

    const revoke = await request(app.getHttpServer())
      .post(`/api/v1/consent/grants/${grant.body.id}/revoke`)
      .set(ctx.auth(ctx.customerA.token));
    expect(revoke.status).toBe(200);

    const deniedAfterRevoke = await request(app.getHttpServer())
      .get(doctorPayloadUrl(ctx.customerA.personId, ctx.artifactId, 'treatment'))
      .set(ctx.auth(doctor.token));
    expect(deniedAfterRevoke.status).toBe(403);
    assertNoPhi(deniedAfterRevoke.body);

    const opened = await request(app.getHttpServer())
      .post('/api/v1/admin/health/break-glass')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        patient_person_id: ctx.customerA.personId,
        doctor_partner_id: partner.id,
        country_id: ctx.country.id,
        reason: `emergency-${suffix}`,
        ticket_id: `T-${suffix}`,
        ttl_minutes: 60,
      });
    expect(opened.status).toBe(201);
    expect(opened.body.bridged_consent?.purpose).toBe('break_glass');
    const breakGlassGrantId = opened.body.id as string;

    const breakGlassRead = await request(app.getHttpServer())
      .get(doctorPayloadUrl(ctx.customerA.personId, ctx.artifactId, 'break_glass'))
      .set(ctx.auth(doctor.token))
      .set('X-Request-Id', `r9f-bg-read-${suffix}`);
    expect(breakGlassRead.status).toBe(200);
    expect(breakGlassRead.body.payload.results[0].value).toBe('14');

    const consentList = await request(app.getHttpServer())
      .get('/api/v1/admin/health/consent-grants')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(consentList.status).toBe(200);
    assertNoPhi(consentList.body);
    expect(consentList.body.data.some((row: { break_glass_grant_id?: string }) => row.break_glass_grant_id === breakGlassGrantId)).toBe(true);

    const auditList = await request(app.getHttpServer())
      .get('/api/v1/admin/health/access-audits')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(auditList.status).toBe(200);
    assertNoPhi(auditList.body);

    const queue = await request(app.getHttpServer())
      .get('/api/v1/admin/health/break-glass?active_only=true')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(queue.status).toBe(200);
    assertNoPhi(queue.body);
    expect(queue.body.data.some((row: { id: string }) => row.id === breakGlassGrantId)).toBe(true);

    const reviewed = await request(app.getHttpServer())
      .post(`/api/v1/admin/health/break-glass/${breakGlassGrantId}/review`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ review_notes: 'post-incident review' });
    expect(reviewed.status).toBe(201);
    expect(reviewed.body.review_status).toBe('REVIEWED');

    const reviewAgain = await request(app.getHttpServer())
      .post(`/api/v1/admin/health/break-glass/${breakGlassGrantId}/review`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ review_notes: 'post-incident review' });
    expect(reviewAgain.status).toBe(201);
    expect(reviewAgain.body.review_status).toBe('REVIEWED');

    await prisma.breakGlassGrant.update({
      where: { id: breakGlassGrantId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    await prisma.consentGrant.updateMany({
      where: { breakGlassGrantId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const deniedExpired = await request(app.getHttpServer())
      .get(doctorPayloadUrl(ctx.customerA.personId, ctx.artifactId, 'break_glass'))
      .set(ctx.auth(doctor.token));
    expect(deniedExpired.status).toBe(403);
    assertNoPhi(deniedExpired.body);

    const outbox = await prisma.outboxEvent.findFirst({
      where: { occurrenceKey: `bg_health:${breakGlassGrantId}` },
    });
    expect(outbox?.type).toBe('BREAK_GLASS_HEALTH_OPENED');
    assertNoPhi(outbox?.payload);
  });

  it('rejects duplicate active break-glass and unauthorized admin', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const ctx = await publishLabHealthArtifactFixture(app, prisma, orgs, suffix, (email, audience) =>
      signIn(app, email, audience),
    );
    const doctor = await signIn(app, `r9f-dup-doc-${suffix}@example.com`, 'doctor');
    const partner = await seedDoctorPartner(prisma, ctx.country.id, doctor, suffix);

    const admin = await signInPlatformSuperAdmin(app, prisma, `r9f-dup-admin-${suffix}@example.com`);

    const unauthorized = await signIn(app, `r9f-noperms-${suffix}@example.com`, 'admin');
    const deniedList = await request(app.getHttpServer())
      .get('/api/v1/admin/health/consent-grants')
      .set('Authorization', `Bearer ${unauthorized.token}`);
    expect(deniedList.status).toBe(403);

    const first = await request(app.getHttpServer())
      .post('/api/v1/admin/health/break-glass')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        patient_person_id: ctx.customerA.personId,
        doctor_partner_id: partner.id,
        country_id: ctx.country.id,
        reason: 'first',
      });
    expect(first.status).toBe(201);

    const duplicate = await request(app.getHttpServer())
      .post('/api/v1/admin/health/break-glass')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        patient_person_id: ctx.customerA.personId,
        doctor_partner_id: partner.id,
        country_id: ctx.country.id,
        reason: 'duplicate',
      });
    expect(duplicate.status).toBe(409);

    await prisma.breakGlassGrant.update({
      where: { id: first.body.id },
      data: { reviewStatus: BreakGlassReviewStatus.CLOSED },
    });

    const reviewClosed = await request(app.getHttpServer())
      .post(`/api/v1/admin/health/break-glass/${first.body.id}/review`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ review_notes: 'too late' });
    expect(reviewClosed.status).toBe(409);
  });

  it('R9-C regression: re-grant after break-glass does not bypass normal consent permanently', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const ctx = await publishLabHealthArtifactFixture(app, prisma, orgs, suffix, (email, audience) =>
      signIn(app, email, audience),
    );
    const doctor = await signIn(app, `r9f-reg-doc-${suffix}@example.com`, 'doctor');
    const partner = await seedDoctorPartner(prisma, ctx.country.id, doctor, suffix);
    await ensureClinicalRelationship(prisma, ctx.country.id, ctx.customerA.personId, partner.id);

    const admin = await signInPlatformSuperAdmin(app, prisma, `r9f-reg-admin-${suffix}@example.com`);

    const opened = await request(app.getHttpServer())
      .post('/api/v1/admin/health/break-glass')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        patient_person_id: ctx.customerA.personId,
        doctor_partner_id: partner.id,
        country_id: ctx.country.id,
        reason: 'temporary',
        ttl_minutes: 5,
      });
    expect(opened.status).toBe(201);

    await prisma.breakGlassGrant.update({
      where: { id: opened.body.id },
      data: { expiresAt: new Date(Date.now() - 1_000), revokedAt: new Date() },
    });
    await prisma.consentGrant.updateMany({
      where: { breakGlassGrantId: opened.body.id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });

    const deniedBg = await request(app.getHttpServer())
      .get(doctorPayloadUrl(ctx.customerA.personId, ctx.artifactId, 'break_glass'))
      .set(ctx.auth(doctor.token));
    expect(deniedBg.status).toBe(403);

    const normalGrant = await request(app.getHttpServer())
      .post('/api/v1/consent/grants')
      .set(ctx.auth(ctx.customerA.token))
      .send({
        recipient_partner_id: partner.id,
        purpose: 'treatment',
        scope: ['LAB_REPORT'],
      });
    expect(normalGrant.status).toBe(200);

    const allowed = await request(app.getHttpServer())
      .get(doctorPayloadUrl(ctx.customerA.personId, ctx.artifactId, 'treatment'))
      .set(ctx.auth(doctor.token));
    expect(allowed.status).toBe(200);
  });
});
