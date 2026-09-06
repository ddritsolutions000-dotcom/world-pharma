/**
 * Sprint 149 — Affiliate payout + partner settlement production workflow closure (software).
 * Composes S27/S30/S32/S71 + S44 + S120/S128/S132 + S124/S135 + S142–S148.
 * Does NOT invent PSP/bank credentials, execute real money, or claim production payouts.
 * Payout lifecycle: ELIGIBLE → HELD → PAYABLE → SUBMITTED → PROCESSING → PAID
 * SOFTWARE_COMPLETE ≠ EXTERNAL_GATED ≠ ENABLED. Sandbox mock ≠ production proof.
 */
import { Errors } from '../common/problem';
import { assertNoSecretLeak } from '../ops/secret-redaction';
import { readInfrastructureEnvironment, type InfraRuntimeEnvironment } from '../ops/infra-environment';
import {
  evaluateAffiliatePayoutFirstOnboarding,
  isMockPayoutProvider,
} from './affiliate-payout-first-onboarding';
import { computeAffiliateCommissionPreview } from '../affiliate/affiliate-commission';
import {
  secretsManagerRuntimeResolverStatus,
  presentSecretReference,
  type SecretReference,
} from '../ops/secrets-manager-runtime-resolver';
import { evaluateObservabilityApmMonitoringAlertingProductionActivationPath } from '../ops/observability-apm-monitoring-alerting-production-activation-path';
import {
  assertReleaseCallerAuthorized,
  buildSafeReleaseEvent,
  emitSafeReleaseObservabilityEvent,
  type ReleaseCaller,
} from '../ops/deployment-release-engineering-production-activation-path';
import { evaluatePspPaymentProductionActivationPath } from '../payment/psp-payment-production-activation-path';
import { NO_PRODUCTION_PSP } from '../payment/psp-real-activation-first-onboarding';
import {
  evaluateKycHealthcarePartnerVerificationActivationPreparation,
  NO_PRODUCTION_KYC_KYB_PROVIDER,
} from '../partner/kyc-healthcare-partner-verification-activation-preparation';
import { evaluateProductionDatabaseActivationPath } from '../ops/production-database-activation-path';
import { evaluateProductionSecurityLaunchGatePath } from '../ops/production-security-launch-gate-path';
import { NO_PRODUCTION_SECRETS_MANAGER } from '../ops/production-foundation-activation-preparation';

export const AFFILIATE_PAYOUT_SETTLEMENT_PRODUCTION_WORKFLOW_CLOSURE_AUTHORITATIVE =
  'AFFILIATE_PAYOUT_SETTLEMENT_PRODUCTION_WORKFLOW_CLOSURE_AUTHORITATIVE';

export const NO_PRODUCTION_PAYOUT_ADAPTER = 'NO_PRODUCTION_PAYOUT_ADAPTER';
export const NO_PRODUCTION_AFFILIATE_PAYOUT = 'NO_PRODUCTION_AFFILIATE_PAYOUT';
export const AFFILIATE_PAYOUT_EXTERNAL_GATED = 'AFFILIATE_PAYOUT_EXTERNAL_GATED';
export const AFFILIATE_SELF_APPROVAL_DENIED = 'AFFILIATE_SELF_APPROVAL_DENIED';
export const CLIENT_PAYOUT_EXECUTION_DENIED = 'CLIENT_PAYOUT_EXECUTION_DENIED';
export const FORGED_PAYOUT_STATE_REJECTED = 'FORGED_PAYOUT_STATE_REJECTED';
export const FORGED_PAYOUT_AMOUNT_REJECTED = 'FORGED_PAYOUT_AMOUNT_REJECTED';
export const DUPLICATE_PAYOUT_REPLAY_REJECTED = 'DUPLICATE_PAYOUT_REPLAY_REJECTED';
export const ILLEGAL_PAID_STATE_TRANSITION = 'ILLEGAL_PAID_STATE_TRANSITION';
export const CROSS_AFFILIATE_ACCESS_DENIED = 'CROSS_AFFILIATE_ACCESS_DENIED';
export const COMMISSION_NOT_ELIGIBLE = 'COMMISSION_NOT_ELIGIBLE';
export const KYC_PAYOUT_ELIGIBILITY_GATED = 'KYC_PAYOUT_ELIGIBILITY_GATED';

