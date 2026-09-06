import { Injectable } from '@nestjs/common';
import { MembershipScope, PrivilegeGrantStatus } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { BREAK_GLASS_ELIGIBLE_PERMISSIONS, DUAL_CONTROL_COMPANY_ROLES, isBreakGlassEligiblePermission, isCompanyRole, isValidPermissionCode } from './authority';
import { RbacService } from './rbac.service';
import { SecurityEventsService } from './security-events.service';

@Injectable()
export class CompanyAuthorityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly events: SecurityEventsService,
  ) {}

  async requestCompanyMembership(input: {
    actorId: string;
    targetPersonId: string;
    roleCode: string;
    reason: string;
    requestId?: string;
  }) {
    if (!isCompanyRole(input.roleCode)) {
      throw Errors.validation('Only company roles can be granted through this process');
    }
    if (input.targetPersonId === input.actorId) {
      await this.events.emit({
        type: 'PRIVILEGE_ESCALATION_DENIED',
        outcome: 'failure',
        personId: input.actorId,
        requestId: input.requestId,
        metadata: { reason: 'self_grant' },
      });
      throw Errors.forbidden('You cannot grant company roles to yourself');
    }
    await this.assertCanGrant(input.actorId);
    const role = await this.prisma.role.findUnique({ where: { code: input.roleCode } });
    if (!role) {
      throw Errors.validation('Role is not seeded');
    }
    const dual = (DUAL_CONTROL_COMPANY_ROLES as readonly string[]).includes(input.roleCode);
    if (dual) {
      const request = await this.prisma.privilegeGrantRequest.create({
        data: {
          id: uuidv7(),
          kind: 'COMPANY_MEMBERSHIP',
          targetPersonId: input.targetPersonId,
          roleCode: input.roleCode,
          scope: MembershipScope.platform,
          requestedById: input.actorId,
          reason: input.reason.trim() || 'company membership',
        },
      });
      await this.events.emit({
        type: 'PRIVILEGE_GRANT_REQUESTED',
        outcome: 'success',
        personId: input.actorId,
        requestId: input.requestId,
        metadata: {
          request_id: request.id,
          role: input.roleCode,
          target_person_id: input.targetPersonId,
        },
      });
      return { status: 'PENDING', request_id: request.id };
    }
    const membership = await this.createCompanyMembership(input.targetPersonId, role.id);
    await this.events.emit({
      type: 'COMPANY_MEMBERSHIP_GRANTED',
      outcome: 'success',
      personId: input.actorId,
      requestId: input.requestId,
      metadata: {
        membership_id: membership.id,
        role: input.roleCode,
        target_person_id: input.targetPersonId,
      },
    });
    return { status: 'GRANTED', membership_id: membership.id };
  }

  async reviewGrant(input: { actorId: string; requestId: string; approve: boolean; correlationId?: string }) {
    await this.assertCanGrant(input.actorId);
    const request = await this.prisma.privilegeGrantRequest.findUnique({ where: { id: input.requestId } });
    if (!request || request.status !== PrivilegeGrantStatus.PENDING) {
      throw Errors.validation('Grant request is not pending');
    }
    if (request.requestedById === input.actorId) {
      await this.events.emit({
        type: 'DUAL_CONTROL_REJECTED',
        outcome: 'failure',
        personId: input.actorId,
        requestId: input.correlationId,
        metadata: { request_id: request.id, reason: 'self_approval' },
      });
      throw Errors.forbidden('Dual control: requester cannot approve their own grant');
    }
    if (!input.approve) {
      await this.prisma.privilegeGrantRequest.update({
        where: { id: request.id },
        data: {
          status: PrivilegeGrantStatus.REJECTED,
          reviewedById: input.actorId,
          reviewedAt: new Date(),
        },
      });
      return { status: 'REJECTED' };
    }
    const role = await this.prisma.role.findUnique({ where: { code: request.roleCode } });
    if (!role) {
      throw Errors.validation('Role is not seeded');
    }
    const membership = await this.createCompanyMembership(request.targetPersonId, role.id);
    await this.prisma.privilegeGrantRequest.update({
      where: { id: request.id },
      data: {
        status: PrivilegeGrantStatus.APPROVED,
        reviewedById: input.actorId,
        reviewedAt: new Date(),
      },
    });
    await this.events.emit({
      type: 'COMPANY_MEMBERSHIP_GRANTED',
      outcome: 'success',
      personId: input.actorId,
      requestId: input.correlationId,
      metadata: { request_id: request.id, membership_id: membership.id, role: request.roleCode },
    });
    return { status: 'APPROVED', membership_id: membership.id };
  }

  async listGrantRequests() {
    const rows = await this.prisma.privilegeGrantRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        target_person_id: row.targetPersonId,
        role_code: row.roleCode,
        status: row.status,
        reason: row.reason,
        requested_by_id: row.requestedById,
        reviewed_by_id: row.reviewedById,
        created_at: row.createdAt.toISOString(),
        reviewed_at: row.reviewedAt?.toISOString() ?? null,
      })),
    };
  }

  async openBreakGlass(input: {
    actorId: string;
    targetPersonId: string;
    reason: string;
    permissions: string[];
    ttlMinutes?: number;
    requestId?: string;
  }) {
    const allowed = await this.rbac.hasPermission(input.actorId, 'security:break_glass');
    if (!allowed) {
      throw Errors.forbidden('Break-glass requires company security authority');
    }
    if (!input.reason.trim()) {
      throw Errors.validation('Break-glass reason is required');
    }
    if (!input.permissions.length) {
      throw Errors.validation('At least one permission is required');
    }
    const validated: string[] = [];
    for (const code of input.permissions) {
      if (!isValidPermissionCode(code)) {
        throw Errors.validation(`Invalid permission code: ${code}`);
      }
      const catalogOk = await this.rbac.isCatalogPermission(code);
      if (!catalogOk) {
        throw Errors.validation(`Unknown permission: ${code}`);
      }
      if (!isBreakGlassEligiblePermission(code)) {
        throw Errors.validation(`Permission is not eligible for break-glass: ${code}`);
      }
      validated.push(code);
    }
    const ttl = Math.min(Math.max(input.ttlMinutes ?? 30, 5), 240);
    const grant = await this.prisma.breakGlassGrant.create({
      data: {
        id: uuidv7(),
        personId: input.targetPersonId,
        grantedById: input.actorId,
        reason: input.reason.trim(),
        permissions: validated,
        expiresAt: new Date(Date.now() + ttl * 60_000),
      },
    });
    await this.events.emit({
      type: 'BREAK_GLASS_OPENED',
      outcome: 'success',
      personId: input.actorId,
      requestId: input.requestId,
      metadata: {
        grant_id: grant.id,
        target_person_id: input.targetPersonId,
        expires_at: grant.expiresAt.toISOString(),
        permanent: false,
      },
    });
    return { grant_id: grant.id, expires_at: grant.expiresAt, permanent: false };
  }

  listBreakGlassEligiblePermissions() {
    return { data: [...BREAK_GLASS_ELIGIBLE_PERMISSIONS] };
  }

  async listPlatformBreakGlass(activeOnly = true) {
    const now = new Date();
    const rows = await this.prisma.breakGlassGrant.findMany({
      where: {
        kind: 'PLATFORM',
        ...(activeOnly ? { revokedAt: null, expiresAt: { gt: now } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        person_id: row.personId,
        granted_by_id: row.grantedById,
        reason: row.reason,
        permissions: row.permissions,
        expires_at: row.expiresAt.toISOString(),
        revoked_at: row.revokedAt?.toISOString() ?? null,
        created_at: row.createdAt.toISOString(),
      })),
    };
  }

  async revokeBreakGlass(input: { actorId: string; grantId: string; requestId?: string }) {
    const allowed = await this.rbac.hasPermission(input.actorId, 'security:break_glass');
    if (!allowed) {
      throw Errors.forbidden('Break-glass revocation requires company security authority');
    }
    const grant = await this.prisma.breakGlassGrant.findUnique({ where: { id: input.grantId } });
    if (!grant || grant.revokedAt) {
      throw Errors.validation('Break-glass grant is not active');
    }
    await this.prisma.breakGlassGrant.update({
      where: { id: grant.id },
      data: { revokedAt: new Date() },
    });
    await this.events.emit({
      type: 'BREAK_GLASS_REVOKED',
      outcome: 'success',
      personId: input.actorId,
      requestId: input.requestId,
      metadata: { grant_id: grant.id, target_person_id: grant.personId },
    });
    return { ok: true };
  }

  private async assertCanGrant(actorId: string) {
    const allowed = await this.rbac.hasPermission(actorId, 'rbac:grant_company');
    if (!allowed) {
      await this.events.emit({
        type: 'PRIVILEGE_ESCALATION_DENIED',
        outcome: 'failure',
        personId: actorId,
        metadata: { reason: 'missing_rbac_grant_company' },
      });
      throw Errors.forbidden('Company membership grants require company-controlled authority');
    }
  }

  private createCompanyMembership(personId: string, roleId: string) {
    return this.prisma.membership.create({
      data: {
        id: uuidv7(),
        personId,
        roleId,
        scope: MembershipScope.platform,
        status: 'ACTIVE',
      },
    });
  }
}
