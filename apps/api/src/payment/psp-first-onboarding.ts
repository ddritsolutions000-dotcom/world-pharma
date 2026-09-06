/**
 * Sprint 65 foundation + Sprint 85 readiness + Sprint 88 production PSP activation readiness.
 * Never invent PSP names, merchant credentials, bank accounts, or real-money success.
 * Never print secrets / card PANs / webhook signing keys.
 *
 * Sandbox MOCK_* checkout = SANDBOX_VERIFIED / SANDBOX_ONLY.
 * Production PSP = EXTERNAL_GATED / NOT_SELECTED until a real non-mock adapter +
 * verified configuration references + human gates exist.
 *
 * Customer payment ≠ vendor payout (settlement remains EXTERNAL_PAYOUT_GATED — S30/S71).
 */
import type { ProviderActivationStage } from '../ops/provider-activation-contracts';
import { getProviderActivationContract } from '../ops/provider-activation-contracts';
import { evaluateProviderActivation } from '../ops/provider-activation';
import {
  listProductionPspRequirements,
  validateProductionPspConfiguration,
  type ProductionPspConfigurationValidation,
} from './production-psp-requirements';
import {
  isLivePaymentEnabled,
  isMockGatewayCode,
  readPaymentEnvironment,
} from './payment.config';
import { PaymentGatewayRegistry } from './gateway.registry';

/** Canonical production PSP umbrella blocker (S65/S85/S88). Never remove. */
export const NO_PRODUCTION_PSP = 'NO_PRODUCTION_PSP';

/** Sprint 88 activation contract lifecycle (canonical). */
export type PspActivationLifecycle =
  | 'NOT_SELECTED'
  | 'CONFIGURED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED'
  | 'DISABLED'
  | 'EXTERNAL_GATED';

export type PspOnboardingStatus =
  | 'NOT_SELECTED'
  | 'NOT_CONFIGURED'
  | 'CONFIGURED'
  | 'CONFIGURED_BUT_UNAVAILABLE'
  | 'VERIFIED_BUT_DISABLED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED'
  | 'EXTERNAL_GATED'
  | 'BLOCKED'
  | 'DISABLED';

/** Safe Admin readiness badges — never secret values. */
export type PspConfigurationReadiness = {
  provider: 'NOT_SELECTED' | string;
  environment: 'SANDBOX' | 'PRODUCTION';
  configuration: 'READY' | 'MISSING';
  webhook: 'READY' | 'MISSING';
  markets: 'READY' | 'MISSING';
  currencies: 'READY' | 'MISSING';
  reconciliation: 'READY' | 'MISSING';
  production_activation: 'EXTERNAL_GATED' | 'READY';
};
export type PspEnablementGuardCheck = {
  id: string;
  ok: boolean;
  detail: string;
};

export type PspCapabilityStatus =
  | 'SANDBOX_VERIFIED'
  | 'SANDBOX_SUPPORTED'
  | 'SANDBOX_ONLY'
  | 'EXTERNAL_GATED'
  | 'EXTERNAL_PAYOUT_GATED'
  | 'NOT_SELECTED'
  | 'POLICY_DRIVEN'
  | 'SOFTWARE_READY';

export type PspPaymentStateMachineSummary = {
  intent_statuses: string[];
  refund_statuses: string[];
  rules: string[];
  forbidden: string[];
};

export type PspWebhookSecuritySummary = {
  unsigned_rejected: true;
  invalid_signature_rejected: true;
  duplicate_idempotent: true;
  production_status: 'EXTERNAL_GATED' | 'SANDBOX_ONLY' | 'CONFIGURED';
  secrets_logged: false;
};

export type PspOrderPaymentConsistencySummary = {
  unpaid_blocks_paid_fulfillment: true;
  failed_payment_does_not_unlock_fulfillment: true;
  duplicate_confirm_does_not_duplicate_fulfillment: true;
  payment_success_not_equal_vendor_payout: true;
};

