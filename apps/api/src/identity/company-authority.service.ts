import { Injectable } from '@nestjs/common';
import { MembershipScope, PrivilegeGrantStatus } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { DUAL_CONTROL_COMPANY_ROLES, isCompanyRole } from './authority';
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
    const ttl = Math.min(Math.max(input.ttlMinutes ?? 30, 5), 240);
    const grant = await this.prisma.breakGlassGrant.create({
      data: {
        id: uuidv7(),
        personId: input.targetPersonId,
        grantedById: input.actorId,
        reason: input.reason.trim(),
        permissions: input.permissions,
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
