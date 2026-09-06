import { INestApplication } from '@nestjs/common';
import {
  AppointmentStatus,
  AppointmentType,
  CarePlanCatalogStatus,
  EncounterStatus,
  PrescriptionStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { OrganizationService } from '../partner/organization.service';
import { EventWorkerService } from '../events/worker.service';
import { applyTestIsolation } from '../test/isolate-runtime';
import { publishLabHealthArtifactFixture } from '../test/publish-lab-health-artifact';
import { signIn as testSignIn } from '../test/sign-in';

describe('Sprint 18 customer health platform (e2e)', () => {
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

  it('A–L: dashboard, records, care plan, reminders, isolation, and empty state', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const ctx = await publishLabHealthArtifactFixture(app, prisma, orgs, suffix, (email, audience) =>
      testSignIn(app, email, audience ?? 'customer'),
    );

    const doctorProfile = await prisma.doctorProfile.findFirst({ include: { partner: true } });
    if (!doctorProfile) {
      throw new Error('Doctor profile required for appointment seed');
    }

    const appointmentId = uuidv7();
    const uniqueHours =
      (parseInt(appointmentId.replace(/-/g, '').slice(0, 12), 16) % 5000) + 100;
    const slotStart = new Date(Date.now() + uniqueHours * 3_600_000);
    slotStart.setUTCMinutes(0, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + 3_600_000);
    await prisma.appointment.create({
      data: {
        id: appointmentId,
        customerPersonId: ctx.customerA.personId,
        doctorProfileId: doctorProfile.id,
        doctorPartnerId: doctorProfile.partnerId,
        countryId: ctx.country.id,
        timezone: 'UTC',
        type: AppointmentType.ONLINE,
        startsAt: slotStart,
        endsAt: slotEnd,
        status: AppointmentStatus.CONFIRMED,
      },
    });

    const encounterId = uuidv7();
    await prisma.encounter.create({
      data: {
        id: encounterId,
        appointmentId,
        customerPersonId: ctx.customerA.personId,
        doctorProfileId: doctorProfile.id,
        doctorPartnerId: doctorProfile.partnerId,
        countryId: ctx.country.id,
        status: EncounterStatus.COMPLETED,
        endedAt: new Date(),
      },
    });

    const prescriptionId = uuidv7();
    await prisma.prescription.create({
      data: {
        id: prescriptionId,
        patientPersonId: ctx.customerA.personId,
        doctorProfileId: doctorProfile.id,
        doctorPartnerId: doctorProfile.partnerId,
        encounterId,
        countryId: ctx.country.id,
        createdByPersonId: doctorProfile.partner.personId,
        status: PrescriptionStatus.ISSUED,
        origin: 'ENCOUNTER',
      },
    });

    await prisma.carePlanDefinition.upsert({
      where: {
        countryId_planCode: { countryId: ctx.country.id, planCode: 'diabetes' },
      },
      create: {
        id: uuidv7(),
        countryId: ctx.country.id,
        planCode: 'diabetes',
        name: 'Diabetes Care Plan',
        description: 'Sandbox care plan for Sprint 18 tests',
        priceMinor: 54900,
        currency: 'XXX',
        period: 'year',
        discountBps: 1500,
        freeDelivery: false,
        featured: true,
        perks: ['15% off medicines at checkout'],
        status: CarePlanCatalogStatus.ACTIVE,
      },
      update: { status: CarePlanCatalogStatus.ACTIVE },
    });

    const subscribed = await request(app.getHttpServer())
      .post('/api/v1/me/care-plan/subscribe')
      .set(ctx.auth(ctx.customerA.token))
      .send({ country_code: 'XX', plan_code: 'diabetes' });
    expect(subscribed.status).toBeLessThan(300);
    expect(subscribed.body.membership?.active).toBe(true);

    const reminder = await request(app.getHttpServer())
      .post('/api/v1/me/medication-reminders')
      .set(ctx.auth(ctx.customerA.token))
      .send({
        country_code: 'XX',
        medicine_label: 'Metformin 500mg',
        schedule_times: ['08:00', '20:00'],
        days_of_week: [0, 1, 2, 3, 4, 5, 6],
      });
    expect(reminder.status).toBeLessThan(300);
    const reminderId = reminder.body.id as string;

    const reminderEvt = await prisma.outboxEvent.findFirst({
      where: { type: 'MEDICATION_REMINDER_CREATED', aggregateId: reminderId },
      orderBy: { createdAt: 'desc' },
    });
    expect(reminderEvt).toBeTruthy();
    await eventWorker.handle(reminderEvt!.id);
    const inbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set(ctx.auth(ctx.customerA.token));
    expect(inbox.body.data.some((row: { title: string }) => row.title === 'Medication reminder set')).toBe(true);

    expect(await request(app.getHttpServer()).get('/api/v1/health/dashboard?country_code=XX')).toMatchObject({
      status: 401,
    });

    const dashboard = await request(app.getHttpServer())
      .get('/api/v1/health/dashboard?country_code=XX')
      .set(ctx.auth(ctx.customerA.token));
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.timeline_enabled).toBe(true);
    expect(
      dashboard.body.overview.upcoming_appointments.some((row: { id: string }) => row.id === appointmentId),
    ).toBe(true);
    expect(
      dashboard.body.overview.recent_prescriptions.some((row: { id: string }) => row.id === prescriptionId),
    ).toBe(true);
    expect(
      dashboard.body.overview.recent_lab_bookings.some((row: { id: string }) => row.id === ctx.bookingId),
    ).toBe(true);
    expect(dashboard.body.overview.active_care_plan?.plan_code).toBe('diabetes');
    expect(dashboard.body.overview.medication_reminders.length).toBeGreaterThanOrEqual(1);
    expect(dashboard.body.overview.health_insights.length).toBeGreaterThanOrEqual(1);
    expect(dashboard.body.overview.health_insights.some((row: { code: string }) => row.code === 'care_plan_active')).toBe(
      true,
    );

    const timeline = await request(app.getHttpServer())
      .get('/api/v1/health/timeline?country_code=XX')
      .set(ctx.auth(ctx.customerA.token));
    expect(timeline.status).toBe(200);
    expect(timeline.body.items.length).toBeGreaterThanOrEqual(1);

    const artifact = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${ctx.artifactId}?country_code=XX`)
      .set(ctx.auth(ctx.customerA.token));
    expect(artifact.status).toBe(200);
    const payload = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${ctx.artifactId}/payload?country_code=XX`)
      .set(ctx.auth(ctx.customerA.token));
    expect(payload.status).toBe(200);

    const carePlan = await request(app.getHttpServer())
      .get('/api/v1/me/care-plan?country_code=XX')
      .set(ctx.auth(ctx.customerA.token));
    expect(carePlan.status).toBe(200);
    expect(carePlan.body.membership?.active).toBe(true);

    const reminders = await request(app.getHttpServer())
      .get('/api/v1/me/medication-reminders?country_code=XX')
      .set(ctx.auth(ctx.customerA.token));
    expect(reminders.status).toBe(200);
    expect(reminders.body.reminders.some((row: { id: string }) => row.id === reminderId)).toBe(true);

    const foreignDashboard = await request(app.getHttpServer())
      .get('/api/v1/health/dashboard?country_code=XX')
      .set(ctx.auth(ctx.customerB.token));
    expect(
      foreignDashboard.body.overview.recent_lab_bookings.some((row: { id: string }) => row.id === ctx.bookingId),
    ).toBe(false);

    const foreignRx = await request(app.getHttpServer())
      .get(`/api/v1/customer/prescriptions/${prescriptionId}`)
      .set(ctx.auth(ctx.customerB.token));
    expect(foreignRx.status).toBe(404);

    const foreignLab = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/bookings/${ctx.bookingId}/report`)
      .set(ctx.auth(ctx.customerB.token));
    expect(foreignLab.status).toBe(403);

    const patchRx = await request(app.getHttpServer())
      .patch(`/api/v1/customer/prescriptions/${prescriptionId}`)
      .set(ctx.auth(ctx.customerA.token))
      .send({ status: 'CANCELLED' });
    expect([403, 404, 405]).toContain(patchRx.status);

    const emptyCustomer = await testSignIn(app, `s18-empty-${suffix}@example.com`);
    const emptyDash = await request(app.getHttpServer())
      .get('/api/v1/health/dashboard?country_code=XX')
      .set(ctx.auth(emptyCustomer.token));
    expect(emptyDash.status).toBe(200);
    expect(emptyDash.body.overview.upcoming_appointments.length).toBe(0);
    expect(emptyDash.body.overview.recent_prescriptions.length).toBe(0);
    expect(emptyDash.body.overview.active_care_plan).toBeNull();
    expect(emptyDash.body.overview.medication_reminders.length).toBe(0);

    const mobileParityTimeline = await request(app.getHttpServer())
      .get('/api/v1/health/timeline?country_code=XX&limit=5')
      .set(ctx.auth(ctx.customerA.token));
    expect(mobileParityTimeline.body.items).toEqual(timeline.body.items.slice(0, 5));
  });
});