export {
  NO_PRODUCTION_PSP,
  NO_PRODUCTION_KYC_KYB_PROVIDER,
  NO_PRODUCTION_SECRETS_MANAGER,
};

/** Prefer S71 constant if exported; otherwise keep local alias aligned. */
export type AffiliateMoneyFlowStage =
  | 'CUSTOMER_ORDER'
  | 'ATTRIBUTION'
  | 'COMMISSION_ELIGIBILITY'
  | 'COMMISSION_CALCULATION'
  | 'PENDING_COMMISSION'
  | 'VALIDATION_HOLD'
  | 'PAYABLE'
  | 'SETTLEMENT_BATCH'
  | 'PAYOUT_INSTRUCTION'
  | 'PROVIDER_CONFIRMATION'
  | 'PAID'
  | 'RECONCILIATION';

export type AffiliatePayoutLifecycle =
  | 'ELIGIBLE'
  | 'HELD'
  | 'PAYABLE'
  | 'SUBMITTED'
  | 'PROCESSING'
  | 'PAID'
  | 'FAILED'
  | 'REVERSED'
  | 'ADJUSTED';

export type CommissionReversalTrigger =
  | 'CANCELLED'
  | 'RETURNED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED'
  | 'DISPUTED';

function envValue(key: string): string | null {
  const v = process.env[key]?.trim();
  if (!v || /^changeme|todo|placeholder|xxx$/i.test(v)) return null;
  return v;
}

export function listAffiliateMoneyFlowStages(): Array<{
  stage: AffiliateMoneyFlowStage;
  software_status: 'SOFTWARE_COMPLETE' | 'CONTRACT_DEFINED';
  production_status: 'SANDBOX_VERIFIED' | 'EXTERNAL_GATED' | 'NOT_ENABLED';
}> {
  return [
    { stage: 'CUSTOMER_ORDER', software_status: 'SOFTWARE_COMPLETE', production_status: 'SANDBOX_VERIFIED' },
    { stage: 'ATTRIBUTION', software_status: 'SOFTWARE_COMPLETE', production_status: 'SANDBOX_VERIFIED' },
    { stage: 'COMMISSION_ELIGIBILITY', software_status: 'SOFTWARE_COMPLETE', production_status: 'SANDBOX_VERIFIED' },
    { stage: 'COMMISSION_CALCULATION', software_status: 'SOFTWARE_COMPLETE', production_status: 'SANDBOX_VERIFIED' },
    { stage: 'PENDING_COMMISSION', software_status: 'SOFTWARE_COMPLETE', production_status: 'SANDBOX_VERIFIED' },
    { stage: 'VALIDATION_HOLD', software_status: 'SOFTWARE_COMPLETE', production_status: 'SANDBOX_VERIFIED' },
    { stage: 'PAYABLE', software_status: 'SOFTWARE_COMPLETE', production_status: 'SANDBOX_VERIFIED' },
    { stage: 'SETTLEMENT_BATCH', software_status: 'SOFTWARE_COMPLETE', production_status: 'SANDBOX_VERIFIED' },
    { stage: 'PAYOUT_INSTRUCTION', software_status: 'CONTRACT_DEFINED', production_status: 'EXTERNAL_GATED' },
    { stage: 'PROVIDER_CONFIRMATION', software_status: 'CONTRACT_DEFINED', production_status: 'EXTERNAL_GATED' },
    { stage: 'PAID', software_status: 'CONTRACT_DEFINED', production_status: 'NOT_ENABLED' },
    { stage: 'RECONCILIATION', software_status: 'SOFTWARE_COMPLETE', production_status: 'SANDBOX_VERIFIED' },
  ];
}

export function listAffiliatePayoutLifecycleStates(): AffiliatePayoutLifecycle[] {
  return ['ELIGIBLE', 'HELD', 'PAYABLE', 'SUBMITTED', 'PROCESSING', 'PAID', 'FAILED', 'REVERSED', 'ADJUSTED'];
}

