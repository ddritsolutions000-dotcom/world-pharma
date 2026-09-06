import { INestApplication } from '@nestjs/common';
import {
  FinancialFactKind,
  HealthArtifactType,
  LabReportVersionStatus,
  LabSampleCocStatus,
  LogisticsJobType,
  OrganizationKind,
  OrganizationStatus,
  PolicyPackStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { OrganizationService } from '../partner/organization.service';
import { PolicyCache } from '../policy/cache';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { EventWorkerService } from '../events/worker.service';
import { applyTestIsolation } from '../test/isolate-runtime';
import { activateLabPartner, enableLabPartnerPack } from '../test/lab-partner';
import { nextPolicyPackVersion } from '../test/next-policy-pack-version';
import { bootstrapSuperAdminByEmail, signIn as signInAudience } from '../test/sign-in';

describe('S25 lab operations diagnostics completion (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgs: OrganizationService;
  let eventWorker: EventWorkerService;

  const countryCode = 'L5';

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
  });

  afterAll(async () => {
    await app.close();
  });

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

  async function attachPhlebotomist(personId: string, organizationId: string, countryId: string) {
    await prisma.partner.create({
      data: {
        id: uuidv7(),
        personId,
        partnerTypeCode: 'PHLEBOTOMIST',
        countryId,
        status: 'ACTIVE',
      },
    });
    await attachOrgStaff(personId, organizationId);
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

  async function publishPack(doc: ReturnType<typeof emptyPolicyDocument>, suffix: string) {
    let country = await prisma.country.findUnique({ where: { isoAlpha2: countryCode } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: countryCode,
          isoAlpha3: 'LXX',
          nameI18n: { en: 'S25 lab test market' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
        },
      });
    }
    await prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        version: await nextPolicyPackVersion(prisma, country.id),
        status: PolicyPackStatus.PUBLISHED,
        document: doc as never,
        checksum: `s25-${suffix}`,
        publishedAt: new Date(),
      },
    });
    const pack = await prisma.policyPack.findFirst({
      where: { countryId: country.id, status: PolicyPackStatus.PUBLISHED },
      orderBy: { publishedAt: 'desc' },
    });
    if (pack) {
      await prisma.country.update({ where: { id: country.id }, data: { publishedPolicyPackId: pack.id } });
    }
    await app.get(PolicyCache).invalidate(countryCode);
    return country;
  }

  it('full lab operations journey with workforce, earnings, health, and isolation', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    // 1–4: provision lab, admin, phlebotomist, pathologists
    const admin = await bootstrapSuperAdminByEmail(app, prisma, `s25-admin-${suffix}@example.com`);
    const labAdmin = await signInAudience(app, `s25-lab-admin-${suffix}@example.com`);
    const labStaff = await signInAudience(app, `s25-lab-staff-${suffix}@example.com`);
    const phlebotomist = await signInAudience(app, `s25-phe-${suffix}@example.com`);
    const phlebotomistB = await signInAudience(app, `s25-phe-b-${suffix}@example.com`);
    const pathologist = await signInAudience(app, `s25-path-${suffix}@example.com`);
    const pathologistB = await signInAudience(app, `s25-path-b-${suffix}@example.com`);
    const customerA = await signInAudience(app, `s25-ca-${suffix}@example.com`);
    const customerB = await signInAudience(app, `s25-cb-${suffix}@example.com`);
    const rider = await signInAudience(app, `s25-rider-${suffix}@example.com`);
    const labBAdmin = await signInAudience(app, `s25-lab-b-${suffix}@example.com`);

    const enabledDoc = emptyPolicyDocument();
    enableLabPartnerPack(enabledDoc, { home: true, center: true });
    enabledDoc.healthcare.health_timeline_enabled = true;
    enabledDoc.payments.enabled = true;
    enabledDoc.payments.methods = ['CARD'];
    enabledDoc.payments.gateway_refs = ['MOCK_PRIMARY'];
    enabledDoc.payments.currencies = ['XXX'];
    const country = await publishPack(enabledDoc, suffix);

    const labA = await orgs.create({
      countryCode,
      kind: OrganizationKind.LAB,
      legalName: `S25 Lab A ${suffix}`,
      displayName: `S25 Lab A ${suffix}`,
      actorId: admin.personId,
    });
    const labB = await orgs.create({
      countryCode,
      kind: OrganizationKind.LAB,
      legalName: `S25 Lab B ${suffix}`,
      displayName: `S25 Lab B ${suffix}`,
      actorId: admin.personId,
    });
    await prisma.organization.updateMany({
      where: { id: { in: [labA.id, labB.id] } },
      data: { status: OrganizationStatus.ACTIVE },
    });

    await attachOrgAdmin(labAdmin.personId, labA.id);
    await attachOrgStaff(labStaff.personId, labA.id);
    await attachPhlebotomist(phlebotomist.personId, labA.id, country.id);
    await attachPhlebotomist(phlebotomistB.personId, labA.id, country.id);
    await attachPathologist(pathologist.personId, labA.id, country.id);
    await attachPathologist(pathologistB.personId, labB.id, country.id);
    await attachOrgAdmin(labBAdmin.personId, labB.id);
    await attachRider(rider.personId, country.id);

    await activateLabPartner(app, { labToken: labAdmin.token, adminToken: admin.token, labOrgId: labA.id });
    await activateLabPartner(app, { labToken: labBAdmin.token, adminToken: admin.token, labOrgId: labB.id });

    // 5: lab catalog
    const item = await request(app.getHttpServer())
      .post('/api/v1/lab/catalog/items')
      .set(auth(labAdmin.token))
      .send({
        slug: `s25-lab-${suffix}`,
        kind: 'LAB_TEST',
        lab_org_id: labA.id,
        title: 'CBC Panel',
        countries: [{ country_code: countryCode }],
      });
    expect(item.status).toBe(201);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set(auth(admin.token));
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/lab/catalog/items/${item.body.id}/variants?lab_org_id=${labA.id}`)
      .set(auth(labAdmin.token))
      .send({ sku_code: `S25-${suffix}`, pack_size: '1 draw' });
    const offer = await request(app.getHttpServer())
      .post('/api/v1/lab/catalog/offers')
      .set(auth(labAdmin.token))
      .send({
        variant_id: variant.body.id,
        lab_org_id: labA.id,
        country_code: countryCode,
        ownership: 'LAB_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '2500',
      });
    await request(app.getHttpServer())
      .post(`/api/v1/lab/catalog/offers/${offer.body.id}/publish`)
      .set(auth(labAdmin.token));

    // 6–8: customer books, lab receives, scheduling implicit on pay
    const address = await prisma.customerAddress.create({
      data: {
        id: uuidv7(),
        customerPersonId: customerA.personId,
        countryId: country.id,
        recipientName: 'Customer A',
        city: 'Testville',
        line1: '1 Sample St',
        isDefault: true,
      },
    });
    const booking = await request(app.getHttpServer())
      .post('/api/v1/me/lab/bookings')
      .set(auth(customerA.token))
      .set('Idempotency-Key', `s25-book-${suffix}`)
      .send({
        offer_id: offer.body.id,
        collection_mode: 'HOME',
        lab_org_id: labA.id,
        customer_address_id: address.id,
        country: countryCode,
        slot_starts_at: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(booking.status).toBe(201);

    const labBookings = await request(app.getHttpServer())
      .get(`/api/v1/lab/bookings?lab_org_id=${labA.id}`)
      .set(auth(labAdmin.token));
    expect(labBookings.status).toBe(200);
    expect(labBookings.body.data.some((row: { id: string }) => row.id === booking.body.id)).toBe(true);

    await request(app.getHttpServer())
      .post(`/api/v1/me/lab/bookings/${booking.body.id}/pay`)
      .set(auth(customerA.token))
      .set('Idempotency-Key', `s25-pay-${suffix}`)
      .send({ scenario: 'success' });

    const sample = await prisma.labSample.findUniqueOrThrow({ where: { labBookingId: booking.body.id } });
    const collectionJob = await prisma.logisticsJob.findFirstOrThrow({
      where: { labSampleId: sample.id, jobType: LogisticsJobType.SAMPLE_COLLECTION },
    });

    // 9–10: phlebotomist sees job and accepts (worker assignment)
    const pheJobsBefore = await request(app.getHttpServer()).get('/api/v1/phlebotomist/jobs').set(auth(phlebotomist.token));
    expect(pheJobsBefore.status).toBe(200);
    expect(pheJobsBefore.body.data.some((row: { id: string }) => row.id === collectionJob.id)).toBe(true);

    const acceptJob = await request(app.getHttpServer())
      .post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/accept`)
      .set(auth(phlebotomist.token));
    expect(acceptJob.status).toBeLessThan(300);

    const pheJobs = await request(app.getHttpServer()).get('/api/v1/phlebotomist/jobs').set(auth(phlebotomist.token));
    expect(pheJobs.status).toBe(200);
    expect(pheJobs.body.data.some((row: { id: string }) => row.id === collectionJob.id)).toBe(true);

    // 23: worker B cannot mutate unauthorized job
    const pheBGet = await request(app.getHttpServer())
      .get(`/api/v1/phlebotomist/jobs/${collectionJob.id}`)
      .set(auth(phlebotomistB.token));
    expect([403, 404]).toContain(pheBGet.status);

    // 11–12: collection + duplicate protection (job already accepted above)
    await request(app.getHttpServer()).post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/arrive`).set(auth(phlebotomist.token)).send({});
    await request(app.getHttpServer()).post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/verify`).set(auth(phlebotomist.token)).send({});
    const collectKey = `s25-collect-${suffix}`;
    await request(app.getHttpServer())
      .post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/collect`)
      .set(auth(phlebotomist.token))
      .send({ idempotency_key: collectKey });
    const duplicateCollect = await request(app.getHttpServer())
      .post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/collect`)
      .set(auth(phlebotomist.token))
      .send({ idempotency_key: collectKey });
    expect(duplicateCollect.status).toBeLessThan(300);
    const illegalSecondCollect = await request(app.getHttpServer())
      .post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/collect`)
      .set(auth(phlebotomist.token))
      .send({});
    expect(illegalSecondCollect.status).toBe(409);

    await request(app.getHttpServer())
      .post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/seal`)
      .set(auth(phlebotomist.token))
      .send({ container_barcode: `S25-${suffix}` });
    await request(app.getHttpServer())
      .post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/handover`)
      .set(auth(phlebotomist.token))
      .send({});

    // 13: transport + accession
    const transportJob = await prisma.logisticsJob.findFirstOrThrow({
      where: { labSampleId: sample.id, jobType: LogisticsJobType.SAMPLE_TRANSPORT },
    });
    await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${transportJob.id}/accept`).set(auth(rider.token));
    await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${transportJob.id}/pickup`).set(auth(rider.token));
    await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${transportJob.id}/deliver`).set(auth(rider.token));

    const accession = await request(app.getHttpServer())
      .post('/api/v1/lab/accessions')
      .set(auth(labAdmin.token))
      .send({ lab_org_id: labA.id, lab_sample_id: sample.id, idempotency_key: `s25-acc-${suffix}` });
    expect(accession.status).toBeLessThan(300);
    const duplicateAccession = await request(app.getHttpServer())
      .post('/api/v1/lab/accessions')
      .set(auth(labAdmin.token))
      .send({ lab_org_id: labA.id, lab_sample_id: sample.id, idempotency_key: `s25-acc-${suffix}` });
    expect(duplicateAccession.status).toBeLessThan(300);

    const accessionRow = await prisma.labAccession.findFirstOrThrow({ where: { labSampleId: sample.id } });
    expect(accessionRow.accessionNumber).toBeTruthy();

    // 14–15: processing + result entry
    const processingId = (await prisma.labProcessing.findUniqueOrThrow({ where: { labSampleId: sample.id } })).id;
    await request(app.getHttpServer())
      .post(`/api/v1/lab/processing/${processingId}/start`)
      .set(auth(labAdmin.token))
      .send({ lab_org_id: labA.id });
    await request(app.getHttpServer())
      .post(`/api/v1/lab/processing/${processingId}/complete`)
      .set(auth(labAdmin.token))
      .send({ lab_org_id: labA.id });

    const report = await prisma.labReport.findUniqueOrThrow({ where: { labSampleId: sample.id } });
    const pathOnlyEnter = await request(app.getHttpServer())
      .post(`/api/v1/lab/reports/${report.id}/results`)
      .set(auth(pathologist.token))
      .send({
        lab_org_id: labA.id,
        summary: 'Should fail SoD',
        lines: [{ analyte_code: 'HGB', analyte_name: 'Hemoglobin', value: '14', unit: 'g/dL' }],
      });
    expect(pathOnlyEnter.status).toBe(403);

    await request(app.getHttpServer())
      .post(`/api/v1/lab/reports/${report.id}/results`)
      .set(auth(labStaff.token))
      .send({
        lab_org_id: labA.id,
        summary: 'Sandbox summary',
        lines: [{ analyte_code: 'HGB', analyte_name: 'Hemoglobin', value: '14', unit: 'g/dL' }],
      });
    await request(app.getHttpServer())
      .post(`/api/v1/lab/reports/${report.id}/submit-verify`)
      .set(auth(labStaff.token))
      .send({ lab_org_id: labA.id });

    // 16–17: pathologist verification + publish
    const selfVerify = await request(app.getHttpServer())
      .post(`/api/v1/pathologist/reports/${report.id}/verify`)
      .set(auth(labStaff.token))
      .send({ lab_org_id: labA.id });
    expect(selfVerify.status).toBe(403);

    await request(app.getHttpServer())
      .post(`/api/v1/pathologist/reports/${report.id}/assign`)
      .set(auth(pathologist.token))
      .send({ lab_org_id: labA.id });
    await request(app.getHttpServer())
      .post(`/api/v1/pathologist/reports/${report.id}/verify`)
      .set(auth(pathologist.token))
      .send({ lab_org_id: labA.id });

    const publishKey = `s25-pub-${suffix}`;
    const publish = await request(app.getHttpServer())
      .post(`/api/v1/pathologist/reports/${report.id}/publish`)
      .set(auth(pathologist.token))
      .send({ lab_org_id: labA.id, idempotency_key: publishKey });
    expect(publish.status).toBeLessThan(300);
    expect(publish.body.version.status).toBe('PUBLISHED');

    const duplicatePublish = await request(app.getHttpServer())
      .post(`/api/v1/pathologist/reports/${report.id}/publish`)
      .set(auth(pathologist.token))
      .send({ lab_org_id: labA.id, idempotency_key: publishKey });
    expect(duplicatePublish.status).toBe(409);

    const publishEvents = await prisma.outboxEvent.findMany({
      where: { type: 'LAB_REPORT_PUBLISHED', aggregateId: report.id },
    });
    expect(publishEvents).toHaveLength(1);
    await eventWorker.handle(publishEvents[0]!.id);

    // 18: customer retrieves report
    const customerReport = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/bookings/${booking.body.id}/report`)
      .set(auth(customerA.token));
    expect(customerReport.status).toBe(200);
    expect(customerReport.body.results[0].value).toBe('14');

    // 19: health timeline integration
    const timeline = await request(app.getHttpServer())
      .get(`/api/v1/health/timeline?country_code=${countryCode}`)
      .set(auth(customerA.token));
    expect(timeline.status).toBe(200);
    expect(JSON.stringify(timeline.body)).toMatch(/lab|diagnostic|report/i);

    const artifact = await prisma.healthArtifact.findFirstOrThrow({
      where: { labBookingId: booking.body.id, artifactType: HealthArtifactType.LAB_REPORT },
    });
    expect(artifact.id).toBeTruthy();

    // 20: lab earnings read-only
    const earnings = await request(app.getHttpServer())
      .get(`/api/v1/lab/earnings/summary?lab_org_id=${labA.id}`)
      .set(auth(labAdmin.token));
    expect(earnings.status).toBe(200);
    expect(earnings.body.sandbox).toBe(true);
    expect(earnings.body.live_payout).toBe(false);
    expect(earnings.body.settlement_status).toBe('SANDBOX_NOT_SETTLED');
    expect(Number(earnings.body.completed_booking_count)).toBeGreaterThanOrEqual(1);
    expect(Number(earnings.body.gross_minor)).toBeGreaterThanOrEqual(2500);

    const earningsBookings = await request(app.getHttpServer())
      .get(`/api/v1/lab/earnings/bookings?lab_org_id=${labA.id}`)
      .set(auth(labAdmin.token));
    expect(earningsBookings.body.data.some((row: { lab_booking_id: string }) => row.lab_booking_id === booking.body.id)).toBe(
      true,
    );

    const labPayable = await prisma.financialFact.findFirst({
      where: { sourceKey: `lab_payable:${booking.body.id}` },
    });
    expect(labPayable?.kind).toBe(FinancialFactKind.LAB_PAYABLE);

    const payoutAttempt = await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/payouts/${uuidv7()}/execute`)
      .set(auth(labAdmin.token));
    expect([401, 403, 404]).toContain(payoutAttempt.status);

    // workforce surface
    const phePartner = await prisma.partner.findFirst({
      where: { personId: phlebotomist.personId, partnerTypeCode: 'PHLEBOTOMIST' },
    });
    expect(phePartner).toBeTruthy();
    const team = await request(app.getHttpServer())
      .get(`/api/v1/lab/team?lab_org_id=${labA.id}`)
      .set(auth(labAdmin.token));
    expect(team.status).toBe(200);
    expect(
      team.body.data.some(
        (row: { partner_types: string[]; operational_roles: string[] }) =>
          row.partner_types.includes('PHLEBOTOMIST') || row.operational_roles.includes('phlebotomist'),
      ),
    ).toBe(true);
    expect(
      team.body.data.some(
        (row: { partner_types: string[]; operational_roles: string[] }) =>
          row.partner_types.includes('PATHOLOGIST') || row.operational_roles.includes('pathologist'),
      ),
    ).toBe(true);

    // 21: customer A cannot read customer B report
    const customerBReport = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/bookings/${booking.body.id}/report`)
      .set(auth(customerB.token));
    expect(customerBReport.status).toBe(403);

    // 22: lab B cannot read lab A booking
    const labBCross = await request(app.getHttpServer())
      .get(`/api/v1/lab/bookings?lab_org_id=${labB.id}`)
      .set(auth(labBAdmin.token));
    expect(labBCross.status).toBe(200);
    expect(labBCross.body.data.some((row: { id: string }) => row.id === booking.body.id)).toBe(false);

    const labBEarnings = await request(app.getHttpServer())
      .get(`/api/v1/lab/earnings/summary?lab_org_id=${labB.id}`)
      .set(auth(labBAdmin.token));
    expect(labBEarnings.status).toBe(200);
    expect(Number(labBEarnings.body.completed_booking_count)).toBe(0);

    // customer progress states
    const progress = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/bookings/${booking.body.id}/collection`)
      .set(auth(customerA.token));
    expect(progress.status).toBe(200);
    expect(progress.body.boundary.results_available).toBe(true);
    expect(progress.body.report_status).toBe(LabReportVersionStatus.PUBLISHED);

    // 24: invalid lifecycle transition blocked
    const immutable = await request(app.getHttpServer())
      .post(`/api/v1/lab/reports/${report.id}/results`)
      .set(auth(labStaff.token))
      .send({
        lab_org_id: labA.id,
        lines: [{ analyte_code: 'HGB', analyte_name: 'Hemoglobin', value: '99', unit: 'g/dL' }],
      });
    expect(immutable.status).toBe(409);

    const cancelledBooking = await request(app.getHttpServer())
      .post(`/api/v1/me/lab/bookings/${booking.body.id}/cancel`)
      .set(auth(customerA.token))
      .send({ reason: 'too late' });
    expect([403, 409]).toContain(cancelledBooking.status);

    // 25: duplicate terminal publish handled (already tested above)
    const version = await prisma.labReportVersion.findUniqueOrThrow({ where: { id: report.currentVersionId! } });
    expect(version.status).toBe(LabReportVersionStatus.PUBLISHED);

    const sampleFinal = await prisma.labSample.findUniqueOrThrow({ where: { id: sample.id } });
    expect(sampleFinal.containerBarcode).toBe(`S25-${suffix}`);
    expect(sampleFinal.status).not.toBe(LabSampleCocStatus.ASSIGNED);
  });
});
