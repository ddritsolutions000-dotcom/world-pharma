import { Injectable } from '@nestjs/common';
import {
  LocationKind,
  OrganizationKind,
  OrganizationStatus,
  PartnerApplicationSource,
  PartnerStatus,
  Prisma,
  KycCaseStatus,
} from '@prisma/client';
import { uuidv7, sanitizeApplicationFields } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import { SecurityEventsService } from '../identity/security-events.service';
import { PolicyResolver } from '../policy/resolver';
import { assertPartnerTransition } from './state-machine';
import { OrganizationService } from './organization.service';
import { KycService } from './kyc.service';
import { VendorActivationReadinessService } from './vendor-activation-readiness.service';
import { missingRequiredDocuments } from './join-document-rules';
import { canTransitionKyc } from './kyc-state';

const SUBMIT_PATH: Partial<Record<PartnerStatus, PartnerStatus[]>> = {
  [PartnerStatus.DRAFT]: [PartnerStatus.REGISTERED, PartnerStatus.DOCUMENTS_REQUIRED, PartnerStatus.DOCUMENTS_SUBMITTED],
  [PartnerStatus.REGISTERED]: [PartnerStatus.DOCUMENTS_REQUIRED, PartnerStatus.DOCUMENTS_SUBMITTED],
  [PartnerStatus.DOCUMENTS_REQUIRED]: [PartnerStatus.DOCUMENTS_SUBMITTED],
  [PartnerStatus.ADDITIONAL_INFORMATION_REQUIRED]: [PartnerStatus.DOCUMENTS_SUBMITTED],
};

const ACTIVATION_ROLES: Record<string, string> = {
  PHARMACY: 'org_operations',
  DELIVERY_PARTNER: 'org_staff',
  VENDOR: 'org_admin',
  DOCTOR: 'independent_doctor',
  LAB: 'org_admin',
  IMAGING_CENTER: 'org_admin',
  PHLEBOTOMIST: 'org_staff',
  PATHOLOGIST: 'org_staff',
  RADIOLOGIST: 'org_staff',
  AFFILIATE: 'org_owner',
};

export interface CreatePartnerInput {
  personId: string;
  partnerTypeCode: string;
  countryCode: string;
  source: PartnerApplicationSource;
  actorId: string;
  requestId?: string;
}