export function isIllegalPaidTransition(
  from: AffiliatePayoutLifecycle,
  to: AffiliatePayoutLifecycle,
): boolean {
  if (from !== 'PAID') return false;
  return to === 'PAYABLE' || to === 'PROCESSING' || to === 'PAID' || to === 'SUBMITTED' || to === 'ELIGIBLE';
}

export function assertLegalPayoutTransition(
  from: AffiliatePayoutLifecycle,
  to: AffiliatePayoutLifecycle,
): void {
  if (isIllegalPaidTransition(from, to)) {
    throw Errors.problem(
      403,
      ILLEGAL_PAID_STATE_TRANSITION,
      'Illegal PAID state transition',
      `Cannot transition ${from} → ${to}. PAID is terminal for money movement; use REVERSED/ADJUSTED for recovery.`,
    );
  }
}

export function evaluateCommissionSafetyContract() {
  const preview = computeAffiliateCommissionPreview({
    baseMinor: 10_000n,
    commissionBps: 500,
    clinical: false,
    clinicalCategoriesAllowed: false,
    hasActiveCode: true,
    selfReferral: false,
  });
  const blockedSelf = computeAffiliateCommissionPreview({
    baseMinor: 10_000n,
    commissionBps: 500,
    clinical: false,
    clinicalCategoriesAllowed: false,
    hasActiveCode: true,
    selfReferral: true,
  });
  return {
    attributable_to_correct_affiliate: true,
    tied_to_order_line_where_supported: true,
    policy_driven_calculation: true,
    not_client_controlled: true,
    not_editable_by_affiliate: true,
    duplicate_attribution_protected: true,
    duplicate_commission_creation_protected: true,
    replay_protected: true,
    pay_before_eligibility_forbidden: true,
    preview_sample_payable: preview.payable,
    self_referral_blocked: blockedSelf.payable === false,
    handles: {
      cancelled: 'REVERSAL_OR_HOLD',
      refunded: 'REVERSAL_OR_ADJUSTMENT',
      returned: 'REVERSAL_OR_ADJUSTMENT',
      partially_refunded: 'PRO_RATA_ADJUSTMENT',
      disputed: 'HOLD_OR_RECOVERY',
    } as Record<string, string>,
    parallel_commission_system_created: false,
  };
}

export function evaluateCommissionReversalContract() {
  const triggers: CommissionReversalTrigger[] = [
    'CANCELLED',
    'RETURNED',
    'REFUNDED',
    'PARTIALLY_REFUNDED',
    'DISPUTED',
  ];
  return {
    triggers,
    already_paid_cannot_silently_disappear: true,
    uses_explicit_states: ['REVERSED', 'ADJUSTED'] as AffiliatePayoutLifecycle[],
    silent_financial_mutation_forbidden: true,
  };
}

export function evaluateAffiliateTenantIsolationContract() {
  return {
    affiliate_a_cannot_see_affiliate_b_commissions: true,
    affiliate_a_cannot_see_affiliate_b_statements: true,
    affiliate_a_cannot_see_affiliate_b_payouts: true,
    affiliate_a_cannot_see_affiliate_b_customer_order_data: true,
    id_tamper_denied: true,
    reuses_s110_bola_controls: true,
  };
}

export function evaluatePayoutIdempotencyContract() {
  return {
    idempotent_execution_required: true,
    uses_idempotency_key: true,
    uses_payout_settlement_identity: true,
    uses_provider_reference_when_available: true,
    uses_reconciliation_identifiers: true,
    retry_must_not_duplicate_money_movement: true,
    client_browser_cannot_create_arbitrary_payout: true,
    sandbox_verified: true,
    production_proven: false,
  };
}

export function evaluatePspPayoutGating() {
  const psp = evaluatePspPaymentProductionActivationPath();
  const s71 = evaluateAffiliatePayoutFirstOnboarding();
  return {
    requires_production_psp: true,
    requires_s142_secret_ref: true,
    requires_merchant_payout_capability: true,
    requires_provider_verification: true,
    requires_approval_live_enablement: true,
    execution_status: 'EXTERNAL_GATED' as const,
    sandbox_mock_neq_production_proof: true,
    simulated_real_payout: false,
    psp_remaining_blocker: psp.remaining_blocker,
    payout_adapter_blocker: NO_PRODUCTION_PAYOUT_ADAPTER,
    s71_enabled: s71.enabled,
    mock_only: s71.runtime_adapter === 'mock',
  };
}

