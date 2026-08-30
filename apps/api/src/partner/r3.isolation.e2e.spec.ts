import { INestApplication } from '@nestjs/common';
import {
  LocationKind,
  LogisticsJobStatus,
  LogisticsJobType,
  OrganizationKind,
  PartnerStatus,
  PolicyPackStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { PolicyCache } from '../policy/cache';
import { OrganizationService } from '../partner/organization.service';
import { applyTestIsolation } from '../test/isolate-runtime';
import { KycService } from '../partner/kyc.service';

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

describe('R3 partner operations isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgs: OrganizationService;
  let kyc: KycService;

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
    kyc = app.get(KycService);
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

  /** Enable PHARMACY on the pack PolicyResolver actually loads (publishedPolicyPackId preferred). */
  async function enablePharmacyOnResolvedPack() {
    const country = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'XX' } });
    let pack = country.publishedPolicyPackId
      ? await prisma.policyPack.findFirst({
          where: { id: country.publishedPolicyPackId, status: PolicyPackStatus.PUBLISHED },
        })
      : null;
    if (!pack) {
      pack = await prisma.policyPack.findFirst({
        where: { countryId: country.id, status: PolicyPackStatus.PUBLISHED },
        orderBy: { version: 'desc' },
      });
    }
    if (!pack) {
      const doc = emptyPolicyDocument();
      doc.partner_types.PHARMACY.enabled = true;
      doc.partner_types.PHARMACY.join_public = false;
      doc.services.pharmacy = true;
      pack = await prisma.policyPack.create({
        data: {
          id: uuidv7(),
          countryId: country.id,
          version: Math.floor(Date.now() % 1_000_000),
          status: PolicyPackStatus.PUBLISHED,
          document: doc as never,
          checksum: `r3-pharm-${Date.now()}`,
          publishedAt: new Date(),
        },
      });
      await prisma.country.update({
        where: { id: country.id },
        data: { publishedPolicyPackId: pack.id },
      });
    } else {
      const doc = { ...(pack.document as Record<string, unknown>) };
      const partnerTypes = { ...((doc.partner_types as Record<string, unknown>) ?? {}) };
      partnerTypes.PHARMACY = {
        ...((partnerTypes.PHARMACY as Record<string, unknown>) ?? {}),
        enabled: true,
        join_public: false,
      };
      doc.partner_types = partnerTypes;
      const services = { ...((doc.services as Record<string, unknown>) ?? {}) };
      services.pharmacy = true;
      doc.services = services;
      await prisma.policyPack.update({
        where: { id: pack.id },
        data: { document: doc as never },
      });
      if (country.publishedPolicyPackId !== pack.id) {
        await prisma.country.update({
          where: { id: country.id },
          data: { publishedPolicyPackId: pack.id },
        });
      }
    }
    await app.get(PolicyCache).invalidate('XX');
  }

  async function approveApplication(adminToken: string, applicationId: string) {
    const steps: PartnerStatus[] = [
      PartnerStatus.REGISTERED,
      PartnerStatus.DOCUMENTS_REQUIRED,
      PartnerStatus.DOCUMENTS_SUBMITTED,
      PartnerStatus.UNDER_REVIEW,
      PartnerStatus.VERIFIED,
      PartnerStatus.APPROVED,
    ];
    for (const to of steps) {
      await request(app.getHttpServer())
        .post(`/api/v1/admin/partners/applications/${applicationId}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ to, reason: 'test_review' })
        .expect(200);
    }
  }

  it('T-LOC: store staff at location A cannot read location B dashboard', async () => {
    const admin = await signIn(app, `r3-admin-${Date.now()}@example.com`, 'admin');
    await attachAdmin(admin.personId);

    const staffA = await signIn(app, `r3-staff-a-${Date.now()}@example.com`);
    const staffB = await signIn(app, `r3-staff-b-${Date.now()}@example.com`);

    const org = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.VENDOR,
      legalName: 'R3 Store Org',
      displayName: 'R3 Store Org',
      actorId: admin.personId,
    });
    const locA = await orgs.createLocation({
      organizationId: org.id,
      kind: LocationKind.WAREHOUSE,
      name: 'Loc A',
      actorId: admin.personId,
    });
    const locB = await orgs.createLocation({
      organizationId: org.id,
      kind: LocationKind.WAREHOUSE,
      name: 'Loc B',
      actorId: admin.personId,
    });

    await attachOrgMember(staffA.personId, org.id, locA.id);
    await attachOrgMember(staffB.personId, org.id, locB.id);

    await request(app.getHttpServer())
      .get(`/api/v1/store/dashboard?organization_id=${org.id}&location_id=${locA.id}`)
      .set('Authorization', `Bearer ${staffA.token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/store/dashboard?organization_id=${org.id}&location_id=${locB.id}`)
      .set('Authorization', `Bearer ${staffA.token}`)
      .expect(403);
  });

  it('T-RID: rider cannot read another rider assigned job', async () => {
    const admin = await signIn(app, `r3-rid-admin-${Date.now()}@example.com`, 'admin');
    await attachAdmin(admin.personId);
    const riderA = await signIn(app, `r3-rider-a-${Date.now()}@example.com`);
    const riderB = await signIn(app, `r3-rider-b-${Date.now()}@example.com`);

    await prisma.partner.create({
      data: {
        id: uuidv7(),
        personId: riderA.personId,
        partnerTypeCode: 'DELIVERY_PARTNER',
        countryId: (await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'XX' } })).id,
        status: PartnerStatus.ACTIVE,
      },
    });
    await prisma.partner.create({
      data: {
        id: uuidv7(),
        personId: riderB.personId,
        partnerTypeCode: 'DELIVERY_PARTNER',
        countryId: (await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'XX' } })).id,
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

    await request(app.getHttpServer())
      .get(`/api/v1/delivery/jobs/${job.id}`)
      .set('Authorization', `Bearer ${riderA.token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/delivery/jobs/${job.id}`)
      .set('Authorization', `Bearer ${riderB.token}`)
      .expect((res) => {
        expect([403, 404]).toContain(res.status);
      });
  });

  it('T-JOIN: public join stays dark when join_public is false', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/join/public?country=XX').expect(200);
    expect(res.body.public).toBe(false);
    expect(res.body.partner_types).toEqual([]);
  });

  it('T-CO: customer token cannot list admin partner applications', async () => {
    const customer = await signIn(app, `r3-cus-${Date.now()}@example.com`);
    await request(app.getHttpServer())
      .get('/api/v1/admin/partners/applications')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(403);
  });

  it('T-JOIN: applicant cannot self-activate via admin activate', async () => {
    const applicant = await signIn(app, `r3-app-${Date.now()}@example.com`, 'partner_applicant');
    const admin = await signIn(app, `r3-act-admin-${Date.now()}@example.com`, 'admin');
    await attachAdmin(admin.personId);

    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/partners/applications')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        person_id: applicant.personId,
        partner_type_code: 'PHARMACY',
        country_code: 'XX',
      })
      .expect(200);

    const applicationId = created.body.application.id as string;
    await approveApplication(admin.token, applicationId);

    const org = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.VENDOR,
      legalName: 'R3 Pharmacy',
      displayName: 'R3 Pharmacy',
      actorId: admin.personId,
    });

    await request(app.getHttpServer())
      .post(`/api/v1/admin/partners/applications/${applicationId}/activate`)
      .set('Authorization', `Bearer ${applicant.token}`)
      .send({ organization_id: org.id })
      .expect(403);
  });

  it('T-PACK: join application respects public gate on create', async () => {
    const applicant = await signIn(app, `r3-pub-${Date.now()}@example.com`, 'partner_applicant');
    await request(app.getHttpServer())
      .post('/api/v1/join/applications')
      .set('Authorization', `Bearer ${applicant.token}`)
      .send({ partner_type_code: 'PHARMACY', country_code: 'XX' })
      .expect(403);
  });

  it('activation assigns org membership without company roles', async () => {
    const admin = await signIn(app, `r3-act2-${Date.now()}@example.com`, 'admin');
    await attachAdmin(admin.personId);
    await enablePharmacyOnResolvedPack();

    const person = await signIn(app, `r3-pharm-${Date.now()}@example.com`);

    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/partners/applications')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        person_id: person.personId,
        partner_type_code: 'PHARMACY',
        country_code: 'XX',
      })
      .expect(200);

    const applicationId = created.body.application.id as string;
    await approveApplication(admin.token, applicationId);

    const org = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.VENDOR,
      legalName: 'R3 Active Pharmacy',
      displayName: 'R3 Active Pharmacy',
      actorId: admin.personId,
    });
    const location = await orgs.createLocation({
      organizationId: org.id,
      kind: LocationKind.STORE,
      name: 'Front counter',
      actorId: admin.personId,
    });

    await request(app.getHttpServer())
      .post(`/api/v1/admin/partners/applications/${applicationId}/activate`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ organization_id: org.id, location_id: location.id, role_code: 'org_operations' })
      .expect(200);

    const companyRole = await prisma.membership.findFirst({
      where: {
        personId: person.personId,
        role: { code: { in: ['super_admin', 'company_admin', 'country_admin'] } },
        status: 'ACTIVE',
      },
    });
    expect(companyRole).toBeNull();

    const orgMembership = await prisma.membership.findFirst({
      where: { personId: person.personId, organizationId: org.id, status: 'ACTIVE' },
    });
    expect(orgMembership?.locationId).toBe(location.id);
  });

  it('T-ORG: store staff in org A cannot read org B dashboard', async () => {
    const admin = await signIn(app, `r3-org-admin-${Date.now()}@example.com`, 'admin');
    await attachAdmin(admin.personId);
    const staff = await signIn(app, `r3-org-staff-${Date.now()}@example.com`);

    const orgA = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.VENDOR,
      legalName: 'R3 Org A',
      displayName: 'R3 Org A',
      actorId: admin.personId,
    });
    const orgB = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.VENDOR,
      legalName: 'R3 Org B',
      displayName: 'R3 Org B',
      actorId: admin.personId,
    });
    const locA = await orgs.createLocation({
      organizationId: orgA.id,
      kind: LocationKind.WAREHOUSE,
      name: 'Org A Loc',
      actorId: admin.personId,
    });
    const locB = await orgs.createLocation({
      organizationId: orgB.id,
      kind: LocationKind.WAREHOUSE,
      name: 'Org B Loc',
      actorId: admin.personId,
    });
    await attachOrgMember(staff.personId, orgA.id, locA.id);

    await request(app.getHttpServer())
      .get(`/api/v1/store/dashboard?organization_id=${orgA.id}&location_id=${locA.id}`)
      .set('Authorization', `Bearer ${staff.token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/store/dashboard?organization_id=${orgB.id}&location_id=${locB.id}`)
      .set('Authorization', `Bearer ${staff.token}`)
      .expect(403);
  });

  it('T-INV: store GRN forbidden across organizations and locations', async () => {
    const admin = await signIn(app, `r3-inv-admin-${Date.now()}@example.com`, 'admin');
    await attachAdmin(admin.personId);
    const staffA = await signIn(app, `r3-inv-a-${Date.now()}@example.com`);
    const org = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.VENDOR,
      legalName: 'R3 Inv Org',
      displayName: 'R3 Inv Org',
      actorId: admin.personId,
    });
    const orgB = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.VENDOR,
      legalName: 'R3 Inv Org B',
      displayName: 'R3 Inv Org B',
      actorId: admin.personId,
    });
    const locA = await orgs.createLocation({
      organizationId: org.id,
      kind: LocationKind.WAREHOUSE,
      name: 'Inv A',
      actorId: admin.personId,
    });
    const locB = await orgs.createLocation({
      organizationId: org.id,
      kind: LocationKind.WAREHOUSE,
      name: 'Inv B',
      actorId: admin.personId,
    });
    const locOtherOrg = await orgs.createLocation({
      organizationId: orgB.id,
      kind: LocationKind.WAREHOUSE,
      name: 'Other org',
      actorId: admin.personId,
    });
    await attachOrgMember(staffA.personId, org.id, locA.id);

    await request(app.getHttpServer())
      .post(`/api/v1/store/grn?organization_id=${orgB.id}&location_id=${locOtherOrg.id}`)
      .set('Authorization', `Bearer ${staffA.token}`)
      .send({
        idempotency_key: uuidv7(),
        lines: [{ variant_id: uuidv7(), lot_code: 'X', qty: 1 }],
      })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/api/v1/store/grn?organization_id=${org.id}&location_id=${locB.id}`)
      .set('Authorization', `Bearer ${staffA.token}`)
      .send({
        idempotency_key: uuidv7(),
        lines: [{ variant_id: uuidv7(), lot_code: 'X', qty: 1 }],
      })
      .expect(403);
  });

  it('T-KYC: applicant cannot read another applicant documents', async () => {
    const admin = await signIn(app, `r3-kyc-admin-${Date.now()}@example.com`, 'admin');
    await attachAdmin(admin.personId);
    const appA = await signIn(app, `r3-kyc-a-${Date.now()}@example.com`, 'partner_applicant');
    const appB = await signIn(app, `r3-kyc-b-${Date.now()}@example.com`, 'partner_applicant');

    const createdA = await request(app.getHttpServer())
      .post('/api/v1/admin/partners/applications')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ person_id: appA.personId, partner_type_code: 'PHARMACY', country_code: 'XX' })
      .expect(200);
    const createdB = await request(app.getHttpServer())
      .post('/api/v1/admin/partners/applications')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ person_id: appB.personId, partner_type_code: 'PHARMACY', country_code: 'XX' })
      .expect(200);

    const applicationIdA = createdA.body.application.id as string;
    const partnerIdA = createdA.body.partner.id as string;
    const kycCase = await kyc.openCase({ partnerId: partnerIdA, applicationId: applicationIdA, actorId: appA.personId });
    await kyc.uploadDocument({
      kycCaseId: kycCase.id,
      actorId: appA.personId,
      documentTypeCode: 'GOVERNMENT_ID',
      bytes: Buffer.from('%PDF-1.4 test'),
      contentType: 'application/pdf',
      originalName: 'id.pdf',
    });

    await request(app.getHttpServer())
      .get(`/api/v1/join/applications/${applicationIdA}`)
      .set('Authorization', `Bearer ${appB.token}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/v1/join/applications/${applicationIdA}/documents`)
      .set('Authorization', `Bearer ${appB.token}`)
      .expect((res) => {
        expect([403, 404]).toContain(res.status);
      });

    expect(createdB.body.application.id).not.toBe(applicationIdA);
  });

  it('T-AUD: activation and adjust emit security events', async () => {
    const admin = await signIn(app, `r3-aud-admin-${Date.now()}@example.com`, 'admin');
    await attachAdmin(admin.personId);
    await enablePharmacyOnResolvedPack();
    const person = await signIn(app, `r3-aud-pharm-${Date.now()}@example.com`);

    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/partners/applications')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ person_id: person.personId, partner_type_code: 'PHARMACY', country_code: 'XX' })
      .expect(200);
    const applicationId = created.body.application.id as string;
    await approveApplication(admin.token, applicationId);

    const org = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.VENDOR,
      legalName: 'R3 Audit Pharmacy',
      displayName: 'R3 Audit Pharmacy',
      actorId: admin.personId,
    });

    const before = await prisma.securityEvent.count({
      where: { type: 'PARTNER_STATUS_CHANGED' },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/admin/partners/applications/${applicationId}/activate`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ organization_id: org.id, role_code: 'org_operations' })
      .expect(200);

    const after = await prisma.securityEvent.count({
      where: { type: 'PARTNER_STATUS_CHANGED' },
    });
    expect(after).toBeGreaterThan(before);
  });

  it('T-RID: rider cannot POD unassigned job; assigned job stays isolated', async () => {
    const rider = await signIn(app, `r3-rid-pod-rider-${Date.now()}@example.com`);
    const other = await signIn(app, `r3-rid-pod-other-${Date.now()}@example.com`);
    await prisma.partner.create({
      data: {
        id: uuidv7(),
        personId: rider.personId,
        partnerTypeCode: 'DELIVERY_PARTNER',
        countryId: (await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'XX' } })).id,
        status: PartnerStatus.ACTIVE,
      },
    });

    const unassigned = await prisma.logisticsJob.create({
      data: {
        id: uuidv7(),
        jobType: LogisticsJobType.MEDICINE_DELIVERY,
        status: LogisticsJobStatus.CREATED,
        assigneeId: null,
        payload: { sandbox: true },
      },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/delivery/jobs/${unassigned.id}/pod`)
      .set('Authorization', `Bearer ${rider.token}`)
      .send({ code: '123456' })
      .expect((res) => {
        expect([403, 404]).toContain(res.status);
      });

    const assigned = await prisma.logisticsJob.create({
      data: {
        id: uuidv7(),
        jobType: LogisticsJobType.MEDICINE_DELIVERY,
        status: LogisticsJobStatus.ASSIGNED,
        assigneeId: rider.personId,
        payload: { sandbox: true },
      },
    });

    await request(app.getHttpServer())
      .get(`/api/v1/delivery/jobs/${assigned.id}`)
      .set('Authorization', `Bearer ${rider.token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/delivery/jobs/${assigned.id}`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect((res) => {
        expect([403, 404]).toContain(res.status);
      });
  });

  it('T-SES: invalid token rejected on store and delivery routes', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/store/organizations')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/v1/delivery/jobs')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });
});
