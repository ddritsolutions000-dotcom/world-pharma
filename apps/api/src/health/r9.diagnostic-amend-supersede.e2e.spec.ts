import { INestApplication } from '@nestjs/common';
import {
  HealthArtifactStatus,
  HealthArtifactType,
  HealthTimelineEventStatus,
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
import { EventWorkerService } from '../events/worker.service';
import { OrganizationService } from '../partner/organization.service';
import { PolicyCache } from '../policy/cache';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { applyTestIsolation } from '../test/isolate-runtime';
import { activateLabPartner, enableLabPartnerPack } from '../test/lab-partner';
import { activateImagingPartner, enableImagingPartnerPack } from '../test/imaging-partner';
import { attachRadiologist } from '../test/radiologist-partner';
import { nextPolicyPackVersion } from '../test/next-policy-pack-version';
import { LocationKind } from '@prisma/client';
import { authTenantContext } from '../tenancy/build-tenant-context';

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

describe('R9 diagnostic health artifact amend/supersede (e2e)', () => {
  jest.setTimeout(240_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let orgs: OrganizationService;
  let eventWorker: EventWorkerService;

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

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  async function grantSuperAdmin(personId: string) {
    const superAdmin = await prisma.role.findUnique({ where: { code: 'super_admin' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId,
        roleId: superAdmin!.id,
        scope: 'platform',
        status: 'ACTIVE',
      },
    });
  }

  async function attachOrgRole(personId: string, organizationId: string, roleCode: 'org_admin' | 'org_staff') {
    const role = await prisma.role.findUnique({ where: { code: roleCode } });
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
    await attachOrgRole(personId, organizationId, 'org_staff');
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
          nameI18n: { en: 'R9 diagnostic supersede test' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
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
        checksum: `r9-diag-${suffix}`,
        publishedAt: new Date(),
      },
    });
    await prisma.country.update({
      where: { id: country.id },
      data: { publishedPolicyPackId: pack.id },
    });
    await app.get(PolicyCache).invalidate('XX');
    return country;
  }

  it('lab amend re-publish supersedes prior health artifact and timeline', async () => {
    const suffix = `${Date.now().toString(36)}-lab-${uuidv7().slice(0, 8)}`;
    const admin = await signIn(app, `r9s-lab-admin-${suffix}@example.com`, 'admin');
    const labUser = await signIn(app, `r9s-lab-ops-${suffix}@example.com`);
    const labStaff = await signIn(app, `r9s-lab-staff-${suffix}@example.com`);
    const pathologist = await signIn(app, `r9s-lab-path-${suffix}@example.com`);
    const customerA = await signIn(app, `r9s-lab-ca-${suffix}@example.com`);
    const customerB = await signIn(app, `r9s-lab-cb-${suffix}@example.com`);
    const rider = await signIn(app, `r9s-lab-rider-${suffix}@example.com`);
    await grantSuperAdmin(admin.personId);

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
      legalName: `R9S Lab ${suffix}`,
      displayName: `R9S Lab ${suffix}`,
      actorId: admin.personId,
    });
    await prisma.organization.update({ where: { id: labA.id }, data: { status: OrganizationStatus.ACTIVE } });
    await attachOrgRole(labUser.personId, labA.id, 'org_admin');
    await attachOrgRole(labStaff.personId, labA.id, 'org_staff');
    await attachPathologist(pathologist.personId, labA.id);
    await attachRider(rider.personId);
    await activateLabPartner(app, { labToken: labUser.token, adminToken: admin.token, labOrgId: labA.id });

    const item = await request(app.getHttpServer())
      .post('/api/v1/lab/catalog/items')
      .set(auth(labUser.token))
      .send({
        slug: `r9s-lab-${suffix}`,
        kind: 'LAB_TEST',
        lab_org_id: labA.id,
        title: 'CBC Panel',
        countries: [{ country_code: 'XX' }],
      });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set(auth(admin.token));
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/lab/catalog/items/${item.body.id}/variants?lab_org_id=${labA.id}`)
      .set(auth(labUser.token))
      .send({ sku_code: `R9S-${suffix}`, pack_size: '1 draw' });
    const offer = await request(app.getHttpServer())
      .post('/api/v1/lab/catalog/offers')
      .set(auth(labUser.token))
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
      .set(auth(labUser.token));

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
      .set('Idempotency-Key', `r9s-lab-book-${suffix}`)
      .send({
        offer_id: offer.body.id,
        collection_mode: 'HOME',
        lab_org_id: labA.id,
        customer_address_id: address.id,
        country: 'XX',
        slot_starts_at: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(booking.status).toBe(201);
    await request(app.getHttpServer())
      .post(`/api/v1/me/lab/bookings/${booking.body.id}/pay`)
      .set(auth(customerA.token))
      .set('Idempotency-Key', `r9s-lab-pay-${suffix}`)
      .send({ scenario: 'success' });

    const sample = await prisma.labSample.findUniqueOrThrow({ where: { labBookingId: booking.body.id } });
    const collectionJob = await prisma.logisticsJob.findFirstOrThrow({
      where: { labSampleId: sample.id, jobType: LogisticsJobType.SAMPLE_COLLECTION },
    });
    await request(app.getHttpServer()).post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/accept`).set(auth(labUser.token));
    await request(app.getHttpServer()).post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/arrive`).set(auth(labUser.token)).send({});
    await request(app.getHttpServer()).post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/verify`).set(auth(labUser.token)).send({});
    await request(app.getHttpServer()).post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/collect`).set(auth(labUser.token)).send({});
    await request(app.getHttpServer())
      .post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/seal`)
      .set(auth(labUser.token))
      .send({ container_barcode: `R9S-${suffix}` });
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
    await request(app.getHttpServer())
      .post('/api/v1/lab/accessions')
      .set(auth(labUser.token))
      .send({ lab_org_id: labA.id, lab_sample_id: sample.id, idempotency_key: `r9s-acc-${suffix}` });
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
        summary: 'v1 summary',
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
    const publishV1 = await request(app.getHttpServer())
      .post(`/api/v1/pathologist/reports/${report.id}/publish`)
      .set(auth(pathologist.token))
      .send({ lab_org_id: labA.id, idempotency_key: `r9s-lab-pub1-${suffix}` });
    expect(publishV1.status).toBeLessThan(300);

    const artifactsV1 = await prisma.runWithTenant(authTenantContext(customerA.personId), () =>
      prisma.healthArtifact.findMany({
        where: { labBookingId: booking.body.id, artifactType: HealthArtifactType.LAB_REPORT },
        orderBy: { publishedAt: 'asc' },
      }),
    );
    expect(artifactsV1).toHaveLength(1);
    expect(artifactsV1[0]?.status).toBe(HealthArtifactStatus.ACTIVE);
    const timelineV1 = await request(app.getHttpServer())
      .get('/api/v1/health/timeline?country_code=XX')
      .set(auth(customerA.token));
    expect(timelineV1.status).toBe(200);
    const labItemsV1 = timelineV1.body.items.filter((row: { artifact_type: string }) => row.artifact_type === 'LAB_REPORT');
    expect(labItemsV1).toHaveLength(1);
    expect(labItemsV1[0].artifact_id).toBe(artifactsV1[0]?.id);

    const amend = await request(app.getHttpServer())
      .post(`/api/v1/pathologist/reports/${report.id}/amend`)
      .set(auth(pathologist.token))
      .send({ lab_org_id: labA.id, reason: 'Corrected hemoglobin' });
    expect(amend.status).toBeLessThan(300);
    await request(app.getHttpServer())
      .post(`/api/v1/lab/reports/${report.id}/results`)
      .set(auth(labStaff.token))
      .send({
        lab_org_id: labA.id,
        summary: 'v2 summary',
        lines: [{ analyte_code: 'HGB', analyte_name: 'Hemoglobin', value: '13', unit: 'g/dL' }],
      });
    await request(app.getHttpServer())
      .post(`/api/v1/lab/reports/${report.id}/submit-verify`)
      .set(auth(labStaff.token))
      .send({ lab_org_id: labA.id });
    await request(app.getHttpServer())
      .post(`/api/v1/pathologist/reports/${report.id}/verify`)
      .set(auth(pathologist.token))
      .send({ lab_org_id: labA.id });
    const publishV2 = await request(app.getHttpServer())
      .post(`/api/v1/pathologist/reports/${report.id}/publish`)
      .set(auth(pathologist.token))
      .send({ lab_org_id: labA.id, idempotency_key: `r9s-lab-pub2-${suffix}` });
    expect(publishV2.status).toBeLessThan(300);

    const artifactsV2 = await prisma.runWithTenant(authTenantContext(customerA.personId), () =>
      prisma.healthArtifact.findMany({
        where: { labBookingId: booking.body.id, artifactType: HealthArtifactType.LAB_REPORT },
        orderBy: { publishedAt: 'asc' },
      }),
    );
    expect(artifactsV2).toHaveLength(2);
    expect(artifactsV2[0]?.status).toBe(HealthArtifactStatus.SUPERSEDED);
    expect(artifactsV2[1]?.status).toBe(HealthArtifactStatus.ACTIVE);

    const timelineV2 = await request(app.getHttpServer())
      .get('/api/v1/health/timeline?country_code=XX')
      .set(auth(customerA.token));
    const labItemsV2 = timelineV2.body.items.filter((row: { artifact_type: string }) => row.artifact_type === 'LAB_REPORT');
    expect(labItemsV2).toHaveLength(1);
    expect(labItemsV2[0].artifact_id).toBe(artifactsV2[1]?.id);
    expect(labItemsV2[0].status).toBe(HealthTimelineEventStatus.ACTIVE);

    const payload = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${artifactsV2[1]!.id}/payload?country_code=XX`)
      .set(auth(customerA.token));
    expect(payload.status).toBe(200);
    expect(payload.body.payload.results[0].value).toBe('13');

    const foreignTimeline = await request(app.getHttpServer())
      .get('/api/v1/health/timeline?country_code=XX')
      .set(auth(customerB.token));
    expect(foreignTimeline.body.items.filter((row: { artifact_type: string }) => row.artifact_type === 'LAB_REPORT')).toHaveLength(0);
    const foreignMeta = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${artifactsV2[1]!.id}?country_code=XX`)
      .set(auth(customerB.token));
    expect(foreignMeta.status).toBe(404);
    const missingCountry = `Y${uuidv7().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
    const wrongCountry = await request(app.getHttpServer())
      .get(`/api/v1/health/timeline?country_code=${missingCountry}`)
      .set(auth(customerA.token));
    expect(wrongCountry.status).toBe(404);

    const publishEvents = await prisma.outboxEvent.findMany({
      where: { type: 'LAB_REPORT_PUBLISHED', aggregateId: report.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(publishEvents.length).toBe(2);
    const replayCountBefore = artifactsV2.length;
    const timelineCountBefore = await prisma.runWithTenant(authTenantContext(customerA.personId), () =>
      prisma.healthTimelineEvent.count({
        where: { sourceModule: 'lab', sourceId: booking.body.id },
      }),
    );
    expect(timelineCountBefore).toBe(2);
    await eventWorker.handle(publishEvents[1]!.id);
    await eventWorker.handle(publishEvents[1]!.id);
    const afterReplay = await prisma.runWithTenant(authTenantContext(customerA.personId), () =>
      prisma.healthArtifact.count({
        where: { labBookingId: booking.body.id, artifactType: HealthArtifactType.LAB_REPORT },
      }),
    );
    expect(afterReplay).toBe(replayCountBefore);
    const timelineCountAfter = await prisma.runWithTenant(authTenantContext(customerA.personId), () =>
      prisma.healthTimelineEvent.count({
        where: { sourceModule: 'lab', sourceId: booking.body.id },
      }),
    );
    expect(timelineCountAfter).toBe(timelineCountBefore);
    const activeAfterReplay = await prisma.runWithTenant(authTenantContext(customerA.personId), () =>
      prisma.healthArtifact.count({
        where: {
          labBookingId: booking.body.id,
          artifactType: HealthArtifactType.LAB_REPORT,
          status: HealthArtifactStatus.ACTIVE,
        },
      }),
    );
    expect(activeAfterReplay).toBe(1);
  });

  it('imaging amend re-publish supersedes prior health artifact and timeline', async () => {
    const suffix = `${Date.now().toString(36)}-img-${uuidv7().slice(0, 8)}`;
    const admin = await signIn(app, `r9s-img-admin-${suffix}@example.com`, 'admin');
    const imagingUser = await signIn(app, `r9s-img-ops-${suffix}@example.com`);
    const tech = await signIn(app, `r9s-img-tech-${suffix}@example.com`);
    const radEnterer = await signIn(app, `r9s-img-rad-a-${suffix}@example.com`);
    const radVerifier = await signIn(app, `r9s-img-rad-b-${suffix}@example.com`);
    const customerA = await signIn(app, `r9s-img-ca-${suffix}@example.com`);
    const customerB = await signIn(app, `r9s-img-cb-${suffix}@example.com`);
    await grantSuperAdmin(admin.personId);

    const enabledDoc = emptyPolicyDocument();
    enableImagingPartnerPack(enabledDoc);
    enabledDoc.healthcare.health_timeline_enabled = true;
    enabledDoc.payments.enabled = true;
    enabledDoc.payments.methods = ['CARD'];
    enabledDoc.payments.gateway_refs = ['MOCK_PRIMARY'];
    enabledDoc.payments.currencies = ['XXX'];
    const country = await publishPack(enabledDoc, suffix);

    const imagingA = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.IMAGING_CENTER,
      legalName: `R9S Imaging ${suffix}`,
      displayName: `R9S Imaging ${suffix}`,
      actorId: admin.personId,
    });
    await prisma.organization.update({ where: { id: imagingA.id }, data: { status: OrganizationStatus.ACTIVE } });
    await attachOrgRole(imagingUser.personId, imagingA.id, 'org_admin');
    await attachOrgRole(tech.personId, imagingA.id, 'org_staff');
    await attachRadiologist(prisma, radEnterer.personId, imagingA.id);
    await attachRadiologist(prisma, radVerifier.personId, imagingA.id);
    await activateImagingPartner(app, {
      imagingToken: imagingUser.token,
      adminToken: admin.token,
      imagingOrgId: imagingA.id,
    });

    const locA = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: imagingA.id,
        countryId: country.id,
        kind: LocationKind.IMAGING,
        name: `R9S Center ${suffix}`,
        city: 'Testville',
        isActive: true,
      },
    });
    const item = await request(app.getHttpServer())
      .post('/api/v1/radiology/catalog/items')
      .set(auth(imagingUser.token))
      .send({
        slug: `r9s-img-${suffix}`,
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
      .set('Idempotency-Key', `r9s-img-book-${suffix}`)
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
      .set('Idempotency-Key', `r9s-img-pay-${suffix}`)
      .send({ scenario: 'success' });

    const checkIn = await request(app.getHttpServer())
      .post('/api/v1/radiology/check-in')
      .set(auth(imagingUser.token))
      .send({
        imaging_org_id: imagingA.id,
        imaging_booking_id: booking.body.id,
        assignee_person_id: tech.personId,
      });
    const studyId = checkIn.body.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/radiology/studies/${studyId}/start?imaging_org_id=${imagingA.id}`)
      .set(auth(tech.token))
      .set('Idempotency-Key', `r9s-img-start-${suffix}`);
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
    const publishV1 = await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/publish`)
      .set(auth(radVerifier.token))
      .send({ imaging_org_id: imagingA.id, idempotency_key: `r9s-img-pub1-${suffix}` });
    expect(publishV1.status).toBeLessThan(300);

    const artifactsV1 = await prisma.runWithTenant(authTenantContext(customerA.personId), () =>
      prisma.healthArtifact.findMany({
        where: { imagingBookingId: booking.body.id, artifactType: HealthArtifactType.IMAGING_REPORT },
        orderBy: { publishedAt: 'asc' },
      }),
    );
    expect(artifactsV1).toHaveLength(1);
    expect(artifactsV1[0]?.status).toBe(HealthArtifactStatus.ACTIVE);

    const amend = await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/amend`)
      .set(auth(radEnterer.token))
      .send({ imaging_org_id: imagingA.id, reason: 'Updated impression' });
    expect(amend.status).toBeLessThan(300);
    await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/findings`)
      .set(auth(radEnterer.token))
      .send({
        imaging_org_id: imagingA.id,
        summary: 'Amended impression',
        findings: [{ finding_code: 'IMPRESSION', finding_text: 'Updated sandbox finding' }],
      });
    await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/submit`)
      .set(auth(radEnterer.token))
      .send({ imaging_org_id: imagingA.id });
    await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/verify`)
      .set(auth(radVerifier.token))
      .send({ imaging_org_id: imagingA.id });
    const publishV2 = await request(app.getHttpServer())
      .post(`/api/v1/radiologist/reports/${reportId}/publish`)
      .set(auth(radVerifier.token))
      .send({ imaging_org_id: imagingA.id, idempotency_key: `r9s-img-pub2-${suffix}` });
    expect(publishV2.status).toBeLessThan(300);

    const artifactsV2 = await prisma.runWithTenant(authTenantContext(customerA.personId), () =>
      prisma.healthArtifact.findMany({
        where: { imagingBookingId: booking.body.id, artifactType: HealthArtifactType.IMAGING_REPORT },
        orderBy: { publishedAt: 'asc' },
      }),
    );
    expect(artifactsV2).toHaveLength(2);
    expect(artifactsV2[0]?.status).toBe(HealthArtifactStatus.SUPERSEDED);
    expect(artifactsV2[1]?.status).toBe(HealthArtifactStatus.ACTIVE);

    const timeline = await request(app.getHttpServer())
      .get('/api/v1/health/timeline?country_code=XX')
      .set(auth(customerA.token));
    const imgItems = timeline.body.items.filter(
      (row: { artifact_type: string }) => row.artifact_type === 'IMAGING_REPORT',
    );
    expect(imgItems).toHaveLength(1);
    expect(imgItems[0].artifact_id).toBe(artifactsV2[1]?.id);

    const payload = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${artifactsV2[1]!.id}/payload?country_code=XX`)
      .set(auth(customerA.token));
    expect(payload.status).toBe(200);
    expect(payload.body.payload.findings[0].finding_text).toMatch(/Updated sandbox/i);

    const foreignMeta = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${artifactsV2[1]!.id}?country_code=XX`)
      .set(auth(customerB.token));
    expect(foreignMeta.status).toBe(404);

    const publishEvents = await prisma.outboxEvent.findMany({
      where: { type: 'IMAGING_REPORT_PUBLISHED', aggregateId: reportId },
      orderBy: { createdAt: 'asc' },
    });
    expect(publishEvents.length).toBe(2);
    const timelineCountBefore = await prisma.runWithTenant(authTenantContext(customerA.personId), () =>
      prisma.healthTimelineEvent.count({
        where: { sourceModule: 'radiology', sourceId: booking.body.id },
      }),
    );
    expect(timelineCountBefore).toBe(2);
    await eventWorker.handle(publishEvents[1]!.id);
    await eventWorker.handle(publishEvents[1]!.id);
    const afterReplay = await prisma.runWithTenant(authTenantContext(customerA.personId), () =>
      prisma.healthArtifact.count({
        where: { imagingBookingId: booking.body.id, artifactType: HealthArtifactType.IMAGING_REPORT },
      }),
    );
    expect(afterReplay).toBe(2);
    const timelineCountAfter = await prisma.runWithTenant(authTenantContext(customerA.personId), () =>
      prisma.healthTimelineEvent.count({
        where: { sourceModule: 'radiology', sourceId: booking.body.id },
      }),
    );
    expect(timelineCountAfter).toBe(2);
  });
});
