/**
 * Sprint 49 — Pure merge helpers for Final Real-Market Launch Readiness.
 * Composes existing gate outcomes; does not reimplement rail business rules.
 */

export type LaunchDimensionId =
  | 'SOFTWARE'
  | 'LEGAL'
  | 'PARTNER_NETWORK'
  | 'PAYMENTS'
  | 'COMMUNICATIONS'
  | 'LOGISTICS'
  | 'INFRASTRUCTURE'
  | 'HEALTHCARE'
  | 'OVERALL';

export type LaunchDimensionStatus =
  | 'READY'
  | 'BLOCKED'
  | 'EXTERNAL_GATED'
  | 'SUSPENDED'
  | 'NOT_CONFIGURED';

export type LaunchOverallDecision = 'READY_FOR_ACTIVATION' | 'NOT_READY' | 'SUSPENDED';

export type LaunchBlockerSeverity = 'critical' | 'blocker' | 'external';

import {
  resolveActionability,
  type BlockerActionability,
  type BlockerTaxonomy,
  type LaunchRunbookStage,
} from './launch-blocker-actionability';

export type { BlockerTaxonomy, LaunchRunbookStage };

export type LaunchBlockerDetail = {
  code: string;
  dimension: LaunchDimensionId;
  explanation: string;
  severity: LaunchBlockerSeverity;
  actionable: 'INTERNAL' | 'EXTERNAL';
  taxonomy: BlockerTaxonomy;
  country_code: string;
  category: string;
  evidence_or_approval_required: string;
  blocks_activation: true;
  actionability: BlockerActionability;
};

export type LaunchChecklistItem = {
  id: string;
  category: 'LEGAL' | 'PARTNERS' | 'PAYMENTS' | 'COMMUNICATIONS' | 'LOGISTICS' | 'INFRASTRUCTURE' | 'HEALTHCARE';
  label: string;
  status: LaunchDimensionStatus;
  blocker_code: string | null;
  external: boolean;
};

export type LaunchDimensionView = {
  id: LaunchDimensionId;
  label: string;
  status: LaunchDimensionStatus;
  blocker_count: number;
  external_gated_count: number;
  summary: string;
  software_ready_note: string;
};

const EXTERNAL_CODE =
  /(EXTERNAL_GATED|EXTERNAL_GATE|NO_PRODUCTION_|NOT_YET_DEFINED|R14_A_|PITR|MOCK_|LIVE_.*DISABLED|PRODUCTION_ENVIRONMENT_NOT_SET)/i;

export function classifyBlockerActionable(code: string): 'INTERNAL' | 'EXTERNAL' {
  return EXTERNAL_CODE.test(code) ? 'EXTERNAL' : 'INTERNAL';
}

export function severityForStatus(status: LaunchDimensionStatus): LaunchBlockerSeverity {
  if (status === 'EXTERNAL_GATED') return 'external';
  if (status === 'SUSPENDED') return 'critical';
  return 'blocker';
}

/** Map rail gate blockers → dimension status (fail-closed; EXTERNAL_GATED never becomes READY). */
export function statusFromGateBlockers(
  available: boolean,
  blockers: string[],
  opts?: { suspended?: boolean; notConfigured?: boolean },
): LaunchDimensionStatus {
  if (opts?.suspended || blockers.some((b) => /SUSPENDED/i.test(b))) {
    return 'SUSPENDED';
  }
  if (available && blockers.length === 0) {
    return 'READY';
  }
  if (opts?.notConfigured || blockers.some((b) => /NOT_FOUND|NOT_CONFIGURED|MISSING/i.test(b) && !EXTERNAL_CODE.test(b))) {
    const onlyMissing =
      blockers.length > 0 &&
      blockers.every(
        (b) =>
          /MISSING|NOT_FOUND|NOT_CONFIGURED|NOT_SET/i.test(b) &&
          !EXTERNAL_CODE.test(b),
      );
    if (onlyMissing || opts?.notConfigured) {
      // Still may be EXTERNAL if gate always adds NO_PRODUCTION_* — prefer EXTERNAL when present
      if (blockers.some((b) => EXTERNAL_CODE.test(b))) {
        return 'EXTERNAL_GATED';
      }
      return 'NOT_CONFIGURED';
    }
  }
  if (blockers.some((b) => EXTERNAL_CODE.test(b)) && !blockers.some((b) => !EXTERNAL_CODE.test(b) && !/COUNTRY_PRODUCTION_NOT_ACTIVE/i.test(b))) {
    // All remaining are external or country-not-active (expected until rails live)
    if (blockers.every((b) => EXTERNAL_CODE.test(b) || /COUNTRY_PRODUCTION_NOT_ACTIVE/i.test(b))) {
      return 'EXTERNAL_GATED';
    }
  }
  if (blockers.some((b) => EXTERNAL_CODE.test(b)) && blockers.every((b) => EXTERNAL_CODE.test(b) || /COUNTRY_PRODUCTION_NOT_ACTIVE|COUNTRY_NOT_FOUND/i.test(b))) {
    return 'EXTERNAL_GATED';
  }
  if (blockers.some((b) => EXTERNAL_CODE.test(b))) {
    // Mix of hard internal + external → BLOCKED if any hard internal, else EXTERNAL
    const hard = blockers.filter((b) => !EXTERNAL_CODE.test(b) && !/COUNTRY_PRODUCTION_NOT_ACTIVE/i.test(b));
    if (hard.length === 0) return 'EXTERNAL_GATED';
    return 'BLOCKED';
  }
  return 'BLOCKED';
}

