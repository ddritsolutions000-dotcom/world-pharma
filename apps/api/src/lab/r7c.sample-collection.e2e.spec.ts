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
import { EventWorkerService } from '../events/worker.service';
import { bootstrapSuperAdminByEmail, signIn as signInAudience } from '../test/sign-in';

describe('R7-C sample collection + chain of custody (e2e)', () => {
  jest.setTimeout(180_000);
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

  async function publishPack(doc: ReturnType<typeof emptyPolicyDocument>, suffix: string) {
    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'XX' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'XX',
          isoAlpha3: 'XXX',
          nameI18n: { en: 'R7C test' },
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
        checksum: `r7c-${suffix}`,
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

  async function bookAndConfirm(input: {
    customerToken: string;
    customerPersonId: string;
    offerId: string;
    labOrgId: string;
    suffix: string;
  }) {
    const country = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'XX' } });
    const address = await prisma.customerAddress.create({
      data: {
        id: uuidv7(),
        customerPersonId: input.customerPersonId,
        countryId: country.id,
        recipientName: 'Customer Test',
        city: 'Testville',
        line1: '1 Sample St',
        isDefault: true,
      },
    });
    const booking = await request(app.getHttpServer())
      .post('/api/v1/me/lab/bookings')
      .set('Authorization', `Bearer ${input.customerToken}`)
      .set('Idempotency-Key', `r7c-book-${input.suffix}`)
      .send({
        offer_id: input.offerId,
        collection_mode: 'HOME',
        lab_org_id: input.labOrgId,
        customer_address_id: address.id,
        country: 'XX',
        slot_starts_at: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(booking.status).toBe(201);
    const pay = await request(app.getHttpServer())
      .post(`/api/v1/me/lab/bookings/${booking.body.id}/pay`)
      .set('Authorization', `Bearer ${input.customerToken}`)
      .set('Idempotency-Key', `r7c-pay-${input.suffix}`)
      .send({ scenario: 'success' });
    expect([200, 201]).toContain(pay.status);
    return booking.body.id as string;
  }

  it('enqueues collection, CoC lifecycle, isolation, append-only, PHI minimization', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const admin = await bootstrapSuperAdminByEmail(app, prisma, `r7c-admin-${suffix}@example.com`);
    const labUser = await signInAudience(app, `r7c-la-${suffix}@example.com`);
    const otherLab = await signInAudience(app, `r7c-lb-${suffix}@example.com`);
    const customerA = await signInAudience(app, `r7c-ca-${suffix}@example.com`);
    const customerB = await signInAudience(app, `r7c-cb-${suffix}@example.com`);
    const pheA = await signInAudience(app, `r7c-phe-a-${suffix}@example.com`);
    const pheB = await signInAudience(app, `r7c-phe-b-${suffix}@example.com`);
    const outsider = await signInAudience(app, `r7c-outsider-${suffix}@example.com`);

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
      legalName: `R7C Lab A ${suffix}`,
      displayName: `R7C Lab A ${suffix}`,
      actorId: admin.personId,
    });
    const labB = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.LAB,
      legalName: `R7C Lab B ${suffix}`,
      displayName: `R7C Lab B ${suffix}`,
      actorId: admin.personId,
    });
    await prisma.organization.updateMany({
      where: { id: { in: [labA.id, labB.id] } },
      data: { status: OrganizationStatus.ACTIVE },
    });
    await attachOrgAdmin(labUser.personId, labA.id);
    await attachOrgAdmin(otherLab.personId, labB.id);
    await attachOrgStaff(pheA.personId, labA.id);
    await attachOrgStaff(pheB.personId, labA.id);

    await activateLabPartner(app, { labToken: labUser.token, adminToken: admin.token, labOrgId: labA.id });
    await activateLabPartner(app, { labToken: otherLab.token, adminToken: admin.token, labOrgId: labB.id });

    const item = await request(app.getHttpServer())
      .post('/api/v1/lab/catalog/items')
      .set('Authorization', `Bearer ${labUser.token}`)
      .send({
        slug: `r7c-lab-${suffix}`,
        kind: 'LAB_TEST',
        lab_org_id: labA.id,
        title: 'CBC Panel',
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
      .send({ sku_code: `R7C-${suffix}`, pack_size: '1 draw' });
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

    const bookingId = await bookAndConfirm({
      customerToken: customerA.token,
      customerPersonId: customerA.personId,
      offerId: offer.body.id,
      labOrgId: labA.id,
      suffix,
    });

    const sample = await prisma.labSample.findUnique({ where: { labBookingId: bookingId } });
    expect(sample).toBeTruthy();
    expect(sample!.status).toBe(LabSampleCocStatus.ASSIGNED);

    const job = await prisma.logisticsJob.findFirst({
      where: { labSampleId: sample!.id, jobType: LogisticsJobType.SAMPLE_COLLECTION },
    });
    expect(job).toBeTruthy();

    const outsiderJobs = await request(app.getHttpServer())
      .get('/api/v1/phlebotomist/jobs')
      .set('Authorization', `Bearer ${outsider.token}`);
    expect(outsiderJobs.status).toBe(403);

    const beforeStart = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/bookings/${bookingId}/collection`)
      .set('Authorization', `Bearer ${customerA.token}`);
    expect(beforeStart.status).toBe(200);
    expect(beforeStart.body.collection_started).toBe(true);
    expect(beforeStart.body.status).toBe('ASSIGNED');

    const crossCustomer = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/bookings/${bookingId}/collection`)
      .set('Authorization', `Bearer ${customerB.token}`);
    expect(crossCustomer.status).toBe(403);

    const labBQueue = await request(app.getHttpServer())
      .get(`/api/v1/lab/collections?lab_org_id=${labB.id}`)
      .set('Authorization', `Bearer ${otherLab.token}`);
    expect(labBQueue.status).toBe(200);
    expect(labBQueue.body.data.some((row: { lab_booking_id: string }) => row.lab_booking_id === bookingId)).toBe(
      false,
    );

    const labAQueue = await request(app.getHttpServer())
      .get(`/api/v1/lab/collections?lab_org_id=${labA.id}`)
      .set('Authorization', `Bearer ${labUser.token}`);
    expect(labAQueue.status).toBe(200);
    expect(labAQueue.body.data.some((row: { lab_booking_id: string }) => row.lab_booking_id === bookingId)).toBe(true);
    expect(JSON.stringify(labAQueue.body)).not.toMatch(/recipient_name|line1|clinical_note|diagnosis/i);

    const accept = await request(app.getHttpServer())
      .post(`/api/v1/phlebotomist/jobs/${job!.id}/accept`)
      .set('Authorization', `Bearer ${pheA.token}`);
    expect(accept.status).toBeLessThan(300);
    expect(accept.body.coc_status).toBe('ACCEPTED');
    expect(JSON.stringify(accept.body)).not.toMatch(/diagnosis|clinical|prescription/i);
    expect(accept.body.customer_display).toMatch(/\*\*\*/);

    const pheBGet = await request(app.getHttpServer())
      .get(`/api/v1/phlebotomist/jobs/${job!.id}`)
      .set('Authorization', `Bearer ${pheB.token}`);
    expect([403, 404]).toContain(pheBGet.status);

    const illegal = await request(app.getHttpServer())
      .post(`/api/v1/phlebotomist/jobs/${job!.id}/collect`)
      .set('Authorization', `Bearer ${pheA.token}`)
      .send({});
    expect(illegal.status).toBe(409);

    const arrive = await request(app.getHttpServer())
      .post(`/api/v1/phlebotomist/jobs/${job!.id}/arrive`)
      .set('Authorization', `Bearer ${pheA.token}`)
      .send({});
    expect(arrive.status).toBeLessThan(300);

    const verify = await request(app.getHttpServer())
      .post(`/api/v1/phlebotomist/jobs/${job!.id}/verify`)
      .set('Authorization', `Bearer ${pheA.token}`)
      .send({});
    expect(verify.status).toBeLessThan(300);

    const collect = await request(app.getHttpServer())
      .post(`/api/v1/phlebotomist/jobs/${job!.id}/collect`)
      .set('Authorization', `Bearer ${pheA.token}`)
      .send({ idempotency_key: `collect-${suffix}` });
    expect(collect.status).toBeLessThan(300);

    const collectDup = await request(app.getHttpServer())
      .post(`/api/v1/phlebotomist/jobs/${job!.id}/collect`)
      .set('Authorization', `Bearer ${pheA.token}`)
      .send({ idempotency_key: `collect-${suffix}` });
    expect(collectDup.status).toBeLessThan(300);
    const afterDupCount = await prisma.labSampleCocEvent.count({
      where: { labSampleId: sample!.id, actionCode: 'specimen_collected' },
    });
    expect(afterDupCount).toBe(1);

    const seal = await request(app.getHttpServer())
      .post(`/api/v1/phlebotomist/jobs/${job!.id}/seal`)
      .set('Authorization', `Bearer ${pheA.token}`)
      .send({ container_barcode: `TUBE-${suffix}` });
    expect(seal.status).toBeLessThan(300);

    const handover = await request(app.getHttpServer())
      .post(`/api/v1/phlebotomist/jobs/${job!.id}/handover`)
      .set('Authorization', `Bearer ${pheA.token}`)
      .send({});
    expect(handover.status).toBeLessThan(300);
    expect(handover.body.coc_status).toBe('HANDED_OVER');

    const collectedEvent = await prisma.outboxEvent.findFirst({
      where: { type: 'LAB_SAMPLE_COLLECTED', aggregateId: sample!.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(collectedEvent?.payload).toMatchObject({ customer_person_id: customerA.personId });

    const handedOverEvent = await prisma.outboxEvent.findFirst({
      where: { type: 'LAB_SAMPLE_HANDED_OVER', aggregateId: sample!.id },
    });
    expect(handedOverEvent?.payload).toMatchObject({ customer_person_id: customerA.personId });

    const transportEvent = await prisma.outboxEvent.findFirst({
      where: { type: 'LAB_SAMPLE_TRANSPORT_ENQUEUED', aggregateId: sample!.id },
    });
    expect(transportEvent?.payload).toMatchObject({ customer_person_id: customerA.personId });
    expect(JSON.stringify([collectedEvent, handedOverEvent, transportEvent])).not.toMatch(
      /recipient_name|line1|diagnosis/i,
    );

    const transportJob = await prisma.logisticsJob.findFirst({
      where: { labSampleId: sample!.id, jobType: LogisticsJobType.SAMPLE_TRANSPORT },
    });
    expect(transportJob).not.toBeNull();

    await eventWorker.handle(handedOverEvent!.id);
    await eventWorker.handle(transportEvent!.id);
    await eventWorker.handle(handedOverEvent!.id);

    const customerInbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set('Authorization', `Bearer ${customerA.token}`);
    expect(customerInbox.status).toBe(200);
    const messages = customerInbox.body.data ?? customerInbox.body;
    expect(messages.some((row: { title: string }) => row.title === 'Lab sample handed over')).toBe(true);
    expect(messages.some((row: { title: string }) => row.title === 'Lab sample transport scheduled')).toBe(true);
    const handedOverCount = messages.filter(
      (row: { title: string }) => row.title === 'Lab sample handed over',
    ).length;
    const transportCount = messages.filter(
      (row: { title: string }) => row.title === 'Lab sample transport scheduled',
    ).length;
    expect(handedOverCount).toBe(1);
    expect(transportCount).toBe(1);

    const customerBInbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set('Authorization', `Bearer ${customerB.token}`);
    const bMessages = customerBInbox.body.data ?? customerBInbox.body;
    expect(
      bMessages.some((row: { title: string }) =>
        ['Lab sample handed over', 'Lab sample transport scheduled'].includes(row.title),
      ),
    ).toBe(false);

    const eventCount = await prisma.labSampleCocEvent.count({ where: { labSampleId: sample!.id } });
    expect(eventCount).toBeGreaterThanOrEqual(6);

    const customerView = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/bookings/${bookingId}/collection`)
      .set('Authorization', `Bearer ${customerA.token}`);
    expect(customerView.status).toBe(200);
    expect(customerView.body.status).toBe('HANDED_OVER');
    expect(customerView.body.custody_timeline.some((e: { to_status: string }) => e.to_status === 'HANDED_OVER')).toBe(
      true,
    );
    expect(JSON.stringify(customerView.body)).not.toMatch(/recipient_name|line1|diagnosis/i);

    const disabledDoc = emptyPolicyDocument();
    enableLabPartnerPack(disabledDoc, { home: false, center: false });
    disabledDoc.partner_types.LAB.enabled = true;
    await publishPack(disabledDoc, `off-${suffix}`);

    const booking2 = await request(app.getHttpServer())
      .post('/api/v1/me/lab/bookings')
      .set('Authorization', `Bearer ${customerA.token}`)
      .set('Idempotency-Key', `r7c-off-${suffix}`)
      .send({
        offer_id: offer.body.id,
        collection_mode: 'HOME',
        lab_org_id: labA.id,
        customer_address_id: (
          await prisma.customerAddress.findFirst({ where: { customerPersonId: customerA.personId } })
        )!.id,
        country: 'XX',
      });
    expect(booking2.status).toBeGreaterThanOrEqual(400);
  });
});
