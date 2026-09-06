import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import {
  computeLaunchReadiness,
  parsePolicyCommerceSignals,
  type LaunchReadinessResult,
} from './market-readiness';
import { CountryProductionService } from './country-production.service';

import { HEALTHCARE_REQUIREMENT_CODES } from './healthcare-requirement-codes';
import type { HealthcareRequirementCode } from './healthcare-requirement-codes';

export { HEALTHCARE_REQUIREMENT_CODES };
export type { HealthcareRequirementCode };

export type CreateHealthcarePolicyDto = {
  countryCode: string;
  requirements: Array<{
    code: HealthcareRequirementCode | string;
    label: string;
    description?: string;
    required: boolean;
    note?: string;
  }>;
  regulatoryBody?: string;
  effectiveFrom?: string;
};

export type AttachEvidenceDto = {
  countryCode: string;
  requirementCode?: string;
  healthcarePolicyVersion?: number;
  documentType: string;
  issuer?: string;
  referenceNumber?: string;
  issuedAt?: string;
  expiresAt?: string;
  storageObjectKey?: string;
  notes?: string;
};

export type RegisterDependencyDto = {
  countryCode?: string;
  dependencyType: string;
  environment?: string;
  providerIdentifier?: string;
  configReference?: string;
  notes?: string;
};