export type PspFirstOnboardingReport = {
  sprint: 88;
  foundation_sprint: 85;
  provider: 'NOT_SELECTED' | string;
  environment: 'sandbox' | 'production';
  configured: boolean;
  verified: boolean;
  approved: boolean;
  enabled: boolean;
  /** @deprecated use sandbox_status — retained for S65 UI compat as truthy sandbox signal */
  sandbox: boolean | 'SANDBOX_VERIFIED' | 'SANDBOX_ONLY';
  sandbox_status: 'SANDBOX_VERIFIED' | 'SANDBOX_ONLY' | 'SANDBOX_AVAILABLE';
  production: 'EXTERNAL_GATED' | 'BLOCKED' | 'READY_FOR_ENABLEMENT' | 'ENABLED';
  webhook: 'SANDBOX_ONLY' | 'EXTERNAL_GATED' | 'CONFIGURED';
  country_support: 'POLICY_DRIVEN' | 'NOT_CONFIGURED';
  currency_support: 'POLICY_DRIVEN' | 'NOT_CONFIGURED';
  refund: 'SANDBOX_SUPPORTED' | 'NOT_IMPLEMENTED' | 'EXTERNAL_GATED';
  settlement_payout: 'EXTERNAL_PAYOUT_GATED';
  reconciliation: 'SANDBOX_VERIFIED' | 'EXTERNAL_GATED';
  registered_gateway_codes: string[];
  non_mock_adapters_registered: string[];
  real_psp_available: false | true;
  activation_stage: ProviderActivationStage | PspOnboardingStatus;
  /** Canonical Sprint 88 lifecycle — production stays NOT_SELECTED or EXTERNAL_GATED without real PSP. */
  activation_lifecycle: PspActivationLifecycle;
  remaining_blocker: string;
  remaining_blockers: string[];
  next_action: string;
  enablement_guard: {
    can_enable: false | true;
    checks: PspEnablementGuardCheck[];
  };
  requirements: ReturnType<typeof listProductionPspRequirements>;
  configuration_validation: ProductionPspConfigurationValidation;
  configuration_readiness: PspConfigurationReadiness;
  payment_state_machine: PspPaymentStateMachineSummary;
  webhook_security: PspWebhookSecuritySummary;
  idempotency: 'SOFTWARE_READY';
  order_payment_consistency: PspOrderPaymentConsistencySummary;
  sandbox_payment: 'SANDBOX_VERIFIED' | 'SANDBOX_ONLY';
  production_payment: 'EXTERNAL_GATED';
  force_launch_available: false;
  fake_psp_invented: false;
  fake_merchant_credentials: false;
  fake_real_money_transaction: false;
  sandbox_cannot_silently_become_production: true;
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  secrets_printed: false;
  message: string;
};

export function listPspPaymentIntentStatuses(): string[] {
  return [
    'CREATED',
    'REQUIRES_ACTION',
    'PROCESSING',
    'AUTHORIZED',
    'AUTHORIZED_COD',
    'CAPTURED',
    'FAILED',
    'CANCELLED',
    'EXPIRED',
    'UNKNOWN',
  ];
}

export function listPspRefundStatuses(): string[] {
  return ['REQUESTED', 'PROCESSING', 'REFUNDED', 'FAILED'];
}

export function describePspPaymentStateMachine(): PspPaymentStateMachineSummary {
  return {
    intent_statuses: listPspPaymentIntentStatuses(),
    refund_statuses: listPspRefundStatuses(),
    rules: [
      'duplicate_initiation_idempotent',
      'duplicate_confirmation_idempotent',
      'invalid_transitions_rejected',
      'terminal_states_protected',
      'failed_payment_does_not_create_paid_order',
      'cancelled_payment_does_not_become_paid',
    ],
    forbidden: ['PAYMENT_FAILED→ORDER_PAID_WITHOUT_VERIFIED_RESULT'],
  };
}

export function describePspWebhookSecurity(
  productionReady: boolean,
): PspWebhookSecuritySummary {
  return {
    unsigned_rejected: true,
    invalid_signature_rejected: true,
    duplicate_idempotent: true,
    production_status: productionReady ? 'CONFIGURED' : 'EXTERNAL_GATED',
    secrets_logged: false,
  };
}

export function describePspOrderPaymentConsistency(): PspOrderPaymentConsistencySummary {
  return {
    unpaid_blocks_paid_fulfillment: true,
    failed_payment_does_not_unlock_fulfillment: true,
    duplicate_confirm_does_not_duplicate_fulfillment: true,
    payment_success_not_equal_vendor_payout: true,
  };
}

