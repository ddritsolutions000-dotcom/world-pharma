/**
 * Sprint 42 — authoritative production readiness evaluation (pure functions).
 * Extends Sprint 39 launch readiness with PARTNER gates and structured blockers.
 */

import {
  computeLaunchReadiness,
  computeMarketReadiness,
  type LaunchReadinessInput,
  type LaunchReadinessResult,
  type MarketReadinessInput,
  type ReadinessDimensionResult,
  type ReadinessGateStatus,
} from './market-readiness';

export type ProductionReadinessDimension =
  | 'SOFTWARE'
  | 'LEGAL'
  | 'PARTNER'
  | 'INTEGRATION'
  | 'PRODUCTION';

export type ProductionBlockerCode =
  | 'LEGAL_EVIDENCE_MISSING'
  | 'LEGAL_EVIDENCE_EXPIRED'
  | 'LEGAL_EVIDENCE_REJECTED'
  | 'HEALTHCARE_POLICY_NOT_PUBLISHED'
  | 'REGULATORY_REQUIREMENT_MISSING'
  | 'PHARMACY_LICENCE_MISSING'
  | 'KYC_NOT_VERIFIED'
  | 'COMMERCIAL_APPROVAL_MISSING'
  | 'PSP_NOT_LIVE'
  | 'OTP_NOT_LIVE'
  | 'MESSAGING_NOT_LIVE'
  | 'CARRIER_NOT_LIVE'
  | 'KYC_PROVIDER_NOT_LIVE'
  | 'CURRENCY_NOT_CONFIGURED'
  | 'POLICY_PACK_MISSING'
  | 'PAYMENT_POLICY_MISSING'
  | 'DELIVERY_POLICY_MISSING'
  | 'SERVICEABILITY_NOT_CONFIGURED'
  | 'SETTLEMENT_POLICY_MISSING'
  | 'NOT_ALL_DIMENSIONS_READY'
  | 'LIFECYCLE_NOT_READY'
  | 'COUNTRY_PRODUCTION_SUSPENDED';

export type RequirementCoverageRow = {
  code: string;
  label: string;
  mandatory: boolean;
  evidence_id: string | null;
  evidence_status: string | null;
  satisfied: boolean;
  expires_at: string | null;
  blocker: ProductionBlockerCode | null;
};

export type ProductionReadinessInput = LaunchReadinessInput & {
  /** At least one verified non-expired pharmacy licence exists for the country. */
  pharmacyLicenceVerified: boolean;
  /** Country-level KYC gate satisfied (verified case or waived by policy). */
  kycVerified: boolean;
  /** At least one partner has commercial approval for the country. */
  commercialApprovalPresent: boolean;
  /** Structured legal detail for requirement coverage. */
  requirementCoverage: RequirementCoverageRow[];
  productionLifecycle: string;
};

export type DimensionView = {
  dimension: ProductionReadinessDimension;
  status: 'PASS' | 'BLOCKED' | 'WARNING' | ReadinessGateStatus;
  blockers: string[];
  warnings: string[];
};

export type ProductionReadinessResult = {
  country_code?: string;
  production_lifecycle: string;
  overall_status: 'READY' | 'BLOCKED' | 'SUSPENDED';
  production_ready: boolean;
  activation_eligible: boolean;
  dimensions: DimensionView[];
  blockers: string[];
  warnings: string[];
  requirement_coverage: RequirementCoverageRow[];
  evidence_status: {
    verified_active: number;
    expired: number;
    rejected: number;
    pending: number;
  };
  partner_readiness: {
    pharmacy_licence_verified: boolean;
    kyc_verified: boolean;
    commercial_approved: boolean;
  };
  dependency_readiness: {
    psp: boolean;
    otp: boolean;
    messaging: boolean;
    carrier: boolean;
    kyc_provider: boolean;
  };
  launch: LaunchReadinessResult;
};

function mapSoftwareStatus(status: ReadinessGateStatus): DimensionView['status'] {
  if (status === 'READY') return 'PASS';
  if (status === 'EXPIRED') return 'WARNING';
  return 'BLOCKED';
}

/**
 * Evidence satisfaction: VERIFIED and not past expiresAt.
 * Evaluator is authoritative — no cron required.
 */
export function isEvidenceSatisfying(input: {
  status: string;
  expiresAt: Date | string | null | undefined;
  now?: Date;
}): boolean {
  if (input.status !== 'VERIFIED') return false;
  if (!input.expiresAt) return true;
  const exp = input.expiresAt instanceof Date ? input.expiresAt : new Date(input.expiresAt);
  if (Number.isNaN(exp.getTime())) return false;
  return exp.getTime() > (input.now ?? new Date()).getTime();
}

