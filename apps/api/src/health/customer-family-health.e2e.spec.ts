import { INestApplication } from '@nestjs/common';
import {
  AppointmentStatus,
  AppointmentType,
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
import { applyTestIsolation } from '../test/isolate-runtime';
import { publishLabHealthArtifactFixture } from '../test/publish-lab-health-artifact';
import { signIn as testSignIn } from '../test/sign-in';

describe('Sprint 19 customer family health (e2e)', () => {
  jest.setTimeout(240_000);
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

  it('profile, family authorization, and record isolation', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const ctx = await publishLabHealthArtifactFixture(app, prisma, orgs, suffix, (email, audience) =>
      testSignIn(app, email, audience ?? 'customer'),
    );
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    const allergy = await request(app.getHttpServer())
      .post('/api/v1/health/profile/allergies')
      .set(auth(ctx.customerA.token))
      .send({ country_code: 'XX', allergen: 'Penicillin', severity: 'SEVERE', reaction: 'Rash' });
    expect(allergy.status).toBeLessThan(300);

    const condition = await request(app.getHttpServer())
      .post('/api/v1/health/profile/conditions')
      .set(auth(ctx.customerA.token))
      .send({ country_code: 'XX', condition: 'Type 2 diabetes', status: 'ACTIVE' });
    expect(condition.status).toBeLessThan(300);

    const vital = await request(app.getHttpServer())
      .post('/api/v1/health/profile/vitals')
      .set(auth(ctx.customerA.token))
      .send({ country_code: 'XX', weight_kg: 72, blood_pressure_systolic: 120, blood_pressure_diastolic: 80 });
    expect(vital.status).toBeLessThan(300);

    const emergency = await request(app.getHttpServer())
      .post('/api/v1/health/profile/emergency-contact')
      .set(auth(ctx.customerA.token))
      .send({
        country_code: 'XX',
        name: 'Alex Contact',
        relationship: 'Spouse',
        phone: '+10000000001',
      });
    expect(emergency.status).toBeLessThan(300);

    const profile = await request(app.getHttpServer())
      .get('/api/v1/health/profile?country_code=XX')
      .set(auth(ctx.customerA.token));
    expect(profile.status).toBe(200);
    expect(profile.body.profile.allergies.some((row: { allergen: string }) => row.allergen === 'Penicillin')).toBe(
      true,
    );
    expect(profile.body.profile.conditions.length).toBeGreaterThanOrEqual(1);
    expect(profile.body.profile.vitals.length).toBeGreaterThanOrEqual(1);
    expect(profile.body.profile.emergency_contact?.name).toBe('Alex Contact');

    const foreignProfile = await request(app.getHttpServer())
      .get('/api/v1/health/profile?country_code=XX')
      .set(auth(ctx.customerB.token));
    expect(foreignProfile.body.profile.allergies.some((row: { allergen: string }) => row.allergen === 'Penicillin')).toBe(
      false,
    );

    const foreignPatch = await request(app.getHttpServer())
      .patch('/api/v1/health/profile')
      .set(auth(ctx.customerB.token))
      .send({ country_code: 'XX', notes: 'Hacked' });
    expect(foreignPatch.status).toBeLessThan(500);

    const member = await request(app.getHttpServer())
      .post('/api/v1/me/family-members')
      .set(auth(ctx.customerA.token))
      .send({
        country_code: 'XX',
        display_name: 'Child One',
        relationship_code: 'CHILD',
        age_years: 8,
      });
    expect(member.status).toBeLessThan(300);
    const familyMemberId = member.body.id as string;

    await request(app.getHttpServer())
      .post('/api/v1/health/profile/allergies')
      .set(auth(ctx.customerA.token))
      .send({ country_code: 'XX', family_member_id: familyMemberId, allergen: 'Peanuts', severity: 'MILD' });

    const familyProfile = await request(app.getHttpServer())
      .get(`/api/v1/health/profile?country_code=XX&family_member_id=${familyMemberId}`)
      .set(auth(ctx.customerA.token));
    expect(familyProfile.status).toBe(200);
    expect(
      familyProfile.body.profile.allergies.some((row: { allergen: string }) => row.allergen === 'Peanuts'),
    ).toBe(true);

    const doctorProfile = await prisma.doctorProfile.findFirst({ include: { partner: true } });
    if (!doctorProfile) {
      throw new Error('Doctor profile required');
    }

    const appointmentId = uuidv7();
    const uniqueHours =
      (parseInt(appointmentId.replace(/-/g, '').slice(0, 12), 16) % 5000) + 200;
    const slotStart = new Date(Date.now() + uniqueHours * 3_600_000);
    slotStart.setUTCMinutes(0, 0, 0);
    await prisma.appointment.create({
      data: {
        id: appointmentId,
        customerPersonId: ctx.customerA.personId,
        subjectFamilyMemberId: familyMemberId,
        doctorProfileId: doctorProfile.id,
        doctorPartnerId: doctorProfile.partnerId,
        countryId: ctx.country.id,
        timezone: 'UTC',
        type: AppointmentType.ONLINE,
        startsAt: slotStart,
        endsAt: new Date(slotStart.getTime() + 3_600_000),
        status: AppointmentStatus.CONFIRMED,
      },
    });

    const selfRxId = uuidv7();
    const familyRxId = uuidv7();
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
    await prisma.prescription.createMany({
      data: [
        {
          id: selfRxId,
          patientPersonId: ctx.customerA.personId,
          subjectFamilyMemberId: null,
          doctorProfileId: doctorProfile.id,
          doctorPartnerId: doctorProfile.partnerId,
          encounterId,
          countryId: ctx.country.id,
          createdByPersonId: doctorProfile.partner.personId,
          status: PrescriptionStatus.ISSUED,
          origin: 'ENCOUNTER',
        },
        {
          id: familyRxId,
          patientPersonId: ctx.customerA.personId,
          subjectFamilyMemberId: familyMemberId,
          doctorProfileId: doctorProfile.id,
          doctorPartnerId: doctorProfile.partnerId,
          encounterId,
          countryId: ctx.country.id,
          createdByPersonId: doctorProfile.partner.personId,
          status: PrescriptionStatus.ISSUED,
          origin: 'ENCOUNTER',
        },
      ],
    });

    await prisma.labBooking.update({
      where: { id: ctx.bookingId },
      data: { subjectFamilyMemberId: null },
    });

    const familyDash = await request(app.getHttpServer())
      .get(`/api/v1/health/dashboard?country_code=XX&family_member_id=${familyMemberId}`)
      .set(auth(ctx.customerA.token));
    expect(familyDash.status).toBe(200);
    expect(familyDash.body.viewing_subject.display_name).toBe('Child One');
    expect(
      familyDash.body.overview.upcoming_appointments.some((row: { id: string }) => row.id === appointmentId),
    ).toBe(true);
    expect(
      familyDash.body.overview.recent_prescriptions.some((row: { id: string }) => row.id === familyRxId),
    ).toBe(true);
    expect(
      familyDash.body.overview.recent_prescriptions.some((row: { id: string }) => row.id === selfRxId),
    ).toBe(false);

    const selfDash = await request(app.getHttpServer())
      .get('/api/v1/health/dashboard?country_code=XX')
      .set(auth(ctx.customerA.token));
    expect(
      selfDash.body.overview.recent_prescriptions.some((row: { id: string }) => row.id === selfRxId),
    ).toBe(true);
    expect(
      selfDash.body.overview.recent_prescriptions.some((row: { id: string }) => row.id === familyRxId),
    ).toBe(false);

    const foreignFamily = await request(app.getHttpServer())
      .get(`/api/v1/health/profile?country_code=XX&family_member_id=${familyMemberId}`)
      .set(auth(ctx.customerB.token));
    expect(foreignFamily.status).toBe(403);

    const randomFamilyId = uuidv7();
    const randomAccess = await request(app.getHttpServer())
      .get(`/api/v1/health/dashboard?country_code=XX&family_member_id=${randomFamilyId}`)
      .set(auth(ctx.customerA.token));
    expect([403, 404]).toContain(randomAccess.status);

    const foreignRx = await request(app.getHttpServer())
      .get(`/api/v1/customer/prescriptions/${familyRxId}`)
      .set(auth(ctx.customerB.token));
    expect(foreignRx.status).toBe(404);

    const foreignLab = await request(app.getHttpServer())
      .get(`/api/v1/me/lab/bookings/${ctx.bookingId}/report`)
      .set(auth(ctx.customerB.token));
    expect(foreignLab.status).toBe(403);

    const subjects = await request(app.getHttpServer())
      .get('/api/v1/health/profile/subjects?country_code=XX')
      .set(auth(ctx.customerA.token));
    expect(subjects.status).toBe(200);
    expect(subjects.body.subjects.some((row: { display_name: string }) => row.display_name === 'Child One')).toBe(
      true,
    );

    const mobileDash = await request(app.getHttpServer())
      .get(`/api/v1/health/dashboard?country_code=XX&family_member_id=${familyMemberId}`)
      .set(auth(ctx.customerA.token));
    expect(mobileDash.body.viewing_subject.kind).toBe('family_member');

    await prisma.customerFamilyMember.update({
      where: { id: familyMemberId },
      data: { healthAccessEnabled: false },
    });
    const disabled = await request(app.getHttpServer())
      .get(`/api/v1/health/profile?country_code=XX&family_member_id=${familyMemberId}`)
      .set(auth(ctx.customerA.token));
    expect(disabled.status).toBe(403);

    const emptyFamily = await testSignIn(app, `s19-empty-${suffix}@example.com`);
    const emptySubjects = await request(app.getHttpServer())
      .get('/api/v1/health/profile/subjects?country_code=XX')
      .set(auth(emptyFamily.token));
    expect(emptySubjects.status).toBe(200);
    expect(emptySubjects.body.subjects.length).toBe(1);
    expect(emptySubjects.body.subjects[0].kind).toBe('self');
  });
});
