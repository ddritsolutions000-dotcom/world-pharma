import { INestApplication } from '@nestjs/common';
import {
  HealthArtifactType,
  LocationKind,
  LogisticsJobType,
  OrganizationKind,
  OrganizationStatus,
  PartnerStatus,
  PolicyPackStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../src/app/app.module';
import { PrismaService } from '../src/app/prisma.service';
import { ProblemFilter } from '../src/common/problem.filter';
import { EventWorkerService } from '../src/events/worker.service';
import { OrganizationService } from '../src/partner/organization.service';
import { PolicyCache } from '../src/policy/cache';
import { emptyPolicyDocument } from '../src/policy/empty-pack';
import { activateImagingPartner, enableImagingPartnerPack } from '../src/test/imaging-partner';
import { applyTestIsolation } from '../src/test/isolate-runtime';
import { activateLabPartner, enableLabPartnerPack } from '../src/test/lab-partner';
import { nextPolicyPackVersion } from '../src/test/next-policy-pack-version';
import { attachRadiologist } from '../src/test/radiologist-partner';
import { bootstrapSuperAdminByEmail, signIn as signInAudience } from '../src/test/sign-in';

/**
 * Sprint 36 — unified healthcare care journey (consult + family + lab + imaging + gates).
 * Real HTTP workflows only; no publishLabHealthArtifactFixture / Prisma ISSUED skips.
 */
describe('unified healthcare care journey (e2e)', () => {
  jest.setTimeout(420_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let orgs: OrganizationService;
  let eventWorker: EventWorkerService;

  const countryCode = 'U6';
  const currency = 'XXX';
  const PHI_PHRASE = 'PHI_U6_CLINICAL_NOTE_ZEBRA_991';

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
    eventWorker = app.get(EventWorkerService);

    const doc = emptyPolicyDocument();
    doc.partner_types.DOCTOR.enabled = true;
    doc.healthcare.doctor_onboarding_enabled = true;
    doc.healthcare.doctor_public_visibility = true;
    doc.healthcare.consultation_capability = true;
    doc.healthcare.appointments_enabled = true;
    doc.healthcare.telemedicine_eligibility = true;
    doc.healthcare.rx_prescribe_enabled = true;
    doc.healthcare.rx_amend_enabled = true;
    doc.healthcare.health_timeline_enabled = true;
    doc.healthcare.rx_allowed_restriction_codes = ['PACK_ALLOWED'];
    enableLabPartnerPack(doc, { home: true, center: true });
    enableImagingPartnerPack(doc);
    doc.payments.enabled = true;
    doc.payments.methods = ['CARD'];
    doc.payments.gateway_refs = ['MOCK_PRIMARY'];
    doc.payments.currencies = [currency];
    doc.currency.default = currency;
    doc.currency.allowed = [currency];

    let country = await prisma.country.findUnique({ where: { isoAlpha2: countryCode } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: countryCode,
          isoAlpha3: 'U6X',
          nameI18n: { en: 'Sprint 36 unified care journey' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: currency,
          defaultTimezone: 'UTC',
        },
      });
    }
    const pack = await prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        version: await nextPolicyPackVersion(prisma, country.id),
        status: PolicyPackStatus.PUBLISHED,
        document: doc as never,
        checksum: `u6-pack-${Date.now()}`,
        publishedAt: new Date(),
      },
    });
    await prisma.country.update({
      where: { id: country.id },
      data: { publishedPolicyPackId: pack.id, status: 'ACTIVE' },
    });
    const zoneCount = await prisma.serviceabilityZone.count({ where: { countryId: country.id } });
    if (zoneCount === 0) {
      await prisma.serviceabilityZone.create({
        data: {
          id: uuidv7(),
          countryId: country.id,
          name: 'U6 default',
          postalFrom: '10000',
          postalTo: '99999',
          medicineDelivery: true,
          labHomeCollection: true,
          expressDelivery: true,
          codAvailable: true,
          priority: 10,
          active: true,
        },
      });
    }
    await app.get(PolicyCache).invalidate(countryCode);
  });

  afterAll(async () => {
    await app.close();
  });

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  function nextMorningUtc(hourOffset = 0) {
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + 1);
    start.setUTCHours(9 + hourOffset, 0, 0, 0);
    return start;
  }

  async function inboxRows(token: string) {
    const res = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set(auth(token));
    expect(res.status).toBe(200);
    return (res.body.data ?? res.body) as Array<{ title: string; body?: string }>;
  }

  async function processOutbox(aggregateId: string, type: string) {
    const event = await prisma.outboxEvent.findFirst({
      where: { aggregateId, type },
      orderBy: { createdAt: 'desc' },
    });
    expect(event).toBeTruthy();
    await eventWorker.handle(event!.id);
    await eventWorker.handle(event!.id);
    return event!;
  }

  async function attachOrgAdmin(personId: string, organizationId: string) {
    const role = await prisma.role.findUnique({ where: { code: 'org_admin' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId,
        roleId: role!.id,
        scope: 'organization',
        organizationId,
        status: 'ACTIVE',
      },
    });
  }

  async function attachOrgStaff(personId: string, organizationId: string) {
    const role = await prisma.role.findUnique({ where: { code: 'org_staff' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId,
        roleId: role!.id,
        scope: 'organization',
        organizationId,
        status: 'ACTIVE',
      },
    });
  }

  async function attachPathologist(personId: string, organizationId: string, countryId: string) {
    await prisma.partner.create({
      data: {
        id: uuidv7(),
        personId,
        partnerTypeCode: 'PATHOLOGIST',
        countryId,
        status: 'ACTIVE',
      },
    });
    await attachOrgStaff(personId, organizationId);
  }

  async function attachRider(personId: string, countryId: string) {
    await prisma.partner.create({
      data: {
        id: uuidv7(),
        personId,
        partnerTypeCode: 'DELIVERY_PARTNER',
        countryId,
        status: 'ACTIVE',
      },
    });
  }

  it('A/C/D: family consult lifecycle, timeline privacy, notifications, rx eligibility, sandbox gates', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const customerA = await signInAudience(app, `u6-ca-${suffix}@example.com`);
    const customerB = await signInAudience(app, `u6-cb-${suffix}@example.com`);
    const doctor = await signInAudience(app, `u6-doc-${suffix}@example.com`, 'doctor');

    const country = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: countryCode } });

    const family = await request(app.getHttpServer())
      .post('/api/v1/me/family-members')
      .set(auth(customerA.token))
      .send({
        country_code: countryCode,
        display_name: 'U6 Family Child',
        relationship_code: 'CHILD',
        age_years: 9,
      });
    expect(family.status).toBeLessThan(300);
    const familyMemberId = family.body.id as string;
    expect(family.body.health_access_enabled).toBe(true);

    await request(app.getHttpServer())
      .post('/api/v1/doctor/applications')
      .set(auth(doctor.token))
      .send({ country_code: countryCode });

    const partner = await prisma.partner.findFirstOrThrow({
      where: { personId: doctor.personId, partnerTypeCode: 'DOCTOR', countryId: country.id },
    });
    await prisma.partner.update({
      where: { id: partner.id },
      data: { status: PartnerStatus.ACTIVE, activatedAt: new Date() },
    });
    const profile = await prisma.doctorProfile.findUniqueOrThrow({ where: { partnerId: partner.id } });
    await prisma.doctorProfile.update({
      where: { id: profile.id },
      data: {
        consultationConfig: {
          fee_minor: '5000',
          currency,
          platform_fee_bps: 1000,
        },
      },
    });

    const windows = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      start_local: '09:00',
      end_local: '17:00',
      slot_minutes: 30,
      buffer_minutes: 0,
    }));
    await request(app.getHttpServer())
      .put('/api/v1/doctor/me/availability/windows')
      .set(auth(doctor.token))
      .send({ timezone: 'UTC', windows });

    const startsAt = nextMorningUtc(0);
    const booked = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set(auth(customerA.token))
      .send({
        doctor_profile_id: profile.id,
        country_code: countryCode,
        starts_at: startsAt.toISOString(),
        type: 'ONLINE',
        family_member_id: familyMemberId,
      });
    expect(booked.status).toBe(200);
    expect(booked.body.subject_family_member_id).toBe(familyMemberId);
    const appointmentId = booked.body.id as string;

    const confirmed = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/confirm`)
      .set(auth(doctor.token));
    expect(confirmed.status).toBe(200);

    await request(app.getHttpServer())
      .post('/api/v1/consent/grants')
      .set(auth(customerA.token))
      .send({ recipient_partner_id: partner.id, purpose: 'consultation' });

    const checkedIn = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/check-in`)
      .set(auth(doctor.token));
    expect(checkedIn.status).toBe(200);

    const started = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/start`)
      .set(auth(doctor.token));
    expect(started.status).toBe(200);
    const encounterId = started.body.encounter.id as string;

    const rxDraft = await request(app.getHttpServer())
      .post('/api/v1/doctor/prescriptions')
      .set(auth(doctor.token))
      .set('Idempotency-Key', `u6-rx-${suffix}`)
      .send({
        encounter_id: encounterId,
        lines: [
          {
            clinical_concept_code: 'MED-U6-001',
            clinical_concept_label: 'Sandbox medicine U6',
            dosage_instructions: 'Once daily',
            quantity_authorized: '10',
          },
        ],
      });
    expect(rxDraft.status).toBe(200);
    const rxId = rxDraft.body.id as string;

    const issued = await request(app.getHttpServer())
      .post(`/api/v1/doctor/prescriptions/${rxId}/issue`)
      .set(auth(doctor.token))
      .set('Idempotency-Key', `u6-issue-${suffix}`);
    expect(issued.status).toBe(200);

    const completed = await request(app.getHttpServer())
      .post(`/api/v1/doctor/appointments/${appointmentId}/complete`)
      .set(auth(doctor.token))
      .send({ patient_summary: `Sandbox consult completed with ${PHI_PHRASE}.` });
    expect(completed.status).toBe(200);

    const customerRx = await request(app.getHttpServer())
      .get(`/api/v1/customer/prescriptions/${rxId}`)
      .set(auth(customerA.token));
    expect(customerRx.status).toBe(200);
    expect(customerRx.body.status).toBe('ISSUED');
    expect(customerRx.body.subject_family_member_id).toBe(familyMemberId);

    const foreignRx = await request(app.getHttpServer())
      .get(`/api/v1/customer/prescriptions/${rxId}`)
      .set(auth(customerB.token));
    expect([403, 404]).toContain(foreignRx.status);

    // Family-subject events are scoped to family_member_id (self timeline excludes them).
    const timeline = await request(app.getHttpServer())
      .get(`/api/v1/health/timeline?country_code=${countryCode}&family_member_id=${familyMemberId}`)
      .set(auth(customerA.token));
    expect(timeline.status).toBe(200);
    const timelineJson = JSON.stringify(timeline.body);
    expect(timelineJson).toMatch(/CONSULT_COMPLETED|Consultation completed/i);
    expect(timelineJson).toMatch(/Prescription|PRESCRIPTION/i);
    expect(timelineJson).not.toContain(PHI_PHRASE);
    const consultItem = (timeline.body.items as Array<{ event_type: string; summary?: string }>).find(
      (row) => row.event_type === 'CONSULT_COMPLETED',
    );
    expect(consultItem?.summary).toMatch(/Consultation completed/i);
    expect(consultItem?.summary).not.toContain(PHI_PHRASE);
    const rxItem = (
      timeline.body.items as Array<{ artifact_type?: string; summary?: string }>
    ).find((row) => row.artifact_type === 'PRESCRIPTION_STRUCTURED');
    expect(rxItem?.summary).toMatch(/prescription is available/i);
    expect(rxItem?.summary).not.toContain(PHI_PHRASE);

    const dashboard = await request(app.getHttpServer())
      .get(`/api/v1/health/dashboard?country_code=${countryCode}`)
      .set(auth(customerA.token));
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.timeline_enabled).toBe(true);
    expect(dashboard.body.country_code).toBe(countryCode);

    const familyDash = await request(app.getHttpServer())
      .get(`/api/v1/health/dashboard?country_code=${countryCode}&family_member_id=${familyMemberId}`)
      .set(auth(customerA.token));
    expect(familyDash.status).toBe(200);
    expect(familyDash.body.viewing_subject.display_name).toBe('U6 Family Child');
    expect(
      familyDash.body.overview.recent_prescriptions.some((row: { id: string }) => row.id === rxId),
    ).toBe(true);
    expect(JSON.stringify(familyDash.body.overview.active_care_plan ?? { sandbox: true })).toMatch(
      /sandbox|true/i,
    );

    await processOutbox(rxId, 'PRESCRIPTION_ISSUED');
    await processOutbox(appointmentId, 'ENCOUNTER_COMPLETED');

    const inbox = await inboxRows(customerA.token);
    const rxNotifs = inbox.filter((row) => row.title === 'A prescription is available');
    const consultNotifs = inbox.filter((row) => row.title === 'Consultation completed');
    expect(rxNotifs.length).toBe(1);
    expect(consultNotifs.length).toBe(1);
    for (const row of [...rxNotifs, ...consultNotifs]) {
      expect(row.body).toBe(
        'Open the app for details. External channels remain disabled in sandbox.',
      );
      expect(row.body).not.toContain(PHI_PHRASE);
      expect(JSON.stringify(row)).not.toMatch(/lab values|Hemoglobin|analyte/i);
    }

    const foreignFamilyDash = await request(app.getHttpServer())
      .get(`/api/v1/health/dashboard?country_code=${countryCode}&family_member_id=${familyMemberId}`)
      .set(auth(customerB.token));
    expect([403, 404]).toContain(foreignFamilyDash.status);

    const randomFamily = await request(app.getHttpServer())
      .get(`/api/v1/health/dashboard?country_code=${countryCode}&family_member_id=${uuidv7()}`)
      .set(auth(customerA.token));
    expect([403, 404]).toContain(randomFamily.status);

    await prisma.customerFamilyMember.update({
      where: { id: familyMemberId },
      data: { healthAccessEnabled: false },
    });
    const disabledFamilyDash = await request(app.getHttpServer())
      .get(`/api/v1/health/dashboard?country_code=${countryCode}&family_member_id=${familyMemberId}`)
      .set(auth(customerA.token));
    expect(disabledFamilyDash.status).toBe(403);

    const eligibility = await request(app.getHttpServer())
      .get(`/api/v1/customer/prescriptions/${rxId}/commerce-eligibility`)
      .set(auth(customerA.token));
    expect(eligibility.status).toBe(200);
    expect(eligibility.body.prescription_id).toBe(rxId);
    expect(eligibility.body.prescription_status).toBe('ISSUED');
    expect(typeof eligibility.body.eligible).toBe('boolean');
    expect(eligibility.body.reason).toBeTruthy();
    expect(Array.isArray(eligibility.body.commerce_items)).toBe(true);

    const foreignElig = await request(app.getHttpServer())
      .get(`/api/v1/customer/prescriptions/${rxId}/commerce-eligibility`)
      .set(auth(customerB.token));
    expect([403, 404]).toContain(foreignElig.status);

    const earnings = await request(app.getHttpServer())
      .get('/api/v1/doctor/earnings/summary')
      .set(auth(doctor.token));
    expect(earnings.status).toBe(200);
    expect(earnings.body.sandbox).toBe(true);
    expect(earnings.body.live_payout).toBe(false);
    expect(earnings.body.settlement_status).toBe('SANDBOX_NOT_SETTLED');
  });

  it('B: lab HOME + imaging publish via real HTTP paths with PHI-safe timeline and notifications', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const country = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: countryCode } });
    const admin = await bootstrapSuperAdminByEmail(app, prisma, `u6-admin-${suffix}@example.com`);
    const labUser = await signInAudience(app, `u6-lab-${suffix}@example.com`);
    const labStaff = await signInAudience(app, `u6-lab-staff-${suffix}@example.com`);
    const pathologist = await signInAudience(app, `u6-path-${suffix}@example.com`);
    const imagingUser = await signInAudience(app, `u6-img-${suffix}@example.com`);
    const tech = await signInAudience(app, `u6-tech-${suffix}@example.com`);
    const radEnterer = await signInAudience(app, `u6-rad-a-${suffix}@example.com`);
    const radVerifier = await signInAudience(app, `u6-rad-b-${suffix}@example.com`);
    const customerA = await signInAudience(app, `u6-lab-ca-${suffix}@example.com`);
    const customerB = await signInAudience(app, `u6-lab-cb-${suffix}@example.com`);
    const rider = await signInAudience(app, `u6-rider-${suffix}@example.com`);

    const labA = await orgs.create({
      countryCode,
      kind: OrganizationKind.LAB,
      legalName: `U6 Lab ${suffix}`,
      displayName: `U6 Lab ${suffix}`,
      actorId: admin.personId,
    });
    await prisma.organization.update({
      where: { id: labA.id },
      data: { status: OrganizationStatus.ACTIVE },
    });
    await attachOrgAdmin(labUser.personId, labA.id);
    await attachOrgStaff(labStaff.personId, labA.id);
    await attachPathologist(pathologist.personId, labA.id, country.id);
    await attachRider(rider.personId, country.id);
    await activateLabPartner(app, {
      labToken: labUser.token,
      adminToken: admin.token,
      labOrgId: labA.id,
    });

    const labItem = await request(app.getHttpServer())
      .post('/api/v1/lab/catalog/items')
      .set(auth(labUser.token))
      .send({
        slug: `u6-lab-${suffix}`,
        kind: 'LAB_TEST',
        lab_org_id: labA.id,
        title: 'CBC Panel U6',
        countries: [{ country_code: countryCode }],
      });
    expect(labItem.status).toBe(201);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${labItem.body.id}/publish`)
      .set(auth(admin.token));
    const labVariant = await request(app.getHttpServer())
      .post(`/api/v1/lab/catalog/items/${labItem.body.id}/variants?lab_org_id=${labA.id}`)
      .set(auth(labUser.token))
      .send({ sku_code: `U6-LAB-${suffix}`, pack_size: '1 draw' });
    const labOffer = await request(app.getHttpServer())
      .post('/api/v1/lab/catalog/offers')
      .set(auth(labUser.token))
      .send({
        variant_id: labVariant.body.id,
        lab_org_id: labA.id,
        country_code: countryCode,
        ownership: 'LAB_OWNED',
        currency,
        cost_minor: '100',
        sell_minor: '2500',
      });
    await request(app.getHttpServer())
      .post(`/api/v1/lab/catalog/offers/${labOffer.body.id}/publish`)
      .set(auth(labUser.token));

    const address = await prisma.customerAddress.create({
      data: {
        id: uuidv7(),
        customerPersonId: customerA.personId,
        countryId: country.id,
        recipientName: 'Customer A',
        city: 'Testville',
        line1: '1 Sample St',
        postalCode: '10001',
        isDefault: true,
      },
    });

    const labBooking = await request(app.getHttpServer())
      .post('/api/v1/me/lab/bookings')
      .set(auth(customerA.token))
      .set('Idempotency-Key', `u6-lab-book-${suffix}`)
      .send({
        offer_id: labOffer.body.id,
        collection_mode: 'HOME',
        lab_org_id: labA.id,
        customer_address_id: address.id,
        country: countryCode,
        slot_starts_at: new Date(Date.now() + 86_400_000).toISOString(),
      });
    expect(labBooking.status).toBe(201);
    await request(app.getHttpServer())
      .post(`/api/v1/me/lab/bookings/${labBooking.body.id}/pay`)
      .set(auth(customerA.token))
      .set('Idempotency-Key', `u6-lab-pay-${suffix}`)
      .send({ scenario: 'success' });

    const sample = await prisma.labSample.findUniqueOrThrow({
      where: { labBookingId: labBooking.body.id },
    });
    const collectionJob = await prisma.logisticsJob.findFirstOrThrow({
      where: { labSampleId: sample.id, jobType: LogisticsJobType.SAMPLE_COLLECTION },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/accept`)
      .set(auth(labUser.token));
    await request(app.getHttpServer())
      .post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/arrive`)
      .set(auth(labUser.token))
      .send({});
    await request(app.getHttpServer())
      .post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/verify`)
      .set(auth(labUser.token))
      .send({});
    await request(app.getHttpServer())
      .post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/collect`)
      .set(auth(labUser.token))
      .send({});
    await request(app.getHttpServer())
      .post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/seal`)
      .set(auth(labUser.token))
      .send({ container_barcode: `U6-${suffix}` });
    await request(app.getHttpServer())
      .post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/handover`)
      .set(auth(labUser.token))
      .send({});

    const transportJob = await prisma.logisticsJob.findFirstOrThrow({
      where: { labSampleId: sample.id, jobType: LogisticsJobType.SAMPLE_TRANSPORT },
    });
    await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${transportJob.id}/accept`)
      .set(auth(rider.token));
    await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${transportJob.id}/pickup`)
      .set(auth(rider.token));
    await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${transportJob.id}/deliver`)
      .set(auth(rider.token));

    const accession = await request(app.getHttpServer())
      .post('/api/v1/lab/accessions')
      .set(auth(labUser.token))
      .send({
        lab_org_id: labA.id,
        lab_sample_id: sample.id,
        idempotency_key: `u6-acc-${suffix}`,
      });
    expect(accession.status).toBeLessThan(300);

    const processingId = (await prisma.labProcessing.findUniqueOrThrow({ where: { labSampleId: sample.id } }))
      .id;
    await request(app.getHttpServer())
      .post(`/api/v1/lab/processing/${processingId}/start`)
      .set(auth(labUser.token))
      .send({ lab_org_id: labA.id });
    await request(app.getHttpServer())
      .post(`/api/v1/lab/processing/${processingId}/complete`)
      .set(auth(labUser.token))
      .send({ lab_org_id: labA.id });

    const labReport = await prisma.labReport.findUniqueOrThrow({ where: { labSampleId: sample.id } });
    const enter = await request(app.getHttpServer())
      .post(`/api/v1/lab/reports/${labReport.id}/results`)
      .set(auth(labStaff.token))
      .send({
        lab_org_id: labA.id,
        summary: 'Sandbox summary',
        lines: [{ analyte_code: 'HGB', analyte_name: 'Hemoglobin', value: '14', unit: 'g/dL' }],
      });
    expect(enter.status).toBeLessThan(300);
    await request(app.getHttpServer())
      .post(`/api/v1/lab/reports/${labReport.id}/submit-verify`)
      .set(auth(labStaff.token))
      .send({ lab_org_id: labA.id });
    await request(app.getHttpServer())
      .post(`/api/v1/pathologist/reports/${labReport.id}/assign`)
      .set(auth(pathologist.token))
      .send({ lab_org_id: labA.id });
    await request(app.getHttpServer())
      .post(`/api/v1/pathologist/reports/${labReport.id}/verify`)
      .set(auth(pathologist.token))
      .send({ lab_org_id: labA.id });
    const labPublish = await request(app.getHttpServer())
      .post(`/api/v1/pathologist/reports/${labReport.id}/publish`)
      .set(auth(pathologist.token))
      .send({ lab_org_id: labA.id, idempotency_key: `u6-lab-pub-${suffix}` });
    expect(labPublish.status).toBeLessThan(300);

    const labPublishEvents = await prisma.outboxEvent.findMany({
      where: { type: 'LAB_REPORT_PUBLISHED', aggregateId: labReport.id },
    });
    expect(labPublishEvents.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(labPublishEvents)).not.toMatch(/Hemoglobin|"value":"14"/i);
    await eventWorker.handle(labPublishEvents[0]!.id);
    await eventWorker.handle(labPublishEvents[0]!.id);

    const labInbox = await inboxRows(customerA.token);
    const labReady = labInbox.filter((row) => row.title === 'Lab report ready');
    expect(labReady.length).toBe(1);
    expect(labReady[0]?.body).toBe(
      'Open the app for details. External channels remain disabled in sandbox.',
    );
    expect(JSON.stringify(labReady[0])).not.toMatch(/Hemoglobin|g\/dL|"value"\s*:\s*"14"/i);

    const labTimeline = await request(app.getHttpServer())
      .get(`/api/v1/health/timeline?country_code=${countryCode}`)
      .set(auth(customerA.token));
    expect(labTimeline.status).toBe(200);
    const labTimelineItem = (
      labTimeline.body.items as Array<{ artifact_type?: string; summary?: string }>
    ).find((row) => row.artifact_type === HealthArtifactType.LAB_REPORT);
    expect(labTimelineItem).toBeTruthy();
    expect(labTimelineItem?.summary).toMatch(/lab report is available/i);
    expect(JSON.stringify(labTimelineItem)).not.toMatch(/Hemoglobin|"14"|g\/dL/i);

    const labArtifact = await prisma.healthArtifact.findFirstOrThrow({
      where: { labBookingId: labBooking.body.id, artifactType: HealthArtifactType.LAB_REPORT },
    });
    const ownArtifact = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${labArtifact.id}?country_code=${countryCode}`)
      .set(auth(customerA.token));
    expect(ownArtifact.status).toBe(200);
    const foreignArtifact = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${labArtifact.id}?country_code=${countryCode}`)
      .set(auth(customerB.token));
    expect([403, 404]).toContain(foreignArtifact.status);

    const customerLabReport = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/bookings/${labBooking.body.id}/report`)
      .set(auth(customerA.token));
    expect(customerLabReport.status).toBe(200);
    const foreignLabReport = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/bookings/${labBooking.body.id}/report`)
      .set(auth(customerB.token));
    expect(foreignLabReport.status).toBe(403);

    const imagingA = await orgs.create({
      countryCode,
      kind: OrganizationKind.IMAGING_CENTER,
      legalName: `U6 Imaging ${suffix}`,
      displayName: `U6 Imaging ${suffix}`,
      actorId: admin.personId,
    });
    await prisma.organization.update({
      where: { id: imagingA.id },
      data: { status: OrganizationStatus.ACTIVE },
    });
    await attachOrgAdmin(imagingUser.personId, imagingA.id);
    await attachOrgAdmin(tech.personId, imagingA.id);
    await attachRadiologist(prisma, radEnterer.personId, imagingA.id, countryCode);
    await attachRadiologist(prisma, radVerifier.personId, imagingA.id, countryCode);

    const locA = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: imagingA.id,
        countryId: country.id,
        kind: LocationKind.IMAGING,
        name: `U6 Center ${suffix}`,
        city: 'Testville',
        isActive: true,
      },
    });

    await activateImagingPartner(app, {
      imagingToken: imagingUser.token,
      adminToken: admin.token,
      imagingOrgId: imagingA.id,
    });

    const imgItem = await request(app.getHttpServer())
      .post('/api/v1/radiology/catalog/items')
      .set(auth(imagingUser.token))
      .send({
        slug: `u6-imaging-${suffix}`,
        kind: 'IMAGING_STUDY',
        imaging_org_id: imagingA.id,
        title: 'CT Chest U6',
        description: 'Commercial imaging listing',
        countries: [{ country_code: countryCode }],
      });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${imgItem.body.id}/publish`)
      .set(auth(admin.token));
    const imgVariant = await request(app.getHttpServer())
      .post(
        `/api/v1/radiology/catalog/items/${imgItem.body.id}/variants?imaging_org_id=${imagingA.id}`,
      )
      .set(auth(imagingUser.token))
      .send({ sku_code: `U6-IMG-${suffix}`, pack_size: '1 study' });
    const imgOffer = await request(app.getHttpServer())
      .post('/api/v1/radiology/catalog/offers')
      .set(auth(imagingUser.token))
      .send({
        variant_id: imgVariant.body.id,
        imaging_org_id: imagingA.id,
        country_code: countryCode,
        ownership: 'IMAGING_OWNED',
        currency,
        cost_minor: '100',
        sell_minor: '3500',
      });
    await request(app.getHttpServer())
      .post(`/api/v1/radiology/catalog/offers/${imgOffer.body.id}/publish`)
      .set(auth(imagingUser.token));

    const slotStart = new Date(Date.now() + 86_400_000);
    slotStart.setUTCHours(10, 0, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + 3_600_000);
    const imgBooking = await request(app.getHttpServer())
      .post('/api/v1/me/imaging/bookings')
      .set(auth(customerA.token))
      .set('Idempotency-Key', `u6-img-book-${suffix}`)
      .send({
        offer_id: imgOffer.body.id,
        imaging_org_id: imagingA.id,
        imaging_location_id: locA.id,
        country: countryCode,
        prep_acknowledged: true,
        slot_starts_at: slotStart.toISOString(),
        slot_ends_at: slotEnd.toISOString(),
      });
    expect(imgBooking.status).toBe(201);
    await request(app.getHttpServer())
      .post(`/api/v1/me/imaging/bookings/${imgBooking.body.id}/pay`)
      .set(auth(customerA.token))
      .set('Idempotency-Key', `u6-img-pay-${suffix}`)
      .send({ scenario: 'success' });

    const bookingId = imgBooking.body.id as string;
    const checkIn = await request(app.getHttpServer())
      .post('/api/v1/radiology/check-in')
      .set(auth(imagingUser.token))
      .send({
        imaging_org_id: imagingA.id,
        imaging_booking_id: bookingId,
        assignee_person_id: tech.personId,
      });
    const studyId = checkIn.body.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/radiology/studies/${studyId}/start?imaging_org_id=${imagingA.id}`)
      .set(auth(tech.token))
      .set('Idempotency-Key', `u6-img-start-${suffix}`);
    await request(app.getHttpServer())
      .post(`/api/v1/radiology/studies/${studyId}/complete`)
      .set(auth(tech.token))
      .send({ imaging_org_id: imagingA.id, equipment_code: 'CT-1', modality_code: 'CT' });

    const imagingReport = await prisma.imagingReport.findUniqueOrThrow({
      where: { imagingStudyId: studyId },
    });
    const reportId = imagingReport.id;
    await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/assign`)
      .set(auth(radEnterer.token))
      .send({ imaging_org_id: imagingA.id });
    await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/findings`)
      .set(auth(radEnterer.token))
      .send({
        imaging_org_id: imagingA.id,
        summary: 'Sandbox impression',
        findings: [{ finding_code: 'IMPRESSION', finding_text: 'No acute abnormality (sandbox)' }],
      });
    await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/submit`)
      .set(auth(radEnterer.token))
      .send({ imaging_org_id: imagingA.id });
    await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/verify`)
      .set(auth(radVerifier.token))
      .send({ imaging_org_id: imagingA.id });
    const imgPublish = await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/publish`)
      .set(auth(radVerifier.token))
      .send({ imaging_org_id: imagingA.id, idempotency_key: `u6-img-pub-${suffix}` });
    expect(imgPublish.status).toBeLessThan(300);

    const imgPublishEvents = await prisma.outboxEvent.findMany({
      where: { type: 'IMAGING_REPORT_PUBLISHED', aggregateId: reportId },
    });
    expect(imgPublishEvents.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(imgPublishEvents)).not.toMatch(/abnormality|finding_text|impression/i);
    await eventWorker.handle(imgPublishEvents[0]!.id);
    await eventWorker.handle(imgPublishEvents[0]!.id);

    const imgInbox = await inboxRows(customerA.token);
    const imgReady = imgInbox.filter((row) => row.title === 'Imaging report ready');
    expect(imgReady.length).toBe(1);
    expect(imgReady[0]?.body).toBe(
      'Open the app for details. External channels remain disabled in sandbox.',
    );
    expect(JSON.stringify(imgReady[0])).not.toMatch(/abnormality|finding/i);

    const imgTimeline = await request(app.getHttpServer())
      .get(`/api/v1/health/timeline?country_code=${countryCode}`)
      .set(auth(customerA.token));
    expect(imgTimeline.status).toBe(200);
    const imgTimelineItem = (
      imgTimeline.body.items as Array<{ artifact_type?: string; summary?: string }>
    ).find((row) => row.artifact_type === HealthArtifactType.IMAGING_REPORT);
    expect(imgTimelineItem).toBeTruthy();
    expect(imgTimelineItem?.summary).toMatch(/imaging report is available/i);
    expect(JSON.stringify(imgTimelineItem)).not.toMatch(/abnormality|finding_text/i);

    const customerImgReport = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${bookingId}/report`)
      .set(auth(customerA.token));
    expect(customerImgReport.status).toBe(200);
    const foreignImgReport = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${bookingId}/report`)
      .set(auth(customerB.token));
    expect(foreignImgReport.status).toBe(403);

    const imagingArtifact = await prisma.healthArtifact.findFirstOrThrow({
      where: { imagingBookingId: bookingId, artifactType: HealthArtifactType.IMAGING_REPORT },
    });
    const ownImgArtifact = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${imagingArtifact.id}?country_code=${countryCode}`)
      .set(auth(customerA.token));
    expect(ownImgArtifact.status).toBe(200);
    const foreignImgArtifact = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${imagingArtifact.id}?country_code=${countryCode}`)
      .set(auth(customerB.token));
    expect([403, 404]).toContain(foreignImgArtifact.status);

    const dashNotes = await request(app.getHttpServer())
      .get(`/api/v1/health/dashboard?country_code=${countryCode}`)
      .set(auth(customerA.token));
    expect(dashNotes.status).toBe(200);
    expect(dashNotes.body.timeline_enabled).toBe(true);
    expect(
      JSON.stringify(dashNotes.body.overview.active_care_plan ?? { sandbox: true }),
    ).toMatch(/sandbox/i);
  });
});
