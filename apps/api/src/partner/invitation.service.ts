import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { InvitationKind, InvitationStatus } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { SecurityEventsService } from '../identity/security-events.service';
import { isCompanyRole } from '../identity/authority';
import { PolicyResolver } from '../policy/resolver';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class InvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyResolver,
    private readonly events: SecurityEventsService,
  ) {}

  async create(input: {
    kind: InvitationKind;
    countryCode: string;
    invitedById: string;
    intendedRoleCode: string;
    partnerTypeCode?: string;
    organizationId?: string;
    invitedEmail?: string;
    ttlHours?: number;
    requestId?: string;
  }) {
    if (input.kind === InvitationKind.PUBLIC_LINK) {
      throw Errors.forbidden('Public invitation links are disabled.');
    }
    if (isCompanyRole(input.intendedRoleCode)) {
      throw Errors.forbidden('Partner invitations cannot assign company management roles.');
    }
    const resolved = await this.policy.resolvePublished(input.countryCode);
    if (!resolved) {
      throw Errors.validation('Country has no published policy pack');
    }
    const token = randomBytes(32).toString('base64url');
    const invitation = await this.prisma.partnerInvitation.create({
      data: {
        id: uuidv7(),
        tokenHash: hashToken(token),
        kind: input.kind,
        status: InvitationStatus.PENDING,
        countryId: resolved.countryId,
        partnerTypeCode: input.partnerTypeCode,
        organizationId: input.organizationId,
        intendedRoleCode: input.intendedRoleCode,
        invitedEmail: input.invitedEmail,
        invitedById: input.invitedById,
        expiresAt: new Date(Date.now() + (input.ttlHours ?? 72) * 3600 * 1000),
      },
    });
    await this.events.emit({
      type: 'PARTNER_INVITATION_CREATED',
      outcome: 'success',
      personId: input.invitedById,
      requestId: input.requestId,
      metadata: { invitation_id: invitation.id, kind: input.kind },
    });
    return { invitation, token };
  }

  async accept(input: { token: string; personId: string; requestId?: string }) {
    const invitation = await this.prisma.partnerInvitation.findUnique({
      where: { tokenHash: hashToken(input.token) },
    });
    if (!invitation) {
      throw Errors.notFound('Invitation not found');
    }
    if (invitation.status !== InvitationStatus.PENDING) {
      throw Errors.validation('Invitation cannot be reused');
    }
    if (invitation.expiresAt <= new Date()) {
      await this.prisma.partnerInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED },
      });
      throw Errors.validation('Invitation expired');
    }
    if (invitation.organizationId) {
      const role = await this.prisma.role.findUnique({ where: { code: invitation.intendedRoleCode } });
      if (!role) {
        throw Errors.validation('Role is not seeded');
      }
      const org = await this.prisma.organization.findUnique({ where: { id: invitation.organizationId } });
      if (!org) {
        throw Errors.notFound('Organization not found');
      }
      const dup = await this.prisma.membership.findUnique({
        where: {
          personId_organizationId_roleId: {
            personId: input.personId,
            organizationId: org.id,
            roleId: role.id,
          },
        },
      });
      if (!dup) {
        await this.prisma.membership.create({
          data: {
            id: uuidv7(),
            personId: input.personId,
            roleId: role.id,
            scope: 'organization',
            countryId: org.countryId,
            organizationId: org.id,
            status: 'ACTIVE',
          },
        });
      }
    }
    const updated = await this.prisma.partnerInvitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.ACCEPTED, acceptedAt: new Date() },
    });
    await this.events.emit({
      type: 'PARTNER_INVITATION_ACCEPTED',
      outcome: 'success',
      personId: input.personId,
      requestId: input.requestId,
      metadata: { invitation_id: invitation.id },
    });
    return updated;
  }

  async revoke(input: { invitationId: string; actorId: string; requestId?: string }) {
    const invitation = await this.prisma.partnerInvitation.findUnique({
      where: { id: input.invitationId },
    });
    if (!invitation || invitation.status !== InvitationStatus.PENDING) {
      throw Errors.validation('Invitation cannot be revoked');
    }
    const updated = await this.prisma.partnerInvitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.REVOKED, revokedAt: new Date() },
    });
    await this.events.emit({
      type: 'PARTNER_INVITATION_REVOKED',
      outcome: 'success',
      personId: input.actorId,
      requestId: input.requestId,
      metadata: { invitation_id: invitation.id },
    });
    return updated;
  }
}
