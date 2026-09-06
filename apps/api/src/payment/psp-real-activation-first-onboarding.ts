/**
 * Sprint 102 — Real PSP / payment production activation preparation.
 * Composes S65/S85/S88. Never invents PSP brands, merchant IDs, or credentials.
 * Never processes real money.
 */
import {
  NO_PRODUCTION_PSP,
  evaluatePspFirstOnboarding,
  type PspActivationLifecycle,
} from './psp-first-onboarding';
import {
  PSP_CREDENTIAL_REFERENCE_MISSING,
  PSP_CURRENCY_CONFIGURATION_MISSING,
  PSP_MARKET_CONFIGURATION_MISSING,
  PSP_PROVIDER_NOT_SELECTED,
  PSP_RECONCILIATION_CONFIGURATION_MISSING,
  PSP_WEBHOOK_CONFIGURATION_MISSING,
  PSP_WEBHOOK_SECRET_REFERENCE_MISSING,
  validateProductionPspConfiguration,
} from './production-psp-requirements';
import { evaluateProductionFoundationFirstOnboarding } from '../ops/production-foundation-first-onboarding';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';

export {
  NO_PRODUCTION_PSP,
  PSP_PROVIDER_NOT_SELECTED,
  PSP_CREDENTIAL_REFERENCE_MISSING,
  PSP_WEBHOOK_SECRET_REFERENCE_MISSING,
  PSP_WEBHOOK_CONFIGURATION_MISSING,
  PSP_MARKET_CONFIGURATION_MISSING,
  PSP_CURRENCY_CONFIGURATION_MISSING,
  PSP_RECONCILIATION_CONFIGURATION_MISSING,
};

export type RealPspLifecycle =
  | 'NOT_SELECTED'
  | 'CONFIGURATION_REQUIRED'
  | 'CREDENTIALS_REQUIRED'
  | 'VERIFICATION_REQUIRED'
  | 'APPROVAL_REQUIRED'
  | 'READY_FOR_ACTIVATION'
  | 'ENABLED'
  | 'DISABLED'
  | 'EXTERNAL_GATED';

export type RealPspMarketStatus = {
  market: 'GLOBAL' | 'IN' | 'AE' | 'US';
  lifecycle: RealPspLifecycle;
  sandbox: 'SANDBOX_VERIFIED';
  production: 'PRODUCTION_NOT_CONFIGURED' | 'PRODUCTION_EXTERNAL_GATED' | 'ENABLED';
  blocker: string;
};

export type RealPspActivationChecklistItem = {
  id: string;
  label: string;
  mandatory: boolean;
  status: 'MISSING' | 'PRESENT' | 'PENDING' | 'N/A';
};

export type RealPspMismatchCondition = {
  code: string;
  description: string;
};

function mapLifecycle(s88: PspActivationLifecycle): RealPspLifecycle {
  if (s88 === 'ENABLED') return 'ENABLED';
  if (s88 === 'DISABLED') return 'DISABLED';
  if (s88 === 'NOT_SELECTED') return 'NOT_SELECTED';
  if (s88 === 'APPROVED') return 'APPROVAL_REQUIRED';
  if (s88 === 'VERIFIED') return 'VERIFICATION_REQUIRED';
  if (s88 === 'CONFIGURED') return 'CONFIGURATION_REQUIRED';
  return 'EXTERNAL_GATED';
}

export function buildRealPspActivationChecklist(): RealPspActivationChecklistItem[] {
  const v = validateProductionPspConfiguration();
  return [
    {
      id: 'psp_selected',
      label: 'Real PSP selected?',
      mandatory: true,
      status: v.provider_selected ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'merchant_relationship',
      label: 'Merchant/account relationship established?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'production_credentials',
      label: 'Production credentials via approved secret manager?',
      mandatory: true,
      status: v.credential_reference.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'webhook_configured',
      label: 'Webhook endpoint configured?',
      mandatory: true,
      status: v.webhook_configuration.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'webhook_verification_tested',
      label: 'Webhook verification tested?',
      mandatory: true,
      status: 'PENDING',
    },
    {
      id: 'markets_configured',
      label: 'Supported markets configured?',
      mandatory: true,
      status: v.market_configuration.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'currencies_configured',
      label: 'Supported currencies configured?',
      mandatory: true,
      status: v.currency_configuration.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'business_verification',
      label: 'Required business verification complete?',
      mandatory: true,
      status: 'PENDING',
    },
    {
      id: 'legal_commercial_approval',
      label: 'Legal/commercial approval complete?',
      mandatory: true,
      status: 'PENDING',
    },
    {
      id: 'reconciliation_configured',
      label: 'Reconciliation configured?',
      mandatory: true,
      status: v.reconciliation_configuration.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'monitoring_configured',
      label: 'Monitoring configured?',
      mandatory: true,
      status: 'PENDING',
    },
    {
      id: 'rollback_disable',
      label: 'Rollback/disable procedure available?',
      mandatory: true,
      status: 'PRESENT',
    },
  ];
}

