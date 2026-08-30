import { INestApplication } from '@nestjs/common';
import { ClinicalRelationshipStatus, ConsentGrantStatus } from '@prisma/client';
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

describe('R9-D doctor health workflow (e2e)', () => {
  jest.setTimeout(240_000);
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

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  function timelineUrl(patientPersonId: string) {
    return `/api/v1/health/patients/${patientPersonId}/timeline?country_code=XX&purpose=treatment`;
  }

  function metadataUrl(patientPersonId: string, artifactId: string) {
    return `/api/v1/health/patients/${patientPersonId}/artifacts/${artifactId}?country_code=XX&purpose=treatment`;
  }

  function payloadUrl(patientPersonId: string, artifactId: string) {
    return `/api/v1/health/patients/${patientPersonId}/artifacts/${artifactId}/payload?country_code=XX&purpose=treatment`;
  }

  async function seedDoctorContext(suffix: string) {
    const ctx = await publishLabHealthArtifactFixture(app, prisma, orgs, suffix, (email, audience) =>
      signIn(app, email, audience),
    );
    const doctor = await signIn(app, `r9d-doc-${suffix}@example.com`, 'doctor');
    const partner = await seedDoctorPartner(prisma, ctx.country.id, doctor, suffix);
    await ensureClinicalRelationship(prisma, ctx.country.id, ctx.customerA.personId, partner.id);
    return { ctx, doctor, partner };
  }

  it('complete doctor flow: discover patient → timeline → metadata → payload → revoke blocks access', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const { ctx, doctor } = await seedDoctorContext(suffix);

    const patients = await request(app.getHttpServer())
      .get('/api/v1/doctor/me/health-patients?country_code=XX')
      .set(auth(doctor.token));
    expect(patients.status).toBe(200);
    expect(patients.body.patients.some((row: { patient_person_id: string }) => row.patient_person_id === ctx.customerA.personId)).toBe(true);

    const deniedTimeline = await request(app.getHttpServer())
      .get(timelineUrl(ctx.customerA.personId))
      .set(auth(doctor.token));
    expect(deniedTimeline.status).toBe(403);

    const grant = await request(app.getHttpServer())
      .post('/api/v1/consent/grants')
      .set(auth(ctx.customerA.token))
      .send({
        recipient_partner_id: (await prisma.partner.findFirstOrThrow({
          where: { personId: doctor.personId, partnerTypeCode: 'DOCTOR' },
        })).id,
        purpose: 'treatment',
        scope: ['LAB_REPORT'],
      });
    expect(grant.status).toBe(200);

    const timeline = await request(app.getHttpServer()).get(timelineUrl(ctx.customerA.personId)).set(auth(doctor.token));
    expect(timeline.status).toBe(200);
    expect(timeline.body.items.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(timeline.body)).not.toMatch(/Hemoglobin|"14"/);

    const metadata = await request(app.getHttpServer())
      .get(metadataUrl(ctx.customerA.personId, ctx.artifactId))
      .set(auth(doctor.token));
    expect(metadata.status).toBe(200);
    expect(metadata.body.artifact_type).toBe('LAB_REPORT');
    expect(metadata.body.payload_available).toBe(true);

    const payload = await request(app.getHttpServer())
      .get(payloadUrl(ctx.customerA.personId, ctx.artifactId))
      .set(auth(doctor.token))
      .set('X-Request-Id', `r9d-flow-${suffix}`);
    expect(payload.status).toBe(200);
    expect(payload.body.payload.results[0].value).toBe('14');

    const allowedAudit = await prisma.runWithTenant(authTenantContext(ctx.customerA.personId), () =>
      prisma.healthArtifactAccessAudit.findFirst({
        where: { artifactId: ctx.artifactId, allowed: true, actorPersonId: doctor.personId },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(allowedAudit).toBeTruthy();

    await request(app.getHttpServer())
      .post(`/api/v1/consent/grants/${grant.body.id}/revoke`)
      .set(auth(ctx.customerA.token));

    const deniedPayload = await request(app.getHttpServer())
      .get(payloadUrl(ctx.customerA.personId, ctx.artifactId))
      .set(auth(doctor.token));
    expect(deniedPayload.status).toBe(403);
    expect(JSON.stringify(deniedPayload.body)).not.toMatch(/Hemoglobin|"14"/);

    const deniedAudit = await prisma.runWithTenant(authTenantContext(ctx.customerA.personId), () =>
      prisma.healthArtifactAccessAudit.findFirst({
        where: { artifactId: ctx.artifactId, allowed: false, reason: 'consent_revoked' },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(deniedAudit).toBeTruthy();

    await request(app.getHttpServer())
      .post('/api/v1/consent/grants')
      .set(auth(ctx.customerA.token))
      .send({
        recipient_partner_id: grant.body.recipient_partner_id,
        purpose: 'treatment',
        scope: ['LAB_REPORT'],
      });

    const payloadAgain = await request(app.getHttpServer())
      .get(payloadUrl(ctx.customerA.personId, ctx.artifactId))
      .set(auth(doctor.token));
    expect(payloadAgain.status).toBe(200);
  });

  it('denies unauthorized actors and consent failures without PHI', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const { ctx, doctor, partner } = await seedDoctorContext(suffix);
    const otherDoctor = await signIn(app, `r9d-other-${suffix}@example.com`, 'doctor');
    await seedDoctorPartner(prisma, ctx.country.id, otherDoctor, `other-${suffix}`);
    const customerB = ctx.customerB;

    const unauth = await request(app.getHttpServer()).get(payloadUrl(ctx.customerA.personId, ctx.artifactId));
    expect(unauth.status).toBe(401);

    const customerDenied = await request(app.getHttpServer())
      .get(payloadUrl(ctx.customerA.personId, ctx.artifactId))
      .set(auth(ctx.customerA.token));
    expect(customerDenied.status).toBe(403);

    const grant = await request(app.getHttpServer())
      .post('/api/v1/consent/grants')
      .set(auth(ctx.customerA.token))
      .send({ recipient_partner_id: partner.id, purpose: 'treatment', scope: ['IMAGING_REPORT'] });
    expect(grant.status).toBe(200);

    const scopeDenied = await request(app.getHttpServer())
      .get(payloadUrl(ctx.customerA.personId, ctx.artifactId))
      .set(auth(doctor.token));
    expect(scopeDenied.status).toBe(403);
    expect(JSON.stringify(scopeDenied.body)).not.toMatch(/Hemoglobin|"14"/);

    await request(app.getHttpServer())
      .post(`/api/v1/consent/grants/${grant.body.id}/revoke`)
      .set(auth(ctx.customerA.token));

    const labGrant = await request(app.getHttpServer())
      .post('/api/v1/consent/grants')
      .set(auth(ctx.customerA.token))
      .send({ recipient_partner_id: partner.id, purpose: 'treatment', scope: ['LAB_REPORT'] });

    const wrongDoctor = await request(app.getHttpServer())
      .get(payloadUrl(ctx.customerA.personId, ctx.artifactId))
      .set(auth(otherDoctor.token));
    expect(wrongDoctor.status).toBe(403);

    const wrongPurpose = await request(app.getHttpServer())
      .get(
        `/api/v1/health/patients/${ctx.customerA.personId}/artifacts/${ctx.artifactId}/payload?country_code=XX&purpose=telemedicine`,
      )
      .set(auth(doctor.token));
    expect(wrongPurpose.status).toBe(400);

    await prisma.consentGrant.update({
      where: { id: labGrant.body.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const expired = await request(app.getHttpServer())
      .get(payloadUrl(ctx.customerA.personId, ctx.artifactId))
      .set(auth(doctor.token));
    expect(expired.status).toBe(403);
    expect(expired.body.detail).toMatch(/expired/i);

    await prisma.clinicalRelationship.updateMany({
      where: { doctorPartnerId: partner.id, patientPersonId: ctx.customerA.personId },
      data: { status: ClinicalRelationshipStatus.ENDED },
    });
    await prisma.consentGrant.update({
      where: { id: labGrant.body.id },
      data: { expiresAt: null, status: ConsentGrantStatus.ACTIVE },
    });
    const inactiveRel = await request(app.getHttpServer())
      .get(payloadUrl(ctx.customerA.personId, ctx.artifactId))
      .set(auth(doctor.token));
    expect(inactiveRel.status).toBe(403);

    await prisma.clinicalRelationship.updateMany({
      where: { doctorPartnerId: partner.id, patientPersonId: ctx.customerA.personId },
      data: { status: ClinicalRelationshipStatus.ACTIVE },
    });

    const foreignArtifact = await request(app.getHttpServer())
      .get(payloadUrl(customerB.personId, ctx.artifactId))
      .set(auth(doctor.token));
    expect([403, 404]).toContain(foreignArtifact.status);
    expect(JSON.stringify(foreignArtifact.body)).not.toMatch(/Hemoglobin|"14"/);

    const badPatient = await request(app.getHttpServer())
      .get(payloadUrl('not-a-uuid', ctx.artifactId))
      .set(auth(doctor.token));
    expect(badPatient.status).toBeGreaterThanOrEqual(400);
  });

  it('preserves patient self-access after doctor consent revoke', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const { ctx, doctor, partner } = await seedDoctorContext(suffix);
    const grant = await request(app.getHttpServer())
      .post('/api/v1/consent/grants')
      .set(auth(ctx.customerA.token))
      .send({ recipient_partner_id: partner.id, purpose: 'treatment', scope: ['LAB_REPORT'] });
    expect(grant.status).toBe(200);

    await request(app.getHttpServer())
      .post(`/api/v1/consent/grants/${grant.body.id}/revoke`)
      .set(auth(ctx.customerA.token));

    const doctorDenied = await request(app.getHttpServer())
      .get(payloadUrl(ctx.customerA.personId, ctx.artifactId))
      .set(auth(doctor.token));
    expect(doctorDenied.status).toBe(403);

    const patientPayload = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${ctx.artifactId}/payload?country_code=XX`)
      .set(auth(ctx.customerA.token));
    expect(patientPayload.status).toBe(200);
    expect(patientPayload.body.payload.results[0].value).toBe('14');
  });
});
