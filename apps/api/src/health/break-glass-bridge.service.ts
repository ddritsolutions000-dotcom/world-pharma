import { Injectable } from '@nestjs/common';
import {
  BreakGlassGrantKind,
  BreakGlassReviewStatus,
  ConsentGrantStatus,
  Prisma,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { HEALTH_CONSENT_ARTIFACT_TYPES } from '../clinical/consent-scope';
import { OutboxService } from '../events/outbox.service';
import { RbacService } from '../identity/rbac.service';
import { SecurityEventsService } from '../identity/security-events.service';

const MAX_HEALTH_BREAK_GLASS_TTL_MINUTES = 240;
const MAX_BRIDGED_CONSENT_HOURS = 4;

@Injectable()
export class BreakGlassBridgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly outbox: OutboxService,
    private readonly events: SecurityEventsService,
  ) {}

  async openHealthBreakGlass(input: {
    actorId: string;
    patientPersonId: string;
    doctorPartnerId: string;
    countryId: string;
    reason: string;
    ticketId?: string;
    ttlMinutes?: number;
    organizationId?: string;
    requestId?: string;
  }) {
    const allowed = await this.rbac.hasPermission(input.actorId, 'security:break_glass');
    if (!allowed) {
      throw Errors.forbidden('Break-glass requires company security authority');
    }
    if (!input.reason?.trim()) {
      throw Errors.validation('Break-glass reason is required');
    }
    if (input.actorId === input.patientPersonId) {
      throw Errors.forbidden('Break-glass grantor cannot be the patient subject');
    }

    const country = await this.prisma.country.findUnique({ where: { id: input.countryId } });
    if (!country) {
      throw Errors.notFound('Country not found');
    }

    const doctor = await this.prisma.partner.findUnique({ where: { id: input.doctorPartnerId } });
    if (!doctor || doctor.partnerTypeCode !== 'DOCTOR') {
      throw Errors.notFound('Doctor partner not found');
    }
    if (doctor.countryId !== country.id) {
      throw Errors.validation('Doctor partner country does not match request country');
    }

    const patient = await this.prisma.person.findUnique({ where: { id: input.patientPersonId } });
    if (!patient) {
      throw Errors.notFound('Patient not found');
    }

    const now = new Date();
    const duplicateActive = await this.prisma.breakGlassGrant.findFirst({
      where: {
        kind: BreakGlassGrantKind.HEALTH_CLINICAL,
        patientPersonId: input.patientPersonId,
        doctorPartnerId: doctor.id,
        revokedAt: null,
        expiresAt: { gt: now },
        reviewStatus: { not: BreakGlassReviewStatus.CLOSED },
      },
    });
    if (duplicateActive) {
      throw Errors.conflict('An active health break-glass grant already exists for this patient and doctor');
    }

    const ttlMinutes = Math.min(
      Math.max(input.ttlMinutes ?? 60, 5),
      MAX_HEALTH_BREAK_GLASS_TTL_MINUTES,
    );
    const grantExpiresAt = new Date(now.getTime() + ttlMinutes * 60_000);
    const consentExpiresAt = new Date(
      Math.min(grantExpiresAt.getTime(), now.getTime() + MAX_BRIDGED_CONSENT_HOURS * 60 * 60_000),
    );

    const scope = [...HEALTH_CONSENT_ARTIFACT_TYPES] as unknown as Prisma.InputJsonValue;

    const result = await this.prisma.$transaction(async (tx) => {
      const grant = await tx.breakGlassGrant.create({
        data: {
          id: uuidv7(),
          kind: BreakGlassGrantKind.HEALTH_CLINICAL,
          personId: input.patientPersonId,
          grantedById: input.actorId,
          reason: input.reason.trim(),
          permissions: ['health:clinical:break_glass'],
          expiresAt: grantExpiresAt,
          countryId: country.id,
          patientPersonId: input.patientPersonId,
          doctorPartnerId: doctor.id,
          ticketId: input.ticketId?.trim() || null,
          reviewStatus: BreakGlassReviewStatus.PENDING,
        },
      });

      const consent = await tx.consentGrant.create({
        data: {
          id: uuidv7(),
          countryId: country.id,
          subjectPersonId: input.patientPersonId,
          recipientPartnerId: doctor.id,
          organizationId: input.organizationId ?? null,
          purpose: 'break_glass',
          scope,
          status: ConsentGrantStatus.ACTIVE,
          expiresAt: consentExpiresAt,
          grantedByPersonId: input.actorId,
          breakGlassGrantId: grant.id,
        },
      });

      await this.outbox.enqueue(tx, {
        type: 'BREAK_GLASS_HEALTH_OPENED',
        aggregateType: 'BreakGlassGrant',
        aggregateId: grant.id,
        producer: 'health',
        countryId: country.id,
        payload: {
          break_glass_grant_id: grant.id,
          consent_id: consent.id,
          patient_person_id: input.patientPersonId,
          doctor_partner_id: doctor.id,
        },
        correlationId: input.requestId ?? null,
        actorId: input.actorId,
        occurrenceKey: `bg_health:${grant.id}`,
      });

      return { grant, consent };
    });

    await this.events.emit({
      type: 'BREAK_GLASS_OPENED',
      outcome: 'success',
      personId: input.actorId,
      requestId: input.requestId,
      metadata: {
        grant_id: result.grant.id,
        kind: BreakGlassGrantKind.HEALTH_CLINICAL,
        patient_person_id: input.patientPersonId,
        doctor_partner_id: doctor.id,
        consent_id: result.consent.id,
        expires_at: result.grant.expiresAt.toISOString(),
        ticket_id: input.ticketId ?? null,
      },
    });

    return this.presentGrant(result.grant, result.consent);
  }

  async reviewHealthBreakGlass(input: {
    actorId: string;
    grantId: string;
    reviewNotes?: string;
    requestId?: string;
  }) {
    const allowed = await this.rbac.hasPermission(input.actorId, 'security:break_glass');
    if (!allowed) {
      throw Errors.forbidden('Break-glass review requires company security authority');
    }

    const grant = await this.prisma.breakGlassGrant.findUnique({
      where: { id: input.grantId },
      include: { bridgedConsents: true },
    });
    if (!grant || grant.kind !== BreakGlassGrantKind.HEALTH_CLINICAL) {
      throw Errors.notFound('Health break-glass grant not found');
    }

    if (grant.reviewStatus === BreakGlassReviewStatus.REVIEWED) {
      return this.presentGrant(grant, grant.bridgedConsents[0] ?? null);
    }
    if (grant.reviewStatus === BreakGlassReviewStatus.CLOSED) {
      throw Errors.conflict('Break-glass grant is closed and cannot be reviewed');
    }

    const updated = await this.prisma.breakGlassGrant.update({
      where: { id: grant.id },
      data: {
        reviewStatus: BreakGlassReviewStatus.REVIEWED,
        reviewedAt: new Date(),
        reviewedById: input.actorId,
        reviewNotes: input.reviewNotes?.trim() || null,
      },
      include: { bridgedConsents: true },
    });

    await this.events.emit({
      type: 'BREAK_GLASS_HEALTH_REVIEWED',
      outcome: 'success',
      personId: input.actorId,
      requestId: input.requestId,
      metadata: {
        grant_id: grant.id,
        patient_person_id: grant.patientPersonId,
        doctor_partner_id: grant.doctorPartnerId,
        consent_id: updated.bridgedConsents[0]?.id ?? null,
      },
    });

    return this.presentGrant(updated, updated.bridgedConsents[0] ?? null);
  }

  isGrantActive(grant: { expiresAt: Date; revokedAt: Date | null; reviewStatus: BreakGlassReviewStatus }) {
    if (grant.revokedAt) {
      return false;
    }
    if (grant.reviewStatus === BreakGlassReviewStatus.CLOSED) {
      return false;
    }
    return grant.expiresAt > new Date();
  }

  private presentGrant(
    grant: {
      id: string;
      kind: BreakGlassGrantKind;
      reason: string;
      expiresAt: Date;
      revokedAt: Date | null;
      countryId: string | null;
      patientPersonId: string | null;
      doctorPartnerId: string | null;
      ticketId: string | null;
      reviewStatus: BreakGlassReviewStatus;
      reviewedAt: Date | null;
      reviewedById: string | null;
      reviewNotes: string | null;
      grantedById: string;
      createdAt: Date;
    },
    consent: {
      id: string;
      purpose: string;
      status: ConsentGrantStatus;
      expiresAt: Date | null;
    } | null,
  ) {
    return {
      id: grant.id,
      kind: grant.kind,
      reason: grant.reason,
      expires_at: grant.expiresAt.toISOString(),
      revoked_at: grant.revokedAt?.toISOString() ?? null,
      country_id: grant.countryId,
      patient_person_id: grant.patientPersonId,
      doctor_partner_id: grant.doctorPartnerId,
      ticket_id: grant.ticketId,
      review_status: grant.reviewStatus,
      reviewed_at: grant.reviewedAt?.toISOString() ?? null,
      reviewed_by_id: grant.reviewedById,
      review_notes: grant.reviewNotes,
      granted_by_id: grant.grantedById,
      created_at: grant.createdAt.toISOString(),
      active: this.isGrantActive(grant),
      bridged_consent: consent
        ? {
            id: consent.id,
            purpose: consent.purpose,
            status: consent.status,
            expires_at: consent.expiresAt?.toISOString() ?? null,
          }
        : null,
    };
  }
}