export function buildRealPspMarketStatuses(): RealPspMarketStatus[] {
  return (['GLOBAL', 'IN', 'AE', 'US'] as const).map((market) => ({
    market,
    lifecycle: 'EXTERNAL_GATED' as const,
    sandbox: 'SANDBOX_VERIFIED' as const,
    production: 'PRODUCTION_EXTERNAL_GATED' as const,
    blocker: NO_PRODUCTION_PSP,
  }));
}

export function buildReconciliationMismatchCatalog(): RealPspMismatchCondition[] {
  return [
    { code: 'PSP_TX_MISSING_IN_WP', description: 'Payment exists in PSP but not World-Pharma' },
    { code: 'WP_PAID_PSP_DISAGREES', description: 'World-Pharma says paid but PSP disagrees' },
    { code: 'AMOUNT_MISMATCH', description: 'Amount mismatch' },
    { code: 'CURRENCY_MISMATCH', description: 'Currency mismatch' },
    { code: 'DUPLICATE_TRANSACTION', description: 'Duplicate transaction' },
    { code: 'REFUND_MISMATCH', description: 'Refund mismatch' },
    { code: 'UNKNOWN_PSP_EVENT', description: 'Unknown PSP event' },
  ];
}

export function evaluateRealPspActivationReadiness() {
  const s88 = evaluatePspFirstOnboarding();
  const validation = validateProductionPspConfiguration();
  const checklist = buildRealPspActivationChecklist();
  const markets = buildRealPspMarketStatuses();
  const mismatches = buildReconciliationMismatchCatalog();
  const foundation = evaluateProductionFoundationFirstOnboarding();

  const allMandatoryMet = checklist
    .filter((c) => c.mandatory)
    .every((c) => c.status === 'PRESENT' || c.status === 'N/A');

  // Never READY_FOR_ACTIVATION without real evidence — remain EXTERNAL_GATED / NOT_SELECTED
  const lifecycle: RealPspLifecycle = mapLifecycle(s88.activation_lifecycle);
  const ready_for_activation = false; // hard: no invented PSP

  return {
    real_psp_selected: false as const,
    lifecycle,
    ready_for_activation,
    checklist,
    markets,
    mismatches,
    foundation_blockers: [
      foundation.remaining_blocker,
      ...foundation.remaining_blockers.filter((b) =>
        [
          'NO_PRODUCTION_ENVIRONMENT',
          'NO_PRODUCTION_SECRETS_MANAGER',
          'NO_PRODUCTION_DATABASE',
          'NO_PRODUCTION_DEPLOYMENT_TARGET',
        ].includes(b),
      ),
    ],
    s88,
    validation,
    all_mandatory_met: allMandatoryMet,
    semantic_guards: {
      config_record_neq_enabled: true,
      sandbox_verified_neq_production_verified: true,
      ready_for_activation_neq_enabled: true,
      client_success_neq_paid: true,
      failed_never_becomes_paid_without_psp_evidence: true,
      payment_success_neq_vendor_payout: true,
      no_real_money_in_this_sprint: true,
    },
  };
}

export type RealPspFirstOnboardingReport = {
  sprint: 102;
  foundation_sprints: string;
  activation_lifecycle: RealPspLifecycle;
  environment: 'sandbox' | 'production';
  provider: 'NOT_SELECTED' | string;
  real_psp_selected: false;
  configured: boolean;
  verified: boolean;
  approved: boolean;
  enabled: false;
  sandbox: 'SANDBOX_VERIFIED';
  production: 'EXTERNAL_GATED';
  sandbox_payment: 'SANDBOX_VERIFIED';
  production_payment: 'EXTERNAL_GATED';
  webhook: string;
  refund: string;
  reconciliation: 'SANDBOX_VERIFIED' | 'PRODUCTION_NOT_YET_PROVEN';
  settlement_payout: 'EXTERNAL_PAYOUT_GATED';
  ready_for_activation: false;
  real_money_processed: false;
  production_psp_enabled: false;
  configuration_readiness: ReturnType<typeof evaluatePspFirstOnboarding>['configuration_readiness'];
  checklist: RealPspActivationChecklistItem[];
  markets: RealPspMarketStatus[];
  mismatch_catalog: RealPspMismatchCondition[];
  payment_state_machine: ReturnType<typeof evaluatePspFirstOnboarding>['payment_state_machine'];
  webhook_security: ReturnType<typeof evaluatePspFirstOnboarding>['webhook_security'];
  order_payment_consistency: ReturnType<typeof evaluatePspFirstOnboarding>['order_payment_consistency'];
  foundation_gate: 'EXTERNAL_GATED';
  remaining_blocker: typeof NO_PRODUCTION_PSP;
  remaining_blockers: string[];
  next_action: string;
  force_launch_available: false;
  force_deploy_available: false;
  country_policy: {
    status: 'POLICY_DRIVEN';
    hardcoded_market: false;
    markets_supported_for_evaluation: Array<'GLOBAL' | 'IN' | 'AE' | 'US'>;
    note: string;
  };
  permission_model: {
    customer_cannot_access_admin_psp: true;
    vendor_cannot_configure_psp: true;
    doctor_cannot_configure_psp: true;
    client_cannot_mark_paid: true;
    unauthorized_api_rejected: true;
    secrets_never_returned: true;
  };
  can_production_launch: 'NO';
  launch_control_overall: string;
  control_plane: 'S100_REUSED';
  foundation_plane: 'S101_REUSED';
  s88_plane: 'COMPOSED';
  evaluated_at: string;
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
  secrets_printed: false;
  fake_credentials_invented: false;
  message: string;
};

