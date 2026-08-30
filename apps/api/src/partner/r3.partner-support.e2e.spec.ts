import { INestApplication } from '@nestjs/common';
import {
  LocationKind,
  LogisticsJobType,
  OrganizationKind,
  PartnerStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { OrganizationService } from './organization.service';
import { applyTestIsolation } from '../test/isolate-runtime';

async function signIn(
  app: INestApplication,
  email: string,
  audience: 'admin' | 'customer' | 'partner_applicant' = 'customer',
) {
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

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe('R3 partner support entry (e2e)', () => {
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

  async function attachOrgMember(
    personId: string,
    organizationId: string,
    locationId?: string,
    roleCode = 'org_operations',
  ) {
    const role = await prisma.role.findUnique({ where: { code: roleCode } });
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId,
        roleId: role!.id,
        scope: 'organization',
        organizationId,
        countryId: org.countryId,
        locationId: locationId ?? null,
        status: 'ACTIVE',
      },
    });
  }

  async function attachAdmin(personId: string) {
    const role = await prisma.role.findUnique({ where: { code: 'super_admin' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId,
        roleId: role!.id,
        scope: 'platform',
        status: 'ACTIVE',
      },
    });
  }

  it('returns 401 for unauthenticated store support', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/store/support/tickets');
    expect(res.status).toBe(401);
  });

  it('store staff can file scoped support with org/location isolation', async () => {
    const suffix = Date.now().toString(36);
    const admin = await signIn(app, `r3-sup-admin-${suffix}@example.com`, 'admin');
    await attachAdmin(admin.personId);
    const staffA = await signIn(app, `r3-sup-staff-a-${suffix}@example.com`);
    const staffB = await signIn(app, `r3-sup-staff-b-${suffix}@example.com`);

    const org = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.VENDOR,
      legalName: `R3 Store ${suffix}`,
      displayName: `R3 Store ${suffix}`,
      actorId: admin.personId,
    });
    const locA = await orgs.createLocation({
      organizationId: org.id,
      kind: LocationKind.WAREHOUSE,
      name: 'Store A',
      actorId: admin.personId,
    });
    const locB = await orgs.createLocation({
      organizationId: org.id,
      kind: LocationKind.WAREHOUSE,
      name: 'Store B',
      actorId: admin.personId,
    });
    await attachOrgMember(staffA.personId, org.id, locA.id);
    await attachOrgMember(staffB.personId, org.id, locB.id);

    const ticket = await request(app.getHttpServer())
      .post('/api/v1/store/support/tickets')
      .set(auth(staffA.token))
      .send({
        organization_id: org.id,
        location_id: locA.id,
        subject: 'Pick queue question',
        body: 'Need help with order workflow.',
        reference_type: 'account',
        reference_id: org.id,
      });
    expect(ticket.status).toBeLessThan(300);
    expect(ticket.body.category).toBe('store_ops');
    expect(ticket.body.reference_type).toBe('account');

    const wrongLocation = await request(app.getHttpServer())
      .post('/api/v1/store/support/tickets')
      .set(auth(staffA.token))
      .send({
        organization_id: org.id,
        location_id: locB.id,
        subject: 'Cross location',
        body: 'Should fail',
      });
    expect(wrongLocation.status).toBe(403);

    const list = await request(app.getHttpServer())
      .get('/api/v1/store/support/tickets')
      .set(auth(staffA.token));
    expect(list.status).toBe(200);
    expect(list.body.data.some((row: { id: string }) => row.id === ticket.body.id)).toBe(true);
  });

  it('delivery rider can file support for own job but not another rider job', async () => {
    const suffix = Date.now().toString(36);
    const riderA = await signIn(app, `r3-sup-rider-a-${suffix}@example.com`);
    const riderB = await signIn(app, `r3-sup-rider-b-${suffix}@example.com`);
    const countryId = (await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'XX' } })).id;

    await prisma.partner.create({
      data: {
        id: uuidv7(),
        personId: riderA.personId,
        partnerTypeCode: 'DELIVERY_PARTNER',
        countryId,
        status: PartnerStatus.ACTIVE,
      },
    });
    await prisma.partner.create({
      data: {
        id: uuidv7(),
        personId: riderB.personId,
        partnerTypeCode: 'DELIVERY_PARTNER',
        countryId,
        status: PartnerStatus.ACTIVE,
      },
    });

    const job = await prisma.logisticsJob.create({
      data: {
        id: uuidv7(),
        jobType: LogisticsJobType.MEDICINE_DELIVERY,
        status: 'ASSIGNED',
        assigneeId: riderA.personId,
        payload: { sandbox: true },
      },
    });

    const ticket = await request(app.getHttpServer())
      .post('/api/v1/delivery/support/tickets')
      .set(auth(riderA.token))
      .send({
        subject: 'POD issue',
        body: 'Customer unavailable at dropoff.',
        reference_type: 'logistics_job',
        reference_id: job.id,
      });
    expect(ticket.status).toBeLessThan(300);
    expect(ticket.body.category).toBe('delivery');

    const steal = await request(app.getHttpServer())
      .post('/api/v1/delivery/support/tickets')
      .set(auth(riderB.token))
      .send({
        subject: 'Steal job reference',
        body: 'Attempt',
        reference_type: 'logistics_job',
        reference_id: job.id,
      });
    expect([403, 404]).toContain(steal.status);

    const noAccess = await signIn(app, `r3-sup-no-rider-${suffix}@example.com`);
    const denied = await request(app.getHttpServer())
      .post('/api/v1/delivery/support/tickets')
      .set(auth(noAccess.token))
      .send({ subject: 'No rider', body: 'Should fail' });
    expect(denied.status).toBe(403);
  });

  it('join applicant can file onboarding support linked to own application only', async () => {
    const suffix = Date.now().toString(36);
    const applicantA = await signIn(app, `r3-sup-app-a-${suffix}@example.com`, 'partner_applicant');
    const applicantB = await signIn(app, `r3-sup-app-b-${suffix}@example.com`, 'partner_applicant');
    const admin = await signIn(app, `r3-sup-join-admin-${suffix}@example.com`, 'admin');
    await attachAdmin(admin.personId);

    const createdA = await request(app.getHttpServer())
      .post('/api/v1/admin/partners/applications')
      .set(auth(admin.token))
      .send({
        person_id: applicantA.personId,
        partner_type_code: 'PHARMACY',
        country_code: 'XX',
      });
    expect(createdA.status).toBeLessThan(300);
    const appIdA = createdA.body.application.id as string;

    const createdB = await request(app.getHttpServer())
      .post('/api/v1/admin/partners/applications')
      .set(auth(admin.token))
      .send({
        person_id: applicantB.personId,
        partner_type_code: 'PHARMACY',
        country_code: 'XX',
      });
    const appIdB = createdB.body.application.id as string;

    const ticket = await request(app.getHttpServer())
      .post('/api/v1/join/support/tickets')
      .set(auth(applicantA.token))
      .send({
        subject: 'Document question',
        body: 'Which format for license upload?',
        reference_type: 'partner_application',
        reference_id: appIdA,
      });
    expect(ticket.status).toBeLessThan(300);
    expect(ticket.body.category).toBe('onboarding');

    const steal = await request(app.getHttpServer())
      .post('/api/v1/join/support/tickets')
      .set(auth(applicantA.token))
      .send({
        subject: 'Steal application',
        body: 'Attempt',
        reference_type: 'partner_application',
        reference_id: appIdB,
      });
    expect(steal.status).toBe(404);

    const list = await request(app.getHttpServer())
      .get('/api/v1/join/support/tickets')
      .set(auth(applicantA.token));
    expect(list.status).toBe(200);
    expect(list.body.data.some((row: { id: string }) => row.id === ticket.body.id)).toBe(true);
  });
});
