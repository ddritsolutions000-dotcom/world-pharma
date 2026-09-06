import { INestApplication } from '@nestjs/common';
import { OutboxStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../src/app/app.module';
import { PrismaService } from '../src/app/prisma.service';
import { ProblemFilter } from '../src/common/problem.filter';
import type { EventEnvelope } from '../src/events/envelope';
import { OutboxService } from '../src/events/outbox.service';
import { NotificationDispatchService } from '../src/platform/notification-dispatch.service';
import { NotificationService } from '../src/platform/notification.service';
import { applyTestIsolation } from '../src/test/isolate-runtime';
import { provisionSuperAdmin, signInAdmin, signInCustomer } from '../src/test/sign-in';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function envelope(partial: Partial<EventEnvelope> & Pick<EventEnvelope, 'eventName' | 'aggregateId'>): EventEnvelope {
  return {
    eventId: uuidv7(),
    eventVersion: 1,
    occurredAt: new Date().toISOString(),
    aggregateType: partial.aggregateType ?? 'Test',
    producer: partial.producer ?? 'test',
    countryId: partial.countryId ?? null,
    correlationId: partial.correlationId ?? uuidv7(),
    causationId: null,
    actorId: partial.actorId ?? null,
    payload: partial.payload ?? {},
    metadata: {},
    ...partial,
  };
}

describe('notification communication operations (e2e)', () => {
  jest.setTimeout(240_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let notifications: NotificationService;
  let dispatch: NotificationDispatchService;
  let outbox: OutboxService;
  let superToken: string;
  let countryId: string;
  let countryCode: string;
  let otherCountryId: string;
  let otherCountryCode: string;

  async function provisionRole(prefix: string, roleCode: string) {
    const email = `${prefix}-${Date.now()}@example.com`;
    const customer = await signInCustomer(app, email);
    const role = await prisma.role.findUnique({ where: { code: roleCode } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: customer.personId,
        roleId: role!.id,
        scope: 'platform',
        status: 'ACTIVE',
      },
    });
    return signInAdmin(app, email, customer.personId);
  }

  async function ensureCountry(iso2: string, iso3: string, name: string) {
    let country = await prisma.country.findUnique({ where: { isoAlpha2: iso2 } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: iso2,
          isoAlpha3: iso3,
          nameI18n: { en: name },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
          dataResidencyMode: 'shared',
        },
      });
    }
    return country;
  }

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
    notifications = app.get(NotificationService);
    dispatch = app.get(NotificationDispatchService);
    outbox = app.get(OutboxService);

    const xx = await prisma.country.findUnique({ where: { isoAlpha2: 'XX' } });
    if (!xx) {
      throw new Error('XX country seed required');
    }
    countryId = xx.id;
    countryCode = xx.isoAlpha2;
    const other = await ensureCountry('ZZ', 'ZZZ', 'Sandbox Other');
    otherCountryId = other.id;
    otherCountryCode = other.isoAlpha2;

    const admin = await provisionSuperAdmin(app, prisma, 's31-super');
    superToken = admin.token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates customer order notification once and isolates across customers', async () => {
    const customerA = await signInCustomer(app, `s31-custa-${uuidv7()}@example.test`);
    const customerB = await signInCustomer(app, `s31-custb-${uuidv7()}@example.test`);
    const orderId = uuidv7();

    await dispatch.handleDomainEvent(
      envelope({
        eventName: 'ORDER_CREATED',
        aggregateId: orderId,
        aggregateType: 'Order',
        payload: { customer_person_id: customerA.personId, country_code: countryCode },
        countryId,
      }),
    );
    await dispatch.handleDomainEvent(
      envelope({
        eventName: 'ORDER_CREATED',
        aggregateId: orderId,
        aggregateType: 'Order',
        payload: { customer_person_id: customerA.personId, country_code: countryCode },
        countryId,
      }),
    );

    const own = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set(auth(customerA.token));
    expect(own.status).toBe(200);
    const orderNotices = own.body.data.filter(
      (row: { title?: string; reference_id?: string }) =>
        row.title === 'Order placed' && row.reference_id === orderId,
    );
    expect(orderNotices).toHaveLength(1);
    expect(orderNotices[0].delivery_status).toBe('SANDBOX_DELIVERED');
    expect(orderNotices[0].sandbox).toBe(true);
    expect(JSON.stringify(orderNotices[0])).not.toMatch(/diagnosis|lab value|prescription contents/i);

    const other = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set(auth(customerB.token));
    expect(other.body.data.some((row: { reference_id?: string }) => row.reference_id === orderId)).toBe(false);
  });

  it('notifies vendor, doctor, lab, delivery, payment, refund, imaging, affiliate paths', async () => {
    const customer = await signInCustomer(app, `s31-flow-${uuidv7()}@example.test`);
    const vendor = await signInCustomer(app, `s31-vend-${uuidv7()}@example.test`);
    const doctorEmail = `s31-doc-${uuidv7()}@example.test`;
    const doctorSession = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ identifier: doctorEmail, purpose: 'REGISTER' });
    const doctorVerify = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({
        challenge_id: doctorSession.body.challenge_id,
        code: doctorSession.body.dev_code,
        audience: 'doctor',
      });
    const doctorToken = doctorVerify.body.access_token as string;
    const doctorPersonId = doctorVerify.body.person_id as string;

    const lab = await signInCustomer(app, `s31-lab-${uuidv7()}@example.test`);
    const delivery = await signInCustomer(app, `s31-del-${uuidv7()}@example.test`);
    const affiliate = await signInCustomer(app, `s31-aff-${uuidv7()}@example.test`);

    const orderId = uuidv7();
    const appointmentId = uuidv7();
    const labReportId = uuidv7();
    const imagingReportId = uuidv7();
    const shipmentId = uuidv7();
    const paymentId = uuidv7();
    const affiliateId = uuidv7();

    await dispatch.handleDomainEvent(
      envelope({
        eventName: 'ORDER_ALLOCATED',
        aggregateId: orderId,
        payload: {
          customer_person_id: customer.personId,
          person_ids: [vendor.personId],
          country_code: countryCode,
        },
      }),
    );
    await dispatch.handleDomainEvent(
      envelope({
        eventName: 'APPOINTMENT_CONFIRMED',
        aggregateId: appointmentId,
        payload: {
          customer_person_id: customer.personId,
          doctor_person_id: doctorPersonId,
          country_code: countryCode,
        },
      }),
    );
    await dispatch.handleDomainEvent(
      envelope({
        eventName: 'LAB_REPORT_PUBLISHED',
        aggregateId: labReportId,
        payload: {
          customer_person_id: customer.personId,
          lab_person_id: lab.personId,
          country_code: countryCode,
        },
      }),
    );
    await dispatch.handleDomainEvent(
      envelope({
        eventName: 'IMAGING_REPORT_PUBLISHED',
        aggregateId: imagingReportId,
        payload: {
          customer_person_id: customer.personId,
          country_code: countryCode,
        },
      }),
    );
    await dispatch.handleDomainEvent(
      envelope({
        eventName: 'SHIPMENT_OUT_FOR_DELIVERY',
        aggregateId: shipmentId,
        payload: {
          customer_person_id: customer.personId,
          delivery_person_id: delivery.personId,
          country_code: countryCode,
        },
      }),
    );
    await dispatch.handleDomainEvent(
      envelope({
        eventName: 'PAYMENT_CAPTURED',
        aggregateId: paymentId,
        payload: { customer_person_id: customer.personId, country_code: countryCode },
      }),
    );
    await dispatch.handleDomainEvent(
      envelope({
        eventName: 'PAYMENT_FAILED',
        aggregateId: uuidv7(),
        payload: { customer_person_id: customer.personId, country_code: countryCode },
      }),
    );
    await dispatch.handleDomainEvent(
      envelope({
        eventName: 'PAYMENT_REFUNDED',
        aggregateId: uuidv7(),
        payload: { customer_person_id: customer.personId, country_code: countryCode },
      }),
    );
    await dispatch.handleDomainEvent(
      envelope({
        eventName: 'AFFILIATE_LIABILITY_CREATED',
        aggregateId: affiliateId,
        payload: {
          affiliate_person_id: affiliate.personId,
          person_ids: [affiliate.personId],
          country_code: countryCode,
        },
      }),
    );

    const vendorInbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set(auth(vendor.token));
    expect(vendorInbox.body.data.some((row: { title?: string }) => row.title === 'New order received')).toBe(true);

    const doctorInbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set(auth(doctorToken));
    expect(doctorInbox.body.data.some((row: { title?: string }) => row.title === 'Appointment confirmed')).toBe(
      true,
    );

    const labInbox = await request(app.getHttpServer()).get('/api/v1/me/notifications/inbox').set(auth(lab.token));
    expect(labInbox.body.data.some((row: { title?: string }) => row.title === 'Lab report ready')).toBe(true);

    const deliveryInbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set(auth(delivery.token));
    expect(deliveryInbox.body.data.some((row: { title?: string }) => row.title === 'Out for delivery')).toBe(true);

    const customerInbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set(auth(customer.token));
    const titles = customerInbox.body.data.map((row: { title?: string }) => row.title);
    expect(titles).toEqual(
      expect.arrayContaining([
        'Lab report ready',
        'Imaging report ready',
        'Out for delivery',
        'Payment captured',
        'Payment failed',
        'Refund completed',
        'Appointment confirmed',
      ]),
    );

    const affiliateInbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set(auth(affiliate.token));
    expect(
      affiliateInbox.body.data.some((row: { title?: string }) => row.title === 'Affiliate commission recorded'),
    ).toBe(true);

    // Isolation: vendor cannot see doctor notice
    expect(vendorInbox.body.data.some((row: { title?: string }) => row.title === 'Appointment confirmed')).toBe(
      false,
    );
    expect(doctorInbox.body.data.some((row: { title?: string }) => row.title === 'New order received')).toBe(false);
    expect(labInbox.body.data.some((row: { title?: string }) => row.title === 'New order received')).toBe(false);
  });

  it('keeps retries bounded with dead-letter visibility and truthful gating', async () => {
    const customer = await signInCustomer(app, `s31-retry-${uuidv7()}@example.test`);
    const first = await notifications.enqueueInbox(
      customer.personId,
      {
        id: uuidv7(),
        channel: 'sms',
        title: 'SMS gated',
        body: NotificationService.safeSandboxBody(),
        read: false,
        created_at: new Date().toISOString(),
        event_type: 'ORDER_CREATED',
        country_code: countryCode,
      },
      { occurrenceKey: `s31-sms:${customer.personId}` },
    );
    expect(first.created).toBe(true);
    const inbox = await notifications.listInbox(customer.personId);
    const sms = inbox.find((row) => row.title === 'SMS gated');
    expect(sms?.delivery_status).toBe('EXTERNAL_GATED');
    expect(sms?.external_gated).toBe(true);
    expect(sms?.sandbox).toBe(true);

    const deadId = uuidv7();
    await outbox.enqueue(prisma, {
      type: 'ORDER_CREATED',
      aggregateType: 'Order',
      aggregateId: deadId,
      producer: 'test',
      countryId,
      payload: { customer_person_id: customer.personId },
      occurrenceKey: `s31-dead:${deadId}`,
    });
    await prisma.outboxEvent.updateMany({
      where: { aggregateId: deadId, type: 'ORDER_CREATED' },
      data: {
        status: OutboxStatus.DEAD_LETTERED,
        attempts: 5,
        lastError: 'forced terminal failure for sprint 31',
        failedAt: new Date(),
      },
    });

    const dlq = await request(app.getHttpServer())
      .get('/api/v1/admin/notifications/ops/dead-letters')
      .set(auth(superToken));
    expect(dlq.status).toBe(200);
    expect(dlq.body.data.some((row: { aggregate_id?: string; status?: string }) => row.aggregate_id === deadId)).toBe(
      true,
    );
    expect(dlq.body.sandbox).toBe(true);
    expect(JSON.stringify(dlq.body)).not.toMatch(/live_delivery":true/);
  });

  it('honors mandatory operational prefs and optional marketing consent', async () => {
    const customer = await signInCustomer(app, `s31-prefs-${uuidv7()}@example.test`);
    await prisma.person.update({
      where: { id: customer.personId },
      data: { primaryCountryId: countryId },
    });

    const patched = await request(app.getHttpServer())
      .patch('/api/v1/me/notifications/preferences')
      .set(auth(customer.token))
      .send({
        order_updates: false,
        appointment_updates: false,
        marketing: false,
      });
    expect(patched.status).toBe(200);
    expect(patched.body.order_updates).toBe(true);
    expect(patched.body.appointment_updates).toBe(true);
    expect(patched.body.marketing).toBe(false);

    await dispatch.handleDomainEvent(
      envelope({
        eventName: 'ORDER_CONFIRMED',
        aggregateId: uuidv7(),
        payload: { customer_person_id: customer.personId, country_code: countryCode },
      }),
    );
    const inbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set(auth(customer.token));
    expect(inbox.body.data.some((row: { title?: string }) => row.title === 'Order confirmed')).toBe(true);

    const allowMarketing = await request(app.getHttpServer())
      .patch('/api/v1/me/notifications/preferences')
      .set(auth(customer.token))
      .send({ marketing: true });
    expect(allowMarketing.body.marketing).toBe(true);
    const denyMarketing = await request(app.getHttpServer())
      .patch('/api/v1/me/notifications/preferences')
      .set(auth(customer.token))
      .send({ marketing: false });
    expect(denyMarketing.body.marketing).toBe(false);
  });

  it('admin ops metrics match records; finance/support RBAC and cross-country isolation', async () => {
    const customer = await signInCustomer(app, `s31-admin-${uuidv7()}@example.test`);
    const localKey = `s31-ops-${uuidv7()}`;
    await notifications.enqueueInbox(
      customer.personId,
      {
        id: uuidv7(),
        channel: 'in_app',
        title: 'Payment captured',
        body: NotificationService.safeSandboxBody(),
        read: false,
        created_at: new Date().toISOString(),
        event_type: 'PAYMENT_CAPTURED',
        country_code: countryCode,
      },
      { occurrenceKey: localKey, recipientCategory: 'customer' },
    );
    await notifications.enqueueInbox(
      customer.personId,
      {
        id: uuidv7(),
        channel: 'in_app',
        title: 'Lab report ready',
        body: NotificationService.safeSandboxBody(),
        read: false,
        created_at: new Date().toISOString(),
        event_type: 'LAB_REPORT_PUBLISHED',
        country_code: otherCountryCode,
      },
      { occurrenceKey: `${localKey}-lab`, recipientCategory: 'customer' },
    );

    const snapshot = await request(app.getHttpServer())
      .get(`/api/v1/admin/notifications/ops/snapshot?country_code=${countryCode}`)
      .set(auth(superToken));
    expect(snapshot.status).toBe(200);
    expect(snapshot.body.live_delivery).toBe(false);
    expect(snapshot.body.sandbox).toBe(true);
    expect(snapshot.body.channels.email.external_gate).toBe('EXTERNAL_GATED');
    expect(snapshot.body.volume).toBeGreaterThanOrEqual(1);

    const records = await request(app.getHttpServer())
      .get(`/api/v1/admin/notifications/ops/records?country_code=${countryCode}&event_type=PAYMENT_CAPTURED`)
      .set(auth(superToken));
    expect(records.status).toBe(200);
    expect(records.body.message_bodies_included).toBe(false);
    expect(records.body.data.some((row: { occurrence_key?: string }) => row.occurrence_key === localKey)).toBe(true);
    expect(records.body.data.every((row: { country_code?: string }) => row.country_code === countryCode)).toBe(true);

    const recentAudit = await prisma.securityEvent.findFirst({
      where: { type: 'NOTIFICATION_OPS_VIEWED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(recentAudit).toBeTruthy();

    const finance = await provisionRole('s31-fin', 'company_finance');
    const financeRecords = await request(app.getHttpServer())
      .get('/api/v1/admin/notifications/ops/records')
      .set(auth(finance.token));
    expect(financeRecords.status).toBe(200);
    expect(
      financeRecords.body.data.every((row: { event_type?: string | null }) =>
        String(row.event_type ?? '').match(/^(PAYMENT_|ORDER_REFUND|SETTLEMENT_|PAYOUT_|AFFILIATE_)/),
      ),
    ).toBe(true);
    expect(
      financeRecords.body.data.some((row: { event_type?: string | null }) => row.event_type === 'LAB_REPORT_PUBLISHED'),
    ).toBe(false);

    const support = await provisionRole('s31-sup', 'company_support');
    const supportRecords = await request(app.getHttpServer())
      .get('/api/v1/admin/notifications/ops/records')
      .set(auth(support.token));
    expect(supportRecords.status).toBe(200);
    expect(supportRecords.body.message_bodies_included).toBe(false);
    expect(JSON.stringify(supportRecords.body)).not.toMatch(/diagnosis|lab value|prescription contents/i);

    const otherCountry = await request(app.getHttpServer())
      .get(`/api/v1/admin/notifications/ops/records?country_code=${otherCountryCode}`)
      .set(auth(superToken));
    expect(
      otherCountry.body.data.some((row: { occurrence_key?: string }) => row.occurrence_key === `${localKey}-lab`),
    ).toBe(true);
    expect(otherCountry.body.data.every((row: { country_code?: string }) => row.country_code === otherCountryCode)).toBe(
      true,
    );
  });

  it('rejects PHI in admin send and keeps mark-all-read person scoped', async () => {
    const customer = await signInCustomer(app, `s31-phi-${uuidv7()}@example.test`);
    const other = await signInCustomer(app, `s31-phi-b-${uuidv7()}@example.test`);
    await notifications.enqueueInbox(customer.personId, {
      id: uuidv7(),
      channel: 'in_app',
      title: 'Order status changed',
      body: NotificationService.safeSandboxBody(),
      read: false,
      created_at: new Date().toISOString(),
    });
    await notifications.enqueueInbox(other.personId, {
      id: uuidv7(),
      channel: 'in_app',
      title: 'Other notice',
      body: NotificationService.safeSandboxBody(),
      read: false,
      created_at: new Date().toISOString(),
    });

    const bad = await request(app.getHttpServer())
      .post('/api/v1/admin/notifications/send')
      .set(auth(superToken))
      .send({
        person_id: customer.personId,
        title: 'Hello',
        body: 'Your diagnosis is hypertension',
      });
    expect(bad.status).toBeGreaterThanOrEqual(400);

    const markAll = await request(app.getHttpServer())
      .post('/api/v1/me/notifications/inbox/read-all')
      .set(auth(customer.token));
    expect(markAll.status).toBe(200);
    expect(markAll.body.data.every((row: { read?: boolean }) => row.read === true)).toBe(true);

    const otherInbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set(auth(other.token));
    expect(otherInbox.body.data.some((row: { read?: boolean; title?: string }) => row.title === 'Other notice' && !row.read)).toBe(
      true,
    );
  });
});
