import { INestApplication } from '@nestjs/common';
import {
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

describe('R7-D transport + accession + processing (e2e)', () => {
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
          nameI18n: { en: 'R7D test' },
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
        checksum: `r7d-${suffix}`,
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

  it('transport, accession, processing, isolation, duplicate prevention', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const admin = await signIn(app, `r7d-admin-${suffix}@example.com`, 'admin');
    const labUser = await signIn(app, `r7d-la-${suffix}@example.com`);
    const otherLab = await signIn(app, `r7d-lb-${suffix}@example.com`);
    const customerA = await signIn(app, `r7d-ca-${suffix}@example.com`);
    const customerB = await signIn(app, `r7d-cb-${suffix}@example.com`);
    const phe = await signIn(app, `r7d-phe-${suffix}@example.com`);
    const rider = await signIn(app, `r7d-rider-${suffix}@example.com`);

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
    await publishPack(enabledDoc, `lab-${suffix}`);

    const labA = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.LAB,
      legalName: `R7D Lab A ${suffix}`,
      displayName: `R7D Lab A ${suffix}`,
      actorId: admin.personId,
    });
    const labB = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.LAB,
      legalName: `R7D Lab B ${suffix}`,
      displayName: `R7D Lab B ${suffix}`,
      actorId: admin.personId,
    });
    await prisma.organization.updateMany({
      where: { id: { in: [labA.id, labB.id] } },
      data: { status: OrganizationStatus.ACTIVE },
    });
    await attachOrgAdmin(labUser.personId, labA.id);
    await attachOrgAdmin(otherLab.personId, labB.id);
    await attachOrgStaff(phe.personId, labA.id);
    await attachRider(rider.personId);

    await activateLabPartner(app, { labToken: labUser.token, adminToken: admin.token, labOrgId: labA.id });

    const item = await request(app.getHttpServer())
      .post('/api/v1/lab/catalog/items')
      .set('Authorization', `Bearer ${labUser.token}`)
      .send({
        slug: `r7d-lab-${suffix}`,
        kind: 'LAB_TEST',
        lab_org_id: labA.id,
        title: 'Metabolic Panel',
        description: 'Commercial lab test',
        countries: [{ country_code: 'XX' }],
      });
    expect(item.status).toBe(201);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/lab/catalog/items/${item.body.id}/variants?lab_org_id=${labA.id}`)
      .set('Authorization', `Bearer ${labUser.token}`)
      .send({ sku_code: `R7D-${suffix}`, pack_size: '1 draw' });
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

    const country = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'XX' } });
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
      .set('Idempotency-Key', `r7d-book-${suffix}`)
      .send({
        offer_id: offer.body.id,
        collection_mode: 'HOME',
        lab_org_id: labA.id,
        customer_address_id: address.id,
        country: 'XX',
        slot_starts_at: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(booking.status).toBe(201);
    const pay = await request(app.getHttpServer())
      .post(`/api/v1/me/lab/bookings/${booking.body.id}/pay`)
      .set('Authorization', `Bearer ${customerA.token}`)
      .set('Idempotency-Key', `r7d-pay-${suffix}`)
      .send({ scenario: 'success' });
    expect([200, 201]).toContain(pay.status);

    const sample = await prisma.labSample.findUniqueOrThrow({ where: { labBookingId: booking.body.id } });
    const collectionJob = await prisma.logisticsJob.findFirstOrThrow({
      where: { labSampleId: sample.id, jobType: LogisticsJobType.SAMPLE_COLLECTION },
    });

    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    await request(app.getHttpServer()).post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/accept`).set(auth(phe.token));
    await request(app.getHttpServer()).post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/arrive`).set(auth(phe.token)).send({});
    await request(app.getHttpServer()).post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/verify`).set(auth(phe.token)).send({});
    await request(app.getHttpServer()).post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/collect`).set(auth(phe.token)).send({});
    await request(app.getHttpServer())
      .post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/seal`)
      .set(auth(phe.token))
      .send({ container_barcode: `TUBE-${suffix}` });
    await request(app.getHttpServer())
      .post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/handover`)
      .set(auth(phe.token))
      .send({});

    const transportJob = await prisma.logisticsJob.findFirstOrThrow({
      where: { labSampleId: sample.id, jobType: LogisticsJobType.SAMPLE_TRANSPORT },
    });

    const labBTransport = await request(app.getHttpServer())
      .get(`/api/v1/lab/transport?lab_org_id=${labB.id}`)
      .set(auth(otherLab.token));
    expect(labBTransport.status).toBe(200);
    expect(labBTransport.body.data.some((r: { id: string }) => r.id === transportJob.id)).toBe(false);

    await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${transportJob.id}/accept`).set(auth(rider.token));
    await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${transportJob.id}/pickup`).set(auth(rider.token));
    await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${transportJob.id}/deliver`).set(auth(rider.token));

    const refreshed = await prisma.labSample.findUniqueOrThrow({ where: { id: sample.id } });
    expect(refreshed.status).toBe(LabSampleCocStatus.LAB_RECEIVED);

    const accession = await request(app.getHttpServer())
      .post('/api/v1/lab/accessions')
      .set(auth(labUser.token))
      .send({ lab_org_id: labA.id, lab_sample_id: sample.id, idempotency_key: `acc-${suffix}` });
    expect(accession.status).toBeLessThan(300);
    expect(accession.body.accession_number).toMatch(/^ACC-/);
    expect(JSON.stringify(accession.body)).not.toMatch(/diagnosis|clinical|result_value/i);

    const accessionDup = await request(app.getHttpServer())
      .post('/api/v1/lab/accessions')
      .set(auth(labUser.token))
      .send({ lab_org_id: labA.id, lab_sample_id: sample.id, idempotency_key: `acc-dup-${suffix}` });
    expect(accessionDup.status).toBeLessThan(300);
    expect(accessionDup.body.id).toBe(accession.body.id);

    const pheProcess = await request(app.getHttpServer())
      .get(`/api/v1/lab/processing?lab_org_id=${labA.id}`)
      .set(auth(customerB.token));
    expect(pheProcess.status).toBe(403);

    const processingId = accession.body.processing_status === 'QUEUED'
      ? (await prisma.labProcessing.findUniqueOrThrow({ where: { labSampleId: sample.id } })).id
      : null;
    expect(processingId).toBeTruthy();

    const start = await request(app.getHttpServer())
      .post(`/api/v1/lab/processing/${processingId}/start`)
      .set(auth(labUser.token))
      .send({ lab_org_id: labA.id });
    expect(start.status).toBeLessThan(300);
    expect(start.body.status).toBe('IN_PROGRESS');

    const afterSample = await prisma.labSample.findUniqueOrThrow({ where: { id: sample.id } });
    expect(afterSample.status).toBe(LabSampleCocStatus.PROCESSING);

    const complete = await request(app.getHttpServer())
      .post(`/api/v1/lab/processing/${processingId}/complete`)
      .set(auth(labUser.token))
      .send({ lab_org_id: labA.id });
    expect(complete.status).toBeLessThan(300);
    expect(complete.body.status).toBe('COMPLETED');

    const customerView = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/bookings/${booking.body.id}/collection`)
      .set(auth(customerA.token));
    expect(customerView.status).toBe(200);
    expect(customerView.body.processing_status).toBe('COMPLETED');
    expect(customerView.body.accession_number).toBeTruthy();
    const customerPayload = JSON.stringify(customerView.body);
    expect(customerPayload).not.toMatch(/"diagnosis"|"clinical_notes"|"result_value"|"pathology_findings"/i);
    expect(customerView.body.boundary?.results_available).toBe(false);

    const cocCount = await prisma.labSampleCocEvent.count({ where: { labSampleId: sample.id } });
    expect(cocCount).toBeGreaterThanOrEqual(8);
  });
});
