import { INestApplication } from '@nestjs/common';
import {
  LabReportVersionStatus,
  LabSampleCocStatus,
  LocationKind,
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
import { applyTestIsolation } from '../test/isolate-runtime';
import { activateLabPartner, enableLabPartnerPack } from '../test/lab-partner';
import { EventWorkerService } from '../events/worker.service';

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

describe('R7-E pathology + digital report (e2e)', () => {
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
          nameI18n: { en: 'R7E test' },
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
        checksum: `r7e-${suffix}`,
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

  it('pathology workflow, SoD, isolation, customer final report only', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const admin = await signIn(app, `r7e-admin-${suffix}@example.com`, 'admin');
    const labUser = await signIn(app, `r7e-lab-${suffix}@example.com`);
    const labStaff = await signIn(app, `r7e-staff-${suffix}@example.com`);
    const pathologist = await signIn(app, `r7e-path-${suffix}@example.com`);
    const pathologistB = await signIn(app, `r7e-pathb-${suffix}@example.com`);
    const customerA = await signIn(app, `r7e-ca-${suffix}@example.com`);
    const customerB = await signIn(app, `r7e-cb-${suffix}@example.com`);
    const rider = await signIn(app, `r7e-rider-${suffix}@example.com`);

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
    enableLabPartnerPack(enabledDoc, { home: true, center: true });
    enabledDoc.payments.enabled = true;
    enabledDoc.payments.methods = ['CARD'];
    enabledDoc.payments.gateway_refs = ['MOCK_PRIMARY'];
    enabledDoc.payments.currencies = ['XXX'];
    const country = await publishPack(enabledDoc, suffix);

    const labA = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.LAB,
      legalName: `R7E Lab A ${suffix}`,
      displayName: `R7E Lab A ${suffix}`,
      actorId: admin.personId,
    });
    const labB = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.LAB,
      legalName: `R7E Lab B ${suffix}`,
      displayName: `R7E Lab B ${suffix}`,
      actorId: admin.personId,
    });
    await prisma.organization.updateMany({
      where: { id: { in: [labA.id, labB.id] } },
      data: { status: OrganizationStatus.ACTIVE },
    });

    await attachOrgAdmin(labUser.personId, labA.id);
    await attachOrgStaff(labStaff.personId, labA.id);
    await attachPathologist(pathologist.personId, labA.id);
    await attachPathologist(pathologistB.personId, labB.id);
    await attachRider(rider.personId);

    await activateLabPartner(app, { labToken: labUser.token, adminToken: admin.token, labOrgId: labA.id });

    const item = await request(app.getHttpServer())
      .post('/api/v1/lab/catalog/items')
      .set('Authorization', `Bearer ${labUser.token}`)
      .send({
        slug: `r7e-lab-${suffix}`,
        kind: 'LAB_TEST',
        lab_org_id: labA.id,
        title: 'CBC Panel',
        countries: [{ country_code: 'XX' }],
      });
    expect(item.status).toBe(201);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/lab/catalog/items/${item.body.id}/variants?lab_org_id=${labA.id}`)
      .set('Authorization', `Bearer ${labUser.token}`)
      .send({ sku_code: `R7E-${suffix}`, pack_size: '1 draw' });
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
      .set('Idempotency-Key', `r7e-book-${suffix}`)
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
      .set('Authorization', `Bearer ${customerA.token}`)
      .set('Idempotency-Key', `r7e-pay-${suffix}`)
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
      .send({ container_barcode: `R7E-${suffix}` });
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
      .send({ lab_org_id: labA.id, lab_sample_id: sample.id, idempotency_key: `r7e-acc-${suffix}` });
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
    expect(report.currentVersionId).toBeTruthy();

    const pathOnlyEnter = await request(app.getHttpServer())
      .post(`/api/v1/lab/reports/${report.id}/results`)
      .set(auth(pathologist.token))
      .send({
        lab_org_id: labA.id,
        summary: 'Should fail SoD pathologist-only',
        lines: [{ analyte_code: 'HGB', analyte_name: 'Hemoglobin', value: '14', unit: 'g/dL' }],
      });
    expect(pathOnlyEnter.status).toBe(403);

    const enter = await request(app.getHttpServer())
      .post(`/api/v1/lab/reports/${report.id}/results`)
      .set(auth(labStaff.token))
      .send({
        lab_org_id: labA.id,
        summary: 'Sandbox summary',
        lines: [{ analyte_code: 'HGB', analyte_name: 'Hemoglobin', value: '14', unit: 'g/dL' }],
      });
    expect(enter.status).toBeLessThan(300);

    const submit = await request(app.getHttpServer())
      .post(`/api/v1/lab/reports/${report.id}/submit-verify`)
      .set(auth(labStaff.token))
      .send({ lab_org_id: labA.id });
    expect(submit.status).toBeLessThan(300);
    expect(submit.body.version.status).toBe('PENDING_VERIFY');

    const selfVerify = await request(app.getHttpServer())
      .post(`/api/v1/pathologist/reports/${report.id}/verify`)
      .set(auth(labStaff.token))
      .send({ lab_org_id: labA.id });
    expect(selfVerify.status).toBe(403);

    const wrongLab = await request(app.getHttpServer())
      .get(`/api/v1/pathologist/work?lab_org_id=${labB.id}`)
      .set(auth(pathologist.token));
    expect(wrongLab.status).toBe(403);

    await request(app.getHttpServer())
      .post(`/api/v1/pathologist/reports/${report.id}/assign`)
      .set(auth(pathologist.token))
      .send({ lab_org_id: labA.id });
    const verify = await request(app.getHttpServer())
      .post(`/api/v1/pathologist/reports/${report.id}/verify`)
      .set(auth(pathologist.token))
      .send({ lab_org_id: labA.id });
    expect(verify.status).toBeLessThan(300);

    const prePublishCustomer = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/bookings/${booking.body.id}/report`)
      .set(auth(customerA.token));
    expect(prePublishCustomer.status).toBe(404);

    const publish = await request(app.getHttpServer())
      .post(`/api/v1/pathologist/reports/${report.id}/publish`)
      .set(auth(pathologist.token))
      .send({ lab_org_id: labA.id, idempotency_key: `r7e-pub-${suffix}` });
    expect(publish.status).toBeLessThan(300);
    expect(publish.body.version.status).toBe('PUBLISHED');

    const publishEvents = await prisma.outboxEvent.findMany({
      where: { type: 'LAB_REPORT_PUBLISHED', aggregateId: report.id },
    });
    expect(publishEvents).toHaveLength(1);
    expect(publishEvents[0]?.payload).toMatchObject({
      customer_person_id: customerA.personId,
      lab_booking_id: booking.body.id,
      sandbox: true,
    });
    expect(JSON.stringify(publishEvents)).not.toMatch(/Hemoglobin|"value":"14"/i);

    await eventWorker.handle(publishEvents[0]!.id);
    await eventWorker.handle(publishEvents[0]!.id);

    const customerInbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set(auth(customerA.token));
    expect(customerInbox.status).toBe(200);
    const publishedNotifications = (customerInbox.body.data ?? customerInbox.body).filter(
      (row: { title: string }) => row.title === 'Lab report ready',
    );
    expect(publishedNotifications.length).toBe(1);

    const customerBInbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set(auth(customerB.token));
    const customerBPublished = (customerBInbox.body.data ?? customerBInbox.body).filter(
      (row: { title: string }) => row.title === 'Lab report ready',
    );
    expect(customerBPublished.length).toBe(0);

    const version = await prisma.labReportVersion.findUniqueOrThrow({ where: { id: report.currentVersionId! } });
    expect(version.status).toBe(LabReportVersionStatus.PUBLISHED);
    expect(version.objectKey).toBeTruthy();

    const immutable = await request(app.getHttpServer())
      .post(`/api/v1/lab/reports/${report.id}/results`)
      .set(auth(labStaff.token))
      .send({
        lab_org_id: labA.id,
        lines: [{ analyte_code: 'HGB', analyte_name: 'Hemoglobin', value: '99', unit: 'g/dL' }],
      });
    expect(immutable.status).toBe(409);

    const customerReport = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/bookings/${booking.body.id}/report`)
      .set(auth(customerA.token));
    expect(customerReport.status).toBe(200);
    expect(customerReport.body.results[0].value).toBe('14');
    expect(JSON.stringify(customerReport.body)).not.toMatch(/"internal_|pathologist_note/i);

    const customerBReport = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/bookings/${booking.body.id}/report`)
      .set(auth(customerB.token));
    expect(customerBReport.status).toBe(403);

    const progress = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/bookings/${booking.body.id}/collection`)
      .set(auth(customerA.token));
    expect(progress.body.boundary.results_available).toBe(true);

    const adminMeta = await request(app.getHttpServer())
      .get(`/api/v1/admin/lab/reports?lab_org_id=${labA.id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(adminMeta.status).toBe(200);
    expect(adminMeta.body.data.some((r: { id: string }) => r.id === report.id)).toBe(true);
  });

  it('report amendment creates new version with lineage and isolation', async () => {
    const suffix = `${Date.now().toString(36)}-amend-${uuidv7().slice(0, 8)}`;
    const admin = await signIn(app, `r7e-amend-admin-${suffix}@example.com`, 'admin');
    const labUser = await signIn(app, `r7e-amend-lab-${suffix}@example.com`);
    const labStaff = await signIn(app, `r7e-amend-staff-${suffix}@example.com`);
    const pathologist = await signIn(app, `r7e-amend-path-${suffix}@example.com`);
    const pathologistB = await signIn(app, `r7e-amend-pathb-${suffix}@example.com`);
    const customerA = await signIn(app, `r7e-amend-ca-${suffix}@example.com`);
    const customerB = await signIn(app, `r7e-amend-cb-${suffix}@example.com`);

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
    enableLabPartnerPack(enabledDoc, { home: true, center: true });
    enabledDoc.payments.enabled = true;
    enabledDoc.payments.methods = ['CARD'];
    enabledDoc.payments.gateway_refs = ['MOCK_PRIMARY'];
    enabledDoc.payments.currencies = ['XXX'];
    const country = await publishPack(enabledDoc, `amend-${suffix}`);

    const labA = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.LAB,
      legalName: `R7E Amend Lab A ${suffix}`,
      displayName: `R7E Amend Lab A ${suffix}`,
      actorId: admin.personId,
    });
    const labB = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.LAB,
      legalName: `R7E Amend Lab B ${suffix}`,
      displayName: `R7E Amend Lab B ${suffix}`,
      actorId: admin.personId,
    });
    await prisma.organization.updateMany({
      where: { id: { in: [labA.id, labB.id] } },
      data: { status: OrganizationStatus.ACTIVE },
    });

    await attachOrgAdmin(labUser.personId, labA.id);
    await attachOrgStaff(labStaff.personId, labA.id);
    await attachPathologist(pathologist.personId, labA.id);
    await attachPathologist(pathologistB.personId, labB.id);
    await activateLabPartner(app, { labToken: labUser.token, adminToken: admin.token, labOrgId: labA.id });

    const item = await request(app.getHttpServer())
      .post('/api/v1/lab/catalog/items')
      .set('Authorization', `Bearer ${labUser.token}`)
      .send({
        slug: `r7e-amend-${suffix}`,
        kind: 'LAB_TEST',
        lab_org_id: labA.id,
        title: 'Amend Panel',
        countries: [{ country_code: 'XX' }],
      });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/lab/catalog/items/${item.body.id}/variants?lab_org_id=${labA.id}`)
      .set('Authorization', `Bearer ${labUser.token}`)
      .send({ sku_code: `R7E-AM-${suffix}`, pack_size: '1 draw' });
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
      .set('Idempotency-Key', `r7e-amend-book-${suffix}`)
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
      .set('Idempotency-Key', `r7e-amend-pay-${suffix}`)
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
      .send({ container_barcode: `R7E-AM-${suffix}` });
    await request(app.getHttpServer())
      .post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/handover`)
      .set(auth(labUser.token))
      .send({});

    const transportJob = await prisma.logisticsJob.findFirstOrThrow({
      where: { labSampleId: sample.id, jobType: LogisticsJobType.SAMPLE_TRANSPORT },
    });
    const rider = await signIn(app, `r7e-amend-rider-${suffix}@example.com`);
    await attachRider(rider.personId);
    await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${transportJob.id}/accept`).set(auth(rider.token));
    await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${transportJob.id}/pickup`).set(auth(rider.token));
    await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${transportJob.id}/deliver`).set(auth(rider.token));

    const accession = await request(app.getHttpServer())
      .post('/api/v1/lab/accessions')
      .set(auth(labUser.token))
      .send({ lab_org_id: labA.id, lab_sample_id: sample.id, idempotency_key: `r7e-amend-acc-${suffix}` });
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
        summary: 'Initial summary',
        lines: [{ analyte_code: 'HGB', analyte_name: 'Hemoglobin', value: '13', unit: 'g/dL' }],
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
      .send({ lab_org_id: labA.id, idempotency_key: `r7e-amend-pub-${suffix}` });
    expect(publish.status).toBeLessThan(300);

    const publishedVersionId = report.currentVersionId!;
    const publishedVersion = await prisma.labReportVersion.findUniqueOrThrow({ where: { id: publishedVersionId } });
    expect(publishedVersion.status).toBe(LabReportVersionStatus.PUBLISHED);
    expect(publishedVersion.versionNumber).toBe(1);

    const customerBeforeAmend = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/bookings/${booking.body.id}/report`)
      .set(auth(customerA.token));
    expect(customerBeforeAmend.status).toBe(200);
    expect(customerBeforeAmend.body.results[0].value).toBe('13');

    const unauthorizedAmend = await request(app.getHttpServer())
      .post(`/api/v1/pathologist/reports/${report.id}/amend`)
      .set(auth(labStaff.token))
      .send({ lab_org_id: labA.id, reason: 'staff cannot amend' });
    expect(unauthorizedAmend.status).toBe(403);

    const crossLabAmend = await request(app.getHttpServer())
      .post(`/api/v1/pathologist/reports/${report.id}/amend`)
      .set(auth(pathologistB.token))
      .send({ lab_org_id: labB.id, reason: 'wrong lab' });
    expect(crossLabAmend.status).toBe(403);

    const emptyReason = await request(app.getHttpServer())
      .post(`/api/v1/pathologist/reports/${report.id}/amend`)
      .set(auth(pathologist.token))
      .send({ lab_org_id: labA.id, reason: '   ' });
    expect(emptyReason.status).toBe(400);

    const amend = await request(app.getHttpServer())
      .post(`/api/v1/pathologist/reports/${report.id}/amend`)
      .set(auth(pathologist.token))
      .send({ lab_org_id: labA.id, reason: 'Corrected reference range' });
    expect(amend.status).toBeLessThan(300);
    expect(amend.body.version.status).toBe('DRAFT');
    expect(amend.body.version.version_number).toBe(2);
    expect(amend.body.version.amendment_reason).toBe('Corrected reference range');

    const oldVersion = await prisma.labReportVersion.findUniqueOrThrow({ where: { id: publishedVersionId } });
    expect(oldVersion.status).toBe(LabReportVersionStatus.PUBLISHED);
    expect(oldVersion.versionNumber).toBe(1);
    expect(oldVersion.amendmentReason).toBeNull();

    const newVersion = await prisma.labReportVersion.findUniqueOrThrow({
      where: { id: amend.body.version.id as string },
    });
    expect(newVersion.amendsVersionId).toBe(publishedVersionId);
    expect(newVersion.amendmentReason).toBe('Corrected reference range');

    const duplicateAmend = await request(app.getHttpServer())
      .post(`/api/v1/pathologist/reports/${report.id}/amend`)
      .set(auth(pathologist.token))
      .send({ lab_org_id: labA.id, reason: 'Second amend while draft open' });
    expect(duplicateAmend.status).toBe(409);

    const amendEvents = await prisma.outboxEvent.findMany({
      where: { type: 'LAB_REPORT_AMENDED', aggregateId: report.id },
    });
    expect(amendEvents).toHaveLength(1);
    expect(amendEvents[0]?.payload).toMatchObject({
      customer_person_id: customerA.personId,
      lab_booking_id: booking.body.id,
      version_number: 2,
      sandbox: true,
    });
    expect(JSON.stringify(amendEvents)).not.toMatch(/Corrected reference range|Hemoglobin|"value":"13"/i);

    await eventWorker.handle(amendEvents[0]!.id);
    await eventWorker.handle(amendEvents[0]!.id);

    const customerInbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set(auth(customerA.token));
    expect(customerInbox.status).toBe(200);
    const customerMessages = customerInbox.body.data ?? customerInbox.body;
    const amendedNotifications = customerMessages.filter(
      (row: { title: string }) => row.title === 'Lab report updated',
    );
    expect(amendedNotifications.length).toBe(1);
    expect(JSON.stringify(customerMessages)).not.toMatch(/Corrected reference range|Hemoglobin/i);

    const customerBInbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set(auth(customerB.token));
    expect(customerBInbox.status).toBe(200);
    const customerBMessages = customerBInbox.body.data ?? customerBInbox.body;
    expect(
      customerBMessages.some((row: { title: string }) => row.title === 'Lab report updated'),
    ).toBe(false);

    const customerDuringDraft = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/bookings/${booking.body.id}/report`)
      .set(auth(customerA.token));
    expect(customerDuringDraft.status).toBe(404);

    const customerBReport = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/bookings/${booking.body.id}/report`)
      .set(auth(customerB.token));
    expect(customerBReport.status).toBe(403);

    await expect(
      prisma.labReportVersion.update({
        where: { id: publishedVersionId },
        data: { summary: 'tamper' },
      }),
    ).rejects.toThrow();
  });
});
