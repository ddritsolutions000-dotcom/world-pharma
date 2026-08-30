import { INestApplication } from '@nestjs/common';
import {
  ClinicalRelationshipKind,
  ClinicalRelationshipStatus,
  ConsentGrantStatus,
  EncounterStatus,
  PartnerStatus,
  PolicyPackStatus,
  PrescriptionErxSubmissionStatus,
  PrescriptionStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { ErxSubmissionService } from './erx-submission.service';
import { SandboxERxAdapter } from './sandbox-erx.adapter';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { PolicyCache } from '../policy/cache';
import { applyTestIsolation } from '../test/isolate-runtime';

async function signIn(
  app: INestApplication,
  email: string,
  audience: 'customer' | 'doctor' = 'customer',
) {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  expect(requested.status).toBeLessThan(400);
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience });
  expect(verified.status).toBe(200);
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

describe('R5-F e-Rx submission kernel (e2e)', () => {
  jest.setTimeout(120_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let countryId: string;
  let countryCode: string;
  let doctorPair: Awaited<ReturnType<typeof seedDoctorPatient>>;
  let foreignPair: Awaited<ReturnType<typeof seedDoctorPatient>>;
  let appointmentSeq = 0;
  const priorErxProvider = process.env['ERX_PROVIDER'];

  const sampleLines = [
    {
      clinical_concept_code: 'concept.erx-test',
      clinical_concept_label: 'Erx test concept',
      dosage_instructions: '1 tablet daily',
      quantity_authorized: '30',
      quantity_unit: 'tablet',
    },
  ];

  async function publishPack(overrides: {
    rx_erx_enabled?: boolean;
    rx_erx_provider_code?: string;
  }) {
    const doc = emptyPolicyDocument();
    doc.partner_types.DOCTOR.enabled = true;
    doc.healthcare.doctor_onboarding_enabled = true;
    doc.healthcare.consultation_capability = true;
    doc.healthcare.appointments_enabled = true;
    doc.healthcare.rx_prescribe_enabled = true;
    doc.healthcare.rx_amend_enabled = true;
    doc.healthcare.rx_erx_enabled = overrides.rx_erx_enabled ?? false;
    if (overrides.rx_erx_provider_code) {
      doc.healthcare.rx_erx_provider_code = overrides.rx_erx_provider_code;
    }
    await prisma.policyPack.updateMany({
      where: { countryId, status: PolicyPackStatus.PUBLISHED },
      data: { document: doc as never },
    });
    await app.get(PolicyCache).invalidate(countryCode);
  }

  async function seedDoctorPatient(tag: string, targetCountryId: string) {
    const customer = await signIn(app, `r5f-${tag}-cus@example.com`, 'customer');
    const doctor = await signIn(app, `r5f-${tag}-doc@example.com`, 'doctor');
    let partner = await prisma.partner.findFirst({
      where: { personId: doctor.personId, partnerTypeCode: 'DOCTOR', countryId: targetCountryId },
    });
    if (!partner) {
      partner = await prisma.partner.create({
        data: {
          id: uuidv7(),
          personId: doctor.personId,
          countryId: targetCountryId,
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
          countryId: targetCountryId,
          displayName: `Dr ${tag}`,
          professionalName: `Dr ${tag}`,
        },
      });
    }
    const existingRel = await prisma.clinicalRelationship.findFirst({
      where: { patientPersonId: customer.personId, doctorPartnerId: partner.id, countryId: targetCountryId },
    });
    if (!existingRel) {
      await prisma.clinicalRelationship.create({
        data: {
          id: uuidv7(),
          countryId: targetCountryId,
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
          countryId: targetCountryId,
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
    const slotMs = 31 * 60_000;
    const startsAt = new Date(Date.now() + 3_600_000 + appointmentSeq * slotMs);
    appointmentSeq += 1;
    const appointment = await prisma.appointment.create({
      data: {
        id: uuidv7(),
        countryId: targetCountryId,
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
        countryId: targetCountryId,
        customerPersonId: customer.personId,
        doctorProfileId: profile.id,
        doctorPartnerId: partner.id,
        status: EncounterStatus.STARTED,
        startedAt: new Date(),
      },
    });
    return { customer, doctor, encounter };
  }

  async function issuePrescription(token: string, encounterId: string, idempotencyKey: string) {
    const create = await request(app.getHttpServer())
      .post('/api/v1/doctor/prescriptions')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `create-${idempotencyKey}`)
      .send({ encounter_id: encounterId, lines: sampleLines });
    expect(create.status).toBe(200);
    const issue = await request(app.getHttpServer())
      .post(`/api/v1/doctor/prescriptions/${create.body.id}/issue`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `issue-${idempotencyKey}`)
      .send({});
    expect(issue.status).toBe(200);
    return {
      prescriptionId: create.body.id as string,
      versionId: issue.body.current_version_id as string,
      issueBody: issue.body,
    };
  }

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
    process.env['ERX_PROVIDER'] = 'sandbox';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ProblemFilter());
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    prisma = app.get(PrismaService);

    countryCode = 'RF';
    let country = await prisma.country.findUnique({ where: { isoAlpha2: countryCode } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: countryCode,
          isoAlpha3: 'RFX',
          nameI18n: { en: 'R5-F test' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
          dataResidencyMode: 'shared',
        },
      });
      const doc = emptyPolicyDocument();
      doc.partner_types.DOCTOR.enabled = true;
      doc.healthcare.rx_prescribe_enabled = true;
      doc.healthcare.rx_amend_enabled = true;
      const pack = await prisma.policyPack.create({
        data: {
          id: uuidv7(),
          countryId: country.id,
          version: 1,
          status: PolicyPackStatus.PUBLISHED,
          document: doc as never,
          checksum: 'r5f-test',
          publishedAt: new Date(),
        },
      });
      await prisma.country.update({
        where: { id: country.id },
        data: { publishedPolicyPackId: pack.id },
      });
    }
    countryId = country.id;
    await publishPack({ rx_erx_enabled: false });

    const suffix = `${Date.now().toString(36)}-${uuidv7().replace(/-/g, '').slice(0, 12)}`;
    doctorPair = await seedDoctorPatient(`a${suffix}`, countryId);

    const foreignCountry =
      (await prisma.country.findUnique({ where: { isoAlpha2: 'FG' } })) ??
      (await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'FG',
          isoAlpha3: 'FGX',
          nameI18n: { en: 'Foreign' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
          dataResidencyMode: 'shared',
        },
      }));
    const foreignDoc = emptyPolicyDocument();
    foreignDoc.partner_types.DOCTOR.enabled = true;
    foreignDoc.healthcare.doctor_onboarding_enabled = true;
    foreignDoc.healthcare.consultation_capability = true;
    foreignDoc.healthcare.appointments_enabled = true;
    foreignDoc.healthcare.rx_prescribe_enabled = true;
    foreignDoc.healthcare.rx_amend_enabled = true;
    foreignDoc.healthcare.rx_erx_enabled = true;
    foreignDoc.healthcare.rx_erx_provider_code = 'sandbox';
    const foreignPackExisting = await prisma.policyPack.findFirst({
      where: { countryId: foreignCountry.id, status: PolicyPackStatus.PUBLISHED },
    });
    if (!foreignPackExisting) {
      const pack = await prisma.policyPack.create({
        data: {
          id: uuidv7(),
          countryId: foreignCountry.id,
          version: 1,
          status: PolicyPackStatus.PUBLISHED,
          document: foreignDoc as never,
          checksum: 'r5f-foreign',
          publishedAt: new Date(),
        },
      });
      await prisma.country.update({
        where: { id: foreignCountry.id },
        data: { publishedPolicyPackId: pack.id },
      });
    } else {
      await prisma.policyPack.update({
        where: { id: foreignPackExisting.id },
        data: { document: foreignDoc as never },
      });
    }
    await app.get(PolicyCache).invalidate('FG');
    foreignPair = await seedDoctorPatient(`f${suffix}`, foreignCountry.id);
  });

  afterAll(async () => {
    if (priorErxProvider === undefined) {
      delete process.env['ERX_PROVIDER'];
    } else {
      process.env['ERX_PROVIDER'] = priorErxProvider;
    }
    await app.close();
  });

  it('skips e-Rx submission when pack rx_erx_enabled is false', async () => {
    await publishPack({ rx_erx_enabled: false });
    const before = await prisma.prescriptionErxSubmission.count();
    const { versionId } = await issuePrescription(
      doctorPair.doctor.token,
      doctorPair.encounter.id,
      `off-${uuidv7()}`,
    );
    const after = await prisma.prescriptionErxSubmission.count();
    expect(after).toBe(before);
    const row = await prisma.prescriptionErxSubmission.findUnique({ where: { prescriptionVersionId: versionId } });
    expect(row).toBeNull();
  });

  it('records UNSUPPORTED when rx_erx_enabled without provider code', async () => {
    await publishPack({ rx_erx_enabled: true });
    const { versionId } = await issuePrescription(
      doctorPair.doctor.token,
      doctorPair.encounter.id,
      `no-provider-${uuidv7()}`,
    );
    const row = await prisma.prescriptionErxSubmission.findUniqueOrThrow({
      where: { prescriptionVersionId: versionId },
    });
    expect(row.status).toBe(PrescriptionErxSubmissionStatus.UNSUPPORTED);
    expect(row.reasonCode).toBe('pack_provider_code_missing');
    const outbox = await prisma.outboxEvent.findFirst({
      where: { occurrenceKey: `PRESCRIPTION_ERX_UNSUPPORTED:${versionId}` },
    });
    expect(outbox).toBeTruthy();
  });

  it('records UNSUPPORTED when runtime ERX_PROVIDER is absent', async () => {
    await publishPack({ rx_erx_enabled: true, rx_erx_provider_code: 'sandbox' });
    const prev = process.env['ERX_PROVIDER'];
    delete process.env['ERX_PROVIDER'];
    try {
      const { versionId } = await issuePrescription(
        doctorPair.doctor.token,
        doctorPair.encounter.id,
        `no-runtime-${uuidv7()}`,
      );
      const row = await prisma.prescriptionErxSubmission.findUniqueOrThrow({
        where: { prescriptionVersionId: versionId },
      });
      expect(row.status).toBe(PrescriptionErxSubmissionStatus.UNSUPPORTED);
      expect(row.reasonCode).toBe('runtime_provider_not_configured');
    } finally {
      process.env['ERX_PROVIDER'] = prev ?? 'sandbox';
    }
  });

  it('submits through sandbox adapter when pack and runtime align', async () => {
    process.env['ERX_PROVIDER'] = 'sandbox';
    await publishPack({ rx_erx_enabled: true, rx_erx_provider_code: 'sandbox' });
    const key = `ok-${uuidv7()}`;
    const { versionId, prescriptionId } = await issuePrescription(
      doctorPair.doctor.token,
      doctorPair.encounter.id,
      key,
    );
    const row = await prisma.prescriptionErxSubmission.findUniqueOrThrow({
      where: { prescriptionVersionId: versionId },
    });
    expect(row.status).toBe(PrescriptionErxSubmissionStatus.SUBMITTED);
    expect(row.providerCode).toBe('sandbox');
    expect(row.providerRef).toMatch(/^sandbox\.erx\./);
    expect(row.attemptCount).toBe(1);
    const submittedOutbox = await prisma.outboxEvent.findFirst({
      where: { occurrenceKey: `PRESCRIPTION_ERX_SUBMITTED:${versionId}` },
    });
    expect(submittedOutbox).toBeTruthy();
    const audit = await prisma.securityEvent.findFirst({
      where: { type: 'PRESCRIPTION_ERX_SUBMITTED', personId: doctorPair.doctor.personId },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).toBeTruthy();
  });

  it('is idempotent per prescription version on duplicate service calls', async () => {
    process.env['ERX_PROVIDER'] = 'sandbox';
    await publishPack({ rx_erx_enabled: true, rx_erx_provider_code: 'sandbox' });
    const { versionId, prescriptionId } = await issuePrescription(
      doctorPair.doctor.token,
      doctorPair.encounter.id,
      `idem-${uuidv7()}`,
    );
    const svc = app.get(ErxSubmissionService);
    const sandbox = app.get(SandboxERxAdapter);
    const submitSpy = jest.spyOn(sandbox, 'submit');
    const first = await svc.submitForIssuedVersion({
      prescriptionVersionId: versionId,
      prescriptionId,
      countryId,
      countryCode,
      actorPersonId: doctorPair.doctor.personId,
    });
    const second = await svc.submitForIssuedVersion({
      prescriptionVersionId: versionId,
      prescriptionId,
      countryId,
      countryCode,
      actorPersonId: doctorPair.doctor.personId,
    });
    expect(first!.id).toBe(second!.id);
    expect(submitSpy).not.toHaveBeenCalled();
    submitSpy.mockRestore();
    expect(await prisma.prescriptionErxSubmission.count({ where: { prescriptionVersionId: versionId } })).toBe(1);
  });

  it('rejects unauthorized customer prescription mutation', async () => {
    const mutate = await request(app.getHttpServer())
      .post('/api/v1/customer/prescriptions')
      .set('Authorization', `Bearer ${doctorPair.customer.token}`)
      .send({ encounter_id: doctorPair.encounter.id, lines: sampleLines });
    expect(mutate.status).toBeGreaterThanOrEqual(400);
  });

  it('isolates e-Rx submissions by country tenant', async () => {
    process.env['ERX_PROVIDER'] = 'sandbox';
    await publishPack({ rx_erx_enabled: true, rx_erx_provider_code: 'sandbox' });
    const local = await issuePrescription(doctorPair.doctor.token, doctorPair.encounter.id, `iso-local-${uuidv7()}`);
    const foreign = await issuePrescription(
      foreignPair.doctor.token,
      foreignPair.encounter.id,
      `iso-foreign-${uuidv7()}`,
    );
    const localRow = await prisma.prescriptionErxSubmission.findUniqueOrThrow({
      where: { prescriptionVersionId: local.versionId },
    });
    const foreignRow = await prisma.prescriptionErxSubmission.findUniqueOrThrow({
      where: { prescriptionVersionId: foreign.versionId },
    });
    expect(localRow.countryId).toBe(countryId);
    expect(foreignRow.countryId).not.toBe(countryId);
  });

  it('creates a new submission row when amended version is sealed', async () => {
    process.env['ERX_PROVIDER'] = 'sandbox';
    await publishPack({ rx_erx_enabled: true, rx_erx_provider_code: 'sandbox' });
    const key = `amend-${uuidv7()}`;
    const create = await request(app.getHttpServer())
      .post('/api/v1/doctor/prescriptions')
      .set('Authorization', `Bearer ${doctorPair.doctor.token}`)
      .set('Idempotency-Key', `create-${key}`)
      .send({ encounter_id: doctorPair.encounter.id, lines: sampleLines });
    const rxId = create.body.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/doctor/prescriptions/${rxId}/issue`)
      .set('Authorization', `Bearer ${doctorPair.doctor.token}`)
      .set('Idempotency-Key', `issue-${key}`)
      .send({});
    const amend = await request(app.getHttpServer())
      .post(`/api/v1/doctor/prescriptions/${rxId}/amend`)
      .set('Authorization', `Bearer ${doctorPair.doctor.token}`)
      .set('Idempotency-Key', `amend-${key}`)
      .send({
        lines: [
          {
            ...sampleLines[0],
            dosage_instructions: '2 tablets daily',
            quantity_authorized: '60',
          },
        ],
      });
    expect(amend.status).toBe(200);
    const versionId = amend.body.current_version_id as string;
    const row = await prisma.prescriptionErxSubmission.findUniqueOrThrow({
      where: { prescriptionVersionId: versionId },
    });
    expect(row.status).toBe(PrescriptionErxSubmissionStatus.SUBMITTED);
    expect(await prisma.prescriptionErxSubmission.count({ where: { prescriptionId: rxId } })).toBe(2);
  });

  it('cancels submitted sandbox e-Rx when prescription is cancelled', async () => {
    process.env['ERX_PROVIDER'] = 'sandbox';
    await publishPack({ rx_erx_enabled: true, rx_erx_provider_code: 'sandbox' });
    const key = `cancel-${uuidv7()}`;
    const create = await request(app.getHttpServer())
      .post('/api/v1/doctor/prescriptions')
      .set('Authorization', `Bearer ${doctorPair.doctor.token}`)
      .set('Idempotency-Key', `create-${key}`)
      .send({ encounter_id: doctorPair.encounter.id, lines: sampleLines });
    const rxId = create.body.id as string;
    const issue = await request(app.getHttpServer())
      .post(`/api/v1/doctor/prescriptions/${rxId}/issue`)
      .set('Authorization', `Bearer ${doctorPair.doctor.token}`)
      .set('Idempotency-Key', `issue-${key}`)
      .send({});
    const versionId = issue.body.current_version_id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/doctor/prescriptions/${rxId}/cancel`)
      .set('Authorization', `Bearer ${doctorPair.doctor.token}`)
      .set('Idempotency-Key', `cancel-${key}`)
      .send({});
    const row = await prisma.prescriptionErxSubmission.findUniqueOrThrow({
      where: { prescriptionVersionId: versionId },
    });
    expect(row.status).toBe(PrescriptionErxSubmissionStatus.CANCELLED);
    expect(row.cancelledAt).toBeTruthy();
  });
});
