import { Inject, Injectable, forwardRef } from '@nestjs/common';
import {
  CredentialReviewStatus,
  PartnerApplicationSource,
  Prisma,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import { SecurityEventsService } from '../identity/security-events.service';
import { MalwareScanner, PrivateObjectStore } from '../partner/object-store';
import { PartnerService } from '../partner/partner.service';
import { PolicyResolver } from '../policy/resolver';
import { maskCredentialNumber } from './mask';
import { ScheduleService } from './schedule.service';

const ALLOWED_CREDENTIAL_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_CREDENTIAL_BYTES = 10 * 1024 * 1024;

@Injectable()
export class DoctorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly partners: PartnerService,
    private readonly policy: PolicyResolver,
    private readonly outbox: OutboxService,
    private readonly events: SecurityEventsService,
    private readonly objects: PrivateObjectStore,
    private readonly scanner: MalwareScanner,
    @Inject(forwardRef(() => ScheduleService))
    private readonly schedule: ScheduleService,
  ) {}

  async startOnboarding(input: { personId: string; countryCode: string; requestId?: string }) {
    const resolved = await this.policy.resolvePublished(input.countryCode);
    if (!this.policy.isDoctorOnboardingEnabled(resolved?.document ?? null)) {
      throw Errors.serviceDisabled('Doctor onboarding is not enabled for this country.');
    }
    const created = await this.partners.createApplication({
      personId: input.personId,
      partnerTypeCode: 'DOCTOR',
      countryCode: input.countryCode,
      source: PartnerApplicationSource.INTERNAL,
      actorId: input.personId,
      requestId: input.requestId,
    });
    await this.events.emit({
      type: 'DOCTOR_PROFILE_CREATED',
      outcome: 'success',
      personId: input.personId,
      requestId: input.requestId,
      metadata: { partner_id: created.partner.id },
    });
    return this.getMe(input.personId);
  }

  async getMe(personId: string) {
    const partner = await this.requireDoctorPartner(personId);
    const country = await this.prisma.country.findUnique({ where: { id: partner.countryId } });
    const profile = await this.prisma.doctorProfile.findUnique({
      where: { partnerId: partner.id },
      include: { credentials: { orderBy: { createdAt: 'desc' } }, serviceLocations: true },
    });
    if (!profile) {
      throw Errors.notFound('Doctor profile not found');
    }
    const memberships = await this.prisma.membership.findMany({
      where: { personId, deletedAt: null },
      include: { role: true, organization: true },
    });
    const availability = await this.schedule.summary(personId);
    return {
      partner_id: partner.id,
      person_id: personId,
      country_id: partner.countryId,
      country_code: country?.isoAlpha2 ?? null,
      partner_status: partner.status,
      public_visibility: this.policy.isDoctorPubliclyVisible(
        (await this.documentForCountry(partner.countryId))?.document ?? null,
      ),
      profile: {
        display_name: profile.displayName,
        professional_name: profile.professionalName,
        gender: profile.gender,
        languages: profile.languages,
        specialties: profile.specialties,
        bio: profile.bio,
        years_experience: profile.yearsExperience,
        timezone: profile.timezone,
        consultation_config: profile.consultationConfig,
        online_capable: profile.onlineCapable,
      },
      credentials: profile.credentials.map((row) => this.presentCredential(row)),
      organizations: memberships
        .filter((row) => row.organizationId)
        .map((row) => ({
          membership_id: row.id,
          organization_id: row.organizationId,
          organization_name: row.organization?.displayName,
          organization_kind: row.organization?.kind,
          role: row.role.code,
          status: row.status,
          starts_at: row.startsAt,
          ends_at: row.endsAt,
        })),
      availability,
      settings: { notifications_placeholder: true, security: 'identity-kernel' },
    };
  }

  async updateProfile(
    personId: string,
    patch: {
      display_name?: string;
      professional_name?: string;
      gender?: string | null;
      languages?: string[];
      specialties?: string[];
      bio?: string | null;
      years_experience?: number | null;
      timezone?: string;
      consultation_config?: Record<string, unknown>;
      online_capable?: boolean;
    },
    requestId?: string,
  ) {
    const partner = await this.requireDoctorPartner(personId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.doctorProfile.update({
        where: { partnerId: partner.id },
        data: {
          displayName: patch.display_name,
          professionalName: patch.professional_name,
          gender: patch.gender,
          languages: patch.languages as Prisma.InputJsonValue | undefined,
          specialties: patch.specialties as Prisma.InputJsonValue | undefined,
          bio: patch.bio,
          yearsExperience: patch.years_experience,
          timezone: patch.timezone,
          consultationConfig: patch.consultation_config as Prisma.InputJsonValue | undefined,
          onlineCapable: patch.online_capable,
        },
      });
      await this.outbox.enqueue(tx, {
        type: 'DOCTOR_PROFILE_UPDATED',
        aggregateType: 'DoctorProfile',
        aggregateId: partner.id,
        producer: 'clinical',
        countryId: partner.countryId,
        payload: { partner_id: partner.id },
        correlationId: requestId ?? null,
        actorId: personId,
        occurrenceKey: `updated:${profile.updatedAt.toISOString()}`,
      });
      return profile;
    });
    await this.events.emit({
      type: 'DOCTOR_PROFILE_UPDATED',
      outcome: 'success',
      personId,
      requestId,
      metadata: { partner_id: partner.id },
    });
    return { partner_id: partner.id, display_name: updated.displayName };
  }

  async submitCredential(input: {
    personId: string;
    credentialType: string;
    issuer: string;
    number: string;
    issuedOn?: string;
    expiresOn?: string;
    bytes?: Buffer;
    contentType?: string;
    requestId?: string;
  }) {
    const partner = await this.requireDoctorPartner(input.personId);
    const profile = await this.prisma.doctorProfile.findUnique({ where: { partnerId: partner.id } });
    if (!profile) {
      throw Errors.notFound('Doctor profile not found');
    }
    if (!input.credentialType.trim() || !input.issuer.trim() || !input.number.trim()) {
      throw Errors.validation('credential_type, issuer and number are required');
    }
    let objectKey: string | undefined;
    if (input.bytes) {
      if (!input.contentType || !ALLOWED_CREDENTIAL_TYPES.has(input.contentType)) {
        throw Errors.validation('Unsupported credential document type');
      }
      if (input.bytes.length > MAX_CREDENTIAL_BYTES) {
        throw Errors.validation('Credential document is too large');
      }
      const scan = await this.scanner.scan(input.bytes, input.contentType);
      if (!scan.clean) {
        throw Errors.forbidden('Document failed malware scan');
      }
      const stored = await this.objects.put({
        bytes: input.bytes,
        contentType: input.contentType,
        prefix: `doctor-credentials/${partner.id}`,
      });
      objectKey = stored.key;
    }
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const credential = await tx.doctorCredential.create({
          data: {
            id: uuidv7(),
            partnerId: partner.id,
            profileId: profile.id,
            countryId: partner.countryId,
            credentialType: input.credentialType.trim(),
            issuer: input.issuer.trim(),
            number: input.number.trim(),
            issuedOn: input.issuedOn ? new Date(input.issuedOn) : null,
            expiresOn: input.expiresOn ? new Date(input.expiresOn) : null,
            status: CredentialReviewStatus.SUBMITTED,
            objectKey,
          },
        });
        await this.outbox.enqueue(tx, {
          type: 'DOCTOR_CREDENTIAL_SUBMITTED',
          aggregateType: 'DoctorCredential',
          aggregateId: credential.id,
          producer: 'clinical',
          countryId: partner.countryId,
          payload: {
            partner_id: partner.id,
            credential_id: credential.id,
            credential_type: credential.credentialType,
          },
          correlationId: input.requestId ?? null,
          actorId: input.personId,
          occurrenceKey: `submitted:${credential.id}`,
        });
        return credential;
      });
      await this.events.emit({
        type: 'DOCTOR_CREDENTIAL_SUBMITTED',
        outcome: 'success',
        personId: input.personId,
        requestId: input.requestId,
        metadata: { credential_id: created.id, credential_type: created.credentialType },
      });
      return this.presentCredential(created);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw Errors.conflict('This credential is already recorded for the doctor');
      }
      throw error;
    }
  }

  async listAdminDoctors() {
    const rows = await this.prisma.partner.findMany({
      where: { partnerTypeCode: 'DOCTOR' },
      include: {
        doctorProfile: true,
        applications: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      doctors: rows.map((row) => ({
        partner_id: row.id,
        person_id: row.personId,
        country_id: row.countryId,
        status: row.status,
        display_name: row.doctorProfile?.displayName ?? '',
        application_id: row.applications[0]?.id,
        application_status: row.applications[0]?.status,
      })),
    };
  }

  async getAdminDoctor(partnerId: string) {
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      include: {
        doctorProfile: { include: { credentials: true } },
        applications: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!partner || partner.partnerTypeCode !== 'DOCTOR') {
      throw Errors.notFound('Doctor partner not found');
    }
    const reviews = await this.prisma.doctorVerificationReview.findMany({
      where: { partnerId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      partner_id: partner.id,
      person_id: partner.personId,
      status: partner.status,
      profile: partner.doctorProfile
        ? {
            display_name: partner.doctorProfile.displayName,
            professional_name: partner.doctorProfile.professionalName,
            specialties: partner.doctorProfile.specialties,
            timezone: partner.doctorProfile.timezone,
          }
        : null,
      credentials: (partner.doctorProfile?.credentials ?? []).map((row) => this.presentCredential(row)),
      applications: partner.applications.map((row) => ({
        id: row.id,
        status: row.status,
        source: row.source,
      })),
      reviews: reviews.map((row) => ({
        id: row.id,
        action: row.action,
        notes: row.notes,
        created_at: row.createdAt,
      })),
      kyc_separated: true,
    };
  }

  async reviewCredential(input: {
    actorId: string;
    partnerId: string;
    credentialId: string;
    status: CredentialReviewStatus;
    note?: string;
    requestId?: string;
  }) {
    const allowed: CredentialReviewStatus[] = [
      CredentialReviewStatus.UNDER_REVIEW,
      CredentialReviewStatus.ADDITIONAL_INFORMATION_REQUIRED,
      CredentialReviewStatus.VERIFIED,
      CredentialReviewStatus.REJECTED,
    ];
    if (!allowed.includes(input.status)) {
      throw Errors.validation('Invalid credential review status');
    }
    const credential = await this.prisma.doctorCredential.findUnique({ where: { id: input.credentialId } });
    if (!credential || credential.partnerId !== input.partnerId) {
      throw Errors.notFound('Credential not found');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.doctorCredential.update({
        where: { id: credential.id },
        data: { status: input.status, reviewNote: input.note },
      });
      await tx.doctorVerificationReview.create({
        data: {
          id: uuidv7(),
          partnerId: input.partnerId,
          actorPersonId: input.actorId,
          action: `credential:${input.status}`,
          notes: input.note,
        },
      });
      await this.outbox.enqueue(tx, {
        type: 'DOCTOR_CREDENTIAL_REVIEWED',
        aggregateType: 'DoctorCredential',
        aggregateId: credential.id,
        producer: 'clinical',
        countryId: credential.countryId,
        payload: { credential_id: credential.id, status: input.status },
        correlationId: input.requestId ?? null,
        actorId: input.actorId,
        occurrenceKey: `reviewed:${credential.id}:${input.status}`,
      });
      return row;
    });
    await this.events.emit({
      type: 'DOCTOR_CREDENTIAL_REVIEWED',
      outcome: 'success',
      personId: input.actorId,
      requestId: input.requestId,
      metadata: { credential_id: credential.id, status: input.status },
    });
    return this.presentCredential(updated);
  }

  async addVerificationNote(input: {
    actorId: string;
    partnerId: string;
    action: string;
    notes?: string;
    applicationId?: string;
  }) {
    const partner = await this.prisma.partner.findUnique({ where: { id: input.partnerId } });
    if (!partner || partner.partnerTypeCode !== 'DOCTOR') {
      throw Errors.notFound('Doctor partner not found');
    }
    return this.prisma.doctorVerificationReview.create({
      data: {
        id: uuidv7(),
        partnerId: partner.id,
        applicationId: input.applicationId,
        actorPersonId: input.actorId,
        action: input.action,
        notes: input.notes,
      },
    });
  }

  presentCredential(row: {
    id: string;
    credentialType: string;
    issuer: string;
    number: string;
    issuedOn: Date | null;
    expiresOn: Date | null;
    status: CredentialReviewStatus;
    objectKey: string | null;
  }) {
    return {
      id: row.id,
      credential_type: row.credentialType,
      issuer: row.issuer,
      number_masked: maskCredentialNumber(row.number),
      issued_on: row.issuedOn,
      expires_on: row.expiresOn,
      status: row.status,
      has_document: Boolean(row.objectKey),
    };
  }

  private async documentForCountry(countryId: string) {
    const country = await this.prisma.country.findUnique({ where: { id: countryId } });
    if (!country) {
      return null;
    }
    return this.policy.resolvePublished(country.isoAlpha2);
  }

  async listHealthPatients(input: { doctorPersonId: string; countryCode: string }) {
    const partner = await this.requireDoctorPartner(input.doctorPersonId);
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: input.countryCode.trim().toUpperCase() },
    });
    if (!country) {
      throw Errors.notFound('Country not found');
    }
    if (partner.countryId !== country.id) {
      throw Errors.forbidden('Doctor is not registered in this country.');
    }
    const relationships = await this.prisma.clinicalRelationship.findMany({
      where: {
        doctorPartnerId: partner.id,
        countryId: country.id,
        status: 'ACTIVE',
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      patients: relationships.map((row) => ({
        patient_person_id: row.patientPersonId,
        relationship_id: row.id,
        kind: row.kind,
        status: row.status,
        organization_id: row.organizationId,
      })),
    };
  }

  async requireDoctorPartner(personId: string) {
    const partner = await this.prisma.partner.findFirst({
      where: { personId, partnerTypeCode: 'DOCTOR' },
    });
    if (!partner) {
      throw Errors.notFound('Doctor partner not found');
    }
    return partner;
  }
}