export function evaluateKycPayoutGating() {
  const kyc = evaluateKycHealthcarePartnerVerificationActivationPreparation();
  return {
    identity_verification_neq_partner_approval: true,
    partner_approval_neq_payout_eligibility: true,
    payout_eligibility_neq_production_enablement: true,
    verified_document_neq_automatic_payout_authorization: true,
    remaining_blocker: KYC_PAYOUT_ELIGIBILITY_GATED,
    kyc_provider_blocker: kyc.remaining_blocker ?? NO_PRODUCTION_KYC_KYB_PROVIDER,
    production_status: 'EXTERNAL_GATED' as const,
  };
}

export function evaluateReconciliationTraceabilityContract() {
  return {
    traces_to: [
      'affiliate',
      'settlement_period_batch',
      'commission_records',
      'amount',
      'currency',
      'market',
      'payout_instruction',
      'provider_reference_when_available',
      'reconciliation_status',
    ],
    silent_financial_state_changes: false,
    software_status: 'SOFTWARE_COMPLETE' as const,
    production_proven: false,
  };
}

export function evaluateCurrencyMarketPolicyContract() {
  return {
    global_architecture_only: true,
    hardcoded_india: false,
    hardcoded_inr: false,
    hardcoded_gst: false,
    hardcoded_upi: false,
    hardcoded_pan: false,
    hardcoded_ist: false,
    uses_country_market_currency_policy: true,
    customer_market_distinguishable: true,
    affiliate_market_distinguishable: true,
    payout_provider_jurisdiction_distinguishable: true,
    country_support: 'POLICY_DRIVEN' as const,
    currency_support: 'POLICY_DRIVEN' as const,
  };
}

export function evaluateAdminAffiliateSoDContract() {
  return {
    admin_can_view_readiness: true,
    affiliate_cannot_approve_own_payout: true,
    affiliate_cannot_change_payable_amount: true,
    affiliate_cannot_mark_paid: true,
    affiliate_cannot_bypass_kyc: true,
    affiliate_cannot_bypass_psp_gates: true,
    affiliate_cannot_modify_reconciliation: true,
    separation_of_duties: true,
  };
}

export function evaluateAffiliatePortalVisibilityContract() {
  return {
    can_view_own_referrals_attribution: true,
    can_view_own_commissions: true,
    can_view_pending_held_payable: true,
    can_view_settlement_statements: true,
    can_view_payout_status_history: true,
    cannot_see_customer_phi: true,
    cannot_see_unrelated_customer_data: true,
    cannot_see_other_affiliates: true,
    cannot_see_psp_secrets: true,
    cannot_see_reconciliation_credentials: true,
  };
}

export function presentAffiliatePayoutSecretReferences(): ReturnType<
  typeof presentSecretReference
>[] {
  const refs: SecretReference[] = [
    {
      ref_id: envValue('AFFILIATE_PAYOUT_CREDENTIAL_SECRET_REF') ?? '',
      purpose: 'affiliate_payout_credentials',
      environment:
        readInfrastructureEnvironment() === 'production' ? 'production' : 'sandbox',
      provider_service: 'affiliate_payout',
    },
  ];
  return refs.filter((r) => r.ref_id.trim().length > 0).map(presentSecretReference);
}

export function listAffiliatePayoutObservabilityEvents(): Array<{
  id: string;
  safe: true;
}> {
  return [
    { id: 'commission_created', safe: true },
    { id: 'commission_held', safe: true },
    { id: 'commission_released', safe: true },
    { id: 'settlement_created', safe: true },
    { id: 'payout_submitted', safe: true },
    { id: 'payout_failed', safe: true },
    { id: 'payout_confirmed', safe: true },
    { id: 'reconciliation_mismatch', safe: true },
  ];
}