export function computeProductionReadiness(input: ProductionReadinessInput): ProductionReadinessResult {
  const launch = computeLaunchReadiness(input);
  const software = launch.dimensions.find((d) => d.dimension === 'SOFTWARE')!;
  const legalBase = launch.dimensions.find((d) => d.dimension === 'LEGAL')!;
  const integration = launch.dimensions.find((d) => d.dimension === 'INTEGRATION')!;

  const partnerBlockers: string[] = [];
  if (!input.pharmacyLicenceVerified) partnerBlockers.push('PHARMACY_LICENCE_MISSING');
  if (!input.kycVerified) partnerBlockers.push('KYC_NOT_VERIFIED');
  if (!input.commercialApprovalPresent) partnerBlockers.push('COMMERCIAL_APPROVAL_MISSING');

  const legalBlockers = [...legalBase.blockers];
  for (const row of input.requirementCoverage) {
    if (row.mandatory && !row.satisfied && row.blocker && !legalBlockers.includes(row.blocker)) {
      legalBlockers.push(row.blocker);
    }
  }

  const legalStatus: ReadinessGateStatus =
    legalBlockers.includes('LEGAL_EVIDENCE_EXPIRED') || legalBlockers.includes('REGULATORY_EVIDENCE_EXPIRED')
      ? 'EXPIRED'
      : legalBlockers.length === 0
        ? 'READY'
        : 'MISSING';

  const integrationBlockers = integration.blockers.map((b) => {
    if (b === 'LIVE_PSP_EXTERNAL_GATED') return 'PSP_NOT_LIVE';
    if (b === 'LIVE_OTP_EXTERNAL_GATED') return 'OTP_NOT_LIVE';
    if (b === 'LIVE_MESSAGING_EXTERNAL_GATED') return 'MESSAGING_NOT_LIVE';
    if (b === 'LIVE_CARRIER_EXTERNAL_GATED') return 'CARRIER_NOT_LIVE';
    if (b === 'KYC_PROVIDER_EXTERNAL_GATED') return 'KYC_PROVIDER_NOT_LIVE';
    return b;
  });

  const dimensions: DimensionView[] = [
    {
      dimension: 'SOFTWARE',
      status: mapSoftwareStatus(software.status),
      blockers: software.blockers,
      warnings: software.blockers.includes('NOTIFICATION_POLICY_MISSING')
        ? ['NOTIFICATION_POLICY_MISSING']
        : [],
    },
    {
      dimension: 'LEGAL',
      status: legalStatus === 'READY' ? 'PASS' : legalStatus === 'EXPIRED' ? 'WARNING' : 'BLOCKED',
      blockers: legalBlockers,
      warnings: legalStatus === 'EXPIRED' ? ['LEGAL_EVIDENCE_EXPIRED'] : [],
    },
    {
      dimension: 'PARTNER',
      status: partnerBlockers.length === 0 ? 'PASS' : 'BLOCKED',
      blockers: partnerBlockers,
      warnings: [],
    },
    {
      dimension: 'INTEGRATION',
      status: integrationBlockers.length === 0 ? 'PASS' : 'BLOCKED',
      blockers: integrationBlockers,
      warnings: integrationBlockers,
    },
  ];

  const coreReady =
    dimensions[0]!.status === 'PASS' &&
    dimensions[1]!.status === 'PASS' &&
    dimensions[2]!.status === 'PASS' &&
    dimensions[3]!.status === 'PASS';

  const production: DimensionView = {
    dimension: 'PRODUCTION',
    status: coreReady ? 'PASS' : 'BLOCKED',
    blockers: coreReady ? [] : ['NOT_ALL_DIMENSIONS_READY'],
    warnings: [],
  };
  dimensions.push(production);

  const blockers = dimensions.flatMap((d) => d.blockers);
  const warnings = dimensions.flatMap((d) => d.warnings);

  const lifecycle = input.productionLifecycle;
  const suspended = lifecycle === 'SUSPENDED';
  const activationEligible =
    coreReady && (lifecycle === 'READY_FOR_ACTIVATION' || lifecycle === 'ACTIVE');

  let overall: ProductionReadinessResult['overall_status'] = 'BLOCKED';
  if (suspended) overall = 'SUSPENDED';
  else if (coreReady) overall = 'READY';

  const evidenceStatus = {
    verified_active: input.requirementCoverage.filter((r) => r.satisfied).length,
    expired: input.requirementCoverage.filter((r) => r.blocker === 'LEGAL_EVIDENCE_EXPIRED').length,
    rejected: input.requirementCoverage.filter((r) => r.blocker === 'LEGAL_EVIDENCE_REJECTED').length,
    pending: input.requirementCoverage.filter(
      (r) => r.mandatory && !r.satisfied && r.blocker === 'LEGAL_EVIDENCE_MISSING',
    ).length,
  };

  return {
    production_lifecycle: lifecycle,
    overall_status: overall,
    production_ready: coreReady,
    activation_eligible: activationEligible && !suspended,
    dimensions,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    requirement_coverage: input.requirementCoverage,
    evidence_status: evidenceStatus,
    partner_readiness: {
      pharmacy_licence_verified: input.pharmacyLicenceVerified,
      kyc_verified: input.kycVerified,
      commercial_approved: input.commercialApprovalPresent,
    },
    dependency_readiness: {
      psp: input.livePspConfigured,
      otp: input.liveOtpConfigured,
      messaging: input.liveMessagingConfigured,
      carrier: input.liveCarrierConfigured,
      kyc_provider: input.kycProviderVerified,
    },
    launch,
  };
}

export function buildCommerceInput(input: MarketReadinessInput): MarketReadinessInput {
  return input;
}

export { computeMarketReadiness };
