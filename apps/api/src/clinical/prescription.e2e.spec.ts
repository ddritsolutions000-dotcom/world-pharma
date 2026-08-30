import { INestApplication } from '@nestjs/common';
import {
  ClinicalRelationshipKind,
  ClinicalRelationshipStatus,
  ConsentGrantStatus,
  EncounterStatus,
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
import { NullERxAdapter } from './null-erx.adapter';
import { PrescriptionService } from './prescription.service';

async function signIn(
  app: INestApplication,
  email: string,
  audience: 'admin' | 'customer' | 'doctor' = 'customer',
) {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  expect(requested.status).toBeLessThan(400);
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience });
  expect(verified.status).toBe(200);
  expect(verified.body.person_id).toBeTruthy();
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

describe('R5-A/B prescription foundation + prescribing UX contracts (e2e)', () => {
  jest.setTimeout(120_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let countryId: string;
  let countryCode: string;
  let pairA: Awaited<ReturnType<typeof seedDoctorPatient>>;
  let pairB: Awaited<ReturnType<typeof seedDoctorPatient>>;
  let adminToken: string;
  /** Monotonic slot counter for non-overlapping appointment windows across seeds. */
  let appointmentSeq = 0;

  const sampleLines = [
    {
      clinical_concept_code: 'concept.paracetamol',
      clinical_concept_label: 'Paracetamol clinical concept',
      dosage_instructions: '1 tablet every 6 hours',
      quantity_authorized: '20',
      quantity_unit: 'tablet',
    },
  ];

  async function seedDoctorPatient(tag: string) {
    // Unique emails every suite invocation (uuidv7().slice(0,8) alone can collide ~65s across runs).
    const customer = await signIn(app, `rx-${tag}-cus@example.com`, 'customer');
    const doctor = await signIn(app, `rx-${tag}-doc@example.com`, 'doctor');
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
    } else if (partner.status !== PartnerStatus.ACTIVE) {
      partner = await prisma.partner.update({
        where: { id: partner.id },
        data: { status: PartnerStatus.ACTIVE, activatedAt: new Date() },
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
          displayName: 'Rx Doctor',
          professionalName: 'Dr Rx',
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
    // Unique emails prevent profile reuse across suite runs. Slot spacing keeps
    // pairA/pairB non-overlapping if the same doctor were ever reused.
    const slotMs = 31 * 60_000;
    const startsAt = new Date(Date.now() + 3_600_000 + appointmentSeq * slotMs);
    appointmentSeq += 1;
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
        status: EncounterStatus.STARTED,
        startedAt: new Date(),
      },
    });
    return { customer, doctor, partner, profile, encounter };
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
    doc.healthcare.rx_prescribe_enabled = true;
    doc.healthcare.rx_amend_enabled = true;
    doc.healthcare.rx_allowed_restriction_codes = ['PACK_ALLOWED'];
    countryCode = 'RZ';
    let country = await prisma.country.findUnique({ where: { isoAlpha2: countryCode } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: countryCode,
          isoAlpha3: 'RZX',
          nameI18n: { en: 'Rx test' },
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
          checksum: 'rx-test',
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

    // Match dispensing/rx-handoff: wall-clock + uuid (short uuidv7 prefix alone can collide ~65s).
    const suffix = `${Date.now().toString(36)}-${uuidv7().replace(/-/g, '').slice(0, 12)}`;
    pairA = await seedDoctorPatient(`a${suffix}`);
    pairB = await seedDoctorPatient(`b${suffix}`);

    const adminEmail = `rx-admin-${suffix}@example.com`;
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
    adminToken = admin.token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('covers create/issue/amend/isolation/consent/pack/restriction/idempotency/commerce/admin/erx', async () => {
    const beforeCatalog = await prisma.catalogItem.count();
    const beforeOrders = await prisma.order.count();
    const beforePayments = await prisma.paymentIntent.count();
    const beforeShipments = await prisma.shipment.count();
    const beforeLots = await prisma.inventoryLot.count();
    const beforeJournals = await prisma.journal.count();

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/doctor/prescriptions')
      .set('Authorization', `Bearer ${pairA.doctor.token}`)
      .set('Idempotency-Key', `create-${uuidv7()}`)
      .send({ encounter_id: pairA.encounter.id, lines: sampleLines });
    expect(createRes.status).toBe(200);
    expect(createRes.body.status).toBe(PrescriptionStatus.DRAFT);
    expect(createRes.body.versions[0].version_number).toBe(1);
    expect(createRes.body.commerce).toEqual({
      order: false,
      payment: false,
      shipment: false,
      inventory: false,
      finance: false,
    });
    const rxId = createRes.body.id as string;

    const issueRes = await request(app.getHttpServer())
      .post(`/api/v1/doctor/prescriptions/${rxId}/issue`)
      .set('Authorization', `Bearer ${pairA.doctor.token}`)
      .set('Idempotency-Key', `issue-${uuidv7()}`)
      .send({});
    expect(issueRes.status).toBe(200);
    expect(issueRes.body.status).toBe(PrescriptionStatus.ISSUED);
    expect(issueRes.body.versions[0].sealed_at).toBeTruthy();
    const sealedDosage = issueRes.body.versions[0].lines[0].dosage_instructions as string;

    const amendRes = await request(app.getHttpServer())
      .post(`/api/v1/doctor/prescriptions/${rxId}/amend`)
      .set('Authorization', `Bearer ${pairA.doctor.token}`)
      .set('Idempotency-Key', `amend-${uuidv7()}`)
      .send({
        lines: [
          {
            ...sampleLines[0],
            dosage_instructions: '1 tablet every 8 hours',
            quantity_authorized: '30',
          },
        ],
      });
    expect(amendRes.status).toBe(200);
    expect(amendRes.body.versions).toHaveLength(2);
    expect(amendRes.body.current_version_number).toBe(2);
    expect(amendRes.body.versions[0].lines[0].dosage_instructions).toBe(sealedDosage);

    const illegal = await request(app.getHttpServer())
      .post(`/api/v1/doctor/prescriptions/${rxId}/issue`)
      .set('Authorization', `Bearer ${pairA.doctor.token}`)
      .set('Idempotency-Key', `issue-again-${uuidv7()}`)
      .send({});
    expect(illegal.status).toBe(409);

    const otherPatient = await request(app.getHttpServer())
      .get(`/api/v1/customer/prescriptions/${rxId}`)
      .set('Authorization', `Bearer ${pairB.customer.token}`);
    expect(otherPatient.status).toBe(404);

    const otherDoctor = await request(app.getHttpServer())
      .get(`/api/v1/doctor/prescriptions/${rxId}`)
      .set('Authorization', `Bearer ${pairB.doctor.token}`);
    expect(otherDoctor.status).toBe(404);

    const self = await request(app.getHttpServer())
      .get(`/api/v1/customer/prescriptions/${rxId}`)
      .set('Authorization', `Bearer ${pairA.customer.token}`);
    expect(self.status).toBe(200);

    await prisma.consentGrant.updateMany({
      where: { subjectPersonId: pairB.customer.personId, recipientPartnerId: pairB.partner.id },
      data: { status: ConsentGrantStatus.REVOKED, revokedAt: new Date() },
    });
    const consentDenied = await request(app.getHttpServer())
      .post('/api/v1/doctor/prescriptions')
      .set('Authorization', `Bearer ${pairB.doctor.token}`)
      .set('Idempotency-Key', `consent-${uuidv7()}`)
      .send({ encounter_id: pairB.encounter.id, lines: sampleLines });
    expect(consentDenied.status).toBe(403);
    await prisma.consentGrant.updateMany({
      where: { subjectPersonId: pairB.customer.personId, recipientPartnerId: pairB.partner.id },
      data: { status: ConsentGrantStatus.ACTIVE, revokedAt: null },
    });

    const restricted = await request(app.getHttpServer())
      .post('/api/v1/doctor/prescriptions')
      .set('Authorization', `Bearer ${pairB.doctor.token}`)
      .set('Idempotency-Key', `ctl-${uuidv7()}`)
      .send({
        encounter_id: pairB.encounter.id,
        lines: [{ ...sampleLines[0], restriction_category_code: 'NOT_ALLOWED' }],
      });
    expect(restricted.status).toBe(403);

    const cache = app.get(PolicyCache);
    const off = emptyPolicyDocument();
    off.partner_types.DOCTOR.enabled = true;
    off.healthcare.consultation_capability = true;
    off.healthcare.rx_prescribe_enabled = false;
    await prisma.policyPack.updateMany({
      where: { countryId, status: PolicyPackStatus.PUBLISHED },
      data: { document: off as never },
    });
    await cache.invalidate(countryCode);
    const packOff = await request(app.getHttpServer())
      .post('/api/v1/doctor/prescriptions')
      .set('Authorization', `Bearer ${pairB.doctor.token}`)
      .set('Idempotency-Key', `pack-${uuidv7()}`)
      .send({ encounter_id: pairB.encounter.id, lines: sampleLines });
    expect(packOff.status).toBeGreaterThanOrEqual(400);
    const restore = emptyPolicyDocument();
    restore.partner_types.DOCTOR.enabled = true;
    restore.healthcare.doctor_onboarding_enabled = true;
    restore.healthcare.consultation_capability = true;
    restore.healthcare.appointments_enabled = true;
    restore.healthcare.rx_prescribe_enabled = true;
    restore.healthcare.rx_amend_enabled = true;
    restore.healthcare.rx_allowed_restriction_codes = ['PACK_ALLOWED'];
    await prisma.policyPack.updateMany({
      where: { countryId, status: PolicyPackStatus.PUBLISHED },
      data: { document: restore as never },
    });
    await cache.invalidate(countryCode);

    const key = `dup-${uuidv7()}`;
    const first = await request(app.getHttpServer())
      .post('/api/v1/doctor/prescriptions')
      .set('Authorization', `Bearer ${pairB.doctor.token}`)
      .set('Idempotency-Key', key)
      .send({ encounter_id: pairB.encounter.id, lines: sampleLines });
    expect(first.status).toBe(200);
    const second = await request(app.getHttpServer())
      .post('/api/v1/doctor/prescriptions')
      .set('Authorization', `Bearer ${pairB.doctor.token}`)
      .set('Idempotency-Key', key)
      .send({ encounter_id: pairB.encounter.id, lines: sampleLines });
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    const missing = await request(app.getHttpServer())
      .post('/api/v1/doctor/prescriptions')
      .set('Authorization', `Bearer ${pairB.doctor.token}`)
      .send({ encounter_id: pairB.encounter.id, lines: sampleLines });
    expect(missing.status).toBe(400);

    expect(await prisma.catalogItem.count()).toBe(beforeCatalog);
    expect(await prisma.order.count()).toBe(beforeOrders);
    expect(await prisma.paymentIntent.count()).toBe(beforePayments);
    expect(await prisma.shipment.count()).toBe(beforeShipments);
    expect(await prisma.inventoryLot.count()).toBe(beforeLots);
    expect(await prisma.journal.count()).toBe(beforeJournals);

    const adminOk = await request(app.getHttpServer())
      .get('/api/v1/admin/prescriptions')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminOk.status).toBe(200);
    expect(adminOk.body.prescriptions[0]).not.toHaveProperty('lines');
    expect(JSON.stringify(adminOk.body)).not.toMatch(/dosage_instructions/);

    const adapter = app.get(NullERxAdapter);
    const erx = await adapter.submit(uuidv7());
    expect(erx.status).toBe('unsupported');
  });

  it('R5-B: context endpoint, customer hides DRAFT, store contract prep, no commerce', async () => {
    const beforeOrders = await prisma.order.count();
    const beforePayments = await prisma.paymentIntent.count();
    const beforeShipments = await prisma.shipment.count();
    const beforeLots = await prisma.inventoryLot.count();

    const ctxRes = await request(app.getHttpServer())
      .get(`/api/v1/doctor/encounters/${pairA.encounter.id}/prescription-context`)
      .set('Authorization', `Bearer ${pairA.doctor.token}`);
    expect(ctxRes.status).toBe(200);
    expect(ctxRes.body.encounter_id).toBe(pairA.encounter.id);
    expect(ctxRes.body.patient_person_id).toBe(pairA.customer.personId);
    expect(ctxRes.body.od_r5b_02_draft_lines_patch).toBe('deferred');
    expect(ctxRes.body).not.toHaveProperty('dosage_instructions');

    const otherCtx = await request(app.getHttpServer())
      .get(`/api/v1/doctor/encounters/${pairA.encounter.id}/prescription-context`)
      .set('Authorization', `Bearer ${pairB.doctor.token}`);
    expect(otherCtx.status).toBe(404);

    const draft = await request(app.getHttpServer())
      .post('/api/v1/doctor/prescriptions')
      .set('Authorization', `Bearer ${pairA.doctor.token}`)
      .set('Idempotency-Key', `r5b-draft-${uuidv7()}`)
      .send({ encounter_id: pairA.encounter.id, lines: sampleLines });
    expect(draft.status).toBe(200);
    expect(draft.body.status).toBe(PrescriptionStatus.DRAFT);
    const draftId = draft.body.id as string;

    const customerList = await request(app.getHttpServer())
      .get('/api/v1/customer/prescriptions')
      .set('Authorization', `Bearer ${pairA.customer.token}`);
    expect(customerList.status).toBe(200);
    expect((customerList.body.prescriptions as Array<{ id: string }>).some((r) => r.id === draftId)).toBe(false);

    const customerGet = await request(app.getHttpServer())
      .get(`/api/v1/customer/prescriptions/${draftId}`)
      .set('Authorization', `Bearer ${pairA.customer.token}`);
    expect(customerGet.status).toBe(404);

    const customerMutate = await request(app.getHttpServer())
      .post('/api/v1/customer/prescriptions')
      .set('Authorization', `Bearer ${pairA.customer.token}`)
      .send({ encounter_id: pairA.encounter.id, lines: sampleLines });
    expect(customerMutate.status).toBeGreaterThanOrEqual(400);

    const noDraftPatch = await request(app.getHttpServer())
      .patch(`/api/v1/doctor/prescriptions/${draftId}/draft-lines`)
      .set('Authorization', `Bearer ${pairA.doctor.token}`)
      .set('Idempotency-Key', `patch-${uuidv7()}`)
      .send({ lines: sampleLines });
    expect(noDraftPatch.status).toBe(404);

    const svc = app.get(PrescriptionService);
    expect(svc.storePreviewContractFields()).toEqual(
      expect.arrayContaining([
        'prescription_id',
        'current_version_id',
        'status',
        'country_id',
        'encounter_id',
        'line_clinical_labels',
        'quantity_authorized',
        'restriction_category_codes',
      ]),
    );

    expect(await prisma.order.count()).toBe(beforeOrders);
    expect(await prisma.paymentIntent.count()).toBe(beforePayments);
    expect(await prisma.shipment.count()).toBe(beforeShipments);
    expect(await prisma.inventoryLot.count()).toBe(beforeLots);
  });
});
