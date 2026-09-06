import { INestApplication } from '@nestjs/common';
import { OrganizationKind } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { OrganizationService } from '../partner/organization.service';
import { applyTestIsolation } from '../test/isolate-runtime';
import { signIn, signInAdmin, signInCustomer, provisionSuperAdmin } from '../test/sign-in';

describe('application audience and partner isolation (e2e)', () => {
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

  async function attachRole(
    personId: string,
    roleCode: string,
    extra: { scope: 'platform' | 'country' | 'organization'; organizationId?: string; countryId?: string },
  ) {
    const role = await prisma.role.findUnique({ where: { code: roleCode } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId,
        roleId: role!.id,
        scope: extra.scope,
        organizationId: extra.organizationId,
        countryId: extra.countryId,
        status: 'ACTIVE',
      },
    });
  }

  it('keeps customer, vendor, doctor, affiliate, and company scopes from crossing', async () => {
    const globalAdmin = await provisionSuperAdmin(app, prisma, 'topo-ga');

    const customer = await signIn(app, `topo-cus-${Date.now()}@example.com`, 'customer');
    const vendorA = await signIn(app, `topo-va-${Date.now()}@example.com`, 'customer');
    const vendorB = await signIn(app, `topo-vb-${Date.now()}@example.com`, 'customer');
    const doctor = await signIn(app, `topo-doc-${Date.now()}@example.com`, 'doctor');
    const affiliate = await signIn(app, `topo-aff-${Date.now()}@example.com`, 'customer');
    const countryOpsEmail = `topo-ops-${Date.now()}@example.com`;
    const countryOpsCustomer = await signInCustomer(app, countryOpsEmail);
    let countryOps = countryOpsCustomer;

    const orgA = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.VENDOR,
      legalName: 'Topo Vendor A',
      displayName: 'Topo Vendor A',
      actorId: globalAdmin.personId,
    });
    const orgB = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.VENDOR,
      legalName: 'Topo Vendor B',
      displayName: 'Topo Vendor B',
      actorId: globalAdmin.personId,
    });
    const clinic = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.CLINIC,
      legalName: 'Topo Clinic',
      displayName: 'Topo Clinic',
      actorId: globalAdmin.personId,
    });
    const affOrg = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.AFFILIATE_ORG,
      legalName: 'Topo Affiliate',
      displayName: 'Topo Affiliate',
      actorId: globalAdmin.personId,
    });

    await attachRole(vendorA.personId, 'org_admin', { scope: 'organization', organizationId: orgA.id });
    await attachRole(vendorB.personId, 'org_admin', { scope: 'organization', organizationId: orgB.id });
    await attachRole(doctor.personId, 'clinic_doctor', { scope: 'organization', organizationId: clinic.id });
    await attachRole(affiliate.personId, 'org_owner', { scope: 'organization', organizationId: affOrg.id });

    const country = await prisma.country.findFirst();
    if (country) {
      await attachRole(countryOps.personId, 'company_operations', {
        scope: 'country',
        countryId: country.id,
      });
      countryOps = await signInAdmin(app, countryOpsEmail, countryOps.personId);
    }

    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    const customerAdmin = await request(app.getHttpServer())
      .get('/api/v1/admin/finance/dashboard')
      .set(auth(customer.token));
    expect(customerAdmin.status).toBeGreaterThanOrEqual(400);

    const vendorAdmin = await request(app.getHttpServer())
      .get('/api/v1/admin/finance/dashboard')
      .set(auth(vendorA.token));
    expect(vendorAdmin.status).toBeGreaterThanOrEqual(400);

    const affiliateAdmin = await request(app.getHttpServer())
      .get('/api/v1/admin/finance/dashboard')
      .set(auth(affiliate.token));
    expect(affiliateAdmin.status).toBeGreaterThanOrEqual(400);

    const doctorVendor = await request(app.getHttpServer())
      .get(`/api/v1/vendor/catalog/offers?seller_org_id=${orgA.id}`)
      .set(auth(doctor.token));
    expect(doctorVendor.status).toBeGreaterThanOrEqual(400);

    const vendorDoctor = await request(app.getHttpServer())
      .get('/api/v1/doctor/me')
      .set(auth(vendorA.token));
    expect(vendorDoctor.status).toBeGreaterThanOrEqual(400);

    const customerDoctorAppts = await request(app.getHttpServer())
      .get('/api/v1/doctor/appointments')
      .set(auth(customer.token));
    expect(customerDoctorAppts.status).toBeGreaterThanOrEqual(400);

    const vendorCross = await request(app.getHttpServer())
      .get(`/api/v1/vendor/settlements?seller_org_id=${orgB.id}`)
      .set(auth(vendorA.token));
    expect(vendorCross.status).toBeGreaterThanOrEqual(400);

    const vendorOwn = await request(app.getHttpServer())
      .get(`/api/v1/vendor/catalog/offers?seller_org_id=${orgB.id}`)
      .set(auth(vendorA.token));
    expect(vendorOwn.status).toBeGreaterThanOrEqual(400);

    const globalDash = await request(app.getHttpServer())
      .get('/api/v1/admin/finance/dashboard')
      .set(auth(globalAdmin.token));
    expect(globalDash.status).toBe(200);

    if (country) {
      const countryDash = await request(app.getHttpServer())
        .get('/api/v1/admin/finance/dashboard')
        .set(auth(countryOps.token));
      expect(countryDash.status).toBeGreaterThanOrEqual(400);
    }

    const denied = await prisma.securityEvent.findMany({
      where: { type: 'APP_AUDIENCE_DENIED', personId: doctor.personId },
    });
    expect(denied.length).toBeGreaterThan(0);
  });
});
