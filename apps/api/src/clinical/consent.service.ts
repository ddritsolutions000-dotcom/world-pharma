import { Injectable } from '@nestjs/common';
import { ConsentGrantStatus, Prisma } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import { SecurityEventsService } from '../identity/security-events.service';
import {
  assertAllowedConsentPurpose,
  normalizeConsentScopeInput,
  presentConsentScope,
} from './consent-scope';

@Injectable()
export class ConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly events: SecurityEventsService,
  ) {}

  async grant(input: {
    actorId: string;
    subjectPersonId: string;
    recipientPartnerId: string;
    purpose: string;
    scope?: string[];
    organizationId?: string;
    expiresAt?: string;
    requestId?: string;
  }) {
    if (input.actorId !== input.subjectPersonId) {
      throw Errors.forbidden('Only the subject can grant this consent');
    }
    if (!input.purpose?.trim()) {
      throw Errors.validation('purpose is required');
    }
    assertAllowedConsentPurpose(input.purpose);
    const normalizedScope = normalizeConsentScopeInput(input.scope);
    const partner = await this.prisma.partner.findUnique({ where: { id: input.recipientPartnerId } });
    if (!partner || partner.partnerTypeCode !== 'DOCTOR') {
      throw Errors.notFound('Recipient doctor not found');
    }
    const existingActive = await this.prisma.consentGrant.findFirst({
      where: {
        subjectPersonId: input.subjectPersonId,
        recipientPartnerId: partner.id,
        purpose: input.purpose.trim(),
        status: ConsentGrantStatus.ACTIVE,
      },
      orderBy: { grantedAt: 'desc' },
    });
    if (existingActive) {
      const effective = this.expireIfNeeded(existingActive);
      if (effective.status === ConsentGrantStatus.ACTIVE) {
        return this.present(existingActive);
      }
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const grant = await tx.consentGrant.create({
        data: {
          id: uuidv7(),
          countryId: partner.countryId,
          subjectPersonId: input.subjectPersonId,
          recipientPartnerId: partner.id,
          organizationId: input.organizationId,
          purpose: input.purpose.trim(),
          scope: normalizedScope as unknown as Prisma.InputJsonValue,
          status: ConsentGrantStatus.ACTIVE,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          grantedByPersonId: input.actorId,
        },
      });
      await this.outbox.enqueue(tx, {
        type: 'CONSENT_GRANTED',
        aggregateType: 'ConsentGrant',
        aggregateId: grant.id,
        producer: 'clinical',
        countryId: grant.countryId,
        payload: {
          consent_id: grant.id,
          subject_person_id: grant.subjectPersonId,
          recipient_partner_id: grant.recipientPartnerId,
          purpose: grant.purpose,
        },
        correlationId: input.requestId ?? null,
        actorId: input.actorId,
        occurrenceKey: `granted:${grant.id}`,
      });
      return grant;
    });
    await this.events.emit({
      type: 'CONSENT_GRANTED',
      outcome: 'success',
      personId: input.actorId,
      requestId: input.requestId,
      metadata: { consent_id: created.id, purpose: created.purpose },
    });
    return this.present(created);
  }

  async revoke(input: { actorId: string; consentId: string; requestId?: string }) {
    const grant = await this.prisma.consentGrant.findUnique({ where: { id: input.consentId } });
    if (!grant) {
      throw Errors.notFound('Consent grant not found');
    }
    if (grant.subjectPersonId !== input.actorId) {
      throw Errors.forbidden('Only the subject can revoke this consent');
    }
    if (grant.status === ConsentGrantStatus.REVOKED) {
      return this.present(grant);
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.consentGrant.update({
        where: { id: grant.id },
        data: {
          status: ConsentGrantStatus.REVOKED,
          revokedAt: new Date(),
          revokedByPersonId: input.actorId,
        },
      });
      await this.outbox.enqueue(tx, {
        type: 'CONSENT_REVOKED',
        aggregateType: 'ConsentGrant',
        aggregateId: grant.id,
        producer: 'clinical',
        countryId: grant.countryId,
        payload: { consent_id: grant.id },
        correlationId: input.requestId ?? null,
        actorId: input.actorId,
        occurrenceKey: `revoked:${grant.id}`,
      });
      return row;
    });
    await this.events.emit({
      type: 'CONSENT_REVOKED',
      outcome: 'success',
      personId: input.actorId,
      requestId: input.requestId,
      metadata: { consent_id: grant.id },
    });
    return this.present(updated);
  }

  async listForSubject(personId: string) {
    const rows = await this.prisma.consentGrant.findMany({
      where: { subjectPersonId: personId },
      include: {
        recipient: {
          include: { doctorProfile: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      consents: rows.map((row) => ({
        ...this.present(this.expireIfNeeded(row)),
        recipient_display_name:
          row.recipient.doctorProfile?.displayName ||
          row.recipient.doctorProfile?.professionalName ||
          null,
      })),
    };
  }

  activeGrant(params: {
    subjectPersonId: string;
    recipientPartnerId: string;
    purpose: string;
    now?: Date;
  }) {
    return this.prisma.consentGrant.findFirst({
      where: {
        subjectPersonId: params.subjectPersonId,
        recipientPartnerId: params.recipientPartnerId,
        purpose: params.purpose,
        status: ConsentGrantStatus.ACTIVE,
      },
      orderBy: { grantedAt: 'desc' },
    }).then((row) => (row ? this.expireIfNeeded(row) : null));
  }

  present(row: {
    id: string;
    purpose: string;
    scope: Prisma.JsonValue;
    status: ConsentGrantStatus;
    grantedAt: Date;
    expiresAt: Date | null;
    revokedAt: Date | null;
    recipientPartnerId: string;
  }) {
    return {
      id: row.id,
      purpose: row.purpose,
      scope: presentConsentScope(row.scope),
      status: this.effectiveStatus(row),
      granted_at: row.grantedAt,
      expires_at: row.expiresAt,
      revoked_at: row.revokedAt,
      recipient_partner_id: row.recipientPartnerId,
    };
  }

  private expireIfNeeded<T extends { status: ConsentGrantStatus; expiresAt: Date | null }>(row: T): T {
    if (row.status === ConsentGrantStatus.ACTIVE && row.expiresAt && row.expiresAt <= new Date()) {
      return { ...row, status: ConsentGrantStatus.EXPIRED };
    }
    return row;
  }

  private effectiveStatus(row: { status: ConsentGrantStatus; expiresAt: Date | null }) {
    if (row.status === ConsentGrantStatus.ACTIVE && row.expiresAt && row.expiresAt <= new Date()) {
      return ConsentGrantStatus.EXPIRED;
    }
    return row.status;
  }
}
