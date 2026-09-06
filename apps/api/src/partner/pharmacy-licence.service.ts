import { Injectable } from '@nestjs/common';
import { PharmacyLicenceStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';

export type SubmitLicenceDto = {
  licenceAuthority: string;
  licenceNumber: string;
  responsiblePharmacist?: string;
  issuedAt?: string;
  expiresAt?: string;
  evidenceObjectKey?: string;
  regulatoryEvidenceId?: string;
  notes?: string;
};

export type PharmacyLicenceReadiness = {
  hasLicence: boolean;
  status: PharmacyLicenceStatus | 'NOT_SUBMITTED';
  isVerified: boolean;
  isExpired: boolean;
  blockers: string[];
};

@Injectable()
export class PharmacyLicenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityEventsService,
  ) {}

  async submitLicence(principal: Principal, partnerId: string, dto: SubmitLicenceDto) {
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId } });
    if (!partner) throw Errors.notFound('Partner not found');

    if (principal.audience !== 'admin') {
      if (partner.personId !== principal.personId) {
        const isOrgMember = partner.organizationId
          ? await this.prisma.membership.findFirst({
              where: { personId: principal.personId, organizationId: partner.organizationId },
            })
          : null;
        if (!isOrgMember) throw Errors.forbidden('Not authorized for this partner');
      }
    }

    const existing = await this.prisma.pharmacyLicence.findFirst({
      where: { partnerId, countryId: partner.countryId },
      orderBy: { createdAt: 'desc' },
    });

    if (existing && existing.status === PharmacyLicenceStatus.VERIFIED) {
      throw Errors.conflict('Verified licence already exists. Use replace to submit a successor.');
    }

    if (existing) {
      const from = existing.status;
      const updated = await this.prisma.pharmacyLicence.update({
        where: { id: existing.id },
        data: {
          licenceAuthority: dto.licenceAuthority,
          licenceNumber: dto.licenceNumber,
          responsiblePharmacist: dto.responsiblePharmacist ?? null,
          issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : null,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          evidenceObjectKey: dto.evidenceObjectKey ?? null,
          regulatoryEvidenceId: dto.regulatoryEvidenceId ?? null,
          notes: dto.notes ?? null,
          status: PharmacyLicenceStatus.SUBMITTED,
          verifiedById: null,
          verifiedAt: null,
          rejectedAt: null,
          rejectionReason: null,
          updatedAt: new Date(),
        },
      });
      await this.recordEvent({
        licenceId: updated.id,
        partnerId,
        countryId: partner.countryId,
        action: 'SUBMITTED',
        fromStatus: from,
        toStatus: updated.status,
        actorId: principal.personId,
      });
      await this.security.emit({
        type: 'PHARMACY_LICENCE_SUBMITTED',
        outcome: 'success',
        personId: principal.personId,
        metadata: { partner_id: partnerId, licence_id: updated.id, country_id: partner.countryId },
      });
      return this.present(updated);
    }

    const created = await this.prisma.pharmacyLicence.create({
      data: {
        id: randomUUID(),
        partnerId,
        countryId: partner.countryId,
        licenceAuthority: dto.licenceAuthority,
        licenceNumber: dto.licenceNumber,
        responsiblePharmacist: dto.responsiblePharmacist ?? null,
        issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        evidenceObjectKey: dto.evidenceObjectKey ?? null,
        regulatoryEvidenceId: dto.regulatoryEvidenceId ?? null,
        notes: dto.notes ?? null,
        status: PharmacyLicenceStatus.SUBMITTED,
        createdById: principal.personId,
      },
    });
    await this.recordEvent({
      licenceId: created.id,
      partnerId,
      countryId: partner.countryId,
      action: 'SUBMITTED',
      fromStatus: null,
      toStatus: created.status,
      actorId: principal.personId,
    });
    await this.security.emit({
      type: 'PHARMACY_LICENCE_SUBMITTED',
      outcome: 'success',
      personId: principal.personId,
      metadata: { partner_id: partnerId, licence_id: created.id, country_id: partner.countryId },
    });
    return this.present(created);
  }

  /** Admin: move SUBMITTED → UNDER_REVIEW. */
  async markUnderReview(principal: Principal, licenceId: string) {
    if (principal.audience !== 'admin') throw Errors.forbidden('Admin only');
    const licence = await this.prisma.pharmacyLicence.findUnique({ where: { id: licenceId } });
    if (!licence) throw Errors.notFound('Pharmacy licence not found');
    if (
      licence.status !== PharmacyLicenceStatus.SUBMITTED &&
      licence.status !== PharmacyLicenceStatus.UNDER_REVIEW
    ) {
      throw Errors.validation(`Cannot review licence in status ${licence.status}`);
    }
    if (licence.status === PharmacyLicenceStatus.UNDER_REVIEW) return this.present(licence);
    const updated = await this.prisma.pharmacyLicence.update({
      where: { id: licenceId },
      data: { status: PharmacyLicenceStatus.UNDER_REVIEW },
    });
    await this.recordEvent({
      licenceId,
      partnerId: licence.partnerId,
      countryId: licence.countryId,
      action: 'UNDER_REVIEW',
      fromStatus: licence.status,
      toStatus: updated.status,
      actorId: principal.personId,
    });
    return this.present(updated);
  }

  /** Admin-only: verify a submitted/under-review licence. Not a regulator DB check. */
  async verifyLicence(principal: Principal, licenceId: string) {
    if (principal.audience !== 'admin') throw Errors.forbidden('Admin only');
    const licence = await this.prisma.pharmacyLicence.findUnique({ where: { id: licenceId } });
    if (!licence) throw Errors.notFound('Pharmacy licence not found');
    if (licence.status === PharmacyLicenceStatus.VERIFIED) return this.present(licence);
    if (
      licence.status !== PharmacyLicenceStatus.SUBMITTED &&
      licence.status !== PharmacyLicenceStatus.UNDER_REVIEW
    ) {
      throw Errors.validation(`Cannot verify licence in status ${licence.status}`);
    }

    const updated = await this.prisma.pharmacyLicence.update({
      where: { id: licenceId },
      data: {
        status: PharmacyLicenceStatus.VERIFIED,
        verifiedById: principal.personId,
        verifiedAt: new Date(),
        rejectedAt: null,
        rejectionReason: null,
      },
    });
    await this.recordEvent({
      licenceId,
      partnerId: licence.partnerId,
      countryId: licence.countryId,
      action: 'VERIFIED',
      fromStatus: licence.status,
      toStatus: updated.status,
      actorId: principal.personId,
      reason: 'Operator verification — not regulator database confirmation',
    });
    await this.security.emit({
      type: 'PHARMACY_LICENCE_VERIFIED',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        partner_id: licence.partnerId,
        licence_id: licenceId,
        country_id: licence.countryId,
        verification: 'OPERATOR_INTERNAL',
      },
    });
    return this.present(updated);
  }

  async rejectLicence(principal: Principal, licenceId: string, reason: string) {
    if (principal.audience !== 'admin') throw Errors.forbidden('Admin only');
    const licence = await this.prisma.pharmacyLicence.findUnique({ where: { id: licenceId } });
    if (!licence) throw Errors.notFound('Pharmacy licence not found');
    const updated = await this.prisma.pharmacyLicence.update({
      where: { id: licenceId },
      data: {
        status: PharmacyLicenceStatus.REJECTED,
        rejectionReason: reason,
        rejectedAt: new Date(),
      },
    });
    await this.recordEvent({
      licenceId,
      partnerId: licence.partnerId,
      countryId: licence.countryId,
      action: 'REJECTED',
      fromStatus: licence.status,
      toStatus: updated.status,
      actorId: principal.personId,
      reason,
    });
    await this.security.emit({
      type: 'PHARMACY_LICENCE_REJECTED',
      outcome: 'success',
      personId: principal.personId,
      metadata: { partner_id: licence.partnerId, licence_id: licenceId, reason },
    });
    return this.present(updated);
  }

  /** Mark licence expired when past expiresAt (authoritative current-state evaluation). */
  async expireLicence(principal: Principal, licenceId: string, reason?: string) {
    if (principal.audience !== 'admin') throw Errors.forbidden('Admin only');
    const licence = await this.prisma.pharmacyLicence.findUnique({ where: { id: licenceId } });
    if (!licence) throw Errors.notFound('Pharmacy licence not found');
    if (licence.status === PharmacyLicenceStatus.EXPIRED) return this.present(licence);
    const updated = await this.prisma.pharmacyLicence.update({
      where: { id: licenceId },
      data: { status: PharmacyLicenceStatus.EXPIRED },
    });
    await this.recordEvent({
      licenceId,
      partnerId: licence.partnerId,
      countryId: licence.countryId,
      action: 'EXPIRED',
      fromStatus: licence.status,
      toStatus: updated.status,
      actorId: principal.personId,
      reason: reason ?? 'Licence expired',
    });
    await this.security.emit({
      type: 'PHARMACY_LICENCE_EXPIRED',
      outcome: 'success',
      personId: principal.personId,
      metadata: { partner_id: licence.partnerId, licence_id: licenceId },
    });
    return this.present(updated);
  }

  /**
   * Replace a verified/expired/rejected licence with a new SUBMITTED record.
   * Prior record is retained historically (expired/superseded via status).
   */
  async replaceLicence(principal: Principal, partnerId: string, dto: SubmitLicenceDto) {
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId } });
    if (!partner) throw Errors.notFound('Partner not found');

    if (principal.audience !== 'admin') {
      if (partner.personId !== principal.personId) {
        const isOrgMember = partner.organizationId
          ? await this.prisma.membership.findFirst({
              where: { personId: principal.personId, organizationId: partner.organizationId },
            })
          : null;
        if (!isOrgMember) throw Errors.forbidden('Not authorized for this partner');
      }
    }

    const existing = await this.prisma.pharmacyLicence.findFirst({
      where: { partnerId, countryId: partner.countryId },
      orderBy: { createdAt: 'desc' },
    });

    if (
      existing &&
      (existing.status === PharmacyLicenceStatus.VERIFIED ||
        existing.status === PharmacyLicenceStatus.EXPIRED)
    ) {
      await this.prisma.pharmacyLicence.update({
        where: { id: existing.id },
        data: { status: PharmacyLicenceStatus.EXPIRED },
      });
      await this.recordEvent({
        licenceId: existing.id,
        partnerId,
        countryId: partner.countryId,
        action: 'SUPERSEDED',
        fromStatus: existing.status,
        toStatus: PharmacyLicenceStatus.EXPIRED,
        actorId: principal.personId,
        reason: 'Replaced by successor licence',
      });
    }

    const created = await this.prisma.pharmacyLicence.create({
      data: {
        id: randomUUID(),
        partnerId,
        countryId: partner.countryId,
        licenceAuthority: dto.licenceAuthority,
        licenceNumber: dto.licenceNumber,
        responsiblePharmacist: dto.responsiblePharmacist ?? null,
        issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        evidenceObjectKey: dto.evidenceObjectKey ?? null,
        regulatoryEvidenceId: dto.regulatoryEvidenceId ?? null,
        notes: dto.notes ?? null,
        status: PharmacyLicenceStatus.SUBMITTED,
        createdById: principal.personId,
      },
    });
    await this.recordEvent({
      licenceId: created.id,
      partnerId,
      countryId: partner.countryId,
      action: 'REPLACED',
      fromStatus: existing?.status ?? null,
      toStatus: created.status,
      actorId: principal.personId,
    });
    await this.security.emit({
      type: 'PHARMACY_LICENCE_REPLACED',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        partner_id: partnerId,
        licence_id: created.id,
        prior_licence_id: existing?.id ?? null,
      },
    });
    return this.present(created);
  }

  async getForPartner(partnerId: string) {
    return this.prisma.pharmacyLicence.findFirst({
      where: { partnerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async history(partnerId: string) {
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId } });
    const licences = await this.prisma.pharmacyLicence.findMany({
      where: { partnerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        licenceNumber: true,
        licenceAuthority: true,
        expiresAt: true,
        verifiedAt: true,
        verifiedById: true,
        createdAt: true,
      },
    });
    const events = partner
      ? await runWithTenant(workerTenantContext({ countryId: partner.countryId }), () =>
          this.prisma.pharmacyLicenceEvent.findMany({
            where: { partnerId },
            orderBy: { createdAt: 'desc' },
            take: 100,
          }),
        )
      : [];
    return {
      licences: licences.map((l) => ({
        id: l.id,
        status: l.status,
        licence_number: l.licenceNumber,
        licence_authority: l.licenceAuthority,
        expires_at: l.expiresAt?.toISOString() ?? null,
        verified_at: l.verifiedAt?.toISOString() ?? null,
        verified_by_id: l.verifiedById,
        created_at: l.createdAt.toISOString(),
      })),
      events: events.map((e) => ({
        id: e.id,
        licence_id: e.licenceId,
        action: e.action,
        from_status: e.fromStatus,
        to_status: e.toStatus,
        actor_id: e.actorId,
        reason: e.reason,
        created_at: e.createdAt.toISOString(),
      })),
    };
  }

  async computeReadiness(partnerId: string, countryId: string): Promise<PharmacyLicenceReadiness> {
    const licence = await this.prisma.pharmacyLicence.findFirst({
      where: { partnerId, countryId },
      orderBy: { createdAt: 'desc' },
    });

    if (!licence) {
      return {
        hasLicence: false,
        status: 'NOT_SUBMITTED',
        isVerified: false,
        isExpired: false,
        blockers: ['PHARMACY_LICENSE_MISSING'],
      };
    }

    const now = new Date();
    const isExpired =
      licence.status === PharmacyLicenceStatus.EXPIRED ||
      (licence.expiresAt != null && licence.expiresAt < now);
    const isVerified = licence.status === PharmacyLicenceStatus.VERIFIED && !isExpired;

    const blockers: string[] = [];
    if (
      licence.status === PharmacyLicenceStatus.NOT_SUBMITTED ||
      licence.status === PharmacyLicenceStatus.SUBMITTED
    ) {
      blockers.push('PHARMACY_LICENSE_UNVERIFIED');
    } else if (licence.status === PharmacyLicenceStatus.UNDER_REVIEW) {
      blockers.push('PHARMACY_LICENSE_UNDER_REVIEW');
    } else if (licence.status === PharmacyLicenceStatus.REJECTED) {
      blockers.push('PHARMACY_LICENSE_REJECTED');
    } else if (isExpired) {
      blockers.push('PHARMACY_LICENSE_EXPIRED');
    }

    return {
      hasLicence: true,
      status: isExpired && licence.status === PharmacyLicenceStatus.VERIFIED
        ? PharmacyLicenceStatus.EXPIRED
        : licence.status,
      isVerified,
      isExpired,
      blockers,
    };
  }

  private present(licence: {
    id: string;
    partnerId: string;
    countryId: string;
    licenceAuthority: string;
    licenceNumber: string;
    responsiblePharmacist: string | null;
    issuedAt: Date | null;
    expiresAt: Date | null;
    status: PharmacyLicenceStatus;
    verifiedById: string | null;
    verifiedAt: Date | null;
    rejectedAt: Date | null;
    rejectionReason: string | null;
    evidenceObjectKey: string | null;
    notes: string | null;
  }) {
    return {
      id: licence.id,
      partner_id: licence.partnerId,
      country_id: licence.countryId,
      licence_authority: licence.licenceAuthority,
      licence_number: licence.licenceNumber,
      responsible_pharmacist: licence.responsiblePharmacist,
      issued_at: licence.issuedAt?.toISOString() ?? null,
      expires_at: licence.expiresAt?.toISOString() ?? null,
      status: licence.status,
      verified_by_id: licence.verifiedById,
      verified_at: licence.verifiedAt?.toISOString() ?? null,
      rejected_at: licence.rejectedAt?.toISOString() ?? null,
      rejection_reason: licence.rejectionReason,
      // Admin may see that evidence exists; never return a public URL.
      has_evidence: Boolean(licence.evidenceObjectKey),
      notes: licence.notes,
      verification_note: 'Operator verification only — not a government/regulator database check.',
    };
  }

  private async recordEvent(input: {
    licenceId: string;
    partnerId: string;
    countryId: string;
    action: string;
    fromStatus: string | null;
    toStatus: string | null;
    actorId?: string;
    reason?: string;
  }) {
    await runWithTenant(workerTenantContext({ countryId: input.countryId }), async () => {
      await this.prisma.pharmacyLicenceEvent.create({
        data: {
          id: randomUUID(),
          licenceId: input.licenceId,
          partnerId: input.partnerId,
          countryId: input.countryId,
          action: input.action,
          fromStatus: input.fromStatus,
          toStatus: input.toStatus,
          actorId: input.actorId ?? null,
          reason: input.reason ?? null,
        },
      });
    });
  }
}
