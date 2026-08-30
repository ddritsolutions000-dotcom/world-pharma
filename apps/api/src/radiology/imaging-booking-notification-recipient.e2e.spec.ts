import { INestApplication } from '@nestjs/common';
import {
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

describe('CR-318 imaging booking notification dispatch parity (e2e)', () => {
  jest.setTimeout(120_000);
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

  async function seedImagingBooking(suffix: string) {
    const admin = await signIn(app, `cr318-admin-${suffix}@example.com`, 'admin');
    const imagingUser = await signIn(app, `cr318-ia-${suffix}@example.com`);
    const customer = await signIn(app, `cr318-ca-${suffix}@example.com`);
    const otherCustomer = await signIn(app, `cr318-cb-${suffix}@example.com`);

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

    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'X8' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'X8',
          isoAlpha3: 'X88',
          nameI18n: { en: 'CR-318 test' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
        },
      });
    }

    const doc = emptyPolicyDocument();
    enableImagingPartnerPack(doc);
    doc.payments.enabled = true;
    doc.payments.methods = ['CARD'];
    doc.payments.gateway_refs = ['MOCK_PRIMARY', 'MOCK_SECONDARY'];
    doc.payments.currencies = ['XXX'];
    await prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        version: Math.floor(Date.now() % 1_000_000),
        status: PolicyPackStatus.PUBLISHED,
        document: doc as never,
        checksum: `cr318-${suffix}`,
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
    await app.get(PolicyCache).invalidate('X8');

    const imagingOrg = await orgs.create({
      countryCode: 'X8',
      kind: OrganizationKind.IMAGING_CENTER,
      legalName: `CR318 Imaging ${suffix}`,
      displayName: `CR318 Imaging ${suffix}`,
      actorId: admin.personId,
    });
    await prisma.organization.update({
      where: { id: imagingOrg.id },
      data: { status: OrganizationStatus.ACTIVE },
    });
    await attachOrgAdmin(imagingUser.personId, imagingOrg.id);
    await activateImagingPartner(app, {
      imagingToken: imagingUser.token,
      adminToken: admin.token,
      imagingOrgId: imagingOrg.id,
    });

    const loc = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: imagingOrg.id,
        countryId: country.id,
        kind: LocationKind.IMAGING,
        name: `CR318 Center ${suffix}`,
        city: 'Testville',
        isActive: true,
      },
    });

    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    const item = await request(app.getHttpServer())
      .post('/api/v1/radiology/catalog/items')
      .set(auth(imagingUser.token))
      .send({
        slug: `cr318-imaging-${suffix}`,
        kind: 'IMAGING_STUDY',
        imaging_org_id: imagingOrg.id,
        title: 'CR318 MRI',
        description: 'Commercial imaging listing',
        countries: [{ country_code: 'X8' }],
      });
    expect(item.status).toBe(201);

    const publishedItem = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set(auth(admin.token));
    expect(publishedItem.status).toBeLessThan(300);

    const variant = await request(app.getHttpServer())
      .post(`/api/v1/radiology/catalog/items/${item.body.id}/variants?imaging_org_id=${imagingOrg.id}`)
      .set(auth(imagingUser.token))
      .send({ sku_code: `CR318-SKU-${suffix}`, pack_size: '1 study' });
    expect(variant.status).toBe(201);

    const offer = await request(app.getHttpServer())
      .post('/api/v1/radiology/catalog/offers')
      .set(auth(imagingUser.token))
      .send({
        variant_id: variant.body.id,
        imaging_org_id: imagingOrg.id,
        country_code: 'X8',
        ownership: 'IMAGING_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '3500',
      });
    expect(offer.status).toBe(201);

    const publishedOffer = await request(app.getHttpServer())
      .post(`/api/v1/radiology/catalog/offers/${offer.body.id}/publish`)
      .set(auth(imagingUser.token));
    expect([200, 201]).toContain(publishedOffer.status);

    const slotStart = new Date(Date.now() + 86400000);
    slotStart.setUTCHours(10, 0, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

    const booking = await request(app.getHttpServer())
      .post('/api/v1/me/imaging/bookings')
      .set(auth(customer.token))
      .set('Idempotency-Key', `cr318-book-${suffix}`)
      .send({
        offer_id: offer.body.id,
        imaging_org_id: imagingOrg.id,
        imaging_location_id: loc.id,
        country: 'X8',
        prep_acknowledged: true,
        slot_starts_at: slotStart.toISOString(),
        slot_ends_at: slotEnd.toISOString(),
      });
    expect(booking.status).toBe(201);

    return {
      auth,
      admin,
      imagingUser,
      customer,
      otherCustomer,
      bookingId: booking.body.id as string,
    };
  }

  async function inboxTitles(token: string) {
    const res = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const rows = res.body.data ?? res.body;
    return rows.map((row: { title: string }) => row.title as string);
  }

  it('notifies buyer on create and confirm without notifying imaging staff', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const ctx = await seedImagingBooking(suffix);

    const createdEvent = await prisma.outboxEvent.findFirst({
      where: { aggregateId: ctx.bookingId, type: 'IMAGING_BOOKING_CREATED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(createdEvent?.payload).toMatchObject({ customer_person_id: ctx.customer.personId });
    expect(createdEvent?.actorId).toBeNull();

    await eventWorker.handle(createdEvent!.id);
    await eventWorker.handle(createdEvent!.id);

    let customerTitles = await inboxTitles(ctx.customer.token);
    expect(customerTitles.filter((title: string) => title === 'Imaging booking created').length).toBe(1);
    expect(await inboxTitles(ctx.imagingUser.token)).not.toContain('Imaging booking created');
    expect(await inboxTitles(ctx.otherCustomer.token)).not.toContain('Imaging booking created');

    const pay = await request(app.getHttpServer())
      .post(`/api/v1/me/imaging/bookings/${ctx.bookingId}/pay`)
      .set(ctx.auth(ctx.customer.token))
      .set('Idempotency-Key', `cr318-pay-${suffix}`)
      .send({ scenario: 'success' });
    expect([200, 201]).toContain(pay.status);

    const confirmedEvent = await prisma.outboxEvent.findFirst({
      where: { aggregateId: ctx.bookingId, type: 'IMAGING_BOOKING_CONFIRMED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(confirmedEvent?.payload).toMatchObject({ customer_person_id: ctx.customer.personId });
    expect(confirmedEvent?.actorId).toBeNull();

    await eventWorker.handle(confirmedEvent!.id);
    await eventWorker.handle(confirmedEvent!.id);

    customerTitles = await inboxTitles(ctx.customer.token);
    expect(customerTitles.filter((title: string) => title === 'Imaging booking confirmed').length).toBe(1);
    expect(await inboxTitles(ctx.imagingUser.token)).not.toContain('Imaging booking confirmed');
    expect(await inboxTitles(ctx.otherCustomer.token)).not.toContain('Imaging booking confirmed');
  });

  it('notifies buyer on cancel with idempotent replay', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const ctx = await seedImagingBooking(suffix);

    const cancelled = await request(app.getHttpServer())
      .post(`/api/v1/me/imaging/bookings/${ctx.bookingId}/cancel`)
      .set(ctx.auth(ctx.customer.token))
      .send({ reason_code: 'customer_changed_mind' });
    expect(cancelled.status).toBeLessThan(300);
    expect(cancelled.body.status).toBe('CANCELLED');

    const cancelEvent = await prisma.outboxEvent.findFirst({
      where: { aggregateId: ctx.bookingId, type: 'IMAGING_BOOKING_CANCELLED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(cancelEvent?.payload).toMatchObject({ customer_person_id: ctx.customer.personId });
    expect(cancelEvent?.actorId).toBeNull();

    await eventWorker.handle(cancelEvent!.id);
    await eventWorker.handle(cancelEvent!.id);

    const customerTitles = await inboxTitles(ctx.customer.token);
    expect(customerTitles.filter((title: string) => title === 'Imaging booking cancelled').length).toBe(1);
    expect(await inboxTitles(ctx.imagingUser.token)).not.toContain('Imaging booking cancelled');
    expect(await inboxTitles(ctx.otherCustomer.token)).not.toContain('Imaging booking cancelled');
  });
});