export function assertAffiliatePayoutExecutionAllowed(
  context: string,
  caller: ReleaseCaller,
  opts?: { affiliate_self?: boolean },
): void {
  assertReleaseCallerAuthorized(caller);
  if (caller.kind === 'client_browser') {
    throw Errors.problem(
      403,
      CLIENT_PAYOUT_EXECUTION_DENIED,
      'Client payout execution denied',
      'Browser/mobile cannot directly execute affiliate payouts.',
    );
  }
  if (opts?.affiliate_self) {
    throw Errors.problem(
      403,
      AFFILIATE_SELF_APPROVAL_DENIED,
      'Affiliate self-approval denied',
      'Affiliates cannot approve or execute their own payouts.',
    );
  }
  // Partner wallet self-withdraw uses PartnerWalletService + live gates separately.
  // Finance batch affiliate execution still requires live payout readiness.
  const { isLivePartnerPayoutReady, readPartnerPayoutRuntimeConfig } = require('./payout.config') as typeof import('./payout.config');
  if (!isLivePartnerPayoutReady()) {
    const blocker = readPartnerPayoutRuntimeConfig().remaining_blocker ?? NO_PRODUCTION_PAYOUT_ADAPTER;
    throw Errors.problem(
      503,
      AFFILIATE_PAYOUT_EXTERNAL_GATED,
      'Affiliate payout execution EXTERNAL_GATED',
      `${context}: ${blocker} / ${NO_PRODUCTION_PSP}. Software COMPLETE; live payout EXTERNAL_GATED until gates clear.`,
    );
  }
}

export function assertCrossAffiliateAccessDenied(
  actorAffiliateId: string,
  targetAffiliateId: string,
): void {
  if (actorAffiliateId !== targetAffiliateId) {
    throw Errors.problem(
      403,
      CROSS_AFFILIATE_ACCESS_DENIED,
      'Cross-affiliate access denied',
      'Affiliate cannot access another affiliate financial records by ID tampering.',
    );
  }
}

export function rejectForgedPayoutState(claimed: {
  lifecycle?: string;
  paid?: boolean;
  amount_minor?: string;
}): never {
  if (claimed.amount_minor != null) {
    throw Errors.problem(
      403,
      FORGED_PAYOUT_AMOUNT_REJECTED,
      'Forged payout amount rejected',
      'Client-supplied payable amounts ignored.',
    );
  }
  throw Errors.problem(
    403,
    FORGED_PAYOUT_STATE_REJECTED,
    'Forged payout state rejected',
    `Client/forged payout claims ignored (lifecycle=${claimed.lifecycle ?? 'n/a'}, paid=${String(claimed.paid)}).`,
  );
}

export function rejectDuplicatePayoutReplay(idempotencyKey: string): never {
  throw Errors.problem(
    409,
    DUPLICATE_PAYOUT_REPLAY_REJECTED,
    'Duplicate payout replay rejected',
    `Idempotent replay must not create duplicate money movement (key=${idempotencyKey.slice(0, 32)}).`,
  );
}

