import { INestApplication } from '@nestjs/common';
import { ConsentGrantStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { OrganizationService } from '../partner/organization.service';
import { applyTestIsolation } from '../test/isolate-runtime';
import { authTenantContext } from '../tenancy/build-tenant-context';
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

describe('R9-C consent scope enforcement (e2e)', () => {
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

  function doctorPayloadUrl(patientPersonId: string, artifactId: string) {
    return `/api/v1/health/patients/${patientPersonId}/artifacts/${artifactId}/payload?country_code=XX&purpose=treatment`;
  }

  it('grant → authorized doctor read → revoke → denied → re-grant → authorized', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const ctx = await publishLabHealthArtifactFixture(app, prisma, orgs, suffix, (email, audience) =>
      signIn(app, email, audience),
    );
    const doctor = await signIn(app, `r9c-doc-main-${suffix}@example.com`, 'doctor');
    const partner = await seedDoctorPartner(prisma, ctx.country.id, doctor, suffix);
    await ensureClinicalRelationship(prisma, ctx.country.id, ctx.customerA.personId, partner.id);

    const deniedBeforeGrant = await request(app.getHttpServer())
      .get(doctorPayloadUrl(ctx.customerA.personId, ctx.artifactId))
      .set(ctx.auth(doctor.token));
    expect(deniedBeforeGrant.status).toBe(403);
    expect(JSON.stringify(deniedBeforeGrant.body)).not.toMatch(/Hemoglobin|"14"/);

    const grant = await request(app.getHttpServer())
      .post('/api/v1/consent/grants')
      .set(ctx.auth(ctx.customerA.token))
      .send({
        recipient_partner_id: partner.id,
        purpose: 'treatment',
        scope: ['LAB_REPORT'],
      });
    expect(grant.status).toBe(200);
    expect(grant.body.scope).toEqual(['LAB_REPORT']);

    const allowed = await request(app.getHttpServer())
      .get(doctorPayloadUrl(ctx.customerA.personId, ctx.artifactId))
      .set(ctx.auth(doctor.token))
      .set('X-Request-Id', `r9c-allow-${suffix}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body.payload.results[0].value).toBe('14');

    const revoke = await request(app.getHttpServer())
      .post(`/api/v1/consent/grants/${grant.body.id}/revoke`)
      .set(ctx.auth(ctx.customerA.token));
    expect(revoke.status).toBe(200);

    const deniedAfterRevoke = await request(app.getHttpServer())
      .get(doctorPayloadUrl(ctx.customerA.personId, ctx.artifactId))
      .set(ctx.auth(doctor.token));
    expect(deniedAfterRevoke.status).toBe(403);
    expect(JSON.stringify(deniedAfterRevoke.body)).not.toMatch(/Hemoglobin|"14"/);

    const deniedAudit = await prisma.runWithTenant(authTenantContext(ctx.customerA.personId), () =>
      prisma.healthArtifactAccessAudit.findFirst({
        where: { artifactId: ctx.artifactId, allowed: false, reason: 'consent_revoked' },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(deniedAudit).toBeTruthy();

    const regrant = await request(app.getHttpServer())
      .post('/api/v1/consent/grants')
      .set(ctx.auth(ctx.customerA.token))
      .send({
        recipient_partner_id: partner.id,
        purpose: 'treatment',
        scope: ['LAB_REPORT'],
      });
    expect(regrant.status).toBe(200);

    const allowedAgain = await request(app.getHttpServer())
      .get(doctorPayloadUrl(ctx.customerA.personId, ctx.artifactId))
      .set(ctx.auth(doctor.token));
    expect(allowedAgain.status).toBe(200);
    expect(allowedAgain.body.payload.results[0].value).toBe('14');
  });

  it('denies scope mismatch, expired consent, wrong doctor, and malformed scope', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const ctx = await publishLabHealthArtifactFixture(app, prisma, orgs, suffix, (email, audience) =>
      signIn(app, email, audience),
    );
    const doctor = await signIn(app, `r9c-doc-scope-${suffix}@example.com`, 'doctor');
    const otherDoctor = await signIn(app, `r9c-doc-other-${suffix}@example.com`, 'doctor');
    const partner = await seedDoctorPartner(prisma, ctx.country.id, doctor, suffix);
    const otherPartner = await seedDoctorPartner(prisma, ctx.country.id, otherDoctor, suffix);
    await ensureClinicalRelationship(prisma, ctx.country.id, ctx.customerA.personId, partner.id);

    const imagingOnly = await request(app.getHttpServer())
      .post('/api/v1/consent/grants')
      .set(ctx.auth(ctx.customerA.token))
      .send({
        recipient_partner_id: partner.id,
        purpose: 'treatment',
        scope: ['IMAGING_REPORT'],
      });
    expect(imagingOnly.status).toBe(200);

    const scopeDenied = await request(app.getHttpServer())
      .get(doctorPayloadUrl(ctx.customerA.personId, ctx.artifactId))
      .set(ctx.auth(doctor.token));
    expect(scopeDenied.status).toBe(403);
    expect(scopeDenied.body.detail).toMatch(/does not cover/i);

    await request(app.getHttpServer())
      .post(`/api/v1/consent/grants/${imagingOnly.body.id}/revoke`)
      .set(ctx.auth(ctx.customerA.token));

    const labGrant = await request(app.getHttpServer())
      .post('/api/v1/consent/grants')
      .set(ctx.auth(ctx.customerA.token))
      .send({
        recipient_partner_id: partner.id,
        purpose: 'treatment',
        scope: ['LAB_REPORT'],
      });
    expect(labGrant.status).toBe(200);

    await prisma.consentGrant.update({
      where: { id: labGrant.body.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const expiredDenied = await request(app.getHttpServer())
      .get(doctorPayloadUrl(ctx.customerA.personId, ctx.artifactId))
      .set(ctx.auth(doctor.token));
    expect(expiredDenied.status).toBe(403);
    expect(expiredDenied.body.detail).toMatch(/expired/i);

    await prisma.consentGrant.update({
      where: { id: labGrant.body.id },
      data: { expiresAt: null, status: ConsentGrantStatus.ACTIVE },
    });

    const wrongDoctor = await request(app.getHttpServer())
      .get(doctorPayloadUrl(ctx.customerA.personId, ctx.artifactId))
      .set(ctx.auth(otherDoctor.token));
    expect(wrongDoctor.status).toBe(403);

    const malformedScope = await request(app.getHttpServer())
      .post('/api/v1/consent/grants')
      .set(ctx.auth(ctx.customerA.token))
      .send({
        recipient_partner_id: otherPartner.id,
        purpose: 'treatment',
        scope: ['NOT_A_REAL_TYPE'],
      });
    expect(malformedScope.status).toBe(400);

    const unsupportedPurpose = await request(app.getHttpServer())
      .post('/api/v1/consent/grants')
      .set(ctx.auth(ctx.customerA.token))
      .send({
        recipient_partner_id: partner.id,
        purpose: 'invalid-purpose',
        scope: ['LAB_REPORT'],
      });
    expect(unsupportedPurpose.status).toBe(400);

    const telemedicineDenied = await request(app.getHttpServer())
      .get(
        `/api/v1/health/patients/${ctx.customerA.personId}/artifacts/${ctx.artifactId}/payload?country_code=XX&purpose=telemedicine`,
      )
      .set(ctx.auth(doctor.token));
    expect(telemedicineDenied.status).toBe(400);
  });

  it('patient self-read remains allowed without doctor consent', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const ctx = await publishLabHealthArtifactFixture(app, prisma, orgs, suffix, (email, audience) =>
      signIn(app, email, audience),
    );
    const payload = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${ctx.artifactId}/payload?country_code=XX`)
      .set(ctx.auth(ctx.customerA.token));
    expect(payload.status).toBe(200);
    expect(payload.body.payload.results[0].value).toBe('14');
  });
});