export function evaluateRealPspFirstOnboarding(
  input?: { correlation_id?: string },
): RealPspFirstOnboardingReport {
  const readiness = evaluateRealPspActivationReadiness();
  const s88 = readiness.s88;
  const launch = evaluateProductionLaunchControl({
    market: 'GLOBAL',
    service_scope: 'GLOBAL',
    correlation_id: input?.correlation_id,
  });

  const remaining_blockers = [
    NO_PRODUCTION_PSP,
    PSP_PROVIDER_NOT_SELECTED,
    PSP_CREDENTIAL_REFERENCE_MISSING,
    PSP_WEBHOOK_SECRET_REFERENCE_MISSING,
    PSP_WEBHOOK_CONFIGURATION_MISSING,
    PSP_MARKET_CONFIGURATION_MISSING,
    PSP_CURRENCY_CONFIGURATION_MISSING,
    PSP_RECONCILIATION_CONFIGURATION_MISSING,
    ...readiness.foundation_blockers,
    ...s88.remaining_blockers.slice(0, 6),
  ];

  return {
    sprint: 102,
    foundation_sprints: '28,30,65,85,87,88,98,100,101',
    activation_lifecycle: readiness.lifecycle,
    environment: s88.environment,
    provider: 'NOT_SELECTED',
    real_psp_selected: false,
    configured: s88.configured,
    verified: s88.verified,
    approved: s88.approved,
    enabled: false,
    sandbox: 'SANDBOX_VERIFIED',
    production: 'EXTERNAL_GATED',
    sandbox_payment: 'SANDBOX_VERIFIED',
    production_payment: 'EXTERNAL_GATED',
    webhook: String(s88.webhook),
    refund: String(s88.refund),
    reconciliation: 'PRODUCTION_NOT_YET_PROVEN',
    settlement_payout: 'EXTERNAL_PAYOUT_GATED',
    ready_for_activation: false,
    real_money_processed: false,
    production_psp_enabled: false,
    configuration_readiness: s88.configuration_readiness,
    checklist: readiness.checklist,
    markets: readiness.markets,
    mismatch_catalog: readiness.mismatches,
    payment_state_machine: s88.payment_state_machine,
    webhook_security: s88.webhook_security,
    order_payment_consistency: s88.order_payment_consistency,
    foundation_gate: 'EXTERNAL_GATED',
    remaining_blocker: NO_PRODUCTION_PSP,
    remaining_blockers: [...new Set(remaining_blockers)],
    next_action:
      'Select a real PSP + merchant account, vault credential/webhook refs via S101 secrets manager, complete market/currency/legal gates, then human approval. Do not invent credentials or process real money.',
    force_launch_available: false,
    force_deploy_available: false,
    country_policy: {
      status: 'POLICY_DRIVEN',
      hardcoded_market: false,
      markets_supported_for_evaluation: ['GLOBAL', 'IN', 'AE', 'US'],
      note: 'PSP may vary by market/currency/method via policy — no single-country hardcoding.',
    },
    permission_model: {
      customer_cannot_access_admin_psp: true,
      vendor_cannot_configure_psp: true,
      doctor_cannot_configure_psp: true,
      client_cannot_mark_paid: true,
      unauthorized_api_rejected: true,
      secrets_never_returned: true,
    },
    can_production_launch: 'NO',
    launch_control_overall: launch.overall_status,
    control_plane: 'S100_REUSED',
    foundation_plane: 'S101_REUSED',
    s88_plane: 'COMPOSED',
    evaluated_at: new Date().toISOString(),
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    secrets_printed: false,
    fake_credentials_invented: false,
    message:
      'Sprint 102 real PSP activation preparation: provider NOT_SELECTED / EXTERNAL_GATED. Sandbox MOCK checkout remains SANDBOX_VERIFIED. PRODUCTION PSP ENABLED = NO. REAL MONEY PROCESSED = NO. CAN_PRODUCTION_LAUNCH = NO.',
  };
}