@Injectable()
export class PartnerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyResolver,
    private readonly events: SecurityEventsService,
    private readonly outbox: OutboxService,
    private readonly orgs: OrganizationService,
    private readonly kyc: KycService,
    private readonly readiness: VendorActivationReadinessService,
  ) {}

  async createApplication(input: CreatePartnerInput) {
    const type = await this.prisma.partnerType.findUnique({
      where: { code: input.partnerTypeCode },
    });
    if (!type) {
      throw Errors.validation('Unknown partner type');
    }
    const resolved = await this.policy.resolvePublished(input.countryCode);
    if (!resolved) {
      throw Errors.validation('Country has no published policy pack');
    }
    if (input.source === 'PUBLIC') {
      if (!this.policy.canPartnerJoinPublic(resolved.document, input.partnerTypeCode)) {
        throw Errors.forbidden('Public Join is not available for this partner type.');
      }
    }

    const existing = await this.prisma.partner.findUnique({
      where: {
        personId_partnerTypeCode_countryId: {
          personId: input.personId,
          partnerTypeCode: input.partnerTypeCode,
          countryId: resolved.countryId,
        },
      },
    });
    if (existing) {
      throw Errors.validation('A partner of this type already exists in this country');
    }

    const partnerId = uuidv7();
    const applicationId = uuidv7();
    const created = await this.prisma.$transaction(async (tx) => {
      const partner = await tx.partner.create({
        data: {
          id: partnerId,
          personId: input.personId,
          partnerTypeCode: input.partnerTypeCode,
          countryId: resolved.countryId,
          status: PartnerStatus.DRAFT,
        },
      });
      const application = await tx.partnerApplication.create({
        data: {
          id: applicationId,
          partnerId: partner.id,
          partnerTypeCode: input.partnerTypeCode,
          countryId: resolved.countryId,
          source: input.source,
          status: PartnerStatus.DRAFT,
          packVersion: resolved.version,
        },
      });
      await tx.partnerStatusHistory.create({
        data: {
          id: uuidv7(),
          applicationId: application.id,
          partnerId: partner.id,
          fromStatus: null,
          toStatus: PartnerStatus.DRAFT,
          actorId: input.actorId,
          requestId: input.requestId,
          reason: 'created',
        },
      });
      await this.outbox.enqueue(tx, {
        type: 'PARTNER_CREATED',
        aggregateType: 'Partner',
        aggregateId: partner.id,
        producer: 'partner',
        countryId: partner.countryId,
        payload: {
          partner_id: partner.id,
          partner_type_code: input.partnerTypeCode,
          application_id: application.id,
        },
        correlationId: input.requestId ?? null,
        actorId: input.actorId,
        occurrenceKey: 'created',
      });
      if (input.partnerTypeCode === 'DOCTOR') {
        await tx.doctorProfile.create({
          data: {
            id: uuidv7(),
            partnerId: partner.id,
            personId: partner.personId,
            countryId: partner.countryId,
          },
        });
        await this.outbox.enqueue(tx, {
          type: 'DOCTOR_PROFILE_CREATED',
          aggregateType: 'DoctorProfile',
          aggregateId: partner.id,
          producer: 'clinical',
          countryId: partner.countryId,
          payload: { partner_id: partner.id, person_id: partner.personId },
          correlationId: input.requestId ?? null,
          actorId: input.actorId,
          occurrenceKey: 'doctor-profile-created',
        });
      }
      return { partner, application };
    });

    await this.events.emit({
      type: 'PARTNER_CREATED',
      outcome: 'success',
      personId: input.actorId,
      requestId: input.requestId,
      metadata: { partner_id: partnerId, type: input.partnerTypeCode },
    });
    await this.events.emit({
      type: 'PARTNER_APPLICATION_CREATED',
      outcome: 'success',
      personId: input.actorId,
      requestId: input.requestId,
      metadata: { application_id: applicationId },
    });
    return created;
  }

  async transition(input: {
    applicationId: string;
    to: PartnerStatus;
    actorId: string;
    reason: string;
    requestId?: string;
    requested_fields?: string[];
  }) {
    const application = await this.prisma.partnerApplication.findUnique({
      where: { id: input.applicationId },
      include: { partner: true },
    });
    if (!application) {
      throw Errors.notFound('Application not found');
    }
    assertPartnerTransition(application.status, input.to);
    if (input.to === PartnerStatus.ACTIVE) {
      const country = await this.prisma.country.findUnique({
        where: { id: application.countryId },
      });
      const pack = country ? await this.policy.resolvePublished(country.isoAlpha2) : null;
      if (!pack || !this.policy.isPartnerTypeEnabled(pack.document, application.partnerTypeCode)) {
        throw Errors.forbidden('Partner type is not enabled for this country');
      }
      await this.assertRequiredDocuments(application, 'activate');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const nextApp = await tx.partnerApplication.update({
        where: { id: application.id },
        data: {
          status: input.to,
          submittedAt:
            input.to === PartnerStatus.DOCUMENTS_SUBMITTED ? new Date() : application.submittedAt,
          reviewedAt:
            input.to === PartnerStatus.UNDER_REVIEW ? new Date() : application.reviewedAt,
          approvedAt: input.to === PartnerStatus.APPROVED ? new Date() : application.approvedAt,
          rejectedAt: input.to === PartnerStatus.REJECTED ? new Date() : application.rejectedAt,
          rejectionReason:
            input.to === PartnerStatus.REJECTED ? input.reason : application.rejectionReason,
          infoRequest:
            input.to === PartnerStatus.ADDITIONAL_INFORMATION_REQUIRED
              ? input.reason
              : application.infoRequest,
          requestedFields:
            input.to === PartnerStatus.ADDITIONAL_INFORMATION_REQUIRED
              ? (input.requested_fields ?? [])
              : (application.requestedFields as Prisma.InputJsonValue),
        },
      });
      const partnerUpdate: Prisma.PartnerUpdateInput = { status: input.to };
      if (input.to === PartnerStatus.ACTIVE) {
        partnerUpdate.activatedAt = new Date();
      }
      if (input.to === PartnerStatus.SUSPENDED) {
        partnerUpdate.suspendedAt = new Date();
      }
      if (input.to === PartnerStatus.DEACTIVATED) {
        partnerUpdate.deactivatedAt = new Date();
      }
      await tx.partner.update({
        where: { id: application.partnerId },
        data: partnerUpdate,
      });
      await tx.partnerStatusHistory.create({
        data: {
          id: uuidv7(),
          applicationId: application.id,
          partnerId: application.partnerId,
          fromStatus: application.status,
          toStatus: input.to,
          actorId: input.actorId,
          reason: input.reason,
          requestId: input.requestId,
        },
      });
      await this.outbox.enqueue(tx, {
        type: 'PARTNER_STATUS_CHANGED',
        aggregateType: 'Partner',
        aggregateId: application.partnerId,
        producer: 'partner',
        countryId: application.countryId,
        payload: {
          partner_id: application.partnerId,
          application_id: application.id,
          person_id: application.partner.personId,
          from: application.status,
          to: input.to,
          country_code:
            (
              await tx.country.findUnique({
                where: { id: application.countryId },
                select: { isoAlpha2: true },
              })
            )?.isoAlpha2 ?? null,
          partner_type_code: application.partnerTypeCode,
        },
        correlationId: input.requestId ?? null,
        actorId: input.actorId,
        occurrenceKey: `${application.status}:${input.to}:${Date.now()}`,
      });
      return nextApp;
    });

    await this.events.emit({
      type:
        input.to === PartnerStatus.DOCUMENTS_SUBMITTED
          ? 'PARTNER_APPLICATION_SUBMITTED'
          : 'PARTNER_STATUS_CHANGED',
      outcome: 'success',
      personId: input.actorId,
      requestId: input.requestId,
      metadata: { application_id: application.id, from: application.status, to: input.to },
    });
    return updated;
  }

  async listApplicationsForPerson(personId: string) {
    const rows = await this.prisma.partnerApplication.findMany({
      where: { partner: { personId } },
      orderBy: { createdAt: 'desc' },
      include: { partner: { select: { id: true, status: true, partnerTypeCode: true } } },
    });
    return rows.map((row) => this.presentApplication(row));
  }

  async getApplicationForPerson(personId: string, applicationId: string) {
    const row = await this.prisma.partnerApplication.findFirst({
      where: { id: applicationId, partner: { personId } },
      include: {
        partner: { select: { id: true, status: true, partnerTypeCode: true, organizationId: true } },
        history: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!row) {
      throw Errors.notFound('Application not found');
    }
    return this.presentApplication(row);
  }

  async submitApplication(personId: string, applicationId: string) {
    const application = await this.prisma.partnerApplication.findFirst({
      where: { id: applicationId, partner: { personId } },
      include: { partner: true },
    });
    if (!application) {
      throw Errors.notFound('Application not found');
    }
    if (application.status === PartnerStatus.DOCUMENTS_SUBMITTED) {
      return this.getApplicationForPerson(personId, applicationId);
    }
    await this.assertRequiredDocuments(application, 'submit');
    await this.assertRequiredFields(application);
    const steps = SUBMIT_PATH[application.status];
    if (!steps?.length) {
      throw Errors.validation('Application cannot be submitted from current status');
    }
    for (const to of steps) {
      await this.transition({
        applicationId,
        to,
        actorId: personId,
        reason: 'applicant_submit',
      });
    }
    await this.syncKycCaseSubmitted(application.partnerId, personId);
    return this.getApplicationForPerson(personId, applicationId);
  }

  async listApplicationsForReview(filters: { status?: PartnerStatus; countryCode?: string }) {
    const countryId = filters.countryCode
      ? (await this.prisma.country.findUnique({ where: { isoAlpha2: filters.countryCode } }))?.id
      : undefined;
    const rows = await this.prisma.partnerApplication.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(countryId ? { countryId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: {
        partner: {
          select: {
            id: true,
            personId: true,
            partnerTypeCode: true,
            organizationId: true,
            status: true,
          },
        },
      },
    });
    return { data: rows.map((row) => this.presentApplication(row)) };
  }

  async getApplicationForReview(applicationId: string) {
    const row = await this.prisma.partnerApplication.findUnique({
      where: { id: applicationId },
      include: {
        partner: true,
        history: { orderBy: { createdAt: 'desc' }, take: 50 },
        kycCases: { select: { id: true, status: true, createdAt: true } },
      },
    });
    if (!row) {
      throw Errors.notFound('Application not found');
    }
    return this.presentApplication(row);
  }

  async provisionOrganizationFromApplication(input: { applicationId: string; actorId: string }) {
    const application = await this.prisma.partnerApplication.findUnique({
      where: { id: input.applicationId },
      include: { partner: true },
    });
    if (!application) {
      throw Errors.notFound('Application not found');
    }
    if (
      application.status !== PartnerStatus.APPROVED &&
      application.status !== PartnerStatus.VERIFIED
    ) {
      throw Errors.validation('Application must be approved before provisioning a seller organization');
    }
    if (application.partner.organizationId) {
      throw Errors.validation('Application already has a linked seller organization');
    }
    const country = await this.prisma.country.findUnique({ where: { id: application.countryId } });
    if (!country) {
      throw Errors.validation('Application country is missing');
    }
    const fields =
      application.applicationFields && typeof application.applicationFields === 'object'
        ? (application.applicationFields as Record<string, string>)
        : {};
    const legalName = fields.legal_name?.trim() || fields.display_name?.trim() || 'Vendor seller';
    const displayName = fields.display_name?.trim() || legalName;
    const org = await this.orgs.create({
      countryCode: country.isoAlpha2,
      kind: OrganizationKind.VENDOR,
      legalName,
      displayName,
      actorId: input.actorId,
    });
    await this.prisma.organization.update({
      where: { id: org.id },
      data: { status: OrganizationStatus.ACTIVE },
    });
    const location = await this.orgs.createLocation({
      organizationId: org.id,
      kind: LocationKind.VENDOR_WAREHOUSE,
      name: `${displayName} warehouse`,
      actorId: input.actorId,
      city: undefined,
      addressLine: fields.business_address,
    });
    const roleCode = ACTIVATION_ROLES[application.partnerTypeCode] ?? 'org_admin';
    await this.linkPartnerOrg({
      application,
      organizationId: org.id,
      locationId: location.id,
      roleCode,
      actorId: input.actorId,
    });
    await this.events.emit({
      type: 'ORGANIZATION_CREATED',
      outcome: 'success',
      personId: input.actorId,
      metadata: {
        application_id: application.id,
        organization_id: org.id,
        location_id: location.id,
        provisioned_from_application: true,
      },
    });
    return {
      organization_id: org.id,
      location_id: location.id,
      application: await this.getApplicationForReview(application.id),
      readiness: await this.readiness.evaluateByApplicationId(application.id),
    };
  }

  async activateApplication(input: {
    applicationId: string;
    organizationId?: string;
    locationId?: string;
    roleCode?: string;
    actorId: string;
    skipReadinessGate?: boolean;
  }) {
    const application = await this.prisma.partnerApplication.findUnique({
      where: { id: input.applicationId },
      include: { partner: true },
    });
    if (!application) {
      throw Errors.notFound('Application not found');
    }
    if (
      application.status !== PartnerStatus.APPROVED &&
      application.status !== PartnerStatus.VERIFIED
    ) {
      throw Errors.validation('Application must be approved before activation');
    }
    const organizationId = input.organizationId ?? application.partner.organizationId ?? undefined;
    if (!organizationId) {
      throw Errors.validation('organization_id is required — provision a seller organization first');
    }
    if (!input.skipReadinessGate && application.partnerTypeCode === 'VENDOR') {
      const readiness = await this.readiness.evaluateByApplicationId(application.id);
      if (!readiness.ready_for_activation) {
        throw Errors.validation(
          readiness.next_actions.length
            ? `Not ready for activation: ${readiness.next_actions.join('; ')}`
            : 'Application is not ready for activation',
        );
      }
    }
    const roleCode =
      input.roleCode ??
      ACTIVATION_ROLES[application.partnerTypeCode] ??
      'org_staff';
    if (roleCode.startsWith('company_') || roleCode.includes('super_admin')) {
      throw Errors.forbidden('Partner activation cannot grant company roles');
    }
    if (application.partner.organizationId !== organizationId) {
      await this.linkPartnerOrg({
        application,
        organizationId,
        locationId: input.locationId,
        roleCode,
        actorId: input.actorId,
      });
    } else {
      const existingMembership = await this.prisma.membership.findFirst({
        where: {
          personId: application.partner.personId,
          organizationId,
          deletedAt: null,
          status: 'ACTIVE',
        },
      });
      if (!existingMembership) {
        await this.orgs.addMember({
          organizationId,
          personId: application.partner.personId,
          roleCode,
          locationId: input.locationId,
          actorId: input.actorId,
        });
      }
    }
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { status: OrganizationStatus.ACTIVE },
    });
    const updated = await this.transition({
      applicationId: input.applicationId,
      to: PartnerStatus.ACTIVE,
      actorId: input.actorId,
      reason: 'activated',
    });
    await this.events.emit({
      type: 'PARTNER_STATUS_CHANGED',
      outcome: 'success',
      personId: input.actorId,
      metadata: {
        application_id: application.id,
        organization_id: organizationId,
        location_id: input.locationId ?? null,
        role_code: roleCode,
        activated: true,
      },
    });
    return {
      ...this.presentApplication(updated),
      readiness: await this.readiness.evaluateByApplicationId(application.id),
    };
  }

  private async linkPartnerOrg(input: {
    application: Prisma.PartnerApplicationGetPayload<{ include: { partner: true } }>;
    organizationId: string;
    locationId?: string;
    roleCode: string;
    actorId: string;
  }) {
    await this.prisma.partner.update({
      where: { id: input.application.partnerId },
      data: { organizationId: input.organizationId },
    });
    await this.orgs.addMember({
      organizationId: input.organizationId,
      personId: input.application.partner.personId,
      roleCode: input.roleCode,
      locationId: input.locationId,
      actorId: input.actorId,
    });
  }

  private async syncKycCaseSubmitted(partnerId: string, actorId: string): Promise<void> {
    const kycCase = await this.prisma.kycCase.findFirst({
      where: { partnerId },
      orderBy: { createdAt: 'desc' },
    });
    if (!kycCase) {
      return;
    }
    if (kycCase.status === KycCaseStatus.SUBMITTED || kycCase.status === KycCaseStatus.UNDER_REVIEW) {
      return;
    }
    if (!canTransitionKyc(kycCase.status, KycCaseStatus.SUBMITTED)) {
      return;
    }
    await this.kyc.transition({
      kycCaseId: kycCase.id,
      to: KycCaseStatus.SUBMITTED,
      actorId,
      reason: 'application_submit',
    });
  }

  private async assertRequiredDocuments(
    application: Prisma.PartnerApplicationGetPayload<{ include: { partner: true } }>,
    mode: 'submit' | 'activate',
  ): Promise<void> {
    const country = await this.prisma.country.findUnique({ where: { id: application.countryId } });
    const countryCode = country?.isoAlpha2 ?? 'XX';
    const required = await this.kyc.requiredDocuments(countryCode, application.partnerTypeCode);
    if (!required.length) {
      return;
    }
    const kycCase = await this.prisma.kycCase.findFirst({
      where: { partnerId: application.partnerId },
      orderBy: { createdAt: 'desc' },
    });
    const docs = kycCase
      ? await this.prisma.partnerDocument.findMany({ where: { kycCaseId: kycCase.id } })
      : [];
    const missing = missingRequiredDocuments(required, docs, mode);
    if (missing.length) {
      throw Errors.validation(
        mode === 'activate'
          ? `Required documents must be admin-verified before activation: ${missing.join(', ')}`
          : `Missing required documents: ${missing.join(', ')}`,
      );
    }
  }

  async updateApplicationFields(
    personId: string,
    applicationId: string,
    fields: Record<string, unknown>,
  ) {
    const application = await this.prisma.partnerApplication.findFirst({
      where: { id: applicationId, partner: { personId } },
    });
    if (!application) {
      throw Errors.notFound('Application not found');
    }
    const sanitized = sanitizeApplicationFields(fields);
    const existing =
      application.applicationFields && typeof application.applicationFields === 'object'
        ? (application.applicationFields as Record<string, string>)
        : {};
    const merged = { ...existing, ...sanitized };
    await this.prisma.partnerApplication.update({
      where: { id: applicationId },
      data: { applicationFields: merged },
    });
    return this.getApplicationForPerson(personId, applicationId);
  }

  private async assertRequiredFields(
    application: Prisma.PartnerApplicationGetPayload<{ include: { partner: true } }>,
  ): Promise<void> {
    const country = await this.prisma.country.findUnique({ where: { id: application.countryId } });
    const countryCode = country?.isoAlpha2 ?? 'XX';
    const policyRequired = await this.kyc.requiredFields(countryCode, application.partnerTypeCode);
    const requested = Array.isArray(application.requestedFields)
      ? (application.requestedFields as string[])
      : [];
    const required =
      application.status === PartnerStatus.ADDITIONAL_INFORMATION_REQUIRED && requested.length
        ? requested
        : policyRequired;
    if (!required.length) {
      return;
    }
    const stored =
      application.applicationFields && typeof application.applicationFields === 'object'
        ? (application.applicationFields as Record<string, string>)
        : {};
    const missing = required.filter((code) => !stored[code]?.trim());
    if (missing.length) {
      throw Errors.validation(`Missing required fields: ${missing.join(', ')}`);
    }
  }

  private presentApplication(row: {
    id: string;
    partnerId: string;
    partnerTypeCode: string;
    countryId: string;
    source: PartnerApplicationSource;
    status: PartnerStatus;
    packVersion: number | null;
    rejectionReason: string | null;
    infoRequest: string | null;
    applicationFields?: unknown;
    requestedFields?: unknown;
    submittedAt: Date | null;
    reviewedAt: Date | null;
    approvedAt: Date | null;
    rejectedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    partner?: {
      id: string;
      personId?: string;
      partnerTypeCode?: string;
      organizationId?: string | null;
      status?: PartnerStatus;
    };
    history?: unknown[];
    kycCases?: unknown[];
  }) {
    return {
      id: row.id,
      partner_id: row.partnerId,
      partner_type_code: row.partnerTypeCode,
      country_id: row.countryId,
      source: row.source,
      status: row.status,
      pack_version: row.packVersion,
      rejection_reason: row.rejectionReason,
      info_request: row.infoRequest,
      application_fields:
        row.applicationFields && typeof row.applicationFields === 'object'
          ? row.applicationFields
          : {},
      requested_fields: Array.isArray(row.requestedFields) ? row.requestedFields : [],
      submitted_at: row.submittedAt,
      reviewed_at: row.reviewedAt,
      approved_at: row.approvedAt,
      rejected_at: row.rejectedAt,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      partner: row.partner
        ? {
            id: row.partner.id,
            person_id: row.partner.personId,
            organization_id: row.partner.organizationId ?? null,
            status: row.partner.status,
          }
        : undefined,
      history: row.history,
      kyc_cases: row.kycCases,
    };
  }
}
