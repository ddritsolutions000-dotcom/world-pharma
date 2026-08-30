import { Injectable } from '@nestjs/common';
import { BreakGlassGrantKind, BreakGlassReviewStatus, ClinicalRelationshipKind, ClinicalRelationshipStatus, ConsentGrantStatus, HealthArtifactType } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import { PolicyResolver } from '../policy/resolver';
import { ConsentService } from './consent.service';
import {
  artifactReadDenialMessage,
  consentScopeIncludes,
  isArtifactReadPurpose,
  parseConsentScope,
} from './consent-scope';
import { workerTenantContext } from '../tenancy/build-tenant-context';

export type ArtifactReadDecision = {
  allowed: boolean;
  reason: string;
  doctorPartnerId?: string | null;
  organizationId?: string | null;
  consentId?: string;
  consentScope?: HealthArtifactType[];
};

@Injectable()
export class ClinicalAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consents: ConsentService,
    private readonly policy: PolicyResolver,
    private readonly outbox: OutboxService,
  ) {}

  async recordRelationship(input: {
    actorId: string;
    patientPersonId: string;
    doctorPartnerId: string;
    kind: ClinicalRelationshipKind;
    organizationId?: string;
  }) {
    const doctor = await this.prisma.partner.findUnique({ where: { id: input.doctorPartnerId } });
    if (!doctor || doctor.partnerTypeCode !== 'DOCTOR') {
      throw Errors.notFound('Doctor partner not found');
    }
    if (input.organizationId) {
      const membership = await this.prisma.membership.findFirst({
        where: {
          personId: doctor.personId,
          organizationId: input.organizationId,
          deletedAt: null,
          status: 'ACTIVE',
        },
      });
      if (!membership) {
        throw Errors.forbidden('Doctor is not a member of that organization');
      }
    }
    return this.prisma.clinicalRelationship.create({
      data: {
        id: uuidv7(),
        countryId: doctor.countryId,
        patientPersonId: input.patientPersonId,
        doctorPartnerId: doctor.id,
        organizationId: input.organizationId,
        kind: input.kind,
      },
    });
  }

  async evaluate(input: {
    actorId: string;
    audience: string;
    patientPersonId: string;
    purpose: string;
    countryCode: string;
    requestId?: string;
  }) {
    if (input.audience !== 'doctor' && input.audience !== 'admin') {
      return this.deny(input, null, input.patientPersonId, 'audience_denied');
    }
    const doctor = await this.prisma.partner.findFirst({
      where: { personId: input.actorId, partnerTypeCode: 'DOCTOR' },
    });
    if (!doctor) {
      return this.deny(input, null, input.patientPersonId, 'not_a_doctor');
    }
    const resolved = await this.policy.resolvePublished(input.countryCode);
    if (input.purpose === 'consultation' && !this.policy.isConsultationCapable(resolved?.document ?? null)) {
      return this.deny(input, doctor.id, input.patientPersonId, 'policy_consultation_disabled');
    }
    if (input.purpose === 'telemedicine' && !this.policy.isTelemedicineEligible(resolved?.document ?? null)) {
      return this.deny(input, doctor.id, input.patientPersonId, 'policy_telemedicine_disabled');
    }
    const relationship = await this.prisma.clinicalRelationship.findFirst({
      where: {
        doctorPartnerId: doctor.id,
        patientPersonId: input.patientPersonId,
        status: ClinicalRelationshipStatus.ACTIVE,
      },
    });
    if (!relationship) {
      return this.deny(input, doctor.id, input.patientPersonId, 'no_relationship');
    }
    const consent = await this.consents.activeGrant({
      subjectPersonId: input.patientPersonId,
      recipientPartnerId: doctor.id,
      purpose: input.purpose,
    });
    if (!consent || consent.status !== ConsentGrantStatus.ACTIVE) {
      return this.deny(input, doctor.id, input.patientPersonId, 'consent_missing_or_inactive');
    }
    if (consent.expiresAt && consent.expiresAt <= new Date()) {
      return this.deny(input, doctor.id, input.patientPersonId, 'consent_expired');
    }
    await this.audit(input, doctor.id, input.patientPersonId, true, 'allowed');
    return { allowed: true, reason: 'allowed', doctor_partner_id: doctor.id };
  }

  async evaluateForArtifactRead(input: {
    actorId: string;
    audience: string;
    patientPersonId: string;
    artifactType: HealthArtifactType;
    purpose: string;
    countryId: string;
    countryCode: string;
    organizationId?: string;
  }): Promise<ArtifactReadDecision> {
    if (input.audience === 'customer' && input.actorId === input.patientPersonId) {
      return { allowed: true, reason: 'patient_self' };
    }
    return this.evaluateDoctorHealthAccess({
      ...input,
      requireArtifactScope: input.artifactType,
    });
  }

  async evaluateForPatientHealthRead(input: {
    actorId: string;
    audience: string;
    patientPersonId: string;
    purpose: string;
    countryId: string;
    countryCode: string;
    organizationId?: string;
  }): Promise<ArtifactReadDecision> {
    if (input.audience === 'customer' && input.actorId === input.patientPersonId) {
      return { allowed: true, reason: 'patient_self' };
    }
    return this.evaluateDoctorHealthAccess({
      ...input,
      requireArtifactScope: undefined,
    });
  }

  private async evaluateDoctorHealthAccess(input: {
    actorId: string;
    audience: string;
    patientPersonId: string;
    purpose: string;
    countryId: string;
    countryCode: string;
    organizationId?: string;
    requireArtifactScope?: HealthArtifactType;
  }): Promise<ArtifactReadDecision> {
    if (input.audience !== 'doctor') {
      return { allowed: false, reason: 'audience_denied' };
    }
    const doctor = await this.prisma.partner.findFirst({
      where: { personId: input.actorId, partnerTypeCode: 'DOCTOR', status: 'ACTIVE' },
    });
    if (!doctor) {
      return { allowed: false, reason: 'not_a_doctor' };
    }
    if (doctor.countryId !== input.countryId) {
      return { allowed: false, reason: 'country_mismatch', doctorPartnerId: doctor.id };
    }
    if (!isArtifactReadPurpose(input.purpose)) {
      return { allowed: false, reason: 'purpose_not_allowed', doctorPartnerId: doctor.id };
    }
    const resolved = await this.policy.resolvePublished(input.countryCode);
    if (!this.policy.isHealthTimelineEnabled(resolved?.document ?? null)) {
      return { allowed: false, reason: 'health_timeline_disabled', doctorPartnerId: doctor.id };
    }
    if (input.purpose === 'consultation' && !this.policy.isConsultationCapable(resolved?.document ?? null)) {
      return { allowed: false, reason: 'policy_consultation_disabled', doctorPartnerId: doctor.id };
    }
    const relationship = await this.prisma.clinicalRelationship.findFirst({
      where: {
        doctorPartnerId: doctor.id,
        patientPersonId: input.patientPersonId,
        countryId: input.countryId,
        status: ClinicalRelationshipStatus.ACTIVE,
      },
    });
    if (!relationship) {
      return { allowed: false, reason: 'no_relationship', doctorPartnerId: doctor.id };
    }
    if (input.organizationId && relationship.organizationId && relationship.organizationId !== input.organizationId) {
      return { allowed: false, reason: 'organization_mismatch', doctorPartnerId: doctor.id };
    }
    const consent = await this.consents.activeGrant({
      subjectPersonId: input.patientPersonId,
      recipientPartnerId: doctor.id,
      purpose: input.purpose,
    });
    if (!consent) {
      const latest = await this.prisma.consentGrant.findFirst({
        where: {
          subjectPersonId: input.patientPersonId,
          recipientPartnerId: doctor.id,
          purpose: input.purpose,
        },
        orderBy: { grantedAt: 'desc' },
      });
      if (latest?.status === ConsentGrantStatus.REVOKED) {
        return {
          allowed: false,
          reason: 'consent_revoked',
          doctorPartnerId: doctor.id,
          consentId: latest.id,
        };
      }
      if (
        latest?.status === ConsentGrantStatus.EXPIRED ||
        (latest?.expiresAt && latest.expiresAt <= new Date())
      ) {
        return {
          allowed: false,
          reason: 'consent_expired',
          doctorPartnerId: doctor.id,
          consentId: latest.id,
        };
      }
      return { allowed: false, reason: 'consent_missing_or_inactive', doctorPartnerId: doctor.id };
    }
    if (consent.status === ConsentGrantStatus.REVOKED) {
      return { allowed: false, reason: 'consent_revoked', doctorPartnerId: doctor.id, consentId: consent.id };
    }
    if (consent.status === ConsentGrantStatus.EXPIRED) {
      return { allowed: false, reason: 'consent_expired', doctorPartnerId: doctor.id, consentId: consent.id };
    }
    if (consent.expiresAt && consent.expiresAt <= new Date()) {
      return { allowed: false, reason: 'consent_expired', doctorPartnerId: doctor.id, consentId: consent.id };
    }
    if (consent.countryId !== input.countryId) {
      return { allowed: false, reason: 'country_mismatch', doctorPartnerId: doctor.id, consentId: consent.id };
    }
    if (input.organizationId && consent.organizationId && consent.organizationId !== input.organizationId) {
      return { allowed: false, reason: 'organization_mismatch', doctorPartnerId: doctor.id, consentId: consent.id };
    }
    if (
      input.requireArtifactScope &&
      !consentScopeIncludes(consent.scope, input.requireArtifactScope)
    ) {
      return { allowed: false, reason: 'scope_mismatch', doctorPartnerId: doctor.id, consentId: consent.id };
    }
    if (input.purpose === 'break_glass') {
      const breakGlassDenied = await this.evaluateBreakGlassGrant(consent, doctor.id);
      if (breakGlassDenied) {
        return breakGlassDenied;
      }
    }
    return {
      allowed: true,
      reason: 'allowed',
      doctorPartnerId: doctor.id,
      organizationId: consent.organizationId,
      consentId: consent.id,
      consentScope: parseConsentScope(consent.scope),
    };
  }

  static artifactReadDenialMessage(reason: string) {
    return artifactReadDenialMessage(reason);
  }

  private async evaluateBreakGlassGrant(
    consent: { id: string; breakGlassGrantId: string | null; countryId: string },
    doctorPartnerId: string,
  ): Promise<ArtifactReadDecision | null> {
    if (!consent.breakGlassGrantId) {
      return {
        allowed: false,
        reason: 'break_glass_missing',
        doctorPartnerId,
        consentId: consent.id,
      };
    }
    const grant = await this.prisma.runWithTenant(
      workerTenantContext({ countryId: consent.countryId }),
      () =>
        this.prisma.breakGlassGrant.findUnique({
          where: { id: consent.breakGlassGrantId! },
        }),
      { fresh: true },
    );
    if (!grant || grant.kind !== BreakGlassGrantKind.HEALTH_CLINICAL) {
      return {
        allowed: false,
        reason: 'break_glass_missing',
        doctorPartnerId,
        consentId: consent.id,
      };
    }
    if (grant.revokedAt || grant.reviewStatus === BreakGlassReviewStatus.CLOSED) {
      return {
        allowed: false,
        reason: 'break_glass_revoked',
        doctorPartnerId,
        consentId: consent.id,
      };
    }
    if (grant.expiresAt <= new Date()) {
      return {
        allowed: false,
        reason: 'break_glass_expired',
        doctorPartnerId,
        consentId: consent.id,
      };
    }
    return null;
  }

  async evaluateVideoJoin(input: {
    actorId: string;
    audience: string;
    patientPersonId: string;
    doctorPartnerId: string;
    countryCode: string;
    requestId?: string;
  }): Promise<{ allowed: boolean; reason: string }> {
    if (input.audience === 'admin') {
      return { allowed: false, reason: 'admin_has_no_participant_token' };
    }
    if (input.audience !== 'customer' && input.audience !== 'doctor') {
      return { allowed: false, reason: 'audience_denied' };
    }
    if (input.audience === 'customer' && input.actorId !== input.patientPersonId) {
      return { allowed: false, reason: 'not_appointment_customer' };
    }
    const doctor = await this.prisma.partner.findUnique({ where: { id: input.doctorPartnerId } });
    if (!doctor || doctor.partnerTypeCode !== 'DOCTOR') {
      return { allowed: false, reason: 'doctor_not_found' };
    }
    if (input.audience === 'doctor') {
      const own = await this.prisma.partner.findFirst({
        where: { personId: input.actorId, partnerTypeCode: 'DOCTOR', id: doctor.id },
      });
      if (!own) {
        return { allowed: false, reason: 'not_appointment_doctor' };
      }
    }
    const resolved = await this.policy.resolvePublished(input.countryCode);
    if (!this.policy.isTelemedicineEligible(resolved?.document ?? null) || !this.policy.areAppointmentsEnabled(resolved?.document ?? null)) {
      return { allowed: false, reason: 'policy_video_disabled' };
    }
    const relationship = await this.prisma.clinicalRelationship.findFirst({
      where: {
        doctorPartnerId: doctor.id,
        patientPersonId: input.patientPersonId,
        status: ClinicalRelationshipStatus.ACTIVE,
      },
    });
    if (!relationship) {
      return { allowed: false, reason: 'no_relationship' };
    }
    const consultation = await this.consents.activeGrant({
      subjectPersonId: input.patientPersonId,
      recipientPartnerId: doctor.id,
      purpose: 'consultation',
    });
    const tele = await this.consents.activeGrant({
      subjectPersonId: input.patientPersonId,
      recipientPartnerId: doctor.id,
      purpose: 'telemedicine',
    });
    const consent = [consultation, tele].find((row) => row && row.status === ConsentGrantStatus.ACTIVE && !(row.expiresAt && row.expiresAt <= new Date()));
    if (!consent) {
      return { allowed: false, reason: 'consent_missing_or_inactive' };
    }
    return { allowed: true, reason: 'allowed' };
  }

  private async deny(
    input: { actorId: string; countryCode: string; requestId?: string },
    doctorPartnerId: string | null,
    patientPersonId: string,
    reason: string,
  ) {
    await this.audit(input, doctorPartnerId, patientPersonId, false, reason);
    return { allowed: false, reason, doctor_partner_id: doctorPartnerId };
  }

  private async audit(
    input: { actorId: string; countryCode: string; requestId?: string },
    doctorPartnerId: string | null,
    patientPersonId: string,
    allowed: boolean,
    reason: string,
  ) {
    const resolved = await this.policy.resolvePublished(input.countryCode);
    const countryId = resolved?.countryId;
    if (!countryId) {
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      const audit = await tx.clinicalAccessAudit.create({
        data: {
          id: uuidv7(),
          countryId,
          actorPersonId: input.actorId,
          doctorPartnerId,
          patientPersonId,
          purpose: 'evaluate',
          allowed,
          reason,
          requestId: input.requestId,
        },
      });
      await this.outbox.enqueue(tx, {
        type: 'CLINICAL_ACCESS_EVALUATED',
        aggregateType: 'ClinicalAccessAudit',
        aggregateId: audit.id,
        producer: 'clinical',
        countryId,
        payload: { allowed, reason },
        correlationId: input.requestId ?? null,
        actorId: input.actorId,
        occurrenceKey: `eval:${audit.id}`,
      });
    });
  }
}
