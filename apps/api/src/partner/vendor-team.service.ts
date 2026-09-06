import { Injectable } from '@nestjs/common';
import { InvitationKind, MembershipStatus, OrganizationKind } from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import { assertVendorOrganization } from '../catalog/access';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { permissionsForOrgRole } from '../identity/authority';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { InvitationService } from './invitation.service';
import { OrganizationService } from './organization.service';

/** Roles vendor admins may assign — never company or org_owner/org_admin via self-serve invite. */
export const VENDOR_INVITABLE_ROLE_CODES = [
  'org_staff',
  'org_finance',
  'org_operations',
  'org_manager',
] as const;

const VENDOR_TEAM_ADMIN_ROLE_CODES = ['org_owner', 'org_admin'] as const;

@Injectable()
export class VendorTeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgs: OrganizationService,
    private readonly invitations: InvitationService,
  ) {}

  async listMembers(principal: Principal, organizationId: string) {
    await this.assertOrgMember(principal, organizationId);
    const rows = await this.prisma.membership.findMany({
      where: { organizationId, deletedAt: null, status: MembershipStatus.ACTIVE },
      include: { role: true },
      orderBy: { createdAt: 'asc' },
    });
    const selfEmail =
      rows.some((row) => row.personId === principal.personId) ?
        (
          await this.prisma.accountIdentifier.findFirst({
            where: { personId: principal.personId, type: 'EMAIL' },
            select: { valueNormalized: true },
          })
        )?.valueNormalized
      : null;
    const maskEmail = (email: string) => email.replace(/(.{2}).+(@.+)/, '$1***$2');
    return {
      data: rows.map((row) => ({
        id: row.id,
        person_id: row.personId,
        display_name:
          row.personId === principal.personId && selfEmail ?
            maskEmail(selfEmail)
          : `Member ${row.personId.slice(0, 8)}`,
        role_code: row.role.code,
        role_name: row.role.name,
        permissions: permissionsForOrgRole(row.role.code),
        status: row.status,
        created_at: row.createdAt.toISOString(),
        is_self: row.personId === principal.personId,
      })),
    };
  }

  async createInvitation(
    principal: Principal,
    organizationId: string,
    input: { email?: string; role_code: string; country_code: string },
  ) {
    await this.assertOrgTeamAdmin(principal, organizationId);
    if (!VENDOR_INVITABLE_ROLE_CODES.includes(input.role_code as (typeof VENDOR_INVITABLE_ROLE_CODES)[number])) {
      throw Errors.problem(
        403,
        'ROLE_NOT_ASSIGNABLE',
        'Role not assignable',
        'Vendor team invites may only assign operations, staff, finance, or manager roles.',
      );
    }
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    if (org.kind !== OrganizationKind.VENDOR) {
      throw Errors.forbidden('Organization is not a vendor seller.');
    }
    const country = await this.prisma.country.findUnique({ where: { id: org.countryId } });
    if (!country) {
      throw Errors.validation('Organization country is missing.');
    }
    const created = await this.prisma.runWithTenant(
      workerTenantContext({
        organizationId,
        countryId: org.countryId,
        personId: principal.personId,
      }),
      () =>
        this.invitations.create({
          kind: InvitationKind.ORGANIZATION,
          countryCode: input.country_code || country.isoAlpha2,
          invitedById: principal.personId,
          intendedRoleCode: input.role_code,
          organizationId,
          invitedEmail: input.email?.trim() || undefined,
        }),
    );
    return {
      invitation_id: created.invitation.id,
      status: created.invitation.status,
      intended_role_code: created.invitation.intendedRoleCode,
      expires_at: created.invitation.expiresAt.toISOString(),
      invite_token: created.token,
      sandbox: true,
      message: 'Sandbox invitation token returned for testing. External email delivery remains OFF.',
    };
  }

  async acceptInvitation(principal: Principal, token: string) {
    const updated = await this.invitations.accept({
      token: token.trim(),
      personId: principal.personId,
    });
    return {
      invitation_id: updated.id,
      status: updated.status,
      organization_id: updated.organizationId,
    };
  }

  async removeMember(principal: Principal, organizationId: string, membershipId: string) {
    await this.assertOrgTeamAdmin(principal, organizationId);
    const target = await this.prisma.membership.findUnique({
      where: { id: membershipId },
      include: { role: true },
    });
    if (!target || target.organizationId !== organizationId) {
      throw Errors.forbidden('You cannot manage this membership.');
    }
    if (VENDOR_TEAM_ADMIN_ROLE_CODES.includes(target.role.code as (typeof VENDOR_TEAM_ADMIN_ROLE_CODES)[number])) {
      const adminCount = await this.prisma.membership.count({
        where: {
          organizationId,
          status: MembershipStatus.ACTIVE,
          deletedAt: null,
          role: { code: { in: [...VENDOR_TEAM_ADMIN_ROLE_CODES] } },
        },
      });
      if (adminCount <= 1) {
        throw Errors.problem(
          409,
          'LAST_ADMIN_PROTECTED',
          'Cannot remove last admin',
          'At least one organization admin must remain.',
        );
      }
    }
    if (target.personId === principal.personId) {
      throw Errors.problem(
        409,
        'SELF_REMOVAL_FORBIDDEN',
        'Cannot remove yourself',
        'Ask another organization admin to remove your membership.',
      );
    }
    await this.orgs.removeMember({
      membershipId,
      organizationId,
      actorId: principal.personId,
    });
    return { removed: true, membership_id: membershipId };
  }

  private async assertOrgMember(principal: Principal, organizationId: string) {
    await assertVendorOrganization(this.prisma, organizationId);
    const allowed = await this.prisma.membership.count({
      where: {
        personId: principal.personId,
        organizationId,
        status: MembershipStatus.ACTIVE,
        deletedAt: null,
      },
    });
    if (!allowed) {
      throw Errors.forbidden('You cannot access another organization’s team.');
    }
  }

  private async assertOrgTeamAdmin(principal: Principal, organizationId: string) {
    await assertVendorOrganization(this.prisma, organizationId);
    const allowed = await this.prisma.membership.count({
      where: {
        personId: principal.personId,
        organizationId,
        status: MembershipStatus.ACTIVE,
        deletedAt: null,
        role: { code: { in: [...VENDOR_TEAM_ADMIN_ROLE_CODES] } },
      },
    });
    if (!allowed) {
      throw Errors.forbidden('Only organization admins can manage team members.');
    }
  }
}
