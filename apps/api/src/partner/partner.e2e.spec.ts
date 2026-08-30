import { INestApplication } from '@nestjs/common';
import { KycCaseStatus, PartnerApplicationSource, PartnerStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { ProblemFilter } from '../common/problem.filter';
import { PrismaService } from '../app/prisma.service';
import { InvitationService } from './invitation.service';
import { KycService } from './kyc.service';
import { MAX_KYC_BYTES } from './object-store';
import { OrganizationService } from './organization.service';
import { PartnerService } from './partner.service';
import { applyTestIsolation } from '../test/isolate-runtime';

async function registerPerson(prisma: PrismaService): Promise<string> {
  const person = await prisma.person.create({
    data: {
      id: uuidv7(),
      status: 'ACTIVE',
      account: { create: { id: uuidv7(), status: 'ACTIVE' } },
    },
  });
  return person.id;
}

describe('partner dark model', () => {
  let app: INestApplication;
  let partners: PartnerService;
  let kyc: KycService;
  let orgs: OrganizationService;
  let invitations: InvitationService;
  let prisma: PrismaService;
  let personId: string;
  let actorId: string;

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
    partners = app.get(PartnerService);
    kyc = app.get(KycService);
    orgs = app.get(OrganizationService);
    invitations = app.get(InvitationService);
    prisma = app.get(PrismaService);
    personId = await registerPerson(prisma);
    actorId = await registerPerson(prisma);
    const role = await prisma.role.findUnique({ where: { code: 'super_admin' } });
    if (!role) {
      throw new Error('super_admin role is not seeded');
    }
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: actorId,
        roleId: role.id,
        scope: 'platform',
        status: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('does not expose public Join and rejects PUBLIC source', async () => {
    const join = await request(app.getHttpServer()).post('/api/v1/join/doctor').send({});
    expect(join.status).toBeGreaterThanOrEqual(400);
    await expect(
      partners.createApplication({
        personId,
        partnerTypeCode: 'DOCTOR',
        countryCode: 'XX',
        source: PartnerApplicationSource.PUBLIC,
        actorId,
      }),
    ).rejects.toThrow();
  });

  it('creates INTERNAL applications and blocks invalid transitions and disabled activation', async () => {
    const created = await partners.createApplication({
      personId,
      partnerTypeCode: 'DOCTOR',
      countryCode: 'XX',
      source: PartnerApplicationSource.INTERNAL,
      actorId,
    });
    expect(created.application.status).toBe(PartnerStatus.DRAFT);
    await expect(
      partners.transition({
        applicationId: created.application.id,
        to: PartnerStatus.ACTIVE,
        actorId,
        reason: 'skip',
      }),
    ).rejects.toThrow();

    await partners.transition({
      applicationId: created.application.id,
      to: PartnerStatus.REGISTERED,
      actorId,
      reason: 'registered',
    });
    await partners.transition({
      applicationId: created.application.id,
      to: PartnerStatus.PROFILE_INCOMPLETE,
      actorId,
      reason: 'profile',
    });
    await partners.transition({
      applicationId: created.application.id,
      to: PartnerStatus.DOCUMENTS_REQUIRED,
      actorId,
      reason: 'docs',
    });
    await partners.transition({
      applicationId: created.application.id,
      to: PartnerStatus.DOCUMENTS_SUBMITTED,
      actorId,
      reason: 'submitted',
    });
    await partners.transition({
      applicationId: created.application.id,
      to: PartnerStatus.UNDER_REVIEW,
      actorId,
      reason: 'review',
    });
    await partners.transition({
      applicationId: created.application.id,
      to: PartnerStatus.VERIFIED,
      actorId,
      reason: 'verified',
    });
    await partners.transition({
      applicationId: created.application.id,
      to: PartnerStatus.APPROVED,
      actorId,
      reason: 'approved',
    });
    await expect(
      partners.transition({
        applicationId: created.application.id,
        to: PartnerStatus.ACTIVE,
        actorId,
        reason: 'go live',
      }),
    ).rejects.toThrow();
    const history = await prisma.partnerStatusHistory.count({
      where: { applicationId: created.application.id },
    });
    expect(history).toBeGreaterThan(1);
  });

  it('rejects unknown partner types, unknown countries, and duplicates', async () => {
    await expect(
      partners.createApplication({
        personId,
        partnerTypeCode: 'UNICORN',
        countryCode: 'XX',
        source: PartnerApplicationSource.INTERNAL,
        actorId,
      }),
    ).rejects.toThrow();
    await expect(
      partners.createApplication({
        personId,
        partnerTypeCode: 'DOCTOR',
        countryCode: 'ZZ',
        source: PartnerApplicationSource.INTERNAL,
        actorId,
      }),
    ).rejects.toThrow();
    await expect(
      partners.createApplication({
        personId,
        partnerTypeCode: 'DOCTOR',
        countryCode: 'XX',
        source: PartnerApplicationSource.INTERNAL,
        actorId,
      }),
    ).rejects.toThrow();
  });

  it('denies unauthenticated admin and does not log invitation secrets', async () => {
    const unauth = await request(app.getHttpServer())
      .post('/api/v1/admin/partners/applications')
      .send({ person_id: personId, partner_type_code: 'DOCTOR', country_code: 'XX' });
    expect(unauth.status).toBe(401);

    const invite = await invitations.create({
      kind: 'ADMIN',
      countryCode: 'XX',
      invitedById: actorId,
      intendedRoleCode: 'org_staff',
    });
    expect(invite.token).toBeDefined();
    const events = await prisma.securityEvent.findMany({
      where: { type: 'PARTNER_INVITATION_CREATED' },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    expect(JSON.stringify(events)).not.toContain(invite.token);
  });

  it('covers KYC review, additional information, expire, and reject', async () => {
    const created = await partners.createApplication({
      personId: await registerPerson(prisma),
      partnerTypeCode: 'VENDOR',
      countryCode: 'XX',
      source: PartnerApplicationSource.INTERNAL,
      actorId,
    });
    const opened = await kyc.openCase({ partnerId: created.partner.id, actorId });
    await kyc.transition({
      kycCaseId: opened.id,
      to: KycCaseStatus.SUBMITTED,
      actorId: created.partner.personId,
    });
    await kyc.transition({
      kycCaseId: opened.id,
      to: KycCaseStatus.UNDER_REVIEW,
      actorId,
    });
    await kyc.transition({
      kycCaseId: opened.id,
      to: KycCaseStatus.ADDITIONAL_INFORMATION_REQUIRED,
      actorId,
      reason: 'need clearer scan',
    });
    await kyc.transition({
      kycCaseId: opened.id,
      to: KycCaseStatus.SUBMITTED,
      actorId: created.partner.personId,
    });
    await kyc.transition({
      kycCaseId: opened.id,
      to: KycCaseStatus.UNDER_REVIEW,
      actorId,
    });
    const verified = await kyc.transition({
      kycCaseId: opened.id,
      to: KycCaseStatus.VERIFIED,
      actorId,
    });
    expect(verified.status).toBe(KycCaseStatus.VERIFIED);

    const second = await partners.createApplication({
      personId: await registerPerson(prisma),
      partnerTypeCode: 'CLINIC',
      countryCode: 'XX',
      source: PartnerApplicationSource.INTERNAL,
      actorId,
    });
    const case2 = await kyc.openCase({ partnerId: second.partner.id, actorId });
    const uploaded = await kyc.uploadDocument({
      kycCaseId: case2.id,
      actorId,
      documentTypeCode: 'license',
      bytes: Buffer.from('%PDF-1.4 test'),
      contentType: 'application/pdf',
      originalName: 'license.pdf',
    });
    const rejected = await kyc.reviewDocument({
      documentId: uploaded.id,
      actorId,
      approve: false,
      reason: 'illegible',
    });
    expect(rejected.status).toBe('REJECTED');
    await kyc.transition({
      kycCaseId: case2.id,
      to: KycCaseStatus.EXPIRED,
      actorId,
    });
  });

  it('covers KYC upload rules, org membership, and invitation reuse', async () => {
    const created = await partners.createApplication({
      personId: await registerPerson(prisma),
      partnerTypeCode: 'LAB',
      countryCode: 'XX',
      source: PartnerApplicationSource.INTERNAL,
      actorId,
    });
    const opened = await kyc.openCase({ partnerId: created.partner.id, actorId });
    await expect(
      kyc.uploadDocument({
        kycCaseId: opened.id,
        actorId,
        documentTypeCode: 'license',
        bytes: Buffer.from('plain'),
        contentType: 'text/plain',
        originalName: 'secret.txt',
      }),
    ).rejects.toThrow();
    const uploaded = await kyc.uploadDocument({
      kycCaseId: opened.id,
      actorId,
      documentTypeCode: 'license',
      bytes: Buffer.from('%PDF-1.4 test'),
      contentType: 'application/pdf',
      originalName: 'license.pdf',
    });
    expect(uploaded.id).toBeDefined();
    const unauth = await request(app.getHttpServer()).get(
      `/api/v1/admin/partners/documents/${uploaded.id}`,
    );
    expect(unauth.status).toBeGreaterThanOrEqual(400);

    const org = await orgs.create({
      countryCode: 'XX',
      kind: 'LAB',
      legalName: 'Lab Co',
      displayName: 'Lab Co',
      actorId,
    });
    const member = await orgs.addMember({
      organizationId: org.id,
      personId,
      roleCode: 'org_staff',
      actorId,
    });
    await expect(
      orgs.addMember({
        organizationId: org.id,
        personId,
        roleCode: 'org_staff',
        actorId,
      }),
    ).rejects.toThrow();
    await orgs.removeMember({ membershipId: member.id, organizationId: org.id, actorId });

    const invite = await invitations.create({
      kind: 'ADMIN',
      countryCode: 'XX',
      invitedById: actorId,
      intendedRoleCode: 'org_staff',
      partnerTypeCode: 'LAB',
    });
    await invitations.accept({ token: invite.token, personId });
    await expect(invitations.accept({ token: invite.token, personId })).rejects.toThrow();
    await expect(
      invitations.create({
        kind: 'PUBLIC_LINK',
        countryCode: 'XX',
        invitedById: actorId,
        intendedRoleCode: 'org_staff',
      }),
    ).rejects.toThrow();

    const stranger = await registerPerson(prisma);
    await expect(
      kyc.readDocument({ documentId: uploaded.id, actorId: stranger, permission: 'view' }),
    ).rejects.toThrow();
    await expect(
      kyc.uploadDocument({
        kycCaseId: opened.id,
        actorId,
        documentTypeCode: 'license',
        bytes: Buffer.alloc(MAX_KYC_BYTES + 1),
        contentType: 'application/pdf',
        originalName: 'huge.pdf',
      }),
    ).rejects.toThrow();

    const location = await orgs.createLocation({
      organizationId: org.id,
      kind: 'LAB',
      name: 'Main lab',
      actorId,
      city: 'Testville',
    });
    expect(location.id).toBeDefined();

    const expired = await invitations.create({
      kind: 'ADMIN',
      countryCode: 'XX',
      invitedById: actorId,
      intendedRoleCode: 'org_staff',
      ttlHours: 0,
    });
    await expect(invitations.accept({ token: expired.token, personId })).rejects.toThrow();
    const revocable = await invitations.create({
      kind: 'ADMIN',
      countryCode: 'XX',
      invitedById: actorId,
      intendedRoleCode: 'org_staff',
    });
    await invitations.revoke({ invitationId: revocable.invitation.id, actorId });
    await expect(invitations.accept({ token: revocable.token, personId })).rejects.toThrow();
  });
});
