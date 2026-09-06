import { INestApplication } from '@nestjs/common';
import {
  HealthArtifactType,
  LabReportVersionStatus,
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
import { HealthTimelineService } from '../health/health-timeline.service';
import { OrganizationService } from '../partner/organization.service';
import { PolicyCache } from '../policy/cache';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { applyTestIsolation } from '../test/isolate-runtime';
import { activateLabPartner, enableLabPartnerPack } from '../test/lab-partner';
import { bootstrapSuperAdminByEmail } from '../test/sign-in';

async function signIn(app: INestApplication, email: string, audience: 'admin' | 'customer' = 'customer') {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({
      challenge_id: requested.body.challenge_id,
      code: requested.body.dev_code,
      audience,
    });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

describe('R9-A health record kernel (e2e)', () => {
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

  async function attachPathologist(personId: string, organizationId: string) {
    const country = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'XX' } });
    await prisma.partner.create({
      data: {
        id: uuidv7(),
        personId,
        partnerTypeCode: 'PATHOLOGIST',
        countryId: country.id,
        status: 'ACTIVE',
      },
    });
    await attachOrgStaff(personId, organizationId);
  }

  async function attachRider(personId: string) {
    const country = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'XX' } });
    await prisma.partner.create({
      data: {
        id: uuidv7(),
        personId,
        partnerTypeCode: 'DELIVERY_PARTNER',
        countryId: country.id,
        status: 'ACTIVE',
      },
    });
  }

  async function publishPack(doc: ReturnType<typeof emptyPolicyDocument>, suffix: string) {
    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'XX' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'XX',
          isoAlpha3: 'XXX',
          nameI18n: { en: 'R9A test' },
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
        version: Math.floor(Date.now() % 1_000_000) + Math.floor(Math.random() * 1000),
        status: PolicyPackStatus.PUBLISHED,
        document: doc as never,
        checksum: `r9a-${suffix}`,
        publishedAt: new Date(),
      },
    });
    const pack = await prisma.policyPack.findFirst({
      where: { countryId: country.id, status: PolicyPackStatus.PUBLISHED },
      orderBy: { publishedAt: 'desc' },
    });
    if (pack) {
      await prisma.country.update({
        where: { id: country.id },
        data: { publishedPolicyPackId: pack.id },
      });
    }
    await app.get(PolicyCache).invalidate('XX');
    return country;
  }

  async function publishLabReportForCustomer(suffix: string) {
    const admin = await bootstrapSuperAdminByEmail(app, prisma, `r9a-admin-${suffix}@example.com`);
    const labUser = await signIn(app, `r9a-lab-${suffix}@example.com`);
    const labStaff = await signIn(app, `r9a-staff-${suffix}@example.com`);
    const pathologist = await signIn(app, `r9a-path-${suffix}@example.com`);
    const customerA = await signIn(app, `r9a-ca-${suffix}@example.com`);
    const customerB = await signIn(app, `r9a-cb-${suffix}@example.com`);
    const rider = await signIn(app, `r9a-rider-${suffix}@example.com`);

    const enabledDoc = emptyPolicyDocument();
    enableLabPartnerPack(enabledDoc, { home: true, center: true });
    enabledDoc.healthcare.health_timeline_enabled = true;
    enabledDoc.payments.enabled = true;
    enabledDoc.payments.methods = ['CARD'];
    enabledDoc.payments.gateway_refs = ['MOCK_PRIMARY'];
    enabledDoc.payments.currencies = ['XXX'];
    const country = await publishPack(enabledDoc, suffix);

    const labA = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.LAB,
      legalName: `R9A Lab ${suffix}`,
      displayName: `R9A Lab ${suffix}`,
      actorId: admin.personId,
    });
    await prisma.organization.update({
      where: { id: labA.id },
      data: { status: OrganizationStatus.ACTIVE },
    });
    await attachOrgAdmin(labUser.personId, labA.id);
    await attachOrgStaff(labStaff.personId, labA.id);
    await attachPathologist(pathologist.personId, labA.id);
    await attachRider(rider.personId);
    await activateLabPartner(app, { labToken: labUser.token, adminToken: admin.token, labOrgId: labA.id });

    const item = await request(app.getHttpServer())
      .post('/api/v1/lab/catalog/items')
      .set('Authorization', `Bearer ${labUser.token}`)
      .send({
        slug: `r9a-lab-${suffix}`,
        kind: 'LAB_TEST',
        lab_org_id: labA.id,
        title: 'CBC Panel',
        countries: [{ country_code: 'XX' }],
      });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/lab/catalog/items/${item.body.id}/variants?lab_org_id=${labA.id}`)
      .set('Authorization', `Bearer ${labUser.token}`)
      .send({ sku_code: `R9A-${suffix}`, pack_size: '1 draw' });
    const offer = await request(app.getHttpServer())
      .post('/api/v1/lab/catalog/offers')
      .set('Authorization', `Bearer ${labUser.token}`)
      .send({
        variant_id: variant.body.id,
        lab_org_id: labA.id,
        country_code: 'XX',
        ownership: 'LAB_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '2500',
      });
    await request(app.getHttpServer())
      .post(`/api/v1/lab/catalog/offers/${offer.body.id}/publish`)
      .set('Authorization', `Bearer ${labUser.token}`);

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
      .set('Authorization', `Bearer ${customerA.token}`)
      .set('Idempotency-Key', `r9a-book-${suffix}`)
      .send({
        offer_id: offer.body.id,
        collection_mode: 'HOME',
        lab_org_id: labA.id,
        customer_address_id: address.id,
        country: 'XX',
        slot_starts_at: new Date(Date.now() + 86400000).toISOString(),
      });
    await request(app.getHttpServer())
      .post(`/api/v1/me/lab/bookings/${booking.body.id}/pay`)
      .set('Authorization', `Bearer ${customerA.token}`)
      .set('Idempotency-Key', `r9a-pay-${suffix}`)
      .send({ scenario: 'success' });

    const sample = await prisma.labSample.findUniqueOrThrow({ where: { labBookingId: booking.body.id } });
    const collectionJob = await prisma.logisticsJob.findFirstOrThrow({
      where: { labSampleId: sample.id, jobType: LogisticsJobType.SAMPLE_COLLECTION },
    });
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    await request(app.getHttpServer()).post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/accept`).set(auth(labUser.token));
    await request(app.getHttpServer()).post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/arrive`).set(auth(labUser.token)).send({});
    await request(app.getHttpServer()).post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/verify`).set(auth(labUser.token)).send({});
    await request(app.getHttpServer()).post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/collect`).set(auth(labUser.token)).send({});
    await request(app.getHttpServer())
      .post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/seal`)
      .set(auth(labUser.token))
      .send({ container_barcode: `R9A-${suffix}` });
    await request(app.getHttpServer())
      .post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/handover`)
      .set(auth(labUser.token))
      .send({});

    const transportJob = await prisma.logisticsJob.findFirstOrThrow({
      where: { labSampleId: sample.id, jobType: LogisticsJobType.SAMPLE_TRANSPORT },
    });
    await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${transportJob.id}/accept`).set(auth(rider.token));
    await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${transportJob.id}/pickup`).set(auth(rider.token));
    await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${transportJob.id}/deliver`).set(auth(rider.token));

    const accession = await request(app.getHttpServer())
      .post('/api/v1/lab/accessions')
      .set(auth(labUser.token))
      .send({ lab_org_id: labA.id, lab_sample_id: sample.id, idempotency_key: `r9a-acc-${suffix}` });
    expect(accession.status).toBeLessThan(300);

    const processingId = (await prisma.labProcessing.findUniqueOrThrow({ where: { labSampleId: sample.id } })).id;
    await request(app.getHttpServer())
      .post(`/api/v1/lab/processing/${processingId}/start`)
      .set(auth(labUser.token))
      .send({ lab_org_id: labA.id });
    await request(app.getHttpServer())
      .post(`/api/v1/lab/processing/${processingId}/complete`)
      .set(auth(labUser.token))
      .send({ lab_org_id: labA.id });

    const report = await prisma.labReport.findUniqueOrThrow({ where: { labSampleId: sample.id } });
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
    await request(app.getHttpServer())
      .post(`/api/v1/pathologist/reports/${report.id}/assign`)
      .set(auth(pathologist.token))
      .send({ lab_org_id: labA.id });
    await request(app.getHttpServer())
      .post(`/api/v1/pathologist/reports/${report.id}/verify`)
      .set(auth(pathologist.token))
      .send({ lab_org_id: labA.id });
    const publish = await request(app.getHttpServer())
      .post(`/api/v1/pathologist/reports/${report.id}/publish`)
      .set(auth(pathologist.token))
      .send({ lab_org_id: labA.id });
    expect(publish.status).toBeLessThan(300);

    const artifact = await prisma.healthArtifact.findFirstOrThrow({
      where: { labBookingId: booking.body.id, artifactType: HealthArtifactType.LAB_REPORT },
    });

    return {
      country,
      customerA,
      customerB,
      labA,
      bookingId: booking.body.id as string,
      artifactId: artifact.id,
      auth,
    };
  }

  it('patient timeline, artifact metadata/payload, isolation, audit, idempotency, disabled pack, RLS', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const ctx = await publishLabReportForCustomer(suffix);
    const auth = ctx.auth;

    const timeline = await request(app.getHttpServer())
      .get('/api/v1/health/timeline?country_code=XX')
      .set(auth(ctx.customerA.token));
    expect(timeline.status).toBe(200);
    expect(timeline.body.items.length).toBeGreaterThanOrEqual(1);
    expect(timeline.body.items[0].artifact_type).toBe('LAB_REPORT');
    expect(timeline.body.items[0].title).toMatch(/lab/i);
    expect(JSON.stringify(timeline.body)).not.toMatch(/Hemoglobin|14 g/i);

    const foreignTimeline = await request(app.getHttpServer())
      .get('/api/v1/health/timeline?country_code=XX')
      .set(auth(ctx.customerB.token));
    expect(foreignTimeline.status).toBe(200);
    expect(foreignTimeline.body.items).toHaveLength(0);

    const missingCountry = `Y${uuidv7().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
    const wrongCountryTimeline = await request(app.getHttpServer())
      .get(`/api/v1/health/timeline?country_code=${missingCountry}`)
      .set(auth(ctx.customerA.token));
    expect(wrongCountryTimeline.status).toBe(404);

    const metadata = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${ctx.artifactId}?country_code=XX`)
      .set(auth(ctx.customerA.token));
    expect(metadata.status).toBe(200);
    expect(metadata.body.artifact_type).toBe('LAB_REPORT');
    expect(metadata.body.summary).toBeUndefined();

    const foreignMeta = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${ctx.artifactId}?country_code=XX`)
      .set(auth(ctx.customerB.token));
    expect(foreignMeta.status).toBe(404);

    const payload = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${ctx.artifactId}/payload?country_code=XX`)
      .set(auth(ctx.customerA.token))
      .set('X-Request-Id', `r9a-read-${suffix}`);
    expect(payload.status).toBe(200);
    expect(payload.body.payload.results[0].value).toBe('14');
    expect(JSON.stringify(payload.body)).not.toMatch(/pathologist_note|internal_/i);

    const foreignPayload = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${ctx.artifactId}/payload?country_code=XX`)
      .set(auth(ctx.customerB.token));
    expect(foreignPayload.status).toBe(404);
    expect(JSON.stringify(foreignPayload.body)).not.toMatch(/Hemoglobin/i);

    const audits = await prisma.healthArtifactAccessAudit.findMany({
      where: { artifactId: ctx.artifactId, allowed: true },
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);
    expect(audits[0]?.actorPersonId).toBe(ctx.customerA.personId);

    const timelineCountBefore = await prisma.healthTimelineEvent.count({
      where: { sourceModule: 'lab', sourceId: ctx.bookingId },
    });
    const timelineService = app.get(HealthTimelineService);
    await prisma.$transaction(async (tx) => {
      await timelineService.projectArtifactPublished(tx, {
        personId: ctx.customerA.personId,
        countryId: ctx.country.id,
        artifactId: ctx.artifactId,
        artifactType: HealthArtifactType.LAB_REPORT,
        sourceModule: 'lab',
        sourceId: ctx.bookingId,
        title: 'Lab diagnostic report',
        occurredAt: new Date(),
      });
    });
    const timelineCountAfter = await prisma.healthTimelineEvent.count({
      where: { sourceModule: 'lab', sourceId: ctx.bookingId },
    });
    expect(timelineCountAfter).toBe(timelineCountBefore);

    const disabledDoc = emptyPolicyDocument();
    enableLabPartnerPack(disabledDoc, { home: true });
    disabledDoc.healthcare.health_timeline_enabled = false;
    await publishPack(disabledDoc, `${suffix}-off`);
    const disabled = await request(app.getHttpServer())
      .get('/api/v1/health/timeline?country_code=XX')
      .set(auth(ctx.customerA.token));
    expect(disabled.status).toBe(403);

    const rlsRows = await prisma.$queryRaw<{ relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
      SELECT c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ('health_timeline_events', 'health_artifact_access_audits')
    `;
    expect(rlsRows).toHaveLength(2);
    for (const row of rlsRows) {
      expect(row.relrowsecurity).toBe(true);
      expect(row.relforcerowsecurity).toBe(true);
    }

    const reportRow = await prisma.labReport.findUniqueOrThrow({ where: { labBookingId: ctx.bookingId } });
    const version = await prisma.labReportVersion.findFirstOrThrow({
      where: { labReportId: reportRow.id, status: LabReportVersionStatus.PUBLISHED },
    });
    expect(version.status).toBe('PUBLISHED');
  });
});