/**
 * Validate configuration stage — credentials alone never return ENABLED.
 */
export function validatePspConfiguration(input: {
  providerSelected: boolean;
  nonMockAdapterRegistered: boolean;
  paymentEnvironment: 'sandbox' | 'production';
  liveEnabled: boolean;
  humanApproved: boolean;
  r14aComplete: boolean;
  webhookProductionReady: boolean;
  emergencyDisabled: boolean;
}): PspOnboardingStatus {
  if (!input.providerSelected || !input.nonMockAdapterRegistered) return 'NOT_SELECTED';
  if (input.emergencyDisabled) return 'DISABLED';
  if (input.paymentEnvironment !== 'production' || !input.liveEnabled) {
    return 'CONFIGURED_BUT_UNAVAILABLE';
  }
  if (!input.humanApproved || !input.r14aComplete || !input.webhookProductionReady) {
    return 'VERIFIED_BUT_DISABLED';
  }
  // Never auto-ENABLED from this validator — enablement guard is authoritative.
  return 'APPROVED';
}

/** Map internal status → Sprint 88 canonical activation lifecycle. */
export function toPspActivationLifecycle(
  stage: PspOnboardingStatus | ProviderActivationStage | string,
  opts: { realPsp: boolean; productionStatus: string },
): PspActivationLifecycle {
  if (!opts.realPsp) {
    return opts.productionStatus === 'EXTERNAL_GATED' ? 'EXTERNAL_GATED' : 'NOT_SELECTED';
  }
  if (stage === 'ENABLED') return 'ENABLED';
  if (stage === 'DISABLED' || stage === 'BLOCKED') return 'DISABLED';
  if (stage === 'APPROVED') return 'APPROVED';
  if (stage === 'VERIFIED' || stage === 'VERIFIED_BUT_DISABLED') return 'VERIFIED';
  if (stage === 'CONFIGURED' || stage === 'CONFIGURED_BUT_UNAVAILABLE') return 'CONFIGURED';
  if (stage === 'EXTERNAL_GATED') return 'EXTERNAL_GATED';
  if (stage === 'NOT_SELECTED' || stage === 'NOT_CONFIGURED') return 'NOT_SELECTED';
  return 'EXTERNAL_GATED';
}

function buildConfigurationReadiness(
  validation: ProductionPspConfigurationValidation,
  env: 'sandbox' | 'production',
): PspConfigurationReadiness {
  const ready = (p: { reference_present: boolean }) =>
    p.reference_present ? ('READY' as const) : ('MISSING' as const);
  return {
    provider: validation.provider_name,
    environment: env === 'production' ? 'PRODUCTION' : 'SANDBOX',
    configuration: validation.credential_reference.reference_present ? 'READY' : 'MISSING',
    webhook:
      validation.webhook_secret_reference.reference_present &&
      validation.webhook_configuration.reference_present
        ? 'READY'
        : 'MISSING',
    markets: ready(validation.market_configuration),
    currencies: ready(validation.currency_configuration),
    reconciliation: ready(validation.reconciliation_configuration),
    // Never READY without verified production PSP — EXTERNAL_GATED until then.
    production_activation: 'EXTERNAL_GATED',
  };
}

function registeredNonMock(registry: PaymentGatewayRegistry | null): string[] {
  if (!registry) return [];
  return registry.registeredCodes().filter((c) => !isMockGatewayCode(c));
}

/**
 * Final guard before ENABLED — every check must pass.
 * Credentials alone never flip can_enable.
 */
