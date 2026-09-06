import { INestApplication } from '@nestjs/common';
import {
  ImagingReportVersionStatus,
  ImagingStudyInstanceStatus,
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
import { EventWorkerService } from '../events/worker.service';
import { OrganizationService } from '../partner/organization.service';
import { PolicyCache } from '../policy/cache';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { applyTestIsolation } from '../test/isolate-runtime';
import { activateImagingPartner, enableImagingPartnerPack } from '../test/imaging-partner';
import { attachRadiologist } from '../test/radiologist-partner';
import { bootstrapSuperAdminByEmail, signIn as signInAudience } from '../test/sign-in';

describe('Imaging study PACS foundation (e2e)', () => {
  jest.setTimeout(240_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let orgs: OrganizationService;
  let eventWorker: EventWorkerService;
  const countryCode = 'I4';

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

  async function publishPack(doc: ReturnType<typeof emptyPolicyDocument>, suffix: string) {
    let country = await prisma.country.findUnique({ where: { isoAlpha2: countryCode } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: countryCode,
          isoAlpha3: 'I4X',
          nameI18n: { en: 'S24 imaging PACS test' },
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
        checksum: `s24-pacs-${suffix}`,
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
    await app.get(PolicyCache).invalidate(countryCode);
    return country;
  }

  it('booking → acquisition → DICOM ingest → radiologist → customer with isolation', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const admin = await bootstrapSuperAdminByEmail(app, prisma, `s24-admin-${suffix}@example.com`);
    const imagingUser = await signInAudience(app, `s24-ia-${suffix}@example.com`);
    const tech = await signInAudience(app, `s24-tech-${suffix}@example.com`);
    const radA = await signInAudience(app, `s24-rad-a-${suffix}@example.com`);
    const radB = await signInAudience(app, `s24-rad-b-${suffix}@example.com`);
    const radOtherOrg = await signInAudience(app, `s24-rad-c-${suffix}@example.com`);
    const customerA = await signInAudience(app, `s24-ca-${suffix}@example.com`);
    const customerB = await signInAudience(app, `s24-cb-${suffix}@example.com`);

    const enabledDoc = emptyPolicyDocument();
    enableImagingPartnerPack(enabledDoc);
    enabledDoc.payments.enabled = true;
    enabledDoc.payments.methods = ['CARD'];
    enabledDoc.payments.gateway_refs = ['MOCK_PRIMARY'];
    enabledDoc.payments.currencies = ['XXX'];
    const country = await publishPack(enabledDoc, suffix);

    const imagingA = await orgs.create({
      countryCode,
      kind: OrganizationKind.IMAGING_CENTER,
      legalName: `S24 Imaging A ${suffix}`,
      displayName: `S24 Imaging A ${suffix}`,
      actorId: admin.personId,
    });
    const imagingB = await orgs.create({
      countryCode,
      kind: OrganizationKind.IMAGING_CENTER,
      legalName: `S24 Imaging B ${suffix}`,
      displayName: `S24 Imaging B ${suffix}`,
      actorId: admin.personId,
    });
    await prisma.organization.updateMany({
      where: { id: { in: [imagingA.id, imagingB.id] } },
      data: { status: OrganizationStatus.ACTIVE },
    });
    await attachOrgAdmin(imagingUser.personId, imagingA.id);
    await attachOrgAdmin(tech.personId, imagingA.id);
    await attachRadiologist(prisma, radA.personId, imagingA.id, countryCode);
    await attachRadiologist(prisma, radB.personId, imagingA.id, countryCode);
    await attachRadiologist(prisma, radOtherOrg.personId, imagingB.id, countryCode);

    const locA = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: imagingA.id,
        countryId: country.id,
        kind: LocationKind.IMAGING,
        name: `S24 Center ${suffix}`,
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
        slug: `s24-imaging-${suffix}`,
        kind: 'IMAGING_STUDY',
        imaging_org_id: imagingA.id,
        title: 'CT Abdomen PACS test',
        description: 'Commercial imaging listing',
        countries: [{ country_code: countryCode }],
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
        country_code: countryCode,
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
      .set('Idempotency-Key', `s24-book-${suffix}`)
      .send({
        offer_id: offer.body.id,
        imaging_org_id: imagingA.id,
        imaging_location_id: locA.id,
        country: countryCode,
        prep_acknowledged: true,
        slot_starts_at: slotStart.toISOString(),
        slot_ends_at: slotEnd.toISOString(),
      });
    expect(booking.status).toBe(201);
    await request(app.getHttpServer())
      .post(`/api/v1/me/imaging/bookings/${booking.body.id}/pay`)
      .set(auth(customerA.token))
      .set('Idempotency-Key', `s24-pay-${suffix}`)
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
    expect(checkIn.status).toBeLessThan(300);
    const studyId = checkIn.body.id as string;
    expect(checkIn.body.study_instance_uid).toMatch(/^1\.2\.840|^2\.25\./);

    const duplicateCheckIn = await request(app.getHttpServer())
      .post('/api/v1/radiology/check-in')
      .set(auth(imagingUser.token))
      .send({
        imaging_org_id: imagingA.id,
        imaging_booking_id: bookingId,
        assignee_person_id: tech.personId,
      });
    expect(duplicateCheckIn.status).toBeLessThan(300);
    expect(duplicateCheckIn.body.id).toBe(studyId);

    await request(app.getHttpServer())
      .post(`/api/v1/radiology/studies/${studyId}/start?imaging_org_id=${imagingA.id}`)
      .set(auth(tech.token))
      .set('Idempotency-Key', `s24-start-${suffix}`);

    const complete = await request(app.getHttpServer())
      .post(`/api/v1/radiology/studies/${studyId}/complete`)
      .set(auth(tech.token))
      .send({ imaging_org_id: imagingA.id, equipment_code: 'CT-1', modality_code: 'CT' });
    expect(complete.status).toBeLessThan(300);
    expect(complete.body.status).toBe(ImagingStudyStatus.ACQUIRED);
    expect(complete.body.dicom?.series?.length).toBeGreaterThanOrEqual(1);
    expect(complete.body.dicom.series[0].instances[0].object_stored).toBe(true);

    const duplicateComplete = await request(app.getHttpServer())
      .post(`/api/v1/radiology/studies/${studyId}/complete`)
      .set(auth(tech.token))
      .send({ imaging_org_id: imagingA.id, equipment_code: 'CT-1', modality_code: 'CT' });
    expect(duplicateComplete.status).toBeLessThan(300);
    expect(await prisma.imagingStudySeries.count({ where: { imagingStudyId: studyId } })).toBe(1);

    const studyRow = await prisma.imagingStudy.findUniqueOrThrow({
      where: { id: studyId },
      include: { series: { include: { instances: true } } },
    });
    expect(studyRow.studyInstanceUid).toMatch(/^1\.2\.840|^2\.25\./);
    expect(studyRow.series[0]?.seriesInstanceUid).toMatch(/^1\.2\.840|^2\.25\./);
    const sopUid = studyRow.series[0]!.instances[0]!.sopInstanceUid;
    expect(sopUid).toMatch(/^1\.2\.840|^2\.25\./);
    expect(studyRow.series[0]!.instances[0]!.status).toBe(ImagingStudyInstanceStatus.STORED);
    expect(studyRow.series[0]!.instances[0]!.objectKey).toBeTruthy();

    const ingestEvent = await prisma.outboxEvent.findFirst({
      where: { aggregateId: studyId, type: 'IMAGING_STUDY_INGESTED' },
    });
    expect(ingestEvent).toBeTruthy();
    await eventWorker.handle(ingestEvent!.id);

    const reportRow = await prisma.imagingReport.findUnique({ where: { imagingStudyId: studyId } });
    expect(reportRow).toBeTruthy();
    const reportId = reportRow!.id;

    const crossCenterStudy = await request(app.getHttpServer())
      .get(`/api/v1/radiology/studies/${studyId}?imaging_org_id=${imagingB.id}`)
      .set(auth(imagingUser.token));
    expect(crossCenterStudy.status).toBeGreaterThanOrEqual(400);

    const unauthorizedInstance = await request(app.getHttpServer())
      .get(`/api/v1/radiology/studies/${studyId}/instances/${sopUid}?imaging_org_id=${imagingA.id}`);
    expect(unauthorizedInstance.status).toBe(401);

    const customerInstance = await request(app.getHttpServer())
      .get(`/api/v1/radiology/studies/${studyId}/instances/${sopUid}?imaging_org_id=${imagingA.id}`)
      .set(auth(customerA.token));
    expect(customerInstance.status).toBeGreaterThanOrEqual(400);

    const authorizedInstance = await request(app.getHttpServer())
      .get(`/api/v1/radiology/studies/${studyId}/instances/${sopUid}?imaging_org_id=${imagingA.id}`)
      .set(auth(tech.token));
    expect(authorizedInstance.status).toBe(200);
    expect(authorizedInstance.body.sandbox).toBe(true);
    expect(authorizedInstance.body.payload_base64).toBeTruthy();

    const worklist = await request(app.getHttpServer())
      .get(`/api/v1/radiologist/worklist?imaging_org_id=${imagingA.id}`)
      .set(auth(radA.token));
    expect(worklist.status).toBe(200);
    expect(worklist.body.data.some((row: { id: string; study_instance_uid: string }) => row.id === reportId && row.study_instance_uid)).toBe(true);

    const crossRadCase = await request(app.getHttpServer())
      .get(`/api/v1/radiologist/cases/${studyId}?imaging_org_id=${imagingA.id}`)
      .set(auth(radOtherOrg.token));
    expect(crossRadCase.status).toBeGreaterThanOrEqual(400);

    await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/assign`)
      .set(auth(radA.token))
      .send({ imaging_org_id: imagingA.id });

    await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/findings`)
      .set(auth(radA.token))
      .send({
        imaging_org_id: imagingA.id,
        summary: 'Sandbox CT impression',
        findings: [{ finding_code: 'IMPRESSION', finding_text: 'No acute finding (sandbox PACS test)' }],
      });

    await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/submit`)
      .set(auth(radA.token))
      .send({ imaging_org_id: imagingA.id });

    const selfVerify = await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/verify`)
      .set(auth(radA.token))
      .send({ imaging_org_id: imagingA.id });
    expect(selfVerify.status).toBe(403);

    await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/verify`)
      .set(auth(radB.token))
      .send({ imaging_org_id: imagingA.id });

    const publish = await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/publish`)
      .set(auth(radB.token))
      .set('Idempotency-Key', `s24-pub-${suffix}`)
      .send({ imaging_org_id: imagingA.id });
    expect(publish.status).toBeLessThan(300);

    const customerReport = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${bookingId}/report`)
      .set(auth(customerA.token));
    expect(customerReport.status).toBe(200);
    expect(customerReport.body.study_instance_uid).toBe(studyRow.studyInstanceUid);

    const customerStudy = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${bookingId}/study`)
      .set(auth(customerA.token));
    expect(customerStudy.status).toBe(200);
    expect(customerStudy.body.study_instance_uid).toBe(studyRow.studyInstanceUid);
    // S152 — sandbox diagnostic viewer available when instances are stored.
    expect(customerStudy.body.viewer.available).toBe(true);
    expect(customerStudy.body.viewer.certified_diagnostic_workstation).toBe(false);

    const customerViewer = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${bookingId}/viewer`)
      .set(auth(customerA.token));
    expect(customerViewer.status).toBe(200);
    expect(customerViewer.body.series?.length).toBeGreaterThan(0);
    expect(customerViewer.body.viewer.public_urls).toBe(false);
    expect(JSON.stringify(customerViewer.body)).not.toMatch(/payload_base64|object_key|private-objects/);

    const seriesId = customerViewer.body.series[0].series_id as string;
    const frame = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${bookingId}/viewer/series/${seriesId}/frames/0`)
      .set(auth(customerA.token));
    expect(frame.status).toBe(200);
    expect(frame.headers['content-type']).toMatch(/image\/png/);
    expect(frame.headers['x-wp-public-url']).toBe('false');
    expect(Buffer.isBuffer(frame.body) || frame.body?.length > 0 || frame.text?.length > 0).toBeTruthy();

    const customerBViewer = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${bookingId}/viewer`)
      .set(auth(customerB.token));
    expect(customerBViewer.status).toBeGreaterThanOrEqual(400);

    const customerBReport = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${bookingId}/report`)
      .set(auth(customerB.token));
    expect(customerBReport.status).toBeGreaterThanOrEqual(400);

    const customerBStudy = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${bookingId}/study`)
      .set(auth(customerB.token));
    expect(customerBStudy.status).toBeGreaterThanOrEqual(400);

    const publishedVersion = await prisma.imagingReportVersion.findFirst({
      where: { imagingReportId: reportId, status: ImagingReportVersionStatus.PUBLISHED },
    });
    expect(publishedVersion).toBeTruthy();
    expect(studyRow.studyInstanceUid).toBe(studyRow.studyInstanceUid);
  });
});
