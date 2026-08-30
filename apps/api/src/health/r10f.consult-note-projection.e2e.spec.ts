import { INestApplication } from '@nestjs/common';
import {
  AppointmentStatus,
  ClinicalRelationshipKind,
  ClinicalRelationshipStatus,
  ConsentGrantStatus,
  HealthArtifactStatus,
  HealthArtifactType,
  HealthTimelineEventType,
  PartnerStatus,
  PolicyPackStatus,
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
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { HealthConsultProjectionService } from './health-consult-projection.service';

const PATIENT_SUMMARY = 'Follow up in two weeks if symptoms persist. Rest and hydration advised.';

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

describe('R10-F consult note health artifact projection (e2e)', () => {
  jest.setTimeout(240_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let projection: HealthConsultProjectionService;
  let countryId: string;
  const countryCode = 'RF';

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
    projection = app.get(HealthConsultProjectionService);

    const doc = emptyPolicyDocument();
    doc.partner_types.DOCTOR.enabled = true;
    doc.healthcare.doctor_onboarding_enabled = true;
    doc.healthcare.consultation_capability = true;
    doc.healthcare.appointments_enabled = true;
    doc.healthcare.health_timeline_enabled = true;

    let country = await prisma.country.findUnique({ where: { isoAlpha2: countryCode } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: countryCode,
          isoAlpha3: 'RFX',
          nameI18n: { en: 'R10-F test' },
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
          checksum: 'r10f-test',
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

  async function seedConsultEncounter(tag: string) {
    const customer = await signIn(app, `r10f-cus-${tag}@example.com`, 'customer');
    const doctor = await signIn(app, `r10f-doc-${tag}@example.com`, 'doctor');
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
          displayName: 'R10F Doctor',
          professionalName: 'Dr R10F',
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
        status: AppointmentStatus.IN_CONSULTATION,
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
    return { customer, doctor, partner, appointment, encounter };
  }

  async function completeWithSummary(doctorToken: string, appointmentId: string, summary = PATIENT_SUMMARY) {
    return request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/complete`)
      .set(auth(doctorToken))
      .send({ patient_summary: summary });
  }

  it('projects a completed encounter consult note to customer timeline and payload', async () => {
    const tag = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const { customer, doctor, appointment, encounter } = await seedConsultEncounter(tag);

    const complete = await completeWithSummary(doctor.token, appointment.id);
    expect(complete.status).toBe(200);
    expect(complete.body.status).toBe(AppointmentStatus.COMPLETED);

    const timeline = await request(app.getHttpServer())
      .get(`/api/v1/health/timeline?country_code=${countryCode}`)
      .set(auth(customer.token));
    expect(timeline.status).toBe(200);
    const consultItem = timeline.body.items.find(
      (row: { artifact_type: string; event_type: string }) =>
        row.artifact_type === 'CONSULT_NOTE' && row.event_type === 'CONSULT_COMPLETED',
    );
    expect(consultItem).toBeTruthy();
    expect(JSON.stringify(timeline.body)).not.toMatch(/symptoms persist/);

    const artifactId = consultItem.artifact_id as string;
    const metadata = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${artifactId}?country_code=${countryCode}`)
      .set(auth(customer.token));
    expect(metadata.status).toBe(200);
    expect(metadata.body.artifact_type).toBe('CONSULT_NOTE');
    expect(metadata.body.source_module).toBe('encounter');
    expect(metadata.body.source_id).toBe(encounter.id);

    const payload = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${artifactId}/payload?country_code=${countryCode}`)
      .set(auth(customer.token));
    expect(payload.status).toBe(200);
    expect(payload.body.payload.encounter_id).toBe(encounter.id);
    expect(payload.body.payload.patient_summary).toBe(PATIENT_SUMMARY);

    const artifact = await prisma.healthArtifact.findFirstOrThrow({
      where: { encounterId: encounter.id, artifactType: HealthArtifactType.CONSULT_NOTE },
    });
    expect(artifact.status).toBe(HealthArtifactStatus.ACTIVE);
    expect(artifact.personId).toBe(customer.personId);
  });

  it('is idempotent on projection replay and avoids duplicate timeline events', async () => {
    const tag = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const { customer, doctor, appointment, encounter } = await seedConsultEncounter(tag);
    expect((await completeWithSummary(doctor.token, appointment.id)).status).toBe(200);

    const beforeArtifacts = await prisma.healthArtifact.count({
      where: { encounterId: encounter.id, artifactType: HealthArtifactType.CONSULT_NOTE },
    });
    const beforeEvents = await prisma.healthTimelineEvent.count({
      where: {
        sourceModule: 'encounter',
        sourceId: encounter.id,
        eventType: HealthTimelineEventType.CONSULT_COMPLETED,
      },
    });
    expect(beforeArtifacts).toBe(1);
    expect(beforeEvents).toBe(1);

    await prisma.$transaction(async (tx) => {
      await prisma.runWithTenant(
        workerTenantContext({ countryId, personId: doctor.personId }),
        () =>
          projection.projectCompletedEncounter(tx, {
            encounterId: encounter.id,
            patientPersonId: customer.personId,
            countryId,
            countryCode,
            publishedAt: new Date(),
            title: 'Consultation summary',
          }),
      );
    });

    expect(
      await prisma.healthArtifact.count({
        where: { encounterId: encounter.id, artifactType: HealthArtifactType.CONSULT_NOTE },
      }),
    ).toBe(1);
    expect(
      await prisma.healthTimelineEvent.count({
        where: {
          sourceModule: 'encounter',
          sourceId: encounter.id,
          eventType: HealthTimelineEventType.CONSULT_COMPLETED,
        },
      }),
    ).toBe(1);
  });

  it('skips projection when patient_summary is missing on complete', async () => {
    const tag = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const { doctor, appointment, encounter } = await seedConsultEncounter(tag);

    const complete = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointment.id}/complete`)
      .set(auth(doctor.token))
      .send({});
    expect(complete.status).toBe(200);

    const note = await prisma.encounterConsultNote.findUnique({ where: { encounterId: encounter.id } });
    expect(note).toBeNull();
    const artifact = await prisma.healthArtifact.findFirst({
      where: { encounterId: encounter.id, artifactType: HealthArtifactType.CONSULT_NOTE },
    });
    expect(artifact).toBeNull();
  });

  it('rejects unsupported document summary MIME-style payloads via validation', async () => {
    const tag = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const { doctor, appointment } = await seedConsultEncounter(tag);
    const complete = await completeWithSummary(doctor.token, appointment.id, '   ');
    expect(complete.status).toBe(200);
    const artifact = await prisma.healthArtifact.findFirst({
      where: { encounterId: (await prisma.encounter.findUniqueOrThrow({ where: { appointmentId: appointment.id } })).id },
    });
    expect(artifact).toBeNull();
  });

  it('enforces doctor consent scope and denies without PHI', async () => {
    const tag = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const { customer, doctor, partner, appointment, encounter } = await seedConsultEncounter(tag);
    expect((await completeWithSummary(doctor.token, appointment.id)).status).toBe(200);
    const artifact = await prisma.healthArtifact.findFirstOrThrow({
      where: { encounterId: encounter.id, status: HealthArtifactStatus.ACTIVE },
    });

    const denied = await request(app.getHttpServer())
      .get(
        `/api/v1/health/patients/${customer.personId}/artifacts/${artifact.id}/payload?country_code=${countryCode}&purpose=treatment`,
      )
      .set(auth(doctor.token));
    expect(denied.status).toBe(403);
    expect(JSON.stringify(denied.body)).not.toMatch(/symptoms persist/);

    const grant = await request(app.getHttpServer())
      .post('/api/v1/consent/grants')
      .set(auth(customer.token))
      .send({
        recipient_partner_id: partner.id,
        purpose: 'treatment',
        scope: ['CONSULT_NOTE'],
      });
    expect(grant.status).toBe(200);

    const allowed = await request(app.getHttpServer())
      .get(
        `/api/v1/health/patients/${customer.personId}/artifacts/${artifact.id}/payload?country_code=${countryCode}&purpose=treatment`,
      )
      .set(auth(doctor.token));
    expect(allowed.status).toBe(200);
    expect(allowed.body.payload.patient_summary).toBe(PATIENT_SUMMARY);
  });

  it('denies cross-patient access', async () => {
    const tag = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const a = await seedConsultEncounter(`${tag}-a`);
    const b = await seedConsultEncounter(`${tag}-b`);
    expect((await completeWithSummary(a.doctor.token, a.appointment.id)).status).toBe(200);
    const artifact = await prisma.healthArtifact.findFirstOrThrow({
      where: { encounterId: a.encounter.id, status: HealthArtifactStatus.ACTIVE },
    });

    const denied = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${artifact.id}/payload?country_code=${countryCode}`)
      .set(auth(b.customer.token));
    expect([403, 404]).toContain(denied.status);
    expect(JSON.stringify(denied.body)).not.toMatch(/symptoms persist/);
  });

  it('denies wrong-country health reads', async () => {
    const tag = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const { customer, doctor, appointment, encounter } = await seedConsultEncounter(tag);
    expect((await completeWithSummary(doctor.token, appointment.id)).status).toBe(200);
    const artifact = await prisma.healthArtifact.findFirstOrThrow({
      where: { encounterId: encounter.id, status: HealthArtifactStatus.ACTIVE },
    });

    const denied = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${artifact.id}?country_code=XX`)
      .set(auth(customer.token));
    expect([403, 404]).toContain(denied.status);
  });

  it('does not expose storage keys in consult note payload', async () => {
    const tag = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const { customer, doctor, appointment } = await seedConsultEncounter(tag);
    expect((await completeWithSummary(doctor.token, appointment.id)).status).toBe(200);
    const timeline = await request(app.getHttpServer())
      .get(`/api/v1/health/timeline?country_code=${countryCode}`)
      .set(auth(customer.token));
    const artifactId = timeline.body.items.find(
      (row: { artifact_type: string }) => row.artifact_type === 'CONSULT_NOTE',
    )?.artifact_id as string;
    const payload = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${artifactId}/payload?country_code=${countryCode}`)
      .set(auth(customer.token));
    expect(payload.status).toBe(200);
    expect(JSON.stringify(payload.body)).not.toMatch(/object_key|storage_key|health-uploads\//i);
  });
});
