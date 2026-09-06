import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';

@Injectable()
export class PartnerCommercialApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityEventsService,
  ) {}

  async get(partnerId: string) {
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId } });
    if (!partner) throw Errors.notFound('Partner not found');
    const row = await this.prisma.partnerCommercialApproval.findFirst({
      where: { partnerId, countryId: partner.countryId },
    });
    if (!row) {
      return {
        partner_id: partnerId,
        country_id: partner.countryId,
        approved: false,
        approved_by_id: null,
        approved_at: null,
        revoked_by_id: null,
        revoked_at: null,
        notes: null,
      };
    }
    return this.present(row);
  }

  async history(partnerId: string) {
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId } });
    if (!partner) throw Errors.notFound('Partner not found');
    const approval = await this.prisma.partnerCommercialApproval.findFirst({
      where: { partnerId, countryId: partner.countryId },
    });
    if (!approval) return { approval: null, events: [] };
    const events = await this.prisma.partnerCommercialApprovalEvent.findMany({
      where: { approvalId: approval.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      approval: this.present(approval),
      events: events.map((e) => ({
        id: e.id,
        action: e.action,
        approved: e.approved,
        actor_id: e.actorId,
        reason: e.reason,
        created_at: e.createdAt.toISOString(),
      })),
    };
  }

  async approve(principal: Principal, partnerId: string, notes?: string) {
    if (principal.audience !== 'admin') throw Errors.forbidden('Admin only');
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId } });
    if (!partner) throw Errors.notFound('Partner not found');

    // Pharmacy cannot self-approve; vendor person cannot approve own partner.
    if (partner.personId === principal.personId) {
      throw Errors.forbidden('Self-approval of commercial participation is not allowed');
    }

    const row = await this.prisma.partnerCommercialApproval.upsert({
      where: { partnerId_countryId: { partnerId, countryId: partner.countryId } },
      update: {
        approved: true,
        approvedById: principal.personId,
        approvedAt: new Date(),
        revokedAt: null,
        revokedById: null,
        notes: notes ?? null,
        updatedAt: new Date(),
      },
      create: {
        id: randomUUID(),
        partnerId,
        countryId: partner.countryId,
        approved: true,
        approvedById: principal.personId,
        approvedAt: new Date(),
        notes: notes ?? null,
      },
    });

    await runWithTenant(workerTenantContext({ countryId: partner.countryId }), async () => {
      await this.prisma.partnerCommercialApprovalEvent.create({
        data: {
          id: randomUUID(),
          approvalId: row.id,
          partnerId,
          countryId: partner.countryId,
          action: 'APPROVED',
          approved: true,
          actorId: principal.personId,
          reason: notes ?? null,
        },
      });
    });
    await this.security.emit({
      type: 'PARTNER_COMMERCIAL_APPROVED',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        partner_id: partnerId,
        country_id: partner.countryId,
        approval_id: row.id,
      },
    });
    return this.present(row);
  }

  async revoke(principal: Principal, partnerId: string, notes?: string) {
    if (principal.audience !== 'admin') throw Errors.forbidden('Admin only');
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId } });
    if (!partner) throw Errors.notFound('Partner not found');
    const existing = await this.prisma.partnerCommercialApproval.findFirst({
      where: { partnerId, countryId: partner.countryId },
    });
    if (!existing) throw Errors.notFound('No commercial approval record');

    const row = await this.prisma.partnerCommercialApproval.update({
      where: { id: existing.id },
      data: {
        approved: false,
        revokedById: principal.personId,
        revokedAt: new Date(),
        notes: notes ?? null,
        updatedAt: new Date(),
      },
    });
    await runWithTenant(workerTenantContext({ countryId: partner.countryId }), async () => {
      await this.prisma.partnerCommercialApprovalEvent.create({
        data: {
          id: randomUUID(),
          approvalId: row.id,
          partnerId,
          countryId: partner.countryId,
          action: 'REVOKED',
          approved: false,
          actorId: principal.personId,
          reason: notes ?? null,
        },
      });
    });
    await this.security.emit({
      type: 'PARTNER_COMMERCIAL_REVOKED',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        partner_id: partnerId,
        country_id: partner.countryId,
        approval_id: row.id,
      },
    });
    return this.present(row);
  }

  private present(row: {
    id: string;
    partnerId: string;
    countryId: string;
    approved: boolean;
    approvedById: string | null;
    approvedAt: Date | null;
    revokedById: string | null;
    revokedAt: Date | null;
    notes: string | null;
  }) {
    const approved = row.approved && !row.revokedAt;
    return {
      id: row.id,
      partner_id: row.partnerId,
      partnerId: row.partnerId,
      country_id: row.countryId,
      countryId: row.countryId,
      approved,
      approved_by_id: row.approvedById,
      approvedById: row.approvedById,
      approved_at: row.approvedAt?.toISOString() ?? null,
      approvedAt: row.approvedAt,
      revoked_by_id: row.revokedById,
      revokedById: row.revokedById,
      revoked_at: row.revokedAt?.toISOString() ?? null,
      revokedAt: row.revokedAt,
      notes: row.notes,
    };
  }
}
