import { INestApplication } from '@nestjs/common';
import { InvitationKind, OrganizationKind } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { InvitationService } from '../partner/invitation.service';
import { OrganizationService } from '../partner/organization.service';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { PolicyAdminService } from '../policy/admin.service';
import { applyTestIsolation } from '../test/isolate-runtime';
import { SENSITIVE_CLINICAL_PERMISSIONS } from './authority';
import { RbacService } from './rbac.service';

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

describe('company-owned admin authority (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let rbac: RbacService;
  let orgs: OrganizationService;
  let invitations: InvitationService;
  let policyAdmin: PolicyAdminService;

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
    rbac = app.get(RbacService);
    orgs = app.get(OrganizationService);
    invitations = app.get(InvitationService);
    policyAdmin = app.get(PolicyAdminService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function attachRole(
    personId: string,
    roleCode: string,
    extra: { scope: 'platform' | 'organization'; organizationId?: string },
  ) {
    const role = await prisma.role.findUnique({ where: { code: roleCode } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId,
        roleId: role!.id,
        scope: extra.scope,
        organizationId: extra.organizationId,
        status: 'ACTIVE',
      },
    });
  }

  it('blocks partner escalation and keeps company grants dual-controlled', async () => {
    const companyA = await signIn(app, `co-a-${Date.now()}@example.com`, 'admin');
    const companyB = await signIn(app, `co-b-${Date.now()}@example.com`, 'admin');
    await attachRole(companyA.personId, 'super_admin', { scope: 'platform' });
    await attachRole(companyB.personId, 'super_admin', { scope: 'platform' });

    const vendor = await signIn(app, `vendor-${Date.now()}@example.com`);
    const doctor = await signIn(app, `doc-${Date.now()}@example.com`);
    const lab = await signIn(app, `lab-${Date.now()}@example.com`);
    const affiliate = await signIn(app, `aff-${Date.now()}@example.com`);

    const orgA = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.VENDOR,
      legalName: 'Vendor A Ltd',
      displayName: 'Vendor A',
      actorId: companyA.personId,
    });
    const orgB = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.VENDOR,
      legalName: 'Vendor B Ltd',
      displayName: 'Vendor B',
      actorId: companyA.personId,
    });
    const clinic = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.CLINIC,
      legalName: 'Clinic A',
      displayName: 'Clinic A',
      actorId: companyA.personId,
    });
    const labOrg = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.LAB,
      legalName: 'Lab A',
      displayName: 'Lab A',
      actorId: companyA.personId,
    });
    const affOrg = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.AFFILIATE_ORG,
      legalName: 'Affiliate A',
      displayName: 'Affiliate A',
      actorId: companyA.personId,
    });
    await attachRole(vendor.personId, 'org_admin', { scope: 'organization', organizationId: orgA.id });
    await attachRole(doctor.personId, 'clinic_doctor', { scope: 'organization', organizationId: clinic.id });
    await attachRole(lab.personId, 'org_admin', { scope: 'organization', organizationId: labOrg.id });
    await attachRole(affiliate.personId, 'org_owner', { scope: 'organization', organizationId: affOrg.id });

    for (const actor of [vendor, doctor, lab, affiliate]) {
      const grant = await request(app.getHttpServer())
        .post('/api/v1/admin/company-authority/memberships')
        .set('Authorization', `Bearer ${actor.token}`)
        .send({ target_person_id: actor.personId, role_code: 'super_admin', reason: 'self-promote' });
      expect(grant.status).toBeGreaterThanOrEqual(400);
      await expect(
        invitations.create({
          kind: InvitationKind.STAFF,
          countryCode: 'XX',
          invitedById: actor.personId,
          intendedRoleCode: 'super_admin',
          organizationId: orgA.id,
        }),
      ).rejects.toThrow();
      const policy = await request(app.getHttpServer())
        .post('/api/v1/admin/policy-packs')
        .set('Authorization', `Bearer ${actor.token}`)
        .send({ country_code: 'XX', document: emptyPolicyDocument() });
      expect(policy.status).toBeGreaterThanOrEqual(400);
      const payments = await request(app.getHttpServer())
        .get('/api/v1/admin/payments')
        .set('Authorization', `Bearer ${actor.token}`);
      expect(payments.status).toBeGreaterThanOrEqual(400);
      const finance = await request(app.getHttpServer())
        .post('/api/v1/admin/finance/settlements')
        .set('Authorization', `Bearer ${actor.token}`)
        .send({ country_id: uuidv7(), currency: 'XXX' });
      expect(finance.status).toBeGreaterThanOrEqual(400);
    }

    await expect(
      orgs.addMember({
        organizationId: orgB.id,
        personId: vendor.personId,
        roleCode: 'org_staff',
        actorId: vendor.personId,
      }),
    ).rejects.toThrow();
    await expect(
      orgs.addMember({
        organizationId: orgA.id,
        personId: vendor.personId,
        roleCode: 'super_admin',
        actorId: vendor.personId,
      }),
    ).rejects.toThrow();

    const vendorPerms = await rbac.permissionsForPerson(vendor.personId);
    expect(vendorPerms.permissions).not.toContain('policy:publish');
    expect(vendorPerms.permissions).not.toContain('payment:admin');
    expect(vendorPerms.permissions).not.toContain('finance:approve');
    expect(vendorPerms.permissions).not.toContain('finance:settle');
    expect(vendorPerms.permissions).not.toContain('rbac:grant_company');

    const companyAdmin = await signIn(app, `co-admin-${Date.now()}@example.com`);
    await attachRole(companyAdmin.personId, 'company_admin', { scope: 'platform' });
    const companyAdminPerms = await rbac.permissionsForPerson(companyAdmin.personId);
    for (const permission of SENSITIVE_CLINICAL_PERMISSIONS) {
      expect(companyAdminPerms.permissions).not.toContain(permission);
    }
    expect(companyAdminPerms.permissions).toContain('policy:publish');
    expect(companyAdminPerms.permissions).not.toContain('finance:admin');

    const pending = await request(app.getHttpServer())
      .post('/api/v1/admin/company-authority/memberships')
      .set('Authorization', `Bearer ${companyA.token}`)
      .send({ target_person_id: vendor.personId, role_code: 'super_admin', reason: 'elevated ops' });
    expect(pending.status).toBe(200);
    expect(pending.body.status).toBe('PENDING');
    const selfApprove = await request(app.getHttpServer())
      .post(`/api/v1/admin/company-authority/grants/${pending.body.request_id}/review`)
      .set('Authorization', `Bearer ${companyA.token}`)
      .send({ approve: true });
    expect(selfApprove.status).toBeGreaterThanOrEqual(400);
    const approved = await request(app.getHttpServer())
      .post(`/api/v1/admin/company-authority/grants/${pending.body.request_id}/review`)
      .set('Authorization', `Bearer ${companyB.token}`)
      .send({ approve: true });
    expect(approved.status).toBe(200);

    const glass = await request(app.getHttpServer())
      .post('/api/v1/admin/company-authority/break-glass')
      .set('Authorization', `Bearer ${companyA.token}`)
      .send({
        target_person_id: companyAdmin.personId,
        reason: 'incident-42',
        permissions: ['finance:read'],
        ttl_minutes: 15,
      });
    expect(glass.status).toBe(200);
    expect(glass.body.permanent).toBe(false);

    const pack = await policyAdmin.createDraft('XX', emptyPolicyDocument(), companyA.personId);
    await expect(policyAdmin.publish(pack.id, companyA.personId, { dualControl: true })).rejects.toThrow();
    await expect(policyAdmin.publish(pack.id, companyB.personId, { dualControl: true })).resolves.toBeTruthy();

    const audit = await prisma.securityEvent.findMany({
      where: {
        type: {
          in: [
            'PRIVILEGE_ESCALATION_DENIED',
            'COMPANY_MEMBERSHIP_GRANTED',
            'DUAL_CONTROL_REJECTED',
            'BREAK_GLASS_OPENED',
          ],
        },
      },
    });
    expect(audit.length).toBeGreaterThan(0);
    const updateApi = await request(app.getHttpServer())
      .patch(`/api/v1/admin/security-events/${audit[0]!.id}`)
      .set('Authorization', `Bearer ${companyA.token}`)
      .send({ type: 'tamper' });
    expect(updateApi.status).toBeGreaterThanOrEqual(400);
  });
});
