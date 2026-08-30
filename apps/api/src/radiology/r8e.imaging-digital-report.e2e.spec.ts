import { INestApplication } from '@nestjs/common';
import {
  HealthArtifactType,
  ImagingReportVersionStatus,
  ImagingStudyStatus,
  LocationKind,
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
import { applyTestIsolation } from '../test/isolate-runtime';
import { activateImagingPartner, enableImagingPartnerPack } from '../test/imaging-partner';
import { attachRadiologist } from '../test/radiologist-partner';

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

describe('R8-E imaging digital report publication (e2e)', () => {
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
          nameI18n: { en: 'R8E test' },
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
        checksum: `r8e-${suffix}`,
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

  async function bootstrapVerifiedReport(suffix: string) {
    const admin = await signIn(app, `r8e-admin-${suffix}@example.com`, 'admin');
    const imagingUser = await signIn(app, `r8e-ia-${suffix}@example.com`);
    const tech = await signIn(app, `r8e-tech-${suffix}@example.com`);
    const radEnterer = await signIn(app, `r8e-rad-a-${suffix}@example.com`);
    const radVerifier = await signIn(app, `r8e-rad-b-${suffix}@example.com`);
    const radOtherOrg = await signIn(app, `r8e-rad-c-${suffix}@example.com`);
    const customerA = await signIn(app, `r8e-ca-${suffix}@example.com`);
    const customerB = await signIn(app, `r8e-cb-${suffix}@example.com`);
    const rider = await signIn(app, `r8e-rider-${suffix}@example.com`);

    const superAdmin = await prisma.role.findUnique({ where: { code: 'super_admin' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: admin.personId,
        roleId: superAdmin!.id,
        scope: 'platform',
        status: 'ACTIVE',
      },
    });

    const enabledDoc = emptyPolicyDocument();
    enableImagingPartnerPack(enabledDoc);
    enabledDoc.payments.enabled = true;
    enabledDoc.payments.methods = ['CARD'];
    enabledDoc.payments.gateway_refs = ['MOCK_PRIMARY'];
    enabledDoc.payments.currencies = ['XXX'];
    await publishPack(enabledDoc, suffix);

    const imagingA = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.IMAGING_CENTER,
      legalName: `R8E Imaging A ${suffix}`,
      displayName: `R8E Imaging A ${suffix}`,
      actorId: admin.personId,
    });
    const imagingB = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.IMAGING_CENTER,
      legalName: `R8E Imaging B ${suffix}`,
      displayName: `R8E Imaging B ${suffix}`,
      actorId: admin.personId,
    });
    await prisma.organization.updateMany({
      where: { id: { in: [imagingA.id, imagingB.id] } },
      data: { status: OrganizationStatus.ACTIVE },
    });
    await attachOrgAdmin(imagingUser.personId, imagingA.id);
    await attachOrgAdmin(tech.personId, imagingA.id);
    await attachRadiologist(prisma, radEnterer.personId, imagingA.id);
    await attachRadiologist(prisma, radVerifier.personId, imagingA.id);
    await attachRadiologist(prisma, radOtherOrg.personId, imagingB.id);
    await attachRider(rider.personId);

    const country = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'XX' } });
    const locA = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: imagingA.id,
        countryId: country.id,
        kind: LocationKind.IMAGING,
        name: `R8E Center ${suffix}`,
        city: 'Testville',
        isActive: true,
      },
    });

    await activateImagingPartner(app, {
      imagingToken: imagingUser.token,
      adminToken: admin.token,
      imagingOrgId: imagingA.id,
    });

    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    const item = await request(app.getHttpServer())
      .post('/api/v1/radiology/catalog/items')
      .set(auth(imagingUser.token))
      .send({
        slug: `r8e-imaging-${suffix}`,
        kind: 'IMAGING_STUDY',
        imaging_org_id: imagingA.id,
        title: 'CT Chest',
        description: 'Commercial imaging listing',
        countries: [{ country_code: 'XX' }],
      });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set(auth(admin.token));
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/radiology/catalog/items/${item.body.id}/variants?imaging_org_id=${imagingA.id}`)
      .set(auth(imagingUser.token))
      .send({ sku_code: `IMG-${suffix}`, pack_size: '1 study' });
    const offer = await request(app.getHttpServer())
      .post('/api/v1/radiology/catalog/offers')
      .set(auth(imagingUser.token))
      .send({
        variant_id: variant.body.id,
        imaging_org_id: imagingA.id,
        country_code: 'XX',
        ownership: 'IMAGING_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '3500',
      });
    await request(app.getHttpServer())
      .post(`/api/v1/radiology/catalog/offers/${offer.body.id}/publish`)
      .set(auth(imagingUser.token));

    const slotStart = new Date(Date.now() + 86400000);
    slotStart.setUTCHours(10, 0, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + 3600000);
    const booking = await request(app.getHttpServer())
      .post('/api/v1/me/imaging/bookings')
      .set(auth(customerA.token))
      .set('Idempotency-Key', `r8e-book-${suffix}`)
      .send({
        offer_id: offer.body.id,
        imaging_org_id: imagingA.id,
        imaging_location_id: locA.id,
        country: 'XX',
        prep_acknowledged: true,
        slot_starts_at: slotStart.toISOString(),
        slot_ends_at: slotEnd.toISOString(),
      });
    expect(booking.status).toBe(201);
    await request(app.getHttpServer())
      .post(`/api/v1/me/imaging/bookings/${booking.body.id}/pay`)
      .set(auth(customerA.token))
      .set('Idempotency-Key', `r8e-pay-${suffix}`)
      .send({ scenario: 'success' });

    const bookingId = booking.body.id as string;
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
      .set('Idempotency-Key', `r8e-start-${suffix}`);
    await request(app.getHttpServer())
      .post(`/api/v1/radiology/studies/${studyId}/complete`)
      .set(auth(tech.token))
      .send({ imaging_org_id: imagingA.id, equipment_code: 'CT-1', modality_code: 'CT' });

    const reportRow = await prisma.imagingReport.findUniqueOrThrow({ where: { imagingStudyId: studyId } });
    const reportId = reportRow.id;

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

    return {
      auth,
      admin,
      imagingUser,
      tech,
      radEnterer,
      radVerifier,
      radOtherOrg,
      customerA,
      customerB,
      rider,
      imagingA,
      imagingB,
      bookingId,
      studyId,
      reportId,
    };
  }

  it('publication workflow, customer access, SoD, isolation, idempotency, PHI-safe events', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const ctx = await bootstrapVerifiedReport(suffix);
    const { auth, imagingA, imagingB, bookingId, reportId } = ctx;

    const preStatus = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${bookingId}/report/status`)
      .set(auth(ctx.customerA.token));
    expect(preStatus.status).toBe(200);
    expect(preStatus.body.report_available).toBe(false);

    const preReport = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${bookingId}/report`)
      .set(auth(ctx.customerA.token));
    expect(preReport.status).toBe(404);

    const unverifiedPublish = await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/publish`)
      .set(auth(ctx.radEnterer.token))
      .send({ imaging_org_id: imagingA.id });
    expect(unverifiedPublish.status).toBe(403);

    const techPublish = await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/publish`)
      .set(auth(ctx.tech.token))
      .send({ imaging_org_id: imagingA.id });
    expect(techPublish.status).toBe(403);

    const crossOrgPublish = await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/publish`)
      .set(auth(ctx.radOtherOrg.token))
      .send({ imaging_org_id: imagingB.id });
    expect(crossOrgPublish.status).toBe(403);

    const publishKey = `r8e-pub-${suffix}`;
    const publish = await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/publish`)
      .set(auth(ctx.radVerifier.token))
      .send({ imaging_org_id: imagingA.id, idempotency_key: publishKey });
    expect(publish.status).toBeLessThan(300);
    expect(publish.body.version.status).toBe('PUBLISHED');
    expect(publish.body.boundary.publication).toBe(true);

    const publishDup = await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/publish`)
      .set(auth(ctx.radVerifier.token))
      .send({ imaging_org_id: imagingA.id, idempotency_key: publishKey });
    expect(publishDup.status).toBeLessThan(300);
    expect(publishDup.body.version.status).toBe('PUBLISHED');

    const version = await prisma.imagingReportVersion.findFirstOrThrow({
      where: { imagingReportId: reportId, status: ImagingReportVersionStatus.PUBLISHED },
    });
    expect(version.objectKey).toBeTruthy();

    const artifact = await prisma.healthArtifact.findFirst({
      where: { imagingReportVersionId: version.id, artifactType: HealthArtifactType.IMAGING_REPORT },
    });
    expect(artifact).toBeTruthy();

    const immutable = await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/findings`)
      .set(auth(ctx.radVerifier.token))
      .send({
        imaging_org_id: imagingA.id,
        findings: [{ finding_code: 'IMPRESSION', finding_text: 'Should fail' }],
      });
    expect(immutable.status).toBe(409);

    const postStatus = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${bookingId}/report/status`)
      .set(auth(ctx.customerA.token));
    expect(postStatus.status).toBe(200);
    expect(postStatus.body.report_available).toBe(true);

    const customerReport = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${bookingId}/report`)
      .set(auth(ctx.customerA.token));
    expect(customerReport.status).toBe(200);
    expect(customerReport.body.findings[0].finding_text).toMatch(/abnormality/i);
    expect(JSON.stringify(customerReport.body)).not.toMatch(/"internal_|worker_|object_key/i);

    const customerBReport = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${bookingId}/report`)
      .set(auth(ctx.customerB.token));
    expect(customerBReport.status).toBe(403);

    const progress = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${bookingId}/progress`)
      .set(auth(ctx.customerA.token));
    expect(progress.status).toBe(200);
    expect(progress.body.progress).toBe('REPORT_PUBLISHED');
    expect(progress.body.boundary.report).toBe(true);
    expect(JSON.stringify(progress.body)).not.toMatch(/abnormality|impression|finding/i);

    const riderReport = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${bookingId}/report`)
      .set(auth(ctx.rider.token));
    expect(riderReport.status).toBe(403);

    const adminMeta = await request(app.getHttpServer())
      .get(`/api/v1/admin/imaging/reports?imaging_org_id=${imagingA.id}`)
      .set(auth(ctx.admin.token));
    expect(adminMeta.status).toBe(200);
    expect(adminMeta.body.data.some((r: { id: string }) => r.id === reportId)).toBe(true);
    expect(JSON.stringify(adminMeta.body)).not.toMatch(/abnormality|finding_text/i);

    const outbox = await prisma.outboxEvent.findMany({
      where: { type: 'IMAGING_REPORT_PUBLISHED', aggregateId: reportId },
    });
    expect(outbox.length).toBeGreaterThan(0);
    expect(JSON.stringify(outbox)).not.toMatch(/abnormality|finding_text|summary/i);
    expect(outbox[0].payload).toMatchObject({ customer_person_id: ctx.customerA.personId });

    const security = await prisma.securityEvent.findMany({
      where: { type: { in: ['IMAGING_REPORT_PUBLISHED', 'IMAGING_REPORT_CUSTOMER_VIEW'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    expect(security.length).toBeGreaterThan(0);
    expect(JSON.stringify(security)).not.toMatch(/abnormality|finding_text|summary/i);
  });

  it('cancelled study cannot publish', async () => {
    const suffix = `${Date.now().toString(36)}-cancel-${uuidv7().slice(0, 8)}`;
    const ctx = await bootstrapVerifiedReport(suffix);

    await prisma.imagingStudy.update({
      where: { id: ctx.studyId },
      data: { status: ImagingStudyStatus.CANCELLED },
    });

    const cancelledPublish = await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${ctx.reportId}/publish`)
      .set(ctx.auth(ctx.radVerifier.token))
      .send({ imaging_org_id: ctx.imagingA.id, idempotency_key: `r8e-cancel-${suffix}` });
    expect(cancelledPublish.status).toBe(409);
  });

  it('amendment creates new version, preserves lineage, requires re-verification', async () => {
    const suffix = `${Date.now().toString(36)}-amend-${uuidv7().slice(0, 8)}`;
    const ctx = await bootstrapVerifiedReport(suffix);
    const { auth, imagingA, bookingId, reportId } = ctx;

    await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/publish`)
      .set(auth(ctx.radVerifier.token))
      .send({ imaging_org_id: imagingA.id, idempotency_key: `r8e-amend-pub-${suffix}` });

    const publishedVersion = await prisma.imagingReportVersion.findFirstOrThrow({
      where: { imagingReportId: reportId, status: ImagingReportVersionStatus.PUBLISHED },
    });

    const amend = await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/amend`)
      .set(auth(ctx.radEnterer.token))
      .send({ imaging_org_id: imagingA.id, reason: 'Clerical correction (sandbox)' });
    expect(amend.status).toBeLessThan(300);
    expect(amend.body.version.status).toBe('DRAFT');
    expect(amend.body.version.version_number).toBe(2);

    const dupAmend = await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/amend`)
      .set(auth(ctx.radEnterer.token))
      .send({ imaging_org_id: imagingA.id, reason: 'Duplicate attempt' });
    expect(dupAmend.status).toBe(409);

    const versions = await prisma.imagingReportVersion.findMany({
      where: { imagingReportId: reportId },
      orderBy: { versionNumber: 'asc' },
    });
    expect(versions).toHaveLength(2);
    expect(versions[0].status).toBe(ImagingReportVersionStatus.PUBLISHED);
    expect(versions[1].amendsVersionId).toBe(publishedVersion.id);

    const customerDuringAmend = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${bookingId}/report`)
      .set(auth(ctx.customerA.token));
    expect(customerDuringAmend.status).toBe(404);

    await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/findings`)
      .set(auth(ctx.radEnterer.token))
      .send({
        imaging_org_id: imagingA.id,
        summary: 'Amended impression',
        findings: [{ finding_code: 'IMPRESSION', finding_text: 'Updated sandbox finding' }],
      });
    await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/submit`)
      .set(auth(ctx.radEnterer.token))
      .send({ imaging_org_id: imagingA.id });
    const sodVerify = await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/verify`)
      .set(auth(ctx.radEnterer.token))
      .send({ imaging_org_id: imagingA.id });
    expect(sodVerify.status).toBe(403);
    await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/verify`)
      .set(auth(ctx.radVerifier.token))
      .send({ imaging_org_id: imagingA.id });
    await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/publish`)
      .set(auth(ctx.radVerifier.token))
      .send({ imaging_org_id: imagingA.id, idempotency_key: `r8e-amend-repub-${suffix}` });

    const amendedCustomer = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${bookingId}/report`)
      .set(auth(ctx.customerA.token));
    expect(amendedCustomer.status).toBe(200);
    expect(amendedCustomer.body.version_number).toBe(2);
    expect(amendedCustomer.body.findings[0].finding_text).toMatch(/Updated sandbox/i);

    const amendEvents = await prisma.outboxEvent.findMany({
      where: { type: 'IMAGING_REPORT_AMENDED', aggregateId: reportId },
    });
    expect(amendEvents.length).toBeGreaterThan(0);
    expect(JSON.stringify(amendEvents)).not.toMatch(/Updated sandbox|finding_text/i);
  });

  it('unverified report cannot publish from PENDING_VERIFY', async () => {
    const suffix = `${Date.now().toString(36)}-unver-${uuidv7().slice(0, 8)}`;
    const ctx = await bootstrapVerifiedReport(suffix);
    const report = await prisma.imagingReport.findUniqueOrThrow({ where: { id: ctx.reportId } });
    await prisma.imagingReportVersion.update({
      where: { id: report.currentVersionId! },
      data: { status: ImagingReportVersionStatus.PENDING_VERIFY },
    });

    const blocked = await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${ctx.reportId}/publish`)
      .set(ctx.auth(ctx.radVerifier.token))
      .send({ imaging_org_id: ctx.imagingA.id });
    expect(blocked.status).toBe(409);
  });
});