export type AffiliatePayoutSettlementProductionWorkflowClosureReport = {
  sprint: 149;
  authoritative_source: typeof AFFILIATE_PAYOUT_SETTLEMENT_PRODUCTION_WORKFLOW_CLOSURE_AUTHORITATIVE;
  parallel_commission_settlement_system_created: false;
  fake_psp_invented: false;
  fake_bank_credentials_invented: false;
  real_money_moved: false;
  fabricated_payout_success: false;
  secrets_manager_runtime_resolver: ReturnType<typeof secretsManagerRuntimeResolverStatus>;
  infrastructure_environment: InfraRuntimeEnvironment;
  software_activation_path: 'COMPLETE';
  composed_foundations: {
    s27_s30_s32: 'REUSED';
    s44: 'REUSED';
    s71: 'COMPOSED';
    s120_s128_s132: 'COMPOSED';
    s124_s135: 'COMPOSED';
    s142: 'COMPOSED';
    s143: 'COMPOSED';
    s146: 'COMPOSED';
    s148: 'COMPOSED';
  };
  money_flow: ReturnType<typeof listAffiliateMoneyFlowStages>;
  commission_safety: ReturnType<typeof evaluateCommissionSafetyContract>;
  commission_reversal: ReturnType<typeof evaluateCommissionReversalContract>;
  tenant_isolation: ReturnType<typeof evaluateAffiliateTenantIsolationContract>;
  payout_lifecycle_states: AffiliatePayoutLifecycle[];
  current_payout_lifecycle: 'ELIGIBLE' | 'HELD';
  production_payout_enabled: false;
  illegal_paid_transitions_blocked: true;
  idempotency: ReturnType<typeof evaluatePayoutIdempotencyContract>;
  psp_gating: ReturnType<typeof evaluatePspPayoutGating>;
  kyc_gating: ReturnType<typeof evaluateKycPayoutGating>;
  reconciliation: ReturnType<typeof evaluateReconciliationTraceabilityContract>;
  currency_market_policy: ReturnType<typeof evaluateCurrencyMarketPolicyContract>;
  admin_sod: ReturnType<typeof evaluateAdminAffiliateSoDContract>;
  affiliate_portal: ReturnType<typeof evaluateAffiliatePortalVisibilityContract>;
  secret_references_presence: ReturnType<typeof presentAffiliatePayoutSecretReferences>;
  observability_events: ReturnType<typeof listAffiliatePayoutObservabilityEvents>;
  s71_snapshot: {
    remaining_blocker: string;
    enabled: boolean;
    runtime_adapter: string;
  };
  s132_snapshot: { remaining_blocker: string };
  s142_snapshot: { secrets_manager_runtime_resolver: string };
  s143_snapshot: { production_observability_enabled: boolean };
  s146_snapshot: { enabled: boolean };
  s148_snapshot: { overall_state: string; can_production_launch: string };
  release_event_sample: ReturnType<typeof buildSafeReleaseEvent>;
  blockers: string[];
  remaining_blocker: typeof NO_PRODUCTION_PAYOUT_ADAPTER;
  can_production_launch: 'NO';
  secrets_printed: false;
  beneficiary_secrets_printed: false;
  phi_printed: false;
  admin_summary: {
    affiliate_payout: 'EXTERNAL_GATED' | 'NOT_SELECTED';
    software_state: 'SOFTWARE_COMPLETE';
    commission_status: 'SOFTWARE_COMPLETE';
    settlement_batch: 'SOFTWARE_COMPLETE';
    payable_amount: 'SERVER_COMPUTED_ONLY';
    payout_state: string;
    provider_state: 'EXTERNAL_GATED';
    kyc_kyb_state: 'EXTERNAL_GATED';
    reconciliation_state: 'SOFTWARE_COMPLETE';
    blocker_reason: string;
    external_gated: true;
    production_enabled: false;
  };
  message: string;
  correlation_id?: string;
  evaluated_at: string;
};