export function evaluatePspEnablementGuard(input: {
  providerSelected: boolean;
  nonMockAdapterRegistered: boolean;
  paymentEnvironment: 'sandbox' | 'production';
  liveEnabled: boolean;
  humanApproved: boolean;
  r14aComplete: boolean;
  webhookProductionReady: boolean;
  emergencyDisabled: boolean;
}): { can_enable: false | true; checks: PspEnablementGuardCheck[] } {
  const checks: PspEnablementGuardCheck[] = [
    {
      id: 'provider_selected',
      ok: input.providerSelected,
      detail: input.providerSelected ? 'Provider selected' : 'provider_name is NOT_SELECTED',
    },
    {
      id: 'non_mock_adapter',
      ok: input.nonMockAdapterRegistered,
      detail: input.nonMockAdapterRegistered
        ? 'Non-mock adapter registered'
        : 'Only MOCK_* adapters registered — no production PSP adapter',
    },
    {
      id: 'environment_production',
      ok: input.paymentEnvironment === 'production',
      detail: `PAYMENT_ENVIRONMENT=${input.paymentEnvironment}`,
    },
    {
      id: 'live_flag',
      ok: input.liveEnabled,
      detail: input.liveEnabled ? 'PAYMENT_LIVE_ENABLED=true' : 'PAYMENT_LIVE_ENABLED is not true',
    },
    {
      id: 'human_approved',
      ok: input.humanApproved,
      detail: input.humanApproved
        ? 'Human approval recorded'
        : 'PROVIDER_APPROVED_PAYMENTS_PSP / approval missing',
    },
    {
      id: 'r14a',
      ok: input.r14aComplete,
      detail: input.r14aComplete ? 'R14-A complete' : 'R14-A human gates incomplete (typically 0/7)',
    },
    {
      id: 'webhook_production',
      ok: input.webhookProductionReady,
      detail: input.webhookProductionReady
        ? 'Production webhook handler ready'
        : 'Production webhook remains EXTERNAL_GATED / sandbox-only',
    },
    {
      id: 'not_emergency_disabled',
      ok: !input.emergencyDisabled,
      detail: input.emergencyDisabled ? 'Emergency disable active' : 'No emergency disable',
    },
  ];
  const can_enable = checks.every((c) => c.ok) as false | true;
  return { can_enable: can_enable ? true : false, checks };
}

