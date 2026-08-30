import { INestApplication } from '@nestjs/common';
import {
  FinancialFactKind,
  LabReportVersionStatus,
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
import { activateLabPartner, enableLabPartnerPack } from '../test/lab-partner';

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

describe('R7-F physical report + sandbox finance (e2e)', () => {
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
          nameI18n: { en: 'R7F test' },
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
        checksum: `r7f-${suffix}`,
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

  it('physical report lifecycle, finance facts, isolation, rider minimum PII', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const admin = await signIn(app, `r7f-admin-${suffix}@example.com`, 'admin');
    const labUser = await signIn(app, `r7f-lab-${suffix}@example.com`);
    const labStaff = await signIn(app, `r7f-staff-${suffix}@example.com`);
    const pathologist = await signIn(app, `r7f-path-${suffix}@example.com`);
    const customerA = await signIn(app, `r7f-ca-${suffix}@example.com`);
    const customerB = await signIn(app, `r7f-cb-${suffix}@example.com`);
    const rider = await signIn(app, `r7f-rider-${suffix}@example.com`);

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
    enableLabPartnerPack(enabledDoc, { home: true, center: true, physicalReport: true });
    enabledDoc.payments.enabled = true;
    enabledDoc.payments.methods = ['CARD'];
    enabledDoc.payments.gateway_refs = ['MOCK_PRIMARY'];
    enabledDoc.payments.currencies = ['XXX'];
    const country = await publishPack(enabledDoc, suffix);

    const labA = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.LAB,
      legalName: `R7F Lab A ${suffix}`,
      displayName: `R7F Lab A ${suffix}`,
      actorId: admin.personId,
    });
    const labB = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.LAB,
      legalName: `R7F Lab B ${suffix}`,
      displayName: `R7F Lab B ${suffix}`,
      actorId: admin.personId,
    });
    await prisma.organization.updateMany({
      where: { id: { in: [labA.id, labB.id] } },
      data: { status: OrganizationStatus.ACTIVE },
    });

    await attachOrgAdmin(labUser.personId, labA.id);
    await attachOrgStaff(labStaff.personId, labA.id);
    await attachPathologist(pathologist.personId, labA.id);
    await attachRider(rider.personId);
    await activateLabPartner(app, { labToken: labUser.token, adminToken: admin.token, labOrgId: labA.id });

    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    const item = await request(app.getHttpServer())
      .post('/api/v1/lab/catalog/items')
      .set(auth(labUser.token))
      .send({
        slug: `r7f-lab-${suffix}`,
        kind: 'LAB_TEST',
        lab_org_id: labA.id,
        title: 'CBC Panel',
        countries: [{ country_code: 'XX' }],
      });
    expect(item.status).toBe(201);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set(auth(admin.token));
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/lab/catalog/items/${item.body.id}/variants?lab_org_id=${labA.id}`)
      .set(auth(labUser.token))
      .send({ sku_code: `R7F-${suffix}`, pack_size: '1 draw' });
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
      .set('Idempotency-Key', `r7f-book-${suffix}`)
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
      .set('Idempotency-Key', `r7f-pay-${suffix}`)
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
      .send({ container_barcode: `R7F-${suffix}` });
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
      .set(auth(labStaff.token))
      .send({ lab_org_id: labA.id, lab_sample_id: sample.id, idempotency_key: `r7f-acc-${suffix}` });

    const processingId = (await prisma.labProcessing.findUniqueOrThrow({ where: { labSampleId: sample.id } })).id;
    await request(app.getHttpServer())
      .post(`/api/v1/lab/processing/${processingId}/start`)
      .set(auth(labStaff.token))
      .send({ lab_org_id: labA.id });
    await request(app.getHttpServer())
      .post(`/api/v1/lab/processing/${processingId}/complete`)
      .set(auth(labStaff.token))
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
    await request(app.getHttpServer())
      .post(`/api/v1/pathologist/reports/${report.id}/publish`)
      .set(auth(pathologist.token))
      .send({ lab_org_id: labA.id, idempotency_key: `r7f-pub-${suffix}` });

    const labPayable = await prisma.financialFact.findUnique({
      where: { sourceKey: `lab_payable:${booking.body.id}` },
    });
    expect(labPayable?.kind).toBe(FinancialFactKind.LAB_PAYABLE);

    const preRequest = await request(app.getHttpServer())
      .post(`/api/v1/me/lab/bookings/${booking.body.id}/physical-report`)
      .set(auth(customerA.token))
      .set('Idempotency-Key', `r7f-phys-${suffix}`)
      .send({});
    expect(preRequest.status).toBeLessThan(300);
    expect(preRequest.body.status).toBe('REQUESTED');

    const duplicate = await request(app.getHttpServer())
      .post(`/api/v1/me/lab/bookings/${booking.body.id}/physical-report`)
      .set(auth(customerA.token))
      .set('Idempotency-Key', `r7f-phys-${suffix}`)
      .send({});
    expect(duplicate.status).toBeLessThan(300);
    expect(duplicate.body.id).toBe(preRequest.body.id);

    const customerBReq = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/bookings/${booking.body.id}/physical-report`)
      .set(auth(customerB.token));
    expect([403, 404]).toContain(customerBReq.status);

    const wrongLab = await request(app.getHttpServer())
      .get(`/api/v1/lab/physical-reports?lab_org_id=${labB.id}`)
      .set(auth(labStaff.token));
    expect(wrongLab.status).toBe(403);

    const queue = await request(app.getHttpServer())
      .get(`/api/v1/lab/physical-reports?lab_org_id=${labA.id}`)
      .set(auth(labStaff.token));
    expect(queue.status).toBe(200);
    expect(queue.body.data.some((r: { id: string }) => r.id === preRequest.body.id)).toBe(true);

    const requestId = preRequest.body.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/lab/physical-reports/${requestId}/accept`)
      .set(auth(labStaff.token))
      .send({ lab_org_id: labA.id });
    await request(app.getHttpServer())
      .post(`/api/v1/lab/physical-reports/${requestId}/prepare`)
      .set(auth(labStaff.token))
      .send({ lab_org_id: labA.id });
    await request(app.getHttpServer())
      .post(`/api/v1/lab/physical-reports/${requestId}/pack`)
      .set(auth(labStaff.token))
      .send({ lab_org_id: labA.id, sealed_package_id: `PKG-${suffix}` });

    const illegalPrepare = await request(app.getHttpServer())
      .post(`/api/v1/lab/physical-reports/${requestId}/prepare`)
      .set(auth(labStaff.token))
      .send({ lab_org_id: labA.id });
    expect(illegalPrepare.status).toBe(409);

    const dispatch = await request(app.getHttpServer())
      .post(`/api/v1/lab/physical-reports/${requestId}/dispatch`)
      .set(auth(labStaff.token))
      .send({ lab_org_id: labA.id, idempotency_key: `r7f-dispatch-${suffix}` });
    expect(dispatch.status).toBeLessThan(300);
    expect(dispatch.body.status).toBe('DISPATCHED');

    const deliveryFee = await prisma.financialFact.findUnique({
      where: { sourceKey: `report_delivery_fee:${requestId}` },
    });
    expect(deliveryFee?.kind).toBe(FinancialFactKind.REPORT_DELIVERY_FEE);

    const deliveryJob = await prisma.logisticsJob.findFirstOrThrow({
      where: { physicalReportRequestId: requestId, jobType: LogisticsJobType.REPORT_DELIVERY },
    });

    await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${deliveryJob.id}/accept`).set(auth(rider.token));

    const riderJob = await request(app.getHttpServer())
      .get(`/api/v1/delivery/jobs/${deliveryJob.id}`)
      .set(auth(rider.token));
    expect(riderJob.status).toBe(200);
    expect(riderJob.body.job_type).toBe('REPORT_DELIVERY');
    expect(JSON.stringify(riderJob.body)).not.toMatch(/Hemoglobin|analyte|pathology/i);
    expect(riderJob.body.note).toMatch(/No diagnostic/i);

    await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${deliveryJob.id}/pickup`).set(auth(rider.token));
    await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${deliveryJob.id}/deliver`).set(auth(rider.token));

    const delivered = await prisma.physicalReportRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(delivered.status).toBe(PhysicalReportRequestStatus.DELIVERED);

    const customerStatus = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/bookings/${booking.body.id}/physical-report`)
      .set(auth(customerA.token));
    expect(customerStatus.body.status).toBe('DELIVERED');

    const digitalStill = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/bookings/${booking.body.id}/report`)
      .set(auth(customerA.token));
    expect(digitalStill.status).toBe(200);
    expect(digitalStill.body.results[0].value).toBe('14');

    const adminMeta = await request(app.getHttpServer())
      .get(`/api/v1/admin/lab/physical-reports?lab_org_id=${labA.id}`)
      .set(auth(admin.token));
    expect(adminMeta.status).toBe(200);
    expect(adminMeta.body.data.some((r: { id: string }) => r.id === requestId)).toBe(true);
  });

  it('fails closed when physical_report_delivery pack disabled', async () => {
    const suffix = `gate-${Date.now().toString(36)}`;
    const customer = await signIn(app, `r7f-gate-${suffix}@example.com`);
    const doc = emptyPolicyDocument();
    enableLabPartnerPack(doc, { home: true, physicalReport: false });
    await publishPack(doc, suffix);

    const eligibility = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/bookings/${uuidv7()}/physical-report/eligibility`)
      .set({ Authorization: `Bearer ${customer.token}` });
    expect([403, 404]).toContain(eligibility.status);
  });
});
