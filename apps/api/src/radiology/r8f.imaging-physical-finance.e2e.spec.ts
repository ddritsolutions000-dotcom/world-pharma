import { INestApplication } from '@nestjs/common';
import {
  FinancialFactKind,
  ImagingReportVersionStatus,
  LocationKind,
  LogisticsJobType,
  OrganizationKind,
  OrganizationStatus,
  PhysicalReportRequestStatus,
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

describe('R8-F imaging physical report + sandbox finance (e2e)', () => {
  jest.setTimeout(180_000);
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
          nameI18n: { en: 'R8F test' },
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
        checksum: `r8f-${suffix}`,
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

  it('imaging physical report lifecycle, finance facts, isolation, rider minimum PII', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const admin = await bootstrapSuperAdminByEmail(app, prisma, `r8f-admin-${suffix}@example.com`);
    const imagingUser = await signInAudience(app, `r8f-ia-${suffix}@example.com`);
    const tech = await signInAudience(app, `r8f-tech-${suffix}@example.com`);
    const radEnterer = await signInAudience(app, `r8f-rad-a-${suffix}@example.com`);
    const radVerifier = await signInAudience(app, `r8f-rad-b-${suffix}@example.com`);
    const customerA = await signInAudience(app, `r8f-ca-${suffix}@example.com`);
    const customerB = await signInAudience(app, `r8f-cb-${suffix}@example.com`);
    const rider = await signInAudience(app, `r8f-rider-${suffix}@example.com`);

    const enabledDoc = emptyPolicyDocument();
    enableImagingPartnerPack(enabledDoc, { physicalReport: true });
    enabledDoc.payments.enabled = true;
    enabledDoc.payments.methods = ['CARD'];
    enabledDoc.payments.gateway_refs = ['MOCK_PRIMARY'];
    enabledDoc.payments.currencies = ['XXX'];
    const country = await publishPack(enabledDoc, suffix);

    const imagingA = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.IMAGING_CENTER,
      legalName: `R8F Imaging A ${suffix}`,
      displayName: `R8F Imaging A ${suffix}`,
      actorId: admin.personId,
    });
    const imagingB = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.IMAGING_CENTER,
      legalName: `R8F Imaging B ${suffix}`,
      displayName: `R8F Imaging B ${suffix}`,
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
    await attachRider(rider.personId);
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
        slug: `r8f-imaging-${suffix}`,
        kind: 'IMAGING_STUDY',
        imaging_org_id: imagingA.id,
        title: 'MRI Brain',
        countries: [{ country_code: 'XX' }],
      });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set(auth(admin.token));
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/radiology/catalog/items/${item.body.id}/variants?imaging_org_id=${imagingA.id}`)
      .set(auth(imagingUser.token))
      .send({ sku_code: `R8F-${suffix}`, pack_size: '1 study' });
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
        sell_minor: '4500',
      });
    await request(app.getHttpServer())
      .post(`/api/v1/radiology/catalog/offers/${offer.body.id}/publish`)
      .set(auth(imagingUser.token));

    const locA = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: imagingA.id,
        countryId: country.id,
        kind: LocationKind.IMAGING,
        name: `R8F Center ${suffix}`,
        city: 'Testville',
        isActive: true,
      },
    });

    const slotStart = new Date(Date.now() + 86400000);
    slotStart.setUTCHours(11, 0, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + 3600000);
    const booking = await request(app.getHttpServer())
      .post('/api/v1/me/imaging/bookings')
      .set(auth(customerA.token))
      .set('Idempotency-Key', `r8f-book-${suffix}`)
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
      .set('Idempotency-Key', `r8f-pay-${suffix}`)
      .send({ scenario: 'success' });

    const bookingId = booking.body.id as string;
    const checkIn = await request(app.getHttpServer())
      .post('/api/v1/radiology/check-in')
      .set(auth(imagingUser.token))
      .send({ imaging_org_id: imagingA.id, imaging_booking_id: bookingId, assignee_person_id: tech.personId });
    const studyId = checkIn.body.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/radiology/studies/${studyId}/start?imaging_org_id=${imagingA.id}`)
      .set(auth(tech.token))
      .set('Idempotency-Key', `r8f-start-${suffix}`);
    await request(app.getHttpServer())
      .post(`/api/v1/radiology/studies/${studyId}/complete`)
      .set(auth(tech.token))
      .send({ imaging_org_id: imagingA.id, equipment_code: 'MRI-1', modality_code: 'MRI' });

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
    await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/publish`)
      .set(auth(radVerifier.token))
      .send({ imaging_org_id: imagingA.id, idempotency_key: `r8f-pub-${suffix}` });

    const imagingPayable = await prisma.financialFact.findUnique({
      where: { sourceKey: `imaging_payable:${bookingId}` },
    });
    expect(imagingPayable?.kind).toBe(FinancialFactKind.IMAGING_PAYABLE);

    const address = await prisma.customerAddress.create({
      data: {
        id: uuidv7(),
        customerPersonId: customerA.personId,
        countryId: country.id,
        recipientName: 'Customer A',
        city: 'Testville',
        line1: '1 Imaging St',
        isDefault: true,
      },
    });

    const preEligibility = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${bookingId}/physical-report/eligibility`)
      .set(auth(customerA.token));
    expect(preEligibility.status).toBe(200);
    expect(preEligibility.body.eligible).toBe(true);

    const preRequest = await request(app.getHttpServer())
      .post(`/api/v1/me/imaging/bookings/${bookingId}/physical-report`)
      .set(auth(customerA.token))
      .set('Idempotency-Key', `r8f-phys-${suffix}`)
      .send({ customer_address_id: address.id });
    expect(preRequest.status).toBeLessThan(300);
    expect(preRequest.body.status).toBe('REQUESTED');

    const duplicate = await request(app.getHttpServer())
      .post(`/api/v1/me/imaging/bookings/${bookingId}/physical-report`)
      .set(auth(customerA.token))
      .set('Idempotency-Key', `r8f-phys-${suffix}`)
      .send({ customer_address_id: address.id });
    expect(duplicate.status).toBeLessThan(300);
    expect(duplicate.body.id).toBe(preRequest.body.id);

    const customerBReq = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${bookingId}/physical-report`)
      .set(auth(customerB.token));
    expect([403, 404]).toContain(customerBReq.status);

    const wrongOrg = await request(app.getHttpServer())
      .get(`/api/v1/radiology/physical-reports?imaging_org_id=${imagingB.id}`)
      .set(auth(imagingUser.token));
    expect(wrongOrg.status).toBe(403);

    const queue = await request(app.getHttpServer())
      .get(`/api/v1/radiology/physical-reports?imaging_org_id=${imagingA.id}`)
      .set(auth(imagingUser.token));
    expect(queue.status).toBe(200);
    expect(queue.body.data.some((r: { id: string }) => r.id === preRequest.body.id)).toBe(true);

    const requestId = preRequest.body.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/radiology/physical-reports/${requestId}/accept`)
      .set(auth(imagingUser.token))
      .send({ imaging_org_id: imagingA.id });
    await request(app.getHttpServer())
      .post(`/api/v1/radiology/physical-reports/${requestId}/prepare`)
      .set(auth(imagingUser.token))
      .send({ imaging_org_id: imagingA.id });
    await request(app.getHttpServer())
      .post(`/api/v1/radiology/physical-reports/${requestId}/pack`)
      .set(auth(imagingUser.token))
      .send({ imaging_org_id: imagingA.id, sealed_package_id: `PKG-${suffix}` });

    const dispatchKey = `r8f-dispatch-${suffix}`;
    await request(app.getHttpServer())
      .post(`/api/v1/radiology/physical-reports/${requestId}/dispatch`)
      .set(auth(imagingUser.token))
      .send({ imaging_org_id: imagingA.id, idempotency_key: dispatchKey });

    const deliveryFee = await prisma.financialFact.findUnique({
      where: { sourceKey: `imaging_report_delivery_fee:${requestId}` },
    });
    expect(deliveryFee?.kind).toBe(FinancialFactKind.REPORT_DELIVERY_FEE);

    const dupDispatch = await request(app.getHttpServer())
      .post(`/api/v1/radiology/physical-reports/${requestId}/dispatch`)
      .set(auth(imagingUser.token))
      .send({ imaging_org_id: imagingA.id, idempotency_key: dispatchKey });
    expect(dupDispatch.status).toBeLessThan(300);

    const job = await prisma.logisticsJob.findFirstOrThrow({
      where: { imagingPhysicalReportRequestId: requestId, jobType: LogisticsJobType.REPORT_DELIVERY },
    });
    const jobList = await request(app.getHttpServer()).get('/api/v1/delivery/jobs').set(auth(rider.token));
    expect(jobList.status).toBe(200);
    const riderJob = jobList.body.data.find((j: { id: string }) => j.id === job.id);
    expect(riderJob).toBeTruthy();
    expect(riderJob.parcel_label).toContain('Sealed');
    expect(JSON.stringify(riderJob)).not.toMatch(/finding|diagnosis|IMPRESSION/i);

    await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${job.id}/accept`).set(auth(rider.token));
    await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${job.id}/pickup`).set(auth(rider.token));
    await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${job.id}/deliver`).set(auth(rider.token));

    const delivered = await request(app.getHttpServer())
      .get(`/api/v1/me/imaging/bookings/${bookingId}/physical-report`)
      .set(auth(customerA.token));
    expect(delivered.status).toBe(200);
    expect(delivered.body.status).toBe(PhysicalReportRequestStatus.DELIVERED);

    const version = await prisma.imagingReportVersion.findFirstOrThrow({
      where: { imagingReportId: reportId, status: ImagingReportVersionStatus.PUBLISHED },
    });
    expect(version.objectKey).toBeTruthy();
  });
});