export function mapCountryDimensionStatus(status: string): LaunchDimensionStatus {
  const upper = status.toUpperCase();
  if (upper === 'PASS' || upper === 'READY') return 'READY';
  if (upper === 'EXTERNAL_GATED') return 'EXTERNAL_GATED';
  if (upper === 'SUSPENDED') return 'SUSPENDED';
  if (upper === 'WARNING' || upper === 'EXPIRED') return 'BLOCKED';
  if (upper === 'MISSING' || upper === 'NOT_CONFIGURED') return 'NOT_CONFIGURED';
  return 'BLOCKED';
}

export function decideOverall(
  lifecycle: string,
  dimensions: Array<{ status: LaunchDimensionStatus }>,
): LaunchOverallDecision {
  if (lifecycle === 'SUSPENDED' || dimensions.some((d) => d.status === 'SUSPENDED')) {
    return 'SUSPENDED';
  }
  const allReady = dimensions.every((d) => d.status === 'READY');
  if (allReady) {
    return 'READY_FOR_ACTIVATION';
  }
  return 'NOT_READY';
}

export function buildBlockerDetail(input: {
  code: string;
  dimension: LaunchDimensionId;
  country_code: string;
  category: string;
  explanation?: string;
  evidence_or_approval_required?: string;
}): LaunchBlockerDetail {
  const actionable = classifyBlockerActionable(input.code);
  const actionability = resolveActionability(input.code);
  return {
    code: input.code,
    dimension: input.dimension,
    explanation:
      input.explanation ??
      (actionable === 'EXTERNAL'
        ? `${input.code} requires an approved external provider, contract, or operator unlock.`
        : `${input.code} must be resolved by internal configuration or evidence.`),
    severity: actionable === 'EXTERNAL' ? 'external' : 'blocker',
    actionable,
    taxonomy: actionability.taxonomy,
    country_code: input.country_code,
    category: input.category,
    evidence_or_approval_required:
      input.evidence_or_approval_required ??
      (actionable === 'EXTERNAL'
        ? 'Genuine provider configuration + ProductionDependency VERIFIED (not EXTERNAL_GATED) + live enablement flags'
        : 'Complete configuration, regulatory evidence, or partner verification in Main Admin'),
    blocks_activation: true,
    actionability,
  };
}

export const DIMENSION_LABELS: Record<LaunchDimensionId, string> = {
  SOFTWARE: 'Software',
  LEGAL: 'Legal / Regulatory',
  PARTNER_NETWORK: 'Partner Network',
  PAYMENTS: 'Payments',
  COMMUNICATIONS: 'Communications / OTP',
  LOGISTICS: 'Logistics',
  INFRASTRUCTURE: 'Infrastructure / Security',
  HEALTHCARE: 'Healthcare',
  OVERALL: 'Overall Production Readiness',
};

/** Map overall decision → display status for the OVERALL dimension card. */
export function overallToDimensionStatus(decision: LaunchOverallDecision): LaunchDimensionStatus {
  if (decision === 'READY_FOR_ACTIVATION') return 'READY';
  if (decision === 'SUSPENDED') return 'SUSPENDED';
  return 'BLOCKED';
}
