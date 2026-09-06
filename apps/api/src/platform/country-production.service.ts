import { Injectable } from '@nestjs/common';
import {
  CountryProductionLifecycle,
  CountryReadinessDimension,
  CountryReadinessGateStatus,
  KycCaseStatus,
  PharmacyLicenceStatus,
  Prisma,
  RegulatoryEvidenceStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { isLivePaymentEnabled, readPaymentEnvironment } from '../payment/payment.config';
import { parsePolicyCommerceSignals } from './market-readiness';
import {
  assertProductionLifecycleTransition,
  type ProductionLifecycleState,
} from './production-lifecycle';
import {
  computeProductionReadiness,
  isEvidenceSatisfying,
  type ProductionReadinessResult,
  type RequirementCoverageRow,
} from './production-readiness';
import { HEALTHCARE_REQUIREMENT_CODES } from './healthcare-requirement-codes';
import { evaluateProductionInfrastructureAvailable } from '../ops/production-infrastructure-gate';
import { readInfrastructureEnvironment } from '../ops/infra-environment';

@Injectable()
export class CountryProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityEventsService,
  ) {}

  async evaluate(countryCode: string): Promise<
    ProductionReadinessResult & {
      country_code: string;
      infrastructure: {
        status: string;
        database: string;
        redis: string;
        storage: string;
        kms_secrets: string;
        malware_scanning: string;
        backups: string;
        observability: string;
        pitr: string;
        note: string;
      };
    }
  > {
    const country = await this.requireCountry(countryCode);
    const now = new Date();

    const publishedPack = await this.prisma.policyPack.findFirst({
      where: { countryId: country.id, status: 'PUBLISHED' },
      orderBy: { version: 'desc' },
    });
    const commerceSignals = publishedPack
      ? parsePolicyCommerceSignals(publishedPack.document)
      : { paymentPolicyConfigured: false, deliveryPolicyConfigured: false, currencyFromPack: null };

    const [zones, settlementCount, notifCount, healthcarePolicy, requirements, deps] =
      await Promise.all([
        this.prisma.serviceabilityZone.count({ where: { countryId: country.id, active: true } }),
        this.prisma.settlementPolicy.count({ where: { countryId: country.id } }),
        this.prisma.notificationCountryProvider.count({ where: { countryId: country.id } }),
        this.prisma.healthcarePolicy.findFirst({
          where: { countryId: country.id, status: 'PUBLISHED' },
        }),
        this.prisma.regulatoryRequirement.findMany({ where: { countryId: country.id } }),
        this.prisma.productionDependency.findMany({
          where: { OR: [{ countryId: country.id }, { countryId: null }], environment: 'production' },
        }),
      ]);

    const mandatoryReqs = requirements.filter((r) => r.status === 'REQUIRED');
    const coverage: RequirementCoverageRow[] = [];
    let allMet = true;
    let anyExpired = false;

    for (const req of mandatoryReqs) {
      const evidenceRows = await this.prisma.regulatoryEvidence.findMany({
        where: { requirementId: req.id },
        orderBy: { createdAt: 'desc' },
      });
      const active = evidenceRows.find((ev) =>
        isEvidenceSatisfying({ status: ev.status, expiresAt: ev.expiresAt, now }),
      );
      const expiredVerified = evidenceRows.find(
        (ev) =>
          ev.status === 'VERIFIED' &&
          ev.expiresAt != null &&
          ev.expiresAt.getTime() <= now.getTime(),
      );
      const rejected = evidenceRows.find((ev) => ev.status === 'REJECTED');

      let blocker: RequirementCoverageRow['blocker'] = null;
      let satisfied = false;
      if (active) {
        satisfied = true;
      } else if (expiredVerified) {
        anyExpired = true;
        allMet = false;
        blocker = 'LEGAL_EVIDENCE_EXPIRED';
      } else if (rejected && evidenceRows.every((ev) => ev.status === 'REJECTED' || ev.status === 'EXPIRED')) {
        allMet = false;
        blocker = 'LEGAL_EVIDENCE_REJECTED';
      } else {
        allMet = false;
        blocker = 'LEGAL_EVIDENCE_MISSING';
      }

      coverage.push({
        code: req.code,
        label: req.label,
        mandatory: true,
        evidence_id: active?.id ?? expiredVerified?.id ?? rejected?.id ?? evidenceRows[0]?.id ?? null,
        evidence_status: active?.status ?? expiredVerified?.status ?? rejected?.status ?? evidenceRows[0]?.status ?? null,
        satisfied,
        expires_at: (active?.expiresAt ?? expiredVerified?.expiresAt)?.toISOString() ?? null,
        blocker,
      });
    }

    // Surface known codes that are not configured yet as NOT_CONFIGURED blockers in coverage.
    for (const code of HEALTHCARE_REQUIREMENT_CODES) {
      if (coverage.some((row) => row.code === code)) continue;
      if (requirements.some((r) => r.code === code && r.status !== 'REQUIRED')) continue;
      // Unconfigured mandatory catalog codes remain visible as not configured / blocked until policy sets them.
      coverage.push({
        code,
        label: code,
        mandatory: false,
        evidence_id: null,
        evidence_status: 'NOT_CONFIGURED',
        satisfied: false,
        expires_at: null,
        blocker: null,
      });
    }

    if (!healthcarePolicy) {
      allMet = false;
    }

    const pharmacyLicenceVerified =
      (await this.prisma.pharmacyLicence.count({
        where: {
          countryId: country.id,
          status: PharmacyLicenceStatus.VERIFIED,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      })) > 0;

    const kycVerified =
      (await this.prisma.kycCase.count({
        where: {
          countryId: country.id,
          status: KycCaseStatus.VERIFIED,
        },
      })) > 0;

    const commercialApprovalPresent =
      (await this.prisma.partnerCommercialApproval.count({
        where: { countryId: country.id, approved: true, revokedAt: null },
      })) > 0;

    const depLive = (type: string) =>
      deps.some((d) => d.dependencyType === type && (d.status === 'VERIFIED' || d.verificationStatus === 'VERIFIED'));

    const result = computeProductionReadiness({
      commerce: {
        countryStatus: country.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
        currency: commerceSignals.currencyFromPack ?? country.defaultCurrency,
        hasPublishedPolicyPack: Boolean(publishedPack),
        paymentPolicyConfigured: commerceSignals.paymentPolicyConfigured,
        deliveryPolicyConfigured: commerceSignals.deliveryPolicyConfigured,
        serviceabilityZonesActive: zones,
        notificationProvidersConfigured: notifCount,
        settlementPolicyConfigured: settlementCount > 0,
        livePaymentEnabled: isLivePaymentEnabled(),
      },
      healthcarePolicyPublished: Boolean(healthcarePolicy),
      allRequirementsMet: mandatoryReqs.length === 0 ? Boolean(healthcarePolicy) : allMet,
      anyEvidenceExpired: anyExpired,
      commercialNetworkPresent: pharmacyLicenceVerified && commercialApprovalPresent,
      livePspConfigured: depLive('PAYMENT_PROVIDER'),
      liveOtpConfigured: depLive('OTP_PROVIDER'),
      liveMessagingConfigured: depLive('SMS_PROVIDER') || depLive('MESSAGING_PROVIDER'),
      liveCarrierConfigured: depLive('CARRIER'),
      kycProviderVerified: depLive('KYC_PROVIDER'),
      pharmacyLicenceVerified,
      kycVerified,
      commercialApprovalPresent,
      requirementCoverage: coverage,
      productionLifecycle: country.productionLifecycle,
    });

    await this.persistGates(country.id, result);

    const infrastructure = evaluateProductionInfrastructureAvailable();
    return {
      ...result,
      country_code: country.isoAlpha2,
      infrastructure: {
        status: infrastructure.status,
        database: infrastructure.database,
        redis: infrastructure.redis,
        storage: infrastructure.storage,
        kms_secrets: infrastructure.kms_secrets,
        malware_scanning: infrastructure.malware_scanning,
        backups: infrastructure.backups,
        observability: infrastructure.observability,
        pitr: infrastructure.pitr,
        note: 'Application compiled ≠ production infrastructure ready.',
      },
    };
  }

  /**
   * Fail closed for production activation. Sandbox CountryStatus activation is unaffected.
   */
  async assertCountryProductionActivatable(countryCode: string): Promise<ProductionReadinessResult> {
    const readiness = await this.evaluate(countryCode);
    if (readiness.production_lifecycle === 'SUSPENDED') {
      throw Errors.problem(
        409,
        'COUNTRY_PRODUCTION_SUSPENDED',
        'Country production suspended',
        'Re-enter UNDER_REVIEW before production activation.',
      );
    }
    if (!readiness.production_ready) {
      throw Errors.problem(
        409,
        'COUNTRY_PRODUCTION_NOT_READY',
        'Country not production-ready',
        readiness.blockers.join(',') || 'Production readiness blockers remain',
      );
    }
    if (readInfrastructureEnvironment() === 'production') {
      const infra = evaluateProductionInfrastructureAvailable();
      if (infra.status !== 'READY' || infra.storage !== 'READY' || infra.malware_scanning !== 'READY') {
        throw Errors.problem(
          409,
          'INFRASTRUCTURE_NOT_PRODUCTION_READY',
          'Production infrastructure unavailable',
          infra.message,
        );
      }
    }
    if (
      readiness.production_lifecycle !== 'READY_FOR_ACTIVATION' &&
      readiness.production_lifecycle !== 'ACTIVE'
    ) {
      throw Errors.problem(
        409,
        'LIFECYCLE_NOT_READY',
        'Lifecycle not ready',
        `Current lifecycle is ${readiness.production_lifecycle}; expected READY_FOR_ACTIVATION`,
      );
    }
    return readiness;
  }

  /**
   * Production-sensitive operations: live payment environment / suspended production.
   * Sandbox (mock) commerce remains usable when production lifecycle is not ACTIVE.
   */
  async assertCountryAllowsProductionTransaction(countryCode: string): Promise<void> {
    const country = await this.requireCountry(countryCode);
    if (country.productionLifecycle === 'SUSPENDED') {
      throw Errors.problem(
        409,
        'COUNTRY_PRODUCTION_SUSPENDED',
        'Country production suspended',
        'New production transactions are blocked for this country.',
      );
    }
    const productionBound =
      readPaymentEnvironment() === 'production' || isLivePaymentEnabled();
    if (!productionBound) {
      return; // sandbox path — do not require production ACTIVE
    }
    if (country.productionLifecycle !== 'ACTIVE') {
      throw Errors.problem(
        409,
        'COUNTRY_PRODUCTION_NOT_ACTIVE',
        'Country production not active',
        'Production transactions require an explicitly activated country.',
      );
    }
  }

  async transitionLifecycle(
    principal: Principal,
    countryCode: string,
    to: ProductionLifecycleState,
    reason?: string,
  ) {
    const country = await this.requireCountry(countryCode);
    const from = country.productionLifecycle as ProductionLifecycleState;
    try {
      assertProductionLifecycleTransition(from, to);
    } catch {
      throw Errors.problem(
        409,
        'INVALID_LIFECYCLE_TRANSITION',
        'Invalid lifecycle transition',
        `${from} → ${to} is not allowed`,
      );
    }
    if (from === to) {
      return this.presentLifecycle(country);
    }

    // READY_FOR_ACTIVATION requires production_ready evaluation
    if (to === 'READY_FOR_ACTIVATION') {
      const readiness = await this.evaluate(country.isoAlpha2);
      if (!readiness.production_ready) {
        throw Errors.problem(
          409,
          'COUNTRY_PRODUCTION_NOT_READY',
          'Country not production-ready',
          readiness.blockers.join(',') || 'Cannot mark READY_FOR_ACTIVATION',
        );
      }
    }

    if (to === 'ACTIVE') {
      return this.activateProduction(principal, country.isoAlpha2, reason);
    }
    if (to === 'SUSPENDED') {
      return this.suspendProduction(principal, country.isoAlpha2, reason ?? 'Suspended by admin');
    }

    const updated = await this.prisma.country.update({
      where: { id: country.id },
      data: { productionLifecycle: to as CountryProductionLifecycle },
    });
    await this.security.emit({
      type: 'COUNTRY_LIFECYCLE_CHANGED',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        country_code: country.isoAlpha2,
        previous_state: from,
        new_state: to,
        reason: reason ?? null,
      },
    });
    return this.presentLifecycle(updated);
  }

  async activateProduction(principal: Principal, countryCode: string, reason?: string) {
    const country = await this.requireCountry(countryCode);
    await this.assertCountryProductionActivatable(country.isoAlpha2);

    if (country.productionLifecycle === 'ACTIVE') {
      await this.security.emit({
        type: 'COUNTRY_PRODUCTION_ACTIVATED',
        outcome: 'success',
        personId: principal.personId,
        metadata: { country_code: country.isoAlpha2, idempotent: true },
      });
      return {
        ...(await this.evaluate(country.isoAlpha2)),
        idempotent: true,
      };
    }

    if (country.productionLifecycle !== 'READY_FOR_ACTIVATION') {
      throw Errors.problem(
        409,
        'INVALID_LIFECYCLE_TRANSITION',
        'Invalid lifecycle transition',
        `${country.productionLifecycle} → ACTIVE is not allowed`,
      );
    }

    await this.prisma.country.update({
      where: { id: country.id },
      data: {
        productionLifecycle: CountryProductionLifecycle.ACTIVE,
        productionActivatedAt: new Date(),
        productionActivatedById: principal.personId,
        productionSuspendedAt: null,
        productionSuspendedById: null,
        productionSuspendReason: null,
      },
    });
    await this.security.emit({
      type: 'COUNTRY_PRODUCTION_ACTIVATED',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        country_code: country.isoAlpha2,
        previous_state: 'READY_FOR_ACTIVATION',
        new_state: 'ACTIVE',
        reason: reason ?? null,
      },
    });
    return this.evaluate(country.isoAlpha2);
  }

  async suspendProduction(principal: Principal, countryCode: string, reason: string) {
    const country = await this.requireCountry(countryCode);
    if (country.productionLifecycle === 'SUSPENDED') {
      await this.security.emit({
        type: 'COUNTRY_PRODUCTION_SUSPENDED',
        outcome: 'success',
        personId: principal.personId,
        metadata: { country_code: country.isoAlpha2, idempotent: true, reason },
      });
      return {
        ...(await this.evaluate(country.isoAlpha2)),
        idempotent: true,
      };
    }
    if (country.productionLifecycle !== 'ACTIVE') {
      throw Errors.problem(
        409,
        'INVALID_LIFECYCLE_TRANSITION',
        'Invalid lifecycle transition',
        `${country.productionLifecycle} → SUSPENDED is not allowed`,
      );
    }
    await this.prisma.country.update({
      where: { id: country.id },
      data: {
        productionLifecycle: CountryProductionLifecycle.SUSPENDED,
        productionSuspendedAt: new Date(),
        productionSuspendedById: principal.personId,
        productionSuspendReason: reason,
      },
    });
    await this.security.emit({
      type: 'COUNTRY_PRODUCTION_SUSPENDED',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        country_code: country.isoAlpha2,
        previous_state: 'ACTIVE',
        new_state: 'SUSPENDED',
        reason,
      },
    });
    return this.evaluate(country.isoAlpha2);
  }

  async markEvidenceUnderReview(principal: Principal, evidenceId: string, reason?: string) {
    return this.mutateEvidence(principal, evidenceId, 'SUBMITTED', 'SUBMITTED', reason);
  }

  async rejectEvidence(principal: Principal, evidenceId: string, reason: string) {
    if (!reason?.trim()) throw Errors.validation('Rejection reason is required');
    return this.mutateEvidence(principal, evidenceId, 'REJECTED', 'REJECTED', reason);
  }

  async expireEvidence(principal: Principal, evidenceId: string, reason?: string) {
    return this.mutateEvidence(principal, evidenceId, 'EXPIRED', 'EXPIRED', reason);
  }

  async listEvidenceHistory(evidenceId: string) {
    const ev = await this.prisma.regulatoryEvidence.findUnique({ where: { id: evidenceId } });
    if (!ev) throw Errors.notFound('Regulatory evidence not found');
    // Never return storageObjectKey to non-admin callers — this endpoint is admin-only.
    const events = await this.prisma.regulatoryEvidenceEvent.findMany({
      where: { evidenceId },
      orderBy: { createdAt: 'asc' },
    });
    return {
      evidence_id: evidenceId,
      requirement_id: ev.requirementId,
      status: ev.status,
      expires_at: ev.expiresAt?.toISOString() ?? null,
      verified_by_id: ev.verifiedById,
      verified_at: ev.verifiedAt?.toISOString() ?? null,
      // Opaque ref only — never document bytes
      has_private_object_ref: Boolean(ev.storageObjectKey),
      events: events.map((row) => ({
        id: row.id,
        action: row.action,
        from_status: row.fromStatus,
        to_status: row.toStatus,
        actor_id: row.actorId,
        reason: row.reason,
        created_at: row.createdAt.toISOString(),
      })),
    };
  }

  async presentEvidenceForAdmin(countryCode: string) {
    const country = await this.requireCountry(countryCode);
    const rows = await this.prisma.regulatoryEvidence.findMany({
      where: { countryId: country.id },
      include: { requirement: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((ev) => ({
      id: ev.id,
      requirement_code: ev.requirement?.code ?? null,
      requirement_label: ev.requirement?.label ?? null,
      document_type: ev.documentType,
      status: ev.status,
      issuer: ev.issuer,
      reference_number: ev.referenceNumber,
      issued_at: ev.issuedAt?.toISOString() ?? null,
      expires_at: ev.expiresAt?.toISOString() ?? null,
      verified_by_id: ev.verifiedById,
      verified_at: ev.verifiedAt?.toISOString() ?? null,
      has_private_object_ref: Boolean(ev.storageObjectKey),
      // Explicitly omit storageObjectKey value from list payloads for defense in depth
      notes: ev.notes,
    }));
  }

  private async mutateEvidence(
    principal: Principal,
    evidenceId: string,
    status: RegulatoryEvidenceStatus,
    action: string,
    reason?: string,
  ) {
    const ev = await this.prisma.regulatoryEvidence.findUnique({ where: { id: evidenceId } });
    if (!ev) throw Errors.notFound('Regulatory evidence not found');
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.regulatoryEvidence.update({
        where: { id: evidenceId },
        data: {
          status,
          verificationStatus: status,
          ...(status === 'REJECTED'
            ? { verifiedById: principal.personId, verifiedAt: new Date() }
            : {}),
          ...(status === 'EXPIRED' ? { notes: reason ?? ev.notes } : {}),
        },
      });
      await tx.regulatoryEvidenceEvent.create({
        data: {
          id: randomUUID(),
          evidenceId,
          countryId: ev.countryId,
          action,
          fromStatus: ev.status,
          toStatus: status,
          actorId: principal.personId,
          reason: reason ?? null,
        },
      });
      return row;
    });
    await this.security.emit({
      type:
        status === 'REJECTED'
          ? 'REGULATORY_EVIDENCE_REJECTED'
          : status === 'EXPIRED'
            ? 'REGULATORY_EVIDENCE_EXPIRED'
            : 'REGULATORY_EVIDENCE_UPDATED',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        evidence_id: evidenceId,
        country_id: ev.countryId,
        previous_state: ev.status,
        new_state: status,
        reason: reason ?? null,
      },
    });
    return updated;
  }

  async recordEvidenceEvent(
    tx: Prisma.TransactionClient,
    input: {
      evidenceId: string;
      countryId: string;
      action: string;
      fromStatus: string | null;
      toStatus: string | null;
      actorId: string | null;
      reason?: string | null;
    },
  ) {
    await tx.regulatoryEvidenceEvent.create({
      data: {
        id: randomUUID(),
        evidenceId: input.evidenceId,
        countryId: input.countryId,
        action: input.action,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        actorId: input.actorId,
        reason: input.reason ?? null,
      },
    });
  }

  private async persistGates(countryId: string, result: ProductionReadinessResult) {
    const mapDimension = (dim: string): CountryReadinessDimension => {
      if (dim === 'PARTNER') return CountryReadinessDimension.PARTNER;
      if (dim === 'LEGAL') return CountryReadinessDimension.LEGAL;
      if (dim === 'INTEGRATION') return CountryReadinessDimension.INTEGRATION;
      if (dim === 'PRODUCTION') return CountryReadinessDimension.PRODUCTION;
      if (dim === 'SOFTWARE') return CountryReadinessDimension.SOFTWARE;
      return CountryReadinessDimension.COMMERCIAL;
    };
    const mapStatus = (status: string): CountryReadinessGateStatus => {
      if (status === 'PASS' || status === 'READY') return CountryReadinessGateStatus.READY;
      if (status === 'WARNING' || status === 'EXPIRED') return CountryReadinessGateStatus.EXPIRED;
      if (status === 'EXTERNAL_GATED') return CountryReadinessGateStatus.EXTERNAL_GATED;
      return CountryReadinessGateStatus.BLOCKED;
    };
    for (const dim of result.dimensions) {
      await this.prisma.countryReadinessGate.upsert({
        where: {
          countryId_dimension: {
            countryId,
            dimension: mapDimension(dim.dimension),
          },
        },
        update: {
          status: mapStatus(dim.status),
          blockers: dim.blockers,
          recordedAt: new Date(),
        },
        create: {
          id: randomUUID(),
          countryId,
          dimension: mapDimension(dim.dimension),
          status: mapStatus(dim.status),
          blockers: dim.blockers,
        },
      });
    }
  }

  private presentLifecycle(country: {
    isoAlpha2: string;
    productionLifecycle: CountryProductionLifecycle;
    productionActivatedAt: Date | null;
    productionSuspendedAt: Date | null;
    productionSuspendReason: string | null;
    status: string;
  }) {
    return {
      country_code: country.isoAlpha2,
      sandbox_status: country.status,
      production_lifecycle: country.productionLifecycle,
      production_activated_at: country.productionActivatedAt?.toISOString() ?? null,
      production_suspended_at: country.productionSuspendedAt?.toISOString() ?? null,
      production_suspend_reason: country.productionSuspendReason,
    };
  }

  private async requireCountry(isoAlpha2: string) {
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: isoAlpha2.trim().toUpperCase() },
    });
    if (!country) throw Errors.notFound('Country not found');
    return country;
  }
}
