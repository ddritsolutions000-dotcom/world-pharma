import { INestApplication } from '@nestjs/common';
import {
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
import { bootstrapSuperAdminByEmail, signIn as signInAudience } from '../test/sign-in';

describe('R8-D radiologist interpretation + SoD (e2e)', () => {
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

  async function publishPack(doc: ReturnType<typeof emptyPolicyDocument>, suffix: string) {
    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'XX' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'XX',
          isoAlpha3: 'XXX',
          nameI18n: { en: 'R8D test' },
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
        checksum: `r8d-${suffix}`,
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

  it('radiologist worklist, assignment, draft, SoD verify, isolation, no customer findings', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const admin = await bootstrapSuperAdminByEmail(app, prisma, `r8d-admin-${suffix}@example.com`);
    const imagingUser = await signInAudience(app, `r8d-ia-${suffix}@example.com`);
    const tech = await signInAudience(app, `r8d-tech-${suffix}@example.com`);
    const radA = await signInAudience(app, `r8d-rad-a-${suffix}@example.com`);
    const radB = await signInAudience(app, `r8d-rad-b-${suffix}@example.com`);
    const radOtherOrg = await signInAudience(app, `r8d-rad-c-${suffix}@example.com`);
    const customer = await signInAudience(app, `r8d-cust-${suffix}@example.com`);

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
      legalName: `R8D Imaging A ${suffix}`,
      displayName: `R8D Imaging A ${suffix}`,
      actorId: admin.personId,
    });
    const imagingB = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.IMAGING_CENTER,
      legalName: `R8D Imaging B ${suffix}`,
      displayName: `R8D Imaging B ${suffix}`,
      actorId: admin.personId,
    });
    await prisma.organization.updateMany({
      where: { id: { in: [imagingA.id, imagingB.id] } },
      data: { status: OrganizationStatus.ACTIVE },
    });
    await attachOrgAdmin(imagingUser.personId, imagingA.id);
    await attachOrgAdmin(tech.personId, imagingA.id);
    await attachRadiologist(prisma, radA.personId, imagingA.id);
    await attachRadiologist(prisma, radB.personId, imagingA.id);
    await attachRadiologist(prisma, radOtherOrg.personId, imagingB.id);

    const country = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'XX' } });
    const locA = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: imagingA.id,
        countryId: country.id,
        kind: LocationKind.IMAGING,
        name: `R8D Center ${suffix}`,
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
        slug: `r8d-imaging-${suffix}`,
        kind: 'IMAGING_STUDY',
        imaging_org_id: imagingA.id,
        title: 'CT Abdomen',
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
      .set(auth(customer.token))
      .set('Idempotency-Key', `r8d-book-${suffix}`)
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
      .set(auth(customer.token))
      .set('Idempotency-Key', `r8d-pay-${suffix}`)
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
      .set('Idempotency-Key', `r8d-start-${suffix}`);
    const complete = await request(app.getHttpServer())
      .post(`/api/v1/radiology/studies/${studyId}/complete`)
      .set(auth(tech.token))
      .send({ imaging_org_id: imagingA.id, equipment_code: 'CT-1', modality_code: 'CT' });
    expect(complete.status).toBeLessThan(300);
    expect(complete.body.status).toBe('ACQUIRED');

    const reportRow = await prisma.imagingReport.findUnique({ where: { imagingStudyId: studyId } });
    expect(reportRow).toBeTruthy();
    const reportId = reportRow!.id;

    const techWorklist = await request(app.getHttpServer())
      .get(`/api/v1/radiologist/worklist?imaging_org_id=${imagingA.id}`)
      .set(auth(tech.token));
    expect(techWorklist.status).toBe(403);

    const crossOrgWorklist = await request(app.getHttpServer())
      .get(`/api/v1/radiologist/worklist?imaging_org_id=${imagingA.id}`)
      .set(auth(radOtherOrg.token));
    expect(crossOrgWorklist.status).toBe(403);

    const worklist = await request(app.getHttpServer())
      .get(`/api/v1/radiologist/worklist?imaging_org_id=${imagingA.id}`)
      .set(auth(radA.token));
    expect(worklist.status).toBe(200);
    expect(worklist.body.data.some((row: { id: string }) => row.id === reportId)).toBe(true);
    expect(JSON.stringify(worklist.body)).not.toMatch(/pneumonia|fracture/i);

    const caseDetail = await request(app.getHttpServer())
      .get(`/api/v1/radiologist/cases/${studyId}?imaging_org_id=${imagingA.id}`)
      .set(auth(radA.token));
    expect(caseDetail.status).toBe(200);
    expect(caseDetail.body.acquisition.sandbox_object_ref).toMatch(/^(sandbox|private):\/\//);
    expect(caseDetail.body.boundary.publication).toBe(false);
    expect(caseDetail.body.boundary.pacs).toBe(false);

    const findingsWithoutAssign = await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/findings`)
      .set(auth(radA.token))
      .send({
        imaging_org_id: imagingA.id,
        summary: 'Sandbox impression',
        findings: [{ finding_code: 'IMPRESSION', finding_text: 'No acute abnormality (sandbox)' }],
      });
    expect(findingsWithoutAssign.status).toBe(403);

    await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/assign`)
      .set(auth(radA.token))
      .send({ imaging_org_id: imagingA.id });

    const assignDup = await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/assign`)
      .set(auth(radB.token))
      .send({ imaging_org_id: imagingA.id });
    expect(assignDup.status).toBe(403);

    const findings = await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/findings`)
      .set(auth(radA.token))
      .send({
        imaging_org_id: imagingA.id,
        summary: 'Sandbox impression',
        findings: [{ finding_code: 'IMPRESSION', finding_text: 'No acute abnormality (sandbox)' }],
      });
    expect(findings.status).toBeLessThan(300);
    expect(findings.body.version.status).toBe('DRAFT');

    const submit = await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/submit`)
      .set(auth(radA.token))
      .send({ imaging_org_id: imagingA.id });
    expect(submit.status).toBeLessThan(300);
    expect(submit.body.version.status).toBe('PENDING_VERIFY');

    const verifyQueue = await request(app.getHttpServer())
      .get(`/api/v1/radiologist/verify-queue?imaging_org_id=${imagingA.id}`)
      .set(auth(radB.token));
    expect(verifyQueue.status).toBe(200);
    expect(verifyQueue.body.data.some((row: { id: string }) => row.id === reportId)).toBe(true);

    const sodVerify = await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/verify`)
      .set(auth(radA.token))
      .send({ imaging_org_id: imagingA.id });
    expect(sodVerify.status).toBe(403);

    const verify = await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/verify`)
      .set(auth(radB.token))
      .send({ imaging_org_id: imagingA.id });
    expect(verify.status).toBeLessThan(300);
    expect(verify.body.version.status).toBe('VERIFIED');

    const illegalEdit = await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/findings`)
      .set(auth(radB.token))
      .send({
        imaging_org_id: imagingA.id,
        findings: [{ finding_code: 'IMPRESSION', finding_text: 'Should fail' }],
      });
    expect(illegalEdit.status).toBe(409);

    const progress = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${bookingId}/progress`)
      .set(auth(customer.token));
    expect(progress.status).toBe(200);
    expect(progress.body.progress).toBe('INTERPRETATION_VERIFIED');
    expect(progress.body.boundary.report).toBe(false);
    expect(JSON.stringify(progress.body)).not.toMatch(/abnormality|impression|finding/i);

    const study = await prisma.imagingStudy.findUniqueOrThrow({ where: { id: studyId } });
    expect(study.status).toBe(ImagingStudyStatus.ACQUIRED);
    const version = await prisma.imagingReportVersion.findFirstOrThrow({
      where: { imagingReportId: reportId },
    });
    expect(version.status).toBe(ImagingReportVersionStatus.VERIFIED);
  });
});
