import { Injectable } from '@nestjs/common';
import { MembershipScope, MembershipStatus } from '@prisma/client';
import { normalizeIdentifier, randomToken, sha256Hex, uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import {
  COMPANY_ROLE_CODES,
  DUAL_CONTROL_COMPANY_ROLES,
  isCompanyRole,
} from './authority';
import { CompanyAuthorityService } from './company-authority.service';
import { MfaService } from './mfa.service';
import { RbacService } from './rbac.service';
import { SecurityEventsService } from './security-events.service';
import { SessionService } from './session.service';

const ROLE_RANK: Record<string, number> = {
  super_admin: 100,
  global_admin: 90,
  company_admin: 80,
  company_security: 75,
  company_finance: 70,
  company_compliance: 70,
  company_operations: 65,
  company_support: 60,
};

@Injectable()
export class AdminStaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly events: SecurityEventsService,
    private readonly authority: CompanyAuthorityService,
    private readonly sessions: SessionService,
    private readonly mfa: MfaService,
  ) {}

  async list(input: { search?: string; role?: string; status?: string }) {
    const memberships = await this.prisma.membership.findMany({
      where: {
        scope: MembershipScope.platform,
        deletedAt: null,
        role: { code: { in: [...COMPANY_ROLE_CODES] } },
        ...(input.role ? { role: { code: input.role } } : {}),
        ...(input.status ? { status: input.status as MembershipStatus } : {}),
      },
      include: {
        person: {
          include: {
            account: true,
            identifiers: true,
          },
        },
        role: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const search = input.search?.trim().toLowerCase();
    const filtered = search
      ? memberships.filter((row) => {
          const email = row.person.identifiers.find((id) => id.type === 'EMAIL')?.valueNormalized ?? '';
          return email.includes(search) || row.person.id.includes(search) || row.role.code.includes(search);
        })
      : memberships;

    const byPerson = new Map<string, typeof filtered>();
    for (const row of filtered) {
      const bucket = byPerson.get(row.personId) ?? [];
      bucket.push(row);
      byPerson.set(row.personId, bucket);
    }

    const data = [...byPerson.entries()].map(([personId, rows]) => {
      const person = rows[0]!.person;
      const email = person.identifiers.find((id) => id.type === 'EMAIL')?.valueNormalized ?? null;
      return {
        person_id: personId,
        email,
        person_status: person.status,
        account_status: person.account?.status ?? null,
        roles: rows.map((row) => row.role.code),
        membership_statuses: rows.map((row) => ({ role: row.role.code, status: row.status })),
        mfa_required: person.account?.mfaRequired ?? false,
        mfa_enrolled: false,
        last_login_at: person.account?.lastLoginAt?.toISOString() ?? null,
        account_id: person.account?.id ?? null,
      };
    });

    const accountIds = data.map((row) => row.account_id).filter((id): id is string => Boolean(id));
    const enrolled = accountIds.length
      ? await this.prisma.totpSecret.findMany({
          where: { accountId: { in: accountIds }, confirmedAt: { not: null }, revokedAt: null },
          select: { accountId: true },
        })
      : [];
    const enrolledAccounts = new Set(enrolled.map((row) => row.accountId));

    return {
      data: data.map(({ account_id, ...row }) => ({
        ...row,
        mfa_enrolled: account_id ? enrolledAccounts.has(account_id) : false,
      })),
    };
  }

  async get(personId: string) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      include: {
        account: true,
        identifiers: true,
        memberships: {
          where: { scope: MembershipScope.platform, deletedAt: null, role: { code: { in: [...COMPANY_ROLE_CODES] } } },
          include: { role: true },
        },
      },
    });
    if (!person) {
      throw Errors.notFound('Administrator not found.');
    }
    const rbac = await this.rbac.permissionsForPerson(personId);
    const mfaEnrolled = person.account ? await this.mfa.hasActiveTotp(person.account.id, personId) : false;
    return {
      person_id: person.id,
      email: person.identifiers.find((id) => id.type === 'EMAIL')?.valueNormalized ?? null,
      person_status: person.status,
      account_status: person.account?.status ?? null,
      roles: person.memberships.map((row) => row.role.code),
      permissions: rbac.permissions,
      mfa_required: person.account?.mfaRequired ?? false,
      mfa_enrolled: mfaEnrolled,
      last_login_at: person.account?.lastLoginAt?.toISOString() ?? null,
    };
  }

  async invite(input: {
    actorId: string;
    email: string;
    roleCode: string;
    requestId?: string;
  }) {
    if (!isCompanyRole(input.roleCode)) {
      throw Errors.validation('role_code must be a company role');
    }
    await this.assertCanManageActor(input.actorId, input.actorId, input.roleCode, 'invite');
    const parsed = normalizeIdentifier(input.email, undefined, undefined);
    if (!parsed || parsed.type !== 'EMAIL') {
      throw Errors.validation('A valid email is required');
    }
    const country = await this.prisma.country.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!country) {
      throw Errors.validation('No country seeded for admin invitations');
    }
    const rawToken = randomToken(32);
    const invitation = await this.prisma.partnerInvitation.create({
      data: {
        id: uuidv7(),
        tokenHash: sha256Hex(rawToken),
        kind: 'ADMIN',
        status: 'PENDING',
        countryId: country.id,
        intendedRoleCode: input.roleCode,
        invitedEmail: parsed.value,
        invitedById: input.actorId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    await this.events.emit({
      type: 'ADMIN_INVITATION_CREATED',
      outcome: 'success',
      personId: input.actorId,
      requestId: input.requestId,
      metadata: {
        invitation_id: invitation.id,
        role: input.roleCode,
        email: parsed.value.replace(/(.{2}).+(@.+)/, '$1***$2'),
      },
    });
    const nodeEnv = process.env['NODE_ENV'];
    return {
      invitation_id: invitation.id,
      expires_at: invitation.expiresAt.toISOString(),
      ...(nodeEnv !== 'production' ? { dev_invite_token: rawToken } : {}),
    };
  }

  async acceptInvitation(input: {
    token: string;
    identifier: string;
    requestId?: string;
  }) {
    const hash = sha256Hex(input.token.trim());
    const invitation = await this.prisma.partnerInvitation.findUnique({ where: { tokenHash: hash } });
    if (!invitation || invitation.kind !== 'ADMIN' || invitation.status !== 'PENDING') {
      throw Errors.validation('Invitation is invalid or already used');
    }
    if (invitation.expiresAt <= new Date()) {
      await this.prisma.partnerInvitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      throw Errors.validation('Invitation has expired');
    }
    const parsed = normalizeIdentifier(input.identifier, undefined, undefined);
    if (!parsed || parsed.type !== 'EMAIL') {
      throw Errors.validation('Email is required');
    }
    if (invitation.invitedEmail && invitation.invitedEmail !== parsed.value) {
      throw Errors.forbidden('This invitation was issued for a different email address');
    }
    let person = await this.prisma.person.findFirst({
      where: { identifiers: { some: { type: 'EMAIL', valueNormalized: parsed.value } } },
      include: { account: true },
    });
    if (!person) {
      const personId = uuidv7();
      await this.prisma.$transaction(async (tx) => {
        await tx.person.create({
          data: { id: personId, status: 'ACTIVE', preferredLocale: 'en' },
        });
        await tx.account.create({ data: { id: uuidv7(), personId, status: 'ACTIVE' } });
        await tx.accountIdentifier.create({
          data: { id: uuidv7(), personId, type: 'EMAIL', valueNormalized: parsed.value, verifiedAt: new Date() },
        });
      });
      person = await this.prisma.person.findUniqueOrThrow({
        where: { id: personId },
        include: { account: true },
      });
    }
    const role = await this.prisma.role.findUnique({ where: { code: invitation.intendedRoleCode } });
    if (!role) {
      throw Errors.validation('Invitation role is not seeded');
    }
    const dual = (DUAL_CONTROL_COMPANY_ROLES as readonly string[]).includes(invitation.intendedRoleCode);
    if (dual) {
      const request = await this.prisma.privilegeGrantRequest.create({
        data: {
          id: uuidv7(),
          kind: 'COMPANY_MEMBERSHIP',
          targetPersonId: person.id,
          roleCode: invitation.intendedRoleCode,
          scope: MembershipScope.platform,
          requestedById: invitation.invitedById,
          reason: `Admin invitation ${invitation.id}`,
        },
      });
      await this.prisma.partnerInvitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });
      await this.events.emit({
        type: 'ADMIN_INVITATION_ACCEPTED',
        outcome: 'success',
        personId: person.id,
        requestId: input.requestId,
        metadata: {
          invitation_id: invitation.id,
          role: invitation.intendedRoleCode,
          grant_request_id: request.id,
          dual_control: true,
        },
      });
      await this.events.emit({
        type: 'PRIVILEGE_GRANT_REQUESTED',
        outcome: 'success',
        personId: invitation.invitedById,
        requestId: input.requestId,
        metadata: {
          request_id: request.id,
          role: invitation.intendedRoleCode,
          target_person_id: person.id,
          source: 'admin_invitation',
        },
      });
      return {
        person_id: person.id,
        role: invitation.intendedRoleCode,
        status: 'PENDING',
        request_id: request.id,
      };
    }
    const existingMembership = await this.prisma.membership.findFirst({
      where: {
        personId: person.id,
        roleId: role.id,
        scope: MembershipScope.platform,
        organizationId: null,
      },
    });
    if (existingMembership) {
      await this.prisma.membership.update({
        where: { id: existingMembership.id },
        data: { status: 'ACTIVE', deletedAt: null, endsAt: null },
      });
    } else {
      await this.prisma.membership.create({
        data: {
          id: uuidv7(),
          personId: person.id,
          roleId: role.id,
          scope: MembershipScope.platform,
          status: 'ACTIVE',
        },
      });
    }
    await this.prisma.partnerInvitation.update({
      where: { id: invitation.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });
    await this.events.emit({
      type: 'ADMIN_INVITATION_ACCEPTED',
      outcome: 'success',
      personId: person.id,
      requestId: input.requestId,
      metadata: { invitation_id: invitation.id, role: invitation.intendedRoleCode },
    });
    return { person_id: person.id, role: invitation.intendedRoleCode };
  }

  async setAccountStatus(input: {
    actorId: string;
    targetPersonId: string;
    status: 'ACTIVE' | 'DISABLED';
    requestId?: string;
  }) {
    if (input.actorId === input.targetPersonId) {
      throw Errors.forbidden('You cannot change your own account status');
    }
    await this.assertCanManageActor(input.actorId, input.targetPersonId, 'company_support', 'status');
    const person = await this.prisma.person.findUnique({
      where: { id: input.targetPersonId },
      include: { account: true },
    });
    if (!person?.account) {
      throw Errors.notFound('Administrator not found.');
    }
    if (input.status === 'DISABLED') {
      await this.prisma.person.update({ where: { id: person.id }, data: { status: 'DISABLED' } });
      await this.prisma.account.update({ where: { id: person.account.id }, data: { status: 'DISABLED' } });
      await this.sessions.revokeAll(person.id, input.requestId);
      await this.events.emit({
        type: 'ACCOUNT_DEACTIVATED',
        outcome: 'success',
        personId: input.actorId,
        requestId: input.requestId,
        metadata: { target_person_id: input.targetPersonId },
      });
    } else {
      await this.prisma.person.update({ where: { id: person.id }, data: { status: 'ACTIVE' } });
      await this.prisma.account.update({ where: { id: person.account.id }, data: { status: 'ACTIVE' } });
      await this.events.emit({
        type: 'ACCOUNT_ACTIVATED',
        outcome: 'success',
        personId: input.actorId,
        requestId: input.requestId,
        metadata: { target_person_id: input.targetPersonId },
      });
    }
    return { status: input.status };
  }

  async setMfaRequired(input: {
    actorId: string;
    targetPersonId: string;
    required: boolean;
    requestId?: string;
  }) {
    if (input.actorId === input.targetPersonId && !input.required) {
      throw Errors.forbidden('You cannot disable required MFA for your own account');
    }
    await this.assertCanManageActor(input.actorId, input.targetPersonId, 'company_security', 'mfa_policy');
    const person = await this.prisma.person.findUnique({
      where: { id: input.targetPersonId },
      include: { account: true },
    });
    if (!person?.account) {
      throw Errors.notFound('Administrator not found.');
    }
    await this.prisma.account.update({
      where: { id: person.account.id },
      data: { mfaRequired: input.required },
    });
    await this.events.emit({
      type: input.required ? 'MFA_ENABLED' : 'MFA_DISABLED',
      outcome: 'success',
      personId: input.actorId,
      requestId: input.requestId,
      metadata: { target_person_id: input.targetPersonId, policy: true },
    });
    return { mfa_required: input.required };
  }

  async assignRole(input: {
    actorId: string;
    targetPersonId: string;
    roleCode: string;
    reason: string;
    requestId?: string;
  }) {
    if (input.actorId === input.targetPersonId) {
      await this.events.emit({
        type: 'PRIVILEGE_ESCALATION_DENIED',
        outcome: 'failure',
        personId: input.actorId,
        requestId: input.requestId,
        metadata: { reason: 'self_role_grant' },
      });
      throw Errors.forbidden('You cannot grant roles to yourself');
    }
    await this.assertCanManageActor(input.actorId, input.targetPersonId, input.roleCode, 'grant');
    return this.authority.requestCompanyMembership({
      actorId: input.actorId,
      targetPersonId: input.targetPersonId,
      roleCode: input.roleCode,
      reason: input.reason,
      requestId: input.requestId,
    });
  }

  async removeRole(input: {
    actorId: string;
    targetPersonId: string;
    roleCode: string;
    requestId?: string;
  }) {
    if (input.actorId === input.targetPersonId) {
      throw Errors.forbidden('You cannot remove your own company roles');
    }
    await this.assertCanManageActor(input.actorId, input.targetPersonId, input.roleCode, 'revoke');
    const role = await this.prisma.role.findUnique({ where: { code: input.roleCode } });
    if (!role) {
      throw Errors.validation('Role is not seeded');
    }
    await this.prisma.membership.updateMany({
      where: {
        personId: input.targetPersonId,
        roleId: role.id,
        scope: MembershipScope.platform,
        deletedAt: null,
      },
      data: { status: 'SUSPENDED', endsAt: new Date(), deletedAt: new Date() },
    });
    await this.events.emit({
      type: 'COMPANY_MEMBERSHIP_GRANTED',
      outcome: 'success',
      personId: input.actorId,
      requestId: input.requestId,
      metadata: { target_person_id: input.targetPersonId, role: input.roleCode, action: 'revoked' },
    });
    return { removed: true };
  }

  async revokeAllSessions(input: { actorId: string; targetPersonId: string; requestId?: string }) {
    if (input.actorId === input.targetPersonId) {
      throw Errors.forbidden('Use logout-all for your own sessions');
    }
    await this.assertCanManageActor(input.actorId, input.targetPersonId, 'company_security', 'revoke_sessions');
    await this.sessions.revokeAll(input.targetPersonId, input.requestId);
    await this.events.emit({
      type: 'SESSION_REVOKED',
      outcome: 'success',
      personId: input.actorId,
      requestId: input.requestId,
      metadata: { target_person_id: input.targetPersonId, all: true },
    });
    return { ok: true };
  }

  private async assertCanManageActor(
    actorId: string,
    targetPersonId: string,
    roleCode: string,
    action: string,
  ): Promise<void> {
    const allowed = await this.rbac.hasPermission(actorId, 'rbac:grant_company');
    if (!allowed) {
      await this.events.emit({
        type: 'PRIVILEGE_ESCALATION_DENIED',
        outcome: 'failure',
        personId: actorId,
        metadata: { reason: 'missing_rbac_grant_company', action },
      });
      throw Errors.forbidden('Company membership grants require company-controlled authority');
    }
    const actorRank = await this.highestRoleRank(actorId);
    const targetRoleRank = ROLE_RANK[roleCode] ?? 0;
    if (targetRoleRank >= actorRank && roleCode !== 'company_support') {
      await this.events.emit({
        type: 'PRIVILEGE_ESCALATION_DENIED',
        outcome: 'failure',
        personId: actorId,
        metadata: { reason: 'insufficient_role_rank', action, role: roleCode },
      });
      throw Errors.forbidden('You cannot assign or manage a role equal to or above your authority');
    }
    if (
      (DUAL_CONTROL_COMPANY_ROLES as readonly string[]).includes(roleCode) &&
      actorRank < ROLE_RANK.super_admin!
    ) {
      await this.events.emit({
        type: 'PRIVILEGE_ESCALATION_DENIED',
        outcome: 'failure',
        personId: actorId,
        metadata: { reason: 'dual_control_role', action, role: roleCode },
      });
      throw Errors.forbidden('Only super administrators can directly manage global admin roles');
    }
    if (actorId === targetPersonId && action !== 'invite') {
      throw Errors.forbidden('You cannot modify your own authorization');
    }
  }

  private async highestRoleRank(personId: string): Promise<number> {
    const rbac = await this.rbac.permissionsForPerson(personId);
    return rbac.roles.reduce((max, role) => Math.max(max, ROLE_RANK[role] ?? 0), 0);
  }
}
