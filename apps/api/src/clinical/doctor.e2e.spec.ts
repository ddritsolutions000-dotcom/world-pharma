import { INestApplication } from '@nestjs/common';
import {
  ClinicalRelationshipKind,
  CredentialReviewStatus,
  OrganizationKind,
  PolicyPackStatus,
} from '@prisma/client';
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

describe('P2-HC-1 doctor / clinical partner foundation (e2e)', () => {
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
    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'DQ' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'DQ',
          isoAlpha3: 'DQQ',
          nameI18n: { en: 'Doctor test' },
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
          checksum: 'doctor-test',
          publishedAt: new Date(),
        },
      });
      await prisma.country.update({
        where: { id: country.id },
        data: { publishedPolicyPackId: pack.id },
      });
    }
    countryId = country.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('covers identity, isolation, consent, policy fail-closed, RBAC, RLS, audit, and events', async () => {
    const closed = await signIn(app, `doc-xx-${Date.now()}@example.com`, 'doctor');
    const xxDenied = await request(app.getHttpServer())
      .post('/api/v1/doctor/applications')
      .set('Authorization', `Bearer ${closed.token}`)
      .send({ country_code: 'XX' });
    expect(xxDenied.status).toBeGreaterThanOrEqual(400);

    const doctorA = await signIn(app, `doc-a-${Date.now()}@example.com`, 'doctor');
    const doctorB = await signIn(app, `doc-b-${Date.now()}@example.com`, 'doctor');
    const patient = await signIn(app, `pat-${Date.now()}@example.com`, 'customer');
    const vendor = await signIn(app, `ven-${Date.now()}@example.com`, 'customer');
    const adminEmail = `adm-${Date.now()}@example.com`;
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

    const joinedA = await request(app.getHttpServer())
      .post('/api/v1/doctor/applications')
      .set('Authorization', `Bearer ${doctorA.token}`)
      .send({ country_code: 'DQ' });
    expect(joinedA.status).toBe(200);
    expect(joinedA.body.partner_id).toBeDefined();
    const partnerA = joinedA.body.partner_id as string;

    const duplicate = await request(app.getHttpServer())
      .post('/api/v1/doctor/applications')
      .set('Authorization', `Bearer ${doctorA.token}`)
      .send({ country_code: 'DQ' });
    expect(duplicate.status).toBeGreaterThanOrEqual(400);

    const joinedB = await request(app.getHttpServer())
      .post('/api/v1/doctor/applications')
      .set('Authorization', `Bearer ${doctorB.token}`)
      .send({ country_code: 'DQ' });
    expect(joinedB.status).toBe(200);

    const secretNumber = 'LIC-SECRET-991122';
    const cred = await request(app.getHttpServer())
      .post('/api/v1/doctor/me/credentials')
      .set('Authorization', `Bearer ${doctorA.token}`)
      .send({
        credential_type: 'professional_registration',
        issuer: 'test-board',
        number: secretNumber,
      });
    expect(cred.status).toBe(200);
    expect(JSON.stringify(cred.body)).not.toContain(secretNumber);
    expect(cred.body.number_masked).toBeDefined();

    const meB = await request(app.getHttpServer())
      .get('/api/v1/doctor/me')
      .set('Authorization', `Bearer ${doctorB.token}`);
    expect(meB.status).toBe(200);
    expect(meB.body.partner_id).not.toBe(partnerA);
    expect(meB.body.credentials ?? []).toHaveLength(0);

    const customerBlocked = await request(app.getHttpServer())
      .get('/api/v1/doctor/me')
      .set('Authorization', `Bearer ${patient.token}`);
    expect(customerBlocked.status).toBeGreaterThanOrEqual(400);

    const vendorMe = await request(app.getHttpServer())
      .get('/api/v1/doctor/me')
      .set('Authorization', `Bearer ${vendor.token}`);
    expect(vendorMe.status).toBeGreaterThanOrEqual(400);

    const vendorAdmin = await request(app.getHttpServer())
      .get('/api/v1/admin/doctors')
      .set('Authorization', `Bearer ${vendor.token}`);
    expect(vendorAdmin.status).toBeGreaterThanOrEqual(400);

    const adminList = await request(app.getHttpServer())
      .get('/api/v1/admin/doctors')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(adminList.status).toBe(200);
    expect(adminList.body.doctors.length).toBeGreaterThan(0);

    const adminDoctor = await request(app.getHttpServer())
      .get(`/api/v1/admin/doctors/${partnerA}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(adminDoctor.status).toBe(200);
    expect(JSON.stringify(adminDoctor.body)).not.toContain(secretNumber);

    const review = await request(app.getHttpServer())
      .post(`/api/v1/admin/doctors/${partnerA}/credentials/${cred.body.id}/review`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: CredentialReviewStatus.ADDITIONAL_INFORMATION_REQUIRED, note: 'need clearer scan' });
    expect(review.status).toBe(200);
    expect(review.body.status).toBe(CredentialReviewStatus.ADDITIONAL_INFORMATION_REQUIRED);

    const clinic = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.CLINIC,
        legalName: 'Test Clinic',
        displayName: 'Test Clinic',
        status: 'ACTIVE',
      },
    });
    const clinicRole = await prisma.role.findUnique({ where: { code: 'clinic_doctor' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: doctorA.personId,
        roleId: clinicRole!.id,
        scope: 'organization',
        organizationId: clinic.id,
        countryId,
        status: 'ACTIVE',
      },
    });
    const orgsA = await request(app.getHttpServer())
      .get('/api/v1/doctor/me/organizations')
      .set('Authorization', `Bearer ${doctorA.token}`);
    expect(orgsA.status).toBe(200);
    expect(orgsA.body.organizations.some((row: { organization_id: string }) => row.organization_id === clinic.id)).toBe(
      true,
    );
    const orgsB = await request(app.getHttpServer())
      .get('/api/v1/doctor/me/organizations')
      .set('Authorization', `Bearer ${doctorB.token}`);
    expect(
      orgsB.body.organizations.some((row: { organization_id: string }) => row.organization_id === clinic.id),
    ).toBe(false);

    const grant = await request(app.getHttpServer())
      .post('/api/v1/consent/grants')
      .set('Authorization', `Bearer ${patient.token}`)
      .send({
        recipient_partner_id: partnerA,
        purpose: 'consultation',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      });
    expect(grant.status).toBe(200);

    const denied = await request(app.getHttpServer())
      .post('/api/v1/clinical/access/evaluate')
      .set('Authorization', `Bearer ${doctorA.token}`)
      .send({ patient_person_id: patient.personId, purpose: 'consultation', country_code: 'DQ' });
    expect(denied.body.allowed).toBe(false);

    const rel = await request(app.getHttpServer())
      .post('/api/v1/admin/clinical/relationships')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        patient_person_id: patient.personId,
        doctor_partner_id: partnerA,
        kind: ClinicalRelationshipKind.CARE,
        organization_id: clinic.id,
      });
    expect(rel.status).toBe(200);

    const allowed = await request(app.getHttpServer())
      .post('/api/v1/clinical/access/evaluate')
      .set('Authorization', `Bearer ${doctorA.token}`)
      .send({ patient_person_id: patient.personId, purpose: 'consultation', country_code: 'DQ' });
    expect(allowed.body.allowed).toBe(true);

    const teleDenied = await request(app.getHttpServer())
      .post('/api/v1/clinical/access/evaluate')
      .set('Authorization', `Bearer ${doctorA.token}`)
      .send({ patient_person_id: patient.personId, purpose: 'telemedicine', country_code: 'DQ' });
    expect(teleDenied.body.allowed).toBe(false);

    await request(app.getHttpServer())
      .post(`/api/v1/consent/grants/${grant.body.id}/revoke`)
      .set('Authorization', `Bearer ${patient.token}`);
    const afterRevoke = await request(app.getHttpServer())
      .post('/api/v1/clinical/access/evaluate')
      .set('Authorization', `Bearer ${doctorA.token}`)
      .send({ patient_person_id: patient.personId, purpose: 'consultation', country_code: 'DQ' });
    expect(afterRevoke.body.allowed).toBe(false);

    const expiredGrant = await request(app.getHttpServer())
      .post('/api/v1/consent/grants')
      .set('Authorization', `Bearer ${patient.token}`)
      .send({
        recipient_partner_id: partnerA,
        purpose: 'consultation',
        expires_at: new Date(Date.now() - 1000).toISOString(),
      });
    expect(expiredGrant.body.status).toBe('EXPIRED');

    const rls = await prisma.$queryRaw<{ relrowsecurity: boolean }[]>`
      SELECT relrowsecurity FROM pg_class WHERE relname = 'doctor_profiles'
    `;
    expect(rls[0]?.relrowsecurity).toBe(true);

    const events = await prisma.outboxEvent.findMany({
      where: { type: { in: ['DOCTOR_PROFILE_CREATED', 'DOCTOR_CREDENTIAL_SUBMITTED', 'CONSENT_GRANTED'] } },
      take: 20,
    });
    expect(JSON.stringify(events)).not.toContain(secretNumber);

    const security = await prisma.securityEvent.findMany({
      where: { type: { in: ['DOCTOR_CREDENTIAL_SUBMITTED', 'CONSENT_GRANTED'] } },
      take: 20,
    });
    expect(JSON.stringify(security)).not.toContain(secretNumber);
  });
});
