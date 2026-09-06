import { INestApplication } from '@nestjs/common';
import {
  AppointmentStatus,
  AppointmentType,
  EncounterStatus,
  HealthTimelineEventStatus,
  HealthTimelineEventType,
  PrescriptionStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { OrganizationService } from '../partner/organization.service';
import { applyTestIsolation } from '../test/isolate-runtime';
import { publishLabHealthArtifactFixture } from '../test/publish-lab-health-artifact';
import { signIn as testSignIn } from '../test/sign-in';

describe('Sprint 10 customer health journey (e2e)', () => {
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

  it('dashboard, timeline, and cross-customer privacy', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const ctx = await publishLabHealthArtifactFixture(app, prisma, orgs, suffix, (email, audience) =>
      testSignIn(app, email, audience ?? 'customer'),
    );

    const doctorProfile = await prisma.doctorProfile.findFirst({ include: { partner: true } });
    if (!doctorProfile) {
      throw new Error('Doctor profile required for appointment seed');
    }

    const slotOffsetMs =
      86_400_000 * 45 + (parseInt(suffix.replace(/\D/g, '').slice(-6) || '1', 10) % 720) * 3_600_000;
    const slotStart = new Date(Date.now() + slotOffsetMs);
    const slotEnd = new Date(slotStart.getTime() + 3_600_000);
    const appointmentId = uuidv7();
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

    await prisma.healthTimelineEvent.create({
      data: {
        id: uuidv7(),
        personId: ctx.customerA.personId,
        countryId: ctx.country.id,
        eventType: HealthTimelineEventType.CONSULT_COMPLETED,
        sourceModule: 'encounter',
        sourceId: encounterId,
        title: 'Older consult completed',
        status: HealthTimelineEventStatus.ACTIVE,
        occurredAt: new Date(Date.now() - 86_400_000),
        sandbox: true,
      },
    });

    const unauthenticatedDashboard = await request(app.getHttpServer()).get(
      '/api/v1/health/dashboard?country_code=XX',
    );
    expect(unauthenticatedDashboard.status).toBe(401);

    const dashboard = await request(app.getHttpServer())
      .get('/api/v1/health/dashboard?country_code=XX')
      .set(ctx.auth(ctx.customerA.token));
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.timeline_enabled).toBe(true);
    expect(dashboard.body.overview.recent_lab_bookings.some((row: { id: string }) => row.id === ctx.bookingId)).toBe(
      true,
    );
    expect(
      dashboard.body.overview.upcoming_appointments.some((row: { id: string }) => row.id === appointmentId),
    ).toBe(true);
    expect(
      dashboard.body.overview.recent_prescriptions.some((row: { id: string }) => row.id === prescriptionId),
    ).toBe(true);
    expect(dashboard.body.recent_activity.items.length).toBeGreaterThanOrEqual(1);

    const foreignDashboard = await request(app.getHttpServer())
      .get('/api/v1/health/dashboard?country_code=XX')
      .set(ctx.auth(ctx.customerB.token));
    expect(foreignDashboard.status).toBe(200);
    expect(
      foreignDashboard.body.overview.recent_lab_bookings.some((row: { id: string }) => row.id === ctx.bookingId),
    ).toBe(false);

    const timeline = await request(app.getHttpServer())
      .get('/api/v1/health/timeline?country_code=XX')
      .set(ctx.auth(ctx.customerA.token));
    expect(timeline.status).toBe(200);
    expect(timeline.body.items.length).toBeGreaterThanOrEqual(1);
    const times = timeline.body.items.map((item: { occurred_at: string }) => new Date(item.occurred_at).getTime());
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i - 1]).toBeGreaterThanOrEqual(times[i]!);
    }

    const ownPrescription = await request(app.getHttpServer())
      .get(`/api/v1/customer/prescriptions/${prescriptionId}`)
      .set(ctx.auth(ctx.customerA.token));
    expect(ownPrescription.status).toBe(200);

    const foreignPrescription = await request(app.getHttpServer())
      .get(`/api/v1/customer/prescriptions/${prescriptionId}`)
      .set(ctx.auth(ctx.customerB.token));
    expect(foreignPrescription.status).toBe(404);

    const ownAppointment = await request(app.getHttpServer())
      .get(`/api/v1/appointments/${appointmentId}`)
      .set(ctx.auth(ctx.customerA.token));
    expect(ownAppointment.status).toBe(200);

    const foreignAppointment = await request(app.getHttpServer())
      .get(`/api/v1/appointments/${appointmentId}`)
      .set(ctx.auth(ctx.customerB.token));
    expect([403, 404]).toContain(foreignAppointment.status);

    const ownLabReport = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/bookings/${ctx.bookingId}/report`)
      .set(ctx.auth(ctx.customerA.token));
    expect(ownLabReport.status).toBe(200);

    const foreignLabReport = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/bookings/${ctx.bookingId}/report`)
      .set(ctx.auth(ctx.customerB.token));
    expect(foreignLabReport.status).toBe(403);

    const foreignLabBooking = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/bookings/${ctx.bookingId}`)
      .set(ctx.auth(ctx.customerB.token));
    expect(foreignLabBooking.status).toBe(403);

    const unauthenticatedTimeline = await request(app.getHttpServer()).get(
      '/api/v1/health/timeline?country_code=XX',
    );
    expect(unauthenticatedTimeline.status).toBe(401);
  });
});