export function evaluatePspFirstOnboarding(
  registry?: PaymentGatewayRegistry | null,
): PspFirstOnboardingReport {
  const env = readPaymentEnvironment();
  const live = isLivePaymentEnabled();
  const codes = registry?.registeredCodes() ?? [
    'MOCK',
    'MOCK_PRIMARY',
    'MOCK_FALLBACK',
    'MOCK_SECONDARY',
  ];
  const nonMock = registeredNonMock(registry ?? null);
  const realPsp = nonMock.length > 0;
  const provider = realPsp ? nonMock[0]! : 'NOT_SELECTED';
  const activation = evaluateProviderActivation(getProviderActivationContract('PAYMENTS_PSP'));
  const humanApproved =
    process.env['PROVIDER_APPROVED_PAYMENTS_PSP']?.trim().toLowerCase() === 'true' ||
    process.env['R14A_ALL_GATES_VERIFIED']?.trim().toLowerCase() === 'true';
  const r14aComplete = process.env['R14A_ALL_GATES_VERIFIED']?.trim().toLowerCase() === 'true';
  const emergency =
    process.env['PROVIDER_EMERGENCY_DISABLE_ALL']?.trim().toLowerCase() === 'true' ||
    process.env['PROVIDER_EMERGENCY_DISABLE_PAYMENTS_PSP']?.trim().toLowerCase() === 'true';

  const guard = evaluatePspEnablementGuard({
    providerSelected: realPsp,
    nonMockAdapterRegistered: realPsp,
    paymentEnvironment: env,
    liveEnabled: live,
    humanApproved,
    r14aComplete,
    webhookProductionReady: false, // no production webhook adapter registered in this codebase
    emergencyDisabled: emergency,
  });

  const configuration_validation = validateProductionPspConfiguration({
    providerSelected: realPsp,
    providerName: provider,
    nonMockAdapterRegistered: realPsp,
  });

  // Absolute: without a real PSP selection, never VERIFIED/APPROVED/ENABLED for production onboarding.
  const production: PspFirstOnboardingReport['production'] = realPsp
    ? guard.can_enable
      ? 'ENABLED'
      : 'READY_FOR_ENABLEMENT'
    : 'EXTERNAL_GATED';

  const sandboxStatus: PspFirstOnboardingReport['sandbox_status'] =
    env === 'sandbox' ? 'SANDBOX_VERIFIED' : 'SANDBOX_ONLY';

  const activation_stage: PspFirstOnboardingReport['activation_stage'] = realPsp
    ? activation.stage
    : 'NOT_SELECTED';

  const activation_lifecycle = toPspActivationLifecycle(activation_stage, {
    realPsp,
    productionStatus: production,
  });

  // Prefer NOT_SELECTED when no provider; EXTERNAL_GATED is the production posture.
  const lifecycleForDisplay: PspActivationLifecycle = !realPsp
    ? 'NOT_SELECTED'
    : activation_lifecycle === 'ENABLED'
      ? 'ENABLED'
      : production === 'EXTERNAL_GATED'
        ? 'EXTERNAL_GATED'
        : activation_lifecycle;

  const configuration_readiness = buildConfigurationReadiness(configuration_validation, env);

  const granular = configuration_validation.blockers;
  const remaining_blockers = realPsp
    ? ['Complete enablement guard checks before ENABLED', ...granular]
    : [NO_PRODUCTION_PSP, ...granular];

  // Deduplicate while keeping NO_PRODUCTION_PSP first when present.
  const deduped = [...new Set(remaining_blockers)];

  return {
    sprint: 88,
    foundation_sprint: 85,
    provider,
    environment: env,
    configured: realPsp && activation.configured,
    verified: false, // never claim verified without real connectivity evidence
    approved: false,
    enabled: false,
    sandbox: env === 'sandbox' ? 'SANDBOX_VERIFIED' : 'SANDBOX_ONLY',
    sandbox_status: sandboxStatus,
    production,
    webhook: realPsp ? 'EXTERNAL_GATED' : 'SANDBOX_ONLY',
    country_support: 'POLICY_DRIVEN',
    currency_support: 'POLICY_DRIVEN',
    refund: realPsp ? 'EXTERNAL_GATED' : 'SANDBOX_SUPPORTED',
    settlement_payout: 'EXTERNAL_PAYOUT_GATED',
    reconciliation: env === 'sandbox' ? 'SANDBOX_VERIFIED' : 'EXTERNAL_GATED',
    registered_gateway_codes: codes.map((c) => (isMockGatewayCode(c) ? c : 'REDACTED_NON_MOCK')),
    non_mock_adapters_registered: nonMock,
    real_psp_available: realPsp,
    activation_stage,
    activation_lifecycle: !realPsp ? 'NOT_SELECTED' : lifecycleForDisplay,
    remaining_blocker: realPsp
      ? 'Complete enablement guard checks before ENABLED'
      : NO_PRODUCTION_PSP,
    remaining_blockers: deduped,
    next_action: realPsp
      ? 'Complete R14-A + production webhook + human approval, then set PAYMENT_LIVE_ENABLED'
      : 'Supply merchant PSP contract + vault secret refs + register non-mock PaymentGatewayPort adapter',
    enablement_guard: guard,
    requirements: listProductionPspRequirements(),
    configuration_validation,
    configuration_readiness,
    payment_state_machine: describePspPaymentStateMachine(),
    webhook_security: describePspWebhookSecurity(false),
    idempotency: 'SOFTWARE_READY',
    order_payment_consistency: describePspOrderPaymentConsistency(),
    sandbox_payment: env === 'sandbox' ? 'SANDBOX_VERIFIED' : 'SANDBOX_ONLY',
    production_payment: 'EXTERNAL_GATED',
    force_launch_available: false,
    fake_psp_invented: false,
    fake_merchant_credentials: false,
    fake_real_money_transaction: false,
    sandbox_cannot_silently_become_production: true,
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    secrets_printed: false,
    message: realPsp
      ? 'Real PSP adapter detected — complete enablement guard before live traffic. Foundation: Sprint 85 / 65.'
      : `No production PSP selected (${NO_PRODUCTION_PSP}). Provider NOT_SELECTED. Production activation EXTERNAL_GATED. Sandbox MOCK_* checkout remains SANDBOX_VERIFIED. Settlement EXTERNAL_PAYOUT_GATED. Sprint 88 readiness on Sprint 85/65 foundation.`,
  };
}

/** Re-export helper for tests that need the payments activation contract. */
export function paymentsActivationContract() {
  return getProviderActivationContract('PAYMENTS_PSP');
}