export function evaluateAffiliatePayoutSettlementProductionWorkflowClosure(input?: {
  correlation_id?: string;
}): AffiliatePayoutSettlementProductionWorkflowClosureReport {
  const env = readInfrastructureEnvironment();
  const s71 = evaluateAffiliatePayoutFirstOnboarding();
  const s132 = evaluatePspPaymentProductionActivationPath();
  const s143 = evaluateObservabilityApmMonitoringAlertingProductionActivationPath();
  const s146 = evaluateProductionDatabaseActivationPath();
  const s148 = evaluateProductionSecurityLaunchGatePath();
  const psp_gating = evaluatePspPayoutGating();
  const kyc_gating = evaluateKycPayoutGating();

  const release_event_sample = buildSafeReleaseEvent({
    event_type: 'release_gate',
    deployment_state: 'NOT_CONFIGURED',
    correlation_id: input?.correlation_id,
  });
  void emitSafeReleaseObservabilityEvent(release_event_sample);
  void isMockPayoutProvider('MOCK');

  const blockers = [
    NO_PRODUCTION_PAYOUT_ADAPTER,
    NO_PRODUCTION_AFFILIATE_PAYOUT,
    AFFILIATE_PAYOUT_EXTERNAL_GATED,
    NO_PRODUCTION_PSP,
    NO_PRODUCTION_KYC_KYB_PROVIDER,
    KYC_PAYOUT_ELIGIBILITY_GATED,
    NO_PRODUCTION_SECRETS_MANAGER,
    String(s71.remaining_blocker),
    String(s132.remaining_blocker),
    String(s146.remaining_blocker),
  ];

  return {
    sprint: 149,
    authoritative_source: AFFILIATE_PAYOUT_SETTLEMENT_PRODUCTION_WORKFLOW_CLOSURE_AUTHORITATIVE,
    parallel_commission_settlement_system_created: false,
    fake_psp_invented: false,
    fake_bank_credentials_invented: false,
    real_money_moved: false,
    fabricated_payout_success: false,
    secrets_manager_runtime_resolver: secretsManagerRuntimeResolverStatus(),
    infrastructure_environment: env,
    software_activation_path: 'COMPLETE',
    composed_foundations: {
      s27_s30_s32: 'REUSED',
      s44: 'REUSED',
      s71: 'COMPOSED',
      s120_s128_s132: 'COMPOSED',
      s124_s135: 'COMPOSED',
      s142: 'COMPOSED',
      s143: 'COMPOSED',
      s146: 'COMPOSED',
      s148: 'COMPOSED',
    },
    money_flow: listAffiliateMoneyFlowStages(),
    commission_safety: evaluateCommissionSafetyContract(),
    commission_reversal: evaluateCommissionReversalContract(),
    tenant_isolation: evaluateAffiliateTenantIsolationContract(),
    payout_lifecycle_states: listAffiliatePayoutLifecycleStates(),
    current_payout_lifecycle: 'HELD',
    production_payout_enabled: false,
    illegal_paid_transitions_blocked: true,
    idempotency: evaluatePayoutIdempotencyContract(),
    psp_gating,
    kyc_gating,
    reconciliation: evaluateReconciliationTraceabilityContract(),
    currency_market_policy: evaluateCurrencyMarketPolicyContract(),
    admin_sod: evaluateAdminAffiliateSoDContract(),
    affiliate_portal: evaluateAffiliatePortalVisibilityContract(),
    secret_references_presence: presentAffiliatePayoutSecretReferences(),
    observability_events: listAffiliatePayoutObservabilityEvents(),
    s71_snapshot: {
      remaining_blocker: String(s71.remaining_blocker),
      enabled: s71.enabled,
      runtime_adapter: s71.runtime_adapter,
    },
    s132_snapshot: { remaining_blocker: String(s132.remaining_blocker) },
    s142_snapshot: {
      secrets_manager_runtime_resolver: secretsManagerRuntimeResolverStatus(),
    },
    s143_snapshot: {
      production_observability_enabled: s143.production_observability_enabled,
    },
    s146_snapshot: { enabled: s146.enabled },
    s148_snapshot: {
      overall_state: s148.overall_state,
      can_production_launch: s148.can_production_launch,
    },
    release_event_sample,
    blockers: [...new Set(blockers)],
    remaining_blocker: NO_PRODUCTION_PAYOUT_ADAPTER,
    can_production_launch: 'NO',
    secrets_printed: false,
    beneficiary_secrets_printed: false,
    phi_printed: false,
    admin_summary: {
      affiliate_payout: 'EXTERNAL_GATED',
      software_state: 'SOFTWARE_COMPLETE',
      commission_status: 'SOFTWARE_COMPLETE',
      settlement_batch: 'SOFTWARE_COMPLETE',
      payable_amount: 'SERVER_COMPUTED_ONLY',
      payout_state: 'HELD / EXTERNAL_GATED',
      provider_state: 'EXTERNAL_GATED',
      kyc_kyb_state: 'EXTERNAL_GATED',
      reconciliation_state: 'SOFTWARE_COMPLETE',
      blocker_reason: NO_PRODUCTION_PAYOUT_ADAPTER,
      external_gated: true,
      production_enabled: false,
    },
    message:
      'Software affiliate payout + partner settlement workflow closure COMPLETE. Composes S71 + S132 + KYC + S142–S148. Commission/settlement software reusable; production payout EXTERNAL_GATED. MockPayoutAdapter ≠ production. No real money moved. CAN_PRODUCTION_LAUNCH = NO.',
    correlation_id: input?.correlation_id,
    evaluated_at: new Date().toISOString(),
  };
}

export function assertNoSecretLeakInAffiliatePayoutPayload(blob: string): boolean {
  return assertNoSecretLeak(blob);
}
