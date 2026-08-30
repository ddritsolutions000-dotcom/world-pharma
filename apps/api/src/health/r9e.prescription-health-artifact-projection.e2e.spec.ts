import { INestApplication } from '@nestjs/common';
import {
  ClinicalRelationshipKind,
  ClinicalRelationshipStatus,
  ConsentGrantStatus,
  HealthArtifactStatus,
  HealthArtifactType,
  PartnerStatus,
  PolicyPackStatus,
  PrescriptionStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { PolicyCache } from '../policy/cache';
import { applyTestIsolation } from '../test/isolate-runtime';
import { authTenantContext } from '../tenancy/build-tenant-context';

const sampleLines = [
  {
    clinical_concept_code: 'concept.paracetamol',
    clinical_concept_label: 'Paracetamol clinical concept',
    dosage_instructions: '1 tablet every 6 hours',
    quantity_authorized: '20',
    quantity_unit: 'tablet',
  },
];

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

describe('R9-E prescription health artifact projection (e2e)', () => {
  jest.setTimeout(240_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let countryId: string;
  const countryCode = 'RE';

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
    doc.healthcare.health_timeline_enabled = true;
    doc.healthcare.rx_prescribe_enabled = true;
    doc.healthcare.rx_amend_enabled = true;
    doc.healthcare.rx_allowed_restriction_codes = ['PACK_ALLOWED'];

    let country = await prisma.country.findUnique({ where: { isoAlpha2: countryCode } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: countryCode,
          isoAlpha3: 'REX',
          nameI18n: { en: 'R9-E test' },
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
          checksum: 'r9e-test',
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
    countryId = country.id;
    await app.get(PolicyCache).invalidate(countryCode);
  });

  afterAll(async () => {
    await app.close();
  });

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  async function seedEncounter(tag: string) {
    const customer = await signIn(app, `r9e-cus-${tag}@example.com`, 'customer');
    const doctor = await signIn(app, `r9e-doc-${tag}@example.com`, 'doctor');
    let partner = await prisma.partner.findFirst({
      where: { personId: doctor.personId, partnerTypeCode: 'DOCTOR', countryId },
    });
    if (!partner) {
      partner = await prisma.partner.create({
        data: {
          id: uuidv7(),
          personId: doctor.personId,
          countryId,
          partnerTypeCode: 'DOCTOR',
          status: PartnerStatus.ACTIVE,
          activatedAt: new Date(),
        },
      });
    }
    let profile = await prisma.doctorProfile.findUnique({ where: { partnerId: partner.id } });
    if (!profile) {
      profile = await prisma.doctorProfile.create({
        data: {
          id: uuidv7(),
          partnerId: partner.id,
          personId: doctor.personId,
          countryId,
          displayName: 'R9E Doctor',
          professionalName: 'Dr R9E',
        },
      });
    }
    const existingRel = await prisma.clinicalRelationship.findFirst({
      where: { patientPersonId: customer.personId, doctorPartnerId: partner.id, countryId },
    });
    if (!existingRel) {
      await prisma.clinicalRelationship.create({
        data: {
          id: uuidv7(),
          countryId,
          patientPersonId: customer.personId,
          doctorPartnerId: partner.id,
          kind: ClinicalRelationshipKind.CARE,
          status: ClinicalRelationshipStatus.ACTIVE,
        },
      });
    }
    const existingConsent = await prisma.consentGrant.findFirst({
      where: {
        subjectPersonId: customer.personId,
        recipientPartnerId: partner.id,
        purpose: 'consultation',
        status: ConsentGrantStatus.ACTIVE,
      },
    });
    if (!existingConsent) {
      await prisma.consentGrant.create({
        data: {
          id: uuidv7(),
          countryId,
          subjectPersonId: customer.personId,
          recipientPartnerId: partner.id,
          purpose: 'consultation',
          scope: {},
          status: ConsentGrantStatus.ACTIVE,
          grantedAt: new Date(),
          grantedByPersonId: customer.personId,
        },
      });
    }
    const startsAt = new Date(Date.now() + 3_600_000);
    const appointment = await prisma.appointment.create({
      data: {
        id: uuidv7(),
        countryId,
        customerPersonId: customer.personId,
        doctorProfileId: profile.id,
        doctorPartnerId: partner.id,
        type: 'ONLINE',
        status: 'CHECKED_IN',
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        timezone: 'UTC',
      },
    });
    const encounter = await prisma.encounter.create({
      data: {
        id: uuidv7(),
        appointmentId: appointment.id,
        countryId,
        customerPersonId: customer.personId,
        doctorProfileId: profile.id,
        doctorPartnerId: partner.id,
        status: 'STARTED',
        startedAt: new Date(),
      },
    });
    return { customer, doctor, partner, encounter };
  }

  async function issuePrescription(doctorToken: string, encounterId: string) {
    const create = await request(app.getHttpServer())
      .post('/api/v1/doctor/prescriptions')
      .set(auth(doctorToken))
      .set('Idempotency-Key', `r9e-create-${uuidv7()}`)
      .send({ encounter_id: encounterId, lines: sampleLines });
    expect(create.status).toBe(200);
    const issue = await request(app.getHttpServer())
      .post(`/api/v1/doctor/prescriptions/${create.body.id}/issue`)
      .set(auth(doctorToken))
      .set('Idempotency-Key', `r9e-issue-${uuidv7()}`);
    expect(issue.status).toBe(200);
    expect(issue.body.status).toBe(PrescriptionStatus.ISSUED);
    return { prescriptionId: create.body.id as string, versionId: issue.body.current_version_id as string };
  }

  it('projects issued prescription to customer timeline and payload', async () => {
    const tag = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const { customer, doctor, encounter } = await seedEncounter(tag);
    const { prescriptionId } = await issuePrescription(doctor.token, encounter.id);

    const timeline = await request(app.getHttpServer())
      .get(`/api/v1/health/timeline?country_code=${countryCode}`)
      .set(auth(customer.token));
    expect(timeline.status).toBe(200);
    const rxItem = timeline.body.items.find(
      (row: { artifact_type: string }) => row.artifact_type === 'PRESCRIPTION_STRUCTURED',
    );
    expect(rxItem).toBeTruthy();
    expect(JSON.stringify(timeline.body)).not.toMatch(/Paracetamol|every 6 hours/);

    const artifactId = rxItem.artifact_id as string;
    const metadata = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${artifactId}?country_code=${countryCode}`)
      .set(auth(customer.token));
    expect(metadata.status).toBe(200);
    expect(metadata.body.artifact_type).toBe('PRESCRIPTION_STRUCTURED');
    expect(metadata.body.source_module).toBe('clinical');

    const payload = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${artifactId}/payload?country_code=${countryCode}`)
      .set(auth(customer.token));
    expect(payload.status).toBe(200);
    expect(payload.body.payload.lines[0].clinical_concept_label).toMatch(/Paracetamol/);

    const artifacts = await prisma.runWithTenant(authTenantContext(customer.personId), () =>
      prisma.healthArtifact.findMany({
        where: { prescriptionId, artifactType: HealthArtifactType.PRESCRIPTION_STRUCTURED },
      }),
    );
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.status).toBe(HealthArtifactStatus.ACTIVE);
  });

  it('is idempotent on re-issue projection and supersedes on amend', async () => {
    const tag = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const { customer, doctor, encounter } = await seedEncounter(tag);
    const { prescriptionId } = await issuePrescription(doctor.token, encounter.id);

    const before = await prisma.healthArtifact.count({
      where: { prescriptionId, artifactType: HealthArtifactType.PRESCRIPTION_STRUCTURED },
    });
    expect(before).toBe(1);

    const amend = await request(app.getHttpServer())
      .post(`/api/v1/doctor/prescriptions/${prescriptionId}/amend`)
      .set(auth(doctor.token))
      .set('Idempotency-Key', `r9e-amend-${uuidv7()}`)
      .send({
        lines: [
          {
            ...sampleLines[0],
            clinical_concept_label: 'Amended Paracetamol concept',
            dosage_instructions: '2 tablets every 8 hours',
          },
        ],
      });
    expect(amend.status).toBe(200);
    expect(amend.body.current_version_number).toBe(2);

    const artifacts = await prisma.runWithTenant(authTenantContext(customer.personId), () =>
      prisma.healthArtifact.findMany({
        where: { prescriptionId, artifactType: HealthArtifactType.PRESCRIPTION_STRUCTURED },
        orderBy: { publishedAt: 'asc' },
      }),
    );
    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]?.status).toBe(HealthArtifactStatus.SUPERSEDED);
    expect(artifacts[1]?.status).toBe(HealthArtifactStatus.ACTIVE);

    const timeline = await request(app.getHttpServer())
      .get(`/api/v1/health/timeline?country_code=${countryCode}`)
      .set(auth(customer.token));
    const activeRx = timeline.body.items.filter(
      (row: { artifact_type: string }) => row.artifact_type === 'PRESCRIPTION_STRUCTURED',
    );
    expect(activeRx).toHaveLength(1);
    expect(activeRx[0].artifact_id).toBe(artifacts[1]?.id);

    const payload = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${artifacts[1]!.id}/payload?country_code=${countryCode}`)
      .set(auth(customer.token));
    expect(payload.body.payload.lines[0].dosage_instructions).toBe('2 tablets every 8 hours');
  });

  it('enforces doctor consent scope and denies without PHI', async () => {
    const tag = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const { customer, doctor, partner, encounter } = await seedEncounter(tag);
    const { prescriptionId } = await issuePrescription(doctor.token, encounter.id);
    const artifact = await prisma.healthArtifact.findFirstOrThrow({
      where: { prescriptionId, status: HealthArtifactStatus.ACTIVE },
    });

    const denied = await request(app.getHttpServer())
      .get(
        `/api/v1/health/patients/${customer.personId}/artifacts/${artifact.id}/payload?country_code=${countryCode}&purpose=treatment`,
      )
      .set(auth(doctor.token));
    expect(denied.status).toBe(403);
    expect(JSON.stringify(denied.body)).not.toMatch(/Paracetamol|every 6 hours/);

    const grant = await request(app.getHttpServer())
      .post('/api/v1/consent/grants')
      .set(auth(customer.token))
      .send({
        recipient_partner_id: partner.id,
        purpose: 'treatment',
        scope: ['PRESCRIPTION_STRUCTURED'],
      });
    expect(grant.status).toBe(200);

    const allowed = await request(app.getHttpServer())
      .get(
        `/api/v1/health/patients/${customer.personId}/artifacts/${artifact.id}/payload?country_code=${countryCode}&purpose=treatment`,
      )
      .set(auth(doctor.token));
    expect(allowed.status).toBe(200);
    expect(allowed.body.payload.lines[0].clinical_concept_label).toMatch(/Paracetamol/);

    await request(app.getHttpServer())
      .post(`/api/v1/consent/grants/${grant.body.id}/revoke`)
      .set(auth(customer.token));

    const revoked = await request(app.getHttpServer())
      .get(
        `/api/v1/health/patients/${customer.personId}/artifacts/${artifact.id}/payload?country_code=${countryCode}&purpose=treatment`,
      )
      .set(auth(doctor.token));
    expect(revoked.status).toBe(403);
    expect(JSON.stringify(revoked.body)).not.toMatch(/Paracetamol|every 6 hours/);
  });

  it('denies cross-patient access', async () => {
    const tag = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const a = await seedEncounter(`${tag}-a`);
    const b = await seedEncounter(`${tag}-b`);
    const { prescriptionId } = await issuePrescription(a.doctor.token, a.encounter.id);
    const artifact = await prisma.healthArtifact.findFirstOrThrow({
      where: { prescriptionId, status: HealthArtifactStatus.ACTIVE },
    });

    const denied = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${artifact.id}/payload?country_code=${countryCode}`)
      .set(auth(b.customer.token));
    expect([403, 404]).toContain(denied.status);
    expect(JSON.stringify(denied.body)).not.toMatch(/Paracetamol/);
  });
});