@Injectable()
export class RegulatoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityEventsService,
    private readonly production: CountryProductionService,
  ) {}

  // ── Healthcare Policy ─────────────────────────────────────────────────────

  async createHealthcarePolicy(principal: Principal, dto: CreateHealthcarePolicyDto) {
    const country = await this.requireCountry(dto.countryCode);

    const latest = await this.prisma.healthcarePolicy.findFirst({
      where: { countryId: country.id },
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version ?? 0) + 1;

    const policy = await this.prisma.healthcarePolicy.create({
      data: {
        id: randomUUID(),
        countryId: country.id,
        version,
        status: 'DRAFT',
        requirements: dto.requirements,
        regulatoryBody: dto.regulatoryBody ?? null,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
        createdById: principal.personId,
      },
    });

    // Also upsert RegulatoryRequirement rows for searchability.
    for (const req of dto.requirements) {
      await this.prisma.regulatoryRequirement.upsert({
        where: { countryId_code: { countryId: country.id, code: req.code } },
        update: { label: req.label, description: req.description ?? null, status: req.required ? 'REQUIRED' : 'NOT_APPLICABLE', updatedAt: new Date() },
        create: {
          id: randomUUID(),
          countryId: country.id,
          code: req.code,
          label: req.label,
          description: req.description ?? null,
          status: req.required ? 'REQUIRED' : 'NOT_APPLICABLE',
          category: 'HEALTHCARE',
          createdById: principal.personId,
        },
      });
    }

    return policy;
  }

  async publishHealthcarePolicy(principal: Principal, countryCode: string, version: number) {
    const country = await this.requireCountry(countryCode);
    const policy = await this.prisma.healthcarePolicy.findUnique({
      where: { countryId_version: { countryId: country.id, version } },
    });
    if (!policy) throw Errors.notFound('Healthcare policy version not found');
    if (policy.status === 'PUBLISHED') return policy;

    // Supersede previous published
    await this.prisma.healthcarePolicy.updateMany({
      where: { countryId: country.id, status: 'PUBLISHED' },
      data: { status: 'SUPERSEDED', supersededAt: new Date() },
    });

    return this.prisma.healthcarePolicy.update({
      where: { id: policy.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        publishedById: principal.personId,
      },
    });
  }

  async getHealthcarePolicy(countryCode: string) {
    const country = await this.requireCountry(countryCode);
    return this.prisma.healthcarePolicy.findFirst({
      where: { countryId: country.id, status: 'PUBLISHED' },
      orderBy: { version: 'desc' },
    });
  }

  async listHealthcarePolicies(countryCode: string) {
    const country = await this.requireCountry(countryCode);
    return this.prisma.healthcarePolicy.findMany({
      where: { countryId: country.id },
      orderBy: { version: 'desc' },
    });
  }

  // ── Regulatory Requirements ───────────────────────────────────────────────

  async listRequirements(countryCode: string) {
    const country = await this.requireCountry(countryCode);
    return this.prisma.regulatoryRequirement.findMany({
      where: { countryId: country.id },
      orderBy: { code: 'asc' },
    });
  }

  // ── Regulatory Evidence ───────────────────────────────────────────────────

  async attachEvidence(principal: Principal, dto: AttachEvidenceDto) {
    const country = await this.requireCountry(dto.countryCode);

    let requirementId: string | null = null;
    if (dto.requirementCode) {
      const req = await this.prisma.regulatoryRequirement.findUnique({
        where: { countryId_code: { countryId: country.id, code: dto.requirementCode } },
      });
      if (!req) throw Errors.notFound('Regulatory requirement not found');
      requirementId = req.id;
    }

    let healthcarePolicyId: string | null = null;
    if (dto.healthcarePolicyVersion !== undefined) {
      const policy = await this.prisma.healthcarePolicy.findUnique({
        where: { countryId_version: { countryId: country.id, version: dto.healthcarePolicyVersion } },
      });
      if (!policy) throw Errors.notFound('Healthcare policy not found');
      healthcarePolicyId = policy.id;
    }

    return this.prisma.regulatoryEvidence.create({
      data: {
        id: randomUUID(),
        countryId: country.id,
        requirementId: requirementId ?? undefined,
        healthcarePolicyId: healthcarePolicyId ?? undefined,
        documentType: dto.documentType,
        status: 'PENDING',
        issuer: dto.issuer ?? null,
        referenceNumber: dto.referenceNumber ?? null,
        issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        storageObjectKey: dto.storageObjectKey ?? null,
        notes: dto.notes ?? null,
        createdById: principal.personId,
      },
    }).then(async (created) => {
      await this.prisma.regulatoryEvidenceEvent.create({
        data: {
          id: randomUUID(),
          evidenceId: created.id,
          countryId: country.id,
          action: 'CREATED',
          fromStatus: null,
          toStatus: 'PENDING',
          actorId: principal.personId,
        },
      });
      return created;
    });
  }

  async verifyEvidence(principal: Principal, evidenceId: string) {
    const ev = await this.prisma.regulatoryEvidence.findUnique({ where: { id: evidenceId } });
    if (!ev) throw Errors.notFound('Regulatory evidence not found');
    if (ev.expiresAt && ev.expiresAt.getTime() <= Date.now()) {
      throw Errors.problem(
        409,
        'LEGAL_EVIDENCE_EXPIRED',
        'Evidence expired',
        'Cannot verify evidence that is already past its expiry date.',
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.regulatoryEvidence.update({
        where: { id: evidenceId },
        data: {
          status: 'VERIFIED',
          verificationStatus: 'VERIFIED',
          verifiedById: principal.personId,
          verifiedAt: new Date(),
        },
      });
      await this.production.recordEvidenceEvent(tx, {
        evidenceId,
        countryId: ev.countryId,
        action: 'VERIFIED',
        fromStatus: ev.status,
        toStatus: 'VERIFIED',
        actorId: principal.personId,
      });
      return row;
    });
    await this.security.emit({
      type: 'REGULATORY_EVIDENCE_VERIFIED',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        evidence_id: evidenceId,
        country_id: ev.countryId,
        previous_state: ev.status,
        new_state: 'VERIFIED',
      },
    });
    return updated;
  }

  async listEvidence(countryCode: string) {
    return this.production.presentEvidenceForAdmin(countryCode);
  }

  // ── Production Dependencies ────────────────────────────────────────────────

  async registerDependency(principal: Principal, dto: RegisterDependencyDto) {
    const countryId = dto.countryCode
      ? (await this.requireCountry(dto.countryCode)).id
      : null;

    return this.prisma.productionDependency.create({
      data: {
        id: randomUUID(),
        countryId: countryId ?? undefined,
        dependencyType: dto.dependencyType,
        environment: dto.environment ?? 'production',
        status: 'MISSING',
        externalGated: true,
        providerIdentifier: dto.providerIdentifier ?? null,
        configReference: dto.configReference ?? null,
        notes: dto.notes ?? null,
        createdById: principal.personId,
      },
    });
  }

  async listDependencies(countryCode?: string) {
    const countryId = countryCode ? (await this.requireCountry(countryCode)).id : undefined;
    return this.prisma.productionDependency.findMany({
      where: countryId ? { countryId } : undefined,
      orderBy: [{ dependencyType: 'asc' }],
    });
  }

  async verifyDependency(principal: Principal, dependencyId: string) {
    const dep = await this.prisma.productionDependency.findUnique({ where: { id: dependencyId } });
    if (!dep) throw Errors.notFound('Production dependency not found');
    const updated = await this.prisma.productionDependency.update({
      where: { id: dependencyId },
      data: {
        status: 'VERIFIED',
        verificationStatus: 'VERIFIED',
        lastVerifiedAt: new Date(),
        externalGated: false,
      },
    });
    await this.security.emit({
      type: 'REGULATORY_EVIDENCE_UPDATED',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        dependency_id: dependencyId,
        dependency_type: dep.dependencyType,
        previous_state: dep.status,
        new_state: 'VERIFIED',
        note: 'Admin-marked dependency verification — does not imply live network credentials',
      },
    });
    return updated;
  }

  // ── Five-dimension launch readiness ──────────────────────────────────────

  async computeCountryLaunchReadiness(countryCode: string): Promise<LaunchReadinessResult> {
    const country = await this.requireCountry(countryCode);

    // Commerce signals
    const publishedPack = await this.prisma.policyPack.findFirst({
      where: { countryId: country.id, status: 'PUBLISHED' },
      orderBy: { version: 'desc' },
    });
    const commerceSignals = publishedPack
      ? parsePolicyCommerceSignals(publishedPack.document)
      : { paymentPolicyConfigured: false, deliveryPolicyConfigured: false, currencyFromPack: null };
    const zones = await this.prisma.serviceabilityZone
      ? await (this.prisma as unknown as { serviceabilityZone: { count: (a: unknown) => Promise<number> } })
          .serviceabilityZone.count({ where: { countryId: country.id, active: true } })
          .catch(() => 0)
      : 0;
    const settlementCount = await this.prisma.settlementPolicy.count({ where: { countryId: country.id } }).catch(() => 0);
    const notifCount = await this.prisma.notificationCountryProvider.count({ where: { countryId: country.id } }).catch(() => 0);

    const commerceInput = {
      countryStatus: country.status as 'ACTIVE' | 'INACTIVE',
      currency: commerceSignals.currencyFromPack ?? country.defaultCurrency,
      hasPublishedPolicyPack: !!publishedPack,
      paymentPolicyConfigured: commerceSignals.paymentPolicyConfigured,
      deliveryPolicyConfigured: commerceSignals.deliveryPolicyConfigured,
      serviceabilityZonesActive: zones,
      notificationProvidersConfigured: notifCount,
      settlementPolicyConfigured: settlementCount > 0,
      livePaymentEnabled: false,
    };

    // Healthcare policy
    const healthcarePolicy = await this.prisma.healthcarePolicy.findFirst({
      where: { countryId: country.id, status: 'PUBLISHED' },
    });

    // Evidence
    const requirements = await this.prisma.regulatoryRequirement.findMany({
      where: { countryId: country.id, status: 'REQUIRED' },
    });
    const now = new Date();
    let allMet = true;
    let anyExpired = false;
    for (const req of requirements) {
      const evidence = await this.prisma.regulatoryEvidence.findFirst({
        where: {
          requirementId: req.id,
          status: 'VERIFIED',
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      });
      if (!evidence) {
        // Check if any expired evidence exists
        const expired = await this.prisma.regulatoryEvidence.findFirst({
          where: { requirementId: req.id, expiresAt: { lte: now } },
        });
        if (expired) anyExpired = true;
        allMet = false;
      }
    }

    // Production dependencies
    const deps = await this.prisma.productionDependency.findMany({
      where: { OR: [{ countryId: country.id }, { countryId: null }] },
    });
    const pspVerified = deps.some((d) => d.dependencyType === 'PAYMENT_PROVIDER' && d.status === 'VERIFIED');
    const otpVerified = deps.some((d) => d.dependencyType === 'OTP_PROVIDER' && d.status === 'VERIFIED');
    const msgVerified = deps.some((d) => d.dependencyType === 'SMS_PROVIDER' && d.status === 'VERIFIED');
    const carrierVerified = deps.some((d) => d.dependencyType === 'CARRIER' && d.status === 'VERIFIED');
    const kycVerified = deps.some((d) => d.dependencyType === 'KYC_PROVIDER' && d.status === 'VERIFIED');

    return computeLaunchReadiness({
      commerce: commerceInput,
      healthcarePolicyPublished: !!healthcarePolicy,
      allRequirementsMet: requirements.length === 0 || allMet,
      anyEvidenceExpired: anyExpired,
      commercialNetworkPresent: false, // Always false until explicitly confirmed — no automated check
      livePspConfigured: pspVerified,
      liveOtpConfigured: otpVerified,
      liveMessagingConfigured: msgVerified,
      liveCarrierConfigured: carrierVerified,
      kycProviderVerified: kycVerified,
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async requireCountry(isoAlpha2: string) {
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: isoAlpha2.trim().toUpperCase() },
    });
    if (!country) throw Errors.notFound('Country not found');
    return country;
  }
}
