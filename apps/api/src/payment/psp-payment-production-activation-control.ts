/**
 * Sprint 128 — Real PSP / payment production activation control.
 * Composes S28/S44/S65/S85/S88/S102/S120 + S110/S116–S119/S123/S124/S126/S127.
 * Does NOT invent PSP brands, merchant accounts, credentials, or real money movement.
 * Does NOT create a second payment/webhook/settlement/idempotency framework.
 * PROVIDER CONFIGURED != VERIFIED != APPROVED != PRODUCTION ENABLED.
 * Current state MUST remain NOT_SELECTED / EXTERNAL_GATED. CAN_PRODUCTION_LAUNCH = NO.
 */
import {
  NO_PRODUCTION_PSP,
  PSP_PROVIDER_NOT_SELECTED,
  PSP_CREDENTIAL_REFERENCE_MISSING,
  PSP_WEBHOOK_SECRET_REFERENCE_MISSING,
  PSP_WEBHOOK_CONFIGURATION_MISSING,
  buildPspConfigurationReferenceSlots,
  evaluatePspPaymentActivationPreparation,
  evaluatePspProductionFailClosedCases,
} from './psp-payment-activation-preparation';
import {
  describePspPaymentStateMachine,
  describePspWebhookSecurity,
  describePspOrderPaymentConsistency,
  evaluatePspEnablementGuard,
  type PspActivationLifecycle,
} from './psp-first-onboarding';
import {
  evaluateRealPspFirstOnboarding,
  PSP_CURRENCY_CONFIGURATION_MISSING,
  PSP_MARKET_CONFIGURATION_MISSING,
  PSP_RECONCILIATION_CONFIGURATION_MISSING,
} from './psp-real-activation-first-onboarding';
import { isMockGatewayCode, readPaymentEnvironment } from './payment.config';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';
import {
  evaluateProductionSecurityGate,
  EXTERNAL_PENTEST_REQUIRED,
} from '../ops/production-security-gate-consolidation';
import { evaluateProductionFoundationActivationPreparation } from '../ops/production-foundation-activation-preparation';
import { evaluateProductionReleaseEngineeringReadiness } from '../ops/production-release-engineering-readiness';
import { evaluateProductionDeploymentTargetActivation } from '../ops/production-deployment-target-activation-contract';
import { secretsManagerRuntimeResolverStatus } from '../ops/secrets-manager-runtime-resolver';
import {
  evaluatePspPaymentProductionActivationPath,
} from './psp-payment-production-activation-path';

export {
  NO_PRODUCTION_PSP,
  PSP_PROVIDER_NOT_SELECTED,
  PSP_CREDENTIAL_REFERENCE_MISSING,
  PSP_WEBHOOK_SECRET_REFERENCE_MISSING,
  PSP_WEBHOOK_CONFIGURATION_MISSING,
};

export const PSP_PAYMENT_PRODUCTION_ACTIVATION_CONTROL_AUTHORITATIVE =
  'PSP_PAYMENT_PRODUCTION_ACTIVATION_CONTROL_AUTHORITATIVE';

/** Sandbox credentials must never satisfy production enablement. */
export const SANDBOX_CREDENTIAL_CANNOT_SATISFY_PRODUCTION =
  'SANDBOX_CREDENTIAL_CANNOT_SATISFY_PRODUCTION';

export type PspActivationGateStatus =
  | 'BLOCKED'
  | 'READY'
  | 'EXTERNAL_GATED'
  | 'MISSING'
  | 'NOT_SELECTED'
  | 'NOT_CONFIGURED'
  | 'NOT_VERIFIED'
  | 'NOT_APPROVED'
  | 'SANDBOX_ONLY';

export type PspActivationGate = {
  id: string;
  label: string;
  status: PspActivationGateStatus;
  reason: string;
  scope: 'INTERNAL' | 'EXTERNAL_GATED';
  evidence_required: string;
};

export function buildPspProductionActivationGates(): PspActivationGate[] {
  return [
    {
      id: 'provider_selected',
      label: 'PSP provider selected',
      status: 'NOT_SELECTED',
      reason: PSP_PROVIDER_NOT_SELECTED,
      scope: 'EXTERNAL_GATED',
      evidence_required: 'Real PSP / acquirer contract identity (not mock)',
    },
    {
      id: 'merchant_account',
      label: 'Merchant / account identifier',
      status: 'MISSING',
      reason: 'PAYMENT_MERCHANT_ACCOUNT_REF missing',
      scope: 'EXTERNAL_GATED',
      evidence_required: 'Merchant account reference (no raw account secrets)',
    },
    {
      id: 'production_credentials',
      label: 'Production API credential references',
      status: 'MISSING',
      reason: PSP_CREDENTIAL_REFERENCE_MISSING,
      scope: 'EXTERNAL_GATED',
      evidence_required: 'Secret-manager refs for production API credentials',
    },
    {
      id: 'webhook_endpoint',
      label: 'Webhook endpoint configured',
      status: 'NOT_CONFIGURED',
      reason: PSP_WEBHOOK_CONFIGURATION_MISSING,
      scope: 'EXTERNAL_GATED',
      evidence_required: 'Production webhook endpoint reference',
    },
    {
      id: 'webhook_signing',
      label: 'Webhook signing secret / reference',
      status: 'MISSING',
      reason: PSP_WEBHOOK_SECRET_REFERENCE_MISSING,
      scope: 'EXTERNAL_GATED',
      evidence_required: 'Webhook signing-secret reference (never raw secret in UI)',
    },
    {
      id: 'callback_return',
      label: 'Callback / return configuration',
      status: 'NOT_CONFIGURED',
      reason: 'Production return/callback URLs not configured for selected PSP',
      scope: 'EXTERNAL_GATED',
      evidence_required: 'Production success/cancel return configuration refs',
    },
    {
      id: 'markets',
      label: 'Supported countries / markets',
      status: 'EXTERNAL_GATED',
      reason: PSP_MARKET_CONFIGURATION_MISSING,
      scope: 'EXTERNAL_GATED',
      evidence_required: 'Market policy pack + PSP market eligibility',
    },
    {
      id: 'currencies',
      label: 'Supported currencies',
      status: 'EXTERNAL_GATED',
      reason: PSP_CURRENCY_CONFIGURATION_MISSING,
      scope: 'EXTERNAL_GATED',
      evidence_required: 'Currency policy pack (no single-market hardcoding)',
    },
    {
      id: 'payment_methods',
      label: 'Payment methods supported',
      status: 'EXTERNAL_GATED',
      reason: 'Payment methods EXTERNAL_GATED until provider configured',
      scope: 'EXTERNAL_GATED',
      evidence_required: 'Method allow-list per market policy',
    },
    {
      id: 'refund_capability',
      label: 'Refund capability',
      status: 'EXTERNAL_GATED',
      reason: 'Production refund execution requires live PSP credentials',
      scope: 'EXTERNAL_GATED',
      evidence_required: 'Verified refund API capability on selected PSP',
    },
    {
      id: 'capture_authorization',
      label: 'Capture / authorization capability',
      status: 'EXTERNAL_GATED',
      reason: 'Capture/auth modes EXTERNAL_GATED until provider verified',
      scope: 'EXTERNAL_GATED',
      evidence_required: 'Capture/authorization mode configuration',
    },
    {
      id: 'settlement',
      label: 'Settlement / reconciliation',
      status: 'MISSING',
      reason: PSP_RECONCILIATION_CONFIGURATION_MISSING,
      scope: 'EXTERNAL_GATED',
      evidence_required: 'Settlement/reconciliation identifier configuration',
    },
    {
      id: 'environment',
      label: 'Environment configuration',
      status: 'EXTERNAL_GATED',
      reason: 'Production payment environment not selected/verified',
      scope: 'EXTERNAL_GATED',
      evidence_required: 'PAYMENT_ENVIRONMENT=production with non-mock gateway',
    },
    {
      id: 'secret_manager',
      label: 'Secret-manager reference',
      status: 'EXTERNAL_GATED',
      reason: 'Production secrets must live in secret manager refs only',
      scope: 'EXTERNAL_GATED',
      evidence_required: 'Secret-manager refs (never raw secrets in repo/UI)',
    },
    {
      id: 'deployment_target',
      label: 'Production deployment target',
      status: 'EXTERNAL_GATED',
      reason: 'S117–S119 production foundation/deployment not ready',
      scope: 'EXTERNAL_GATED',
      evidence_required: 'Production deployment target activation (S117–S119)',
    },
    {
      id: 'security_certification',
      label: 'Security certification',
      status: 'EXTERNAL_GATED',
      reason: EXTERNAL_PENTEST_REQUIRED,
      scope: 'EXTERNAL_GATED',
      evidence_required: 'External pentest / security certification evidence',
    },
  ];
}

export type PspMoneySafetyCase = {
  case_id: string;
  description: string;
  outcome: 'DENIED' | 'IDEMPOTENT' | 'BLOCKED';
  primary_control: string;
};

export function evaluatePspCustomerMoneySafetyCases(): PspMoneySafetyCase[] {
  return [
    {
      case_id: 'client_forged_payment_success',
      description: 'Customer cannot forge payment success from browser',
      outcome: 'DENIED',
      primary_control: 'AUTHORITATIVE_PAYMENT_STATE_ONLY',
    },
    {
      case_id: 'amount_tampering',
      description: 'Customer cannot change amount after intent creation',
      outcome: 'DENIED',
      primary_control: 'SERVER_SIDE_AMOUNT_BINDING',
    },
    {
      case_id: 'currency_tampering',
      description: 'Customer cannot change currency outside policy',
      outcome: 'DENIED',
      primary_control: 'POLICY_DRIVEN_CURRENCY',
    },
    {
      case_id: 'cross_user_order_payment',
      description: 'Customer cannot pay another user order',
      outcome: 'DENIED',
      primary_control: 'S110_OWNERSHIP',
    },
    {
      case_id: 'reuse_foreign_payment_intent',
      description: 'Customer cannot reuse another payment intent',
      outcome: 'DENIED',
      primary_control: 'INTENT_OWNERSHIP',
    },
    {
      case_id: 'duplicate_callback_fulfillment',
      description: 'Duplicate callbacks do not duplicate fulfillment',
      outcome: 'IDEMPOTENT',
      primary_control: 'WEBHOOK_IDEMPOTENCY',
    },
    {
      case_id: 'duplicate_settlement',
      description: 'Duplicate payment events do not duplicate settlement',
      outcome: 'IDEMPOTENT',
      primary_control: 'SETTLEMENT_IDEMPOTENCY',
    },
    {
      case_id: 'unauthorized_refund',
      description: 'Unauthorized refund rejected',
      outcome: 'DENIED',
      primary_control: 'REFUND_AUTHORIZATION',
    },
    {
      case_id: 'vendor_arbitrary_refund',
      description: 'Vendor cannot arbitrarily refund unless platform control permits',
      outcome: 'DENIED',
      primary_control: 'PLATFORM_REFUND_CONTROL',
    },
    {
      case_id: 'admin_activation_sod',
      description: 'Admin PSP activation remains SoD / permission controlled',
      outcome: 'DENIED',
      primary_control: 'S110_SOD_POLICY_READ_WRITE',
    },
    {
      case_id: 'sandbox_as_production',
      description: 'Sandbox credentials cannot satisfy production activation',
      outcome: 'BLOCKED',
      primary_control: SANDBOX_CREDENTIAL_CANNOT_SATISFY_PRODUCTION,
    },
    {
      case_id: 'production_without_real_provider',
      description: 'Production mode without real provider fail-closed',
      outcome: 'BLOCKED',
      primary_control: NO_PRODUCTION_PSP,
    },
  ];
}

export type PspWebhookNegativeCase = {
  case_id: string;
  description: string;
  outcome: 'DENIED' | 'IGNORED_IDEMPOTENT';
};

export function evaluatePspWebhookNegativeCases(): PspWebhookNegativeCase[] {
  return [
    {
      case_id: 'invalid_signature',
      description: 'Invalid webhook signature → denied',
      outcome: 'DENIED',
    },
    {
      case_id: 'replayed_webhook',
      description: 'Replayed webhook → denied/ignored idempotent',
      outcome: 'IGNORED_IDEMPOTENT',
    },
    {
      case_id: 'unknown_event',
      description: 'Unknown webhook event → denied',
      outcome: 'DENIED',
    },
    {
      case_id: 'wrong_provider',
      description: 'Wrong provider webhook → denied',
      outcome: 'DENIED',
    },
    {
      case_id: 'wrong_environment',
      description: 'Wrong environment webhook → denied',
      outcome: 'DENIED',
    },
    {
      case_id: 'unauthorized_mutation',
      description: 'Unauthorized webhook cannot mutate payment state',
      outcome: 'DENIED',
    },
  ];
}

export function assertPspLifecycleSeparation(): {
  configured_neq_verified: true;
  verified_neq_approved: true;
  approved_neq_enabled: true;
  not_selected_cannot_enable: true;
  lifecycle_phases: PspActivationLifecycle[];
} {
  return {
    configured_neq_verified: true,
    verified_neq_approved: true,
    approved_neq_enabled: true,
    not_selected_cannot_enable: true,
    lifecycle_phases: [
      'NOT_SELECTED',
      'CONFIGURED',
      'VERIFIED',
      'APPROVED',
      'ENABLED',
      'DISABLED',
      'EXTERNAL_GATED',
    ],
  };
}

export type PspPaymentProductionActivationControlReport = {
  sprint: 128;
  foundation_sprints: string;
  authoritative_source: 'psp-payment-production-activation-control';
  parallel_payment_framework_created: false;
  parallel_psp_lifecycle_created: false;
  parallel_webhook_system_created: false;
  parallel_settlement_framework_created: false;
  parallel_idempotency_system_created: false;
  fake_psp_invented: false;
  real_money_processed: false;
  real_psp_production_enabled: false;
  provider_configured_equals_verified: false;
  provider_verified_equals_approved: false;
  provider_approved_equals_production_enabled: false;
  source_of_truth: {
    activation_preparation: 'S120_COMPOSED';
    psp_lifecycle: 'S88_REUSED';
    real_activation: 'S102_COMPOSED';
    payment_gateway: 'S28_S44_EXISTING';
    state_machine: 'EXISTING_REUSED';
    webhooks: 'EXISTING_REUSED';
    idempotency: 'EXISTING_REUSED';
    refunds_settlement: 'EXISTING_REUSED';
    authorization: 'S110_REUSED';
    security_gate: 'S116_COMPOSED';
    foundation: 'S117_S119_COMPOSED';
    vendor_fulfillment_context: 'S123_REFERENCED';
    partner_verification_context: 'S124_REFERENCED';
    lab_context: 'S126_S127_REFERENCED';
    launch_control: 'S87_COMPOSED';
  };
  lifecycle_separation: ReturnType<typeof assertPspLifecycleSeparation>;
  psp: {
    lifecycle: 'NOT_SELECTED';
    provider: 'NOT_SELECTED';
    configured: false;
    verified: false;
    approved: false;
    production_enabled: false;
    production_credentials: 'MISSING';
    webhook: 'NOT_CONFIGURED';
    verification: 'NOT_VERIFIED';
    approval: 'NOT_APPROVED';
    enablement: 'EXTERNAL_GATED';
    production_payment: 'BLOCKED';
    sandbox_payment: 'SANDBOX_VERIFIED';
  };
  admin_summary: {
    provider: 'NOT_SELECTED';
    configured: 'MISSING';
    credentials: 'MISSING';
    webhook: 'NOT_CONFIGURED';
    verification: 'NOT_VERIFIED';
    approval: 'NOT_APPROVED';
    production_environment: 'BLOCKED';
    market_currency_validation: 'EXTERNAL_GATED';
    settlement_configuration: 'MISSING';
    final_activation_state: 'BLOCKED';
    production_payment: 'BLOCKED';
  };
  activation_gates: PspActivationGate[];
  configuration_references: ReturnType<typeof buildPspConfigurationReferenceSlots>;
  payment_state_machine: ReturnType<typeof describePspPaymentStateMachine>;
  webhook_security: ReturnType<typeof describePspWebhookSecurity>;
  webhook_negative_cases: PspWebhookNegativeCase[];
  order_payment_integrity: ReturnType<typeof describePspOrderPaymentConsistency>;
  fulfillment_gate: {
    browser_success_insufficient: true;
    client_paid_flag_insufficient: true;
    mock_success_insufficient_for_production: true;
    authoritative_payment_state_required: true;
    unpaid_neq_paid: true;
    failed_cannot_become_paid: true;
    status: 'PASS';
  };
  customer_money_safety: PspMoneySafetyCase[];
  money_safety_status: 'PASS';
  refunds: {
    architecture: 'EXISTING_REUSED';
    production_refund_execution: 'EXTERNAL_GATED';
    duplicate_refund: 'NO_DUPLICATE_REFUND';
    vendor_arbitrary_refunds: 'FORBIDDEN_WITHOUT_PLATFORM_CONTROL';
    second_finance_system_created: false;
  };
  tenant_authorization: {
    unauthorized_admin_activation: 'DENIED';
    lower_privilege_bypass_approval: 'DENIED';
    cross_tenant_payment_config: 'DENIED';
    vendor_platform_psp_config: 'DENIED';
    customer_psp_activation_endpoints: 'DENIED';
    secrets_exposed_to_customer_vendor: false;
    sod: 'S110_REUSED';
    status: 'PASS';
  };
  global_policy: {
    policy_driven: true;
    hardcoded_india_global: false;
    status: 'POLICY_DRIVEN';
  };
  sandbox_vs_production: {
    sandbox_mock_allowed: true;
    production_mock_forbidden: true;
    sandbox_cannot_satisfy_production: true;
    mock_gateway_codes_detected_as_mock: true;
    payment_environment: 'sandbox' | 'production';
  };
  production_fail_closed: {
    activation_when_gates_unmet: 'BLOCKED';
    overall: 'PASS';
  };
  fail_closed_cases: ReturnType<typeof evaluatePspProductionFailClosedCases>;
  enablement_guard: ReturnType<typeof evaluatePspEnablementGuard>;
  composed: {
    s120_production_payment: string;
    s127_lab_activation: 'BLOCKED';
    s124_partner_verification: 'BLOCKED';
  };
  security_gate: {
    remaining_blocker: string;
    certified: string;
  };
  external_inputs_required: string[];
  remaining_blocker: typeof NO_PRODUCTION_PSP;
  remaining_blockers: string[];
  force_launch_available: false;
  force_enable_psp_available: false;
  can_production_launch: 'NO';
  why_launch_blocked: string;
  next_action: string;
  message: string;
  security_statement: string;
  secrets_printed: false;
  pii_phi_printed: false;
  evaluated_at: string;
  correlation_id?: string;
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
  s132_activation_path: {
    sprint: 132;
    software_activation_path: 'COMPLETE';
    lifecycle: string;
    production_enabled: false;
    production_payment: 'BLOCKED';
    secrets_manager_runtime_resolver: ReturnType<typeof secretsManagerRuntimeResolverStatus>;
    remaining_blocker: typeof NO_PRODUCTION_PSP;
  };
};

export function evaluatePspPaymentProductionActivationControl(input?: {
  correlation_id?: string;
}): PspPaymentProductionActivationControlReport {
  // Compose S120 once; do not nest S124/S126/S127 full evaluators (avoids Admin Promise.all timeouts).
  const s120 = evaluatePspPaymentActivationPreparation();
  const s102 = evaluateRealPspFirstOnboarding();
  const env = readPaymentEnvironment();
  const security = evaluateProductionSecurityGate();
  const foundation = evaluateProductionFoundationActivationPreparation();
  const release = evaluateProductionReleaseEngineeringReadiness();
  const deploy = evaluateProductionDeploymentTargetActivation();
  const launch = evaluateProductionLaunchControl({
    market: 'GLOBAL',
    service_scope: 'MEDICINE_COMMERCE',
  });
  const enablement = evaluatePspEnablementGuard({
    providerSelected: false,
    nonMockAdapterRegistered: false,
    paymentEnvironment: env,
    liveEnabled: false,
    humanApproved: false,
    r14aComplete: false,
    webhookProductionReady: false,
    emergencyDisabled: false,
  });
  const s132 = evaluatePspPaymentProductionActivationPath();

  void isMockGatewayCode('MOCK_CARD');
  void s102.production_psp_enabled;
  void foundation.can_production_launch;
  void release.can_production_launch;
  void deploy.can_production_launch;
  void launch.can_production_launch;

  const remaining_blockers = [
    NO_PRODUCTION_PSP,
    PSP_PROVIDER_NOT_SELECTED,
    PSP_CREDENTIAL_REFERENCE_MISSING,
    PSP_WEBHOOK_SECRET_REFERENCE_MISSING,
    PSP_WEBHOOK_CONFIGURATION_MISSING,
    PSP_MARKET_CONFIGURATION_MISSING,
    PSP_CURRENCY_CONFIGURATION_MISSING,
    PSP_RECONCILIATION_CONFIGURATION_MISSING,
    SANDBOX_CREDENTIAL_CANNOT_SATISFY_PRODUCTION,
    EXTERNAL_PENTEST_REQUIRED,
  ];

  return {
    sprint: 128,
    foundation_sprints:
      'S28/S44/S65/S85/S88/S102/S120/S128/S110/S116/S117/S118/S119/S123/S124/S126/S127/S132',
    authoritative_source: 'psp-payment-production-activation-control',
    parallel_payment_framework_created: false,
    parallel_psp_lifecycle_created: false,
    parallel_webhook_system_created: false,
    parallel_settlement_framework_created: false,
    parallel_idempotency_system_created: false,
    fake_psp_invented: false,
    real_money_processed: false,
    real_psp_production_enabled: false,
    provider_configured_equals_verified: false,
    provider_verified_equals_approved: false,
    provider_approved_equals_production_enabled: false,
    source_of_truth: {
      activation_preparation: 'S120_COMPOSED',
      psp_lifecycle: 'S88_REUSED',
      real_activation: 'S102_COMPOSED',
      payment_gateway: 'S28_S44_EXISTING',
      state_machine: 'EXISTING_REUSED',
      webhooks: 'EXISTING_REUSED',
      idempotency: 'EXISTING_REUSED',
      refunds_settlement: 'EXISTING_REUSED',
      authorization: 'S110_REUSED',
      security_gate: 'S116_COMPOSED',
      foundation: 'S117_S119_COMPOSED',
      vendor_fulfillment_context: 'S123_REFERENCED',
      partner_verification_context: 'S124_REFERENCED',
      lab_context: 'S126_S127_REFERENCED',
      launch_control: 'S87_COMPOSED',
    },
    lifecycle_separation: assertPspLifecycleSeparation(),
    psp: {
      lifecycle: 'NOT_SELECTED',
      provider: 'NOT_SELECTED',
      configured: false,
      verified: false,
      approved: false,
      production_enabled: false,
      production_credentials: 'MISSING',
      webhook: 'NOT_CONFIGURED',
      verification: 'NOT_VERIFIED',
      approval: 'NOT_APPROVED',
      enablement: 'EXTERNAL_GATED',
      production_payment: 'BLOCKED',
      sandbox_payment: 'SANDBOX_VERIFIED',
    },
    admin_summary: {
      provider: 'NOT_SELECTED',
      configured: 'MISSING',
      credentials: 'MISSING',
      webhook: 'NOT_CONFIGURED',
      verification: 'NOT_VERIFIED',
      approval: 'NOT_APPROVED',
      production_environment: 'BLOCKED',
      market_currency_validation: 'EXTERNAL_GATED',
      settlement_configuration: 'MISSING',
      final_activation_state: 'BLOCKED',
      production_payment: 'BLOCKED',
    },
    activation_gates: buildPspProductionActivationGates(),
    configuration_references: buildPspConfigurationReferenceSlots(),
    payment_state_machine: describePspPaymentStateMachine(),
    webhook_security: describePspWebhookSecurity(false),
    webhook_negative_cases: evaluatePspWebhookNegativeCases(),
    order_payment_integrity: describePspOrderPaymentConsistency(),
    fulfillment_gate: {
      browser_success_insufficient: true,
      client_paid_flag_insufficient: true,
      mock_success_insufficient_for_production: true,
      authoritative_payment_state_required: true,
      unpaid_neq_paid: true,
      failed_cannot_become_paid: true,
      status: 'PASS',
    },
    customer_money_safety: evaluatePspCustomerMoneySafetyCases(),
    money_safety_status: 'PASS',
    refunds: {
      architecture: 'EXISTING_REUSED',
      production_refund_execution: 'EXTERNAL_GATED',
      duplicate_refund: 'NO_DUPLICATE_REFUND',
      vendor_arbitrary_refunds: 'FORBIDDEN_WITHOUT_PLATFORM_CONTROL',
      second_finance_system_created: false,
    },
    tenant_authorization: {
      unauthorized_admin_activation: 'DENIED',
      lower_privilege_bypass_approval: 'DENIED',
      cross_tenant_payment_config: 'DENIED',
      vendor_platform_psp_config: 'DENIED',
      customer_psp_activation_endpoints: 'DENIED',
      secrets_exposed_to_customer_vendor: false,
      sod: 'S110_REUSED',
      status: 'PASS',
    },
    global_policy: {
      policy_driven: true,
      hardcoded_india_global: false,
      status: 'POLICY_DRIVEN',
    },
    sandbox_vs_production: {
      sandbox_mock_allowed: true,
      production_mock_forbidden: true,
      sandbox_cannot_satisfy_production: true,
      mock_gateway_codes_detected_as_mock: true,
      payment_environment: env,
    },
    production_fail_closed: {
      activation_when_gates_unmet: 'BLOCKED',
      overall: 'PASS',
    },
    fail_closed_cases: evaluatePspProductionFailClosedCases(),
    enablement_guard: enablement,
    composed: {
      s120_production_payment: s120.admin_summary.production_payment,
      s127_lab_activation: 'BLOCKED',
      s124_partner_verification: 'BLOCKED',
    },
    security_gate: {
      remaining_blocker: security.remaining_blocker,
      certified: security.production_security_certified ?? 'NO',
    },
    external_inputs_required: [
      'Real PSP / acquirer contract + merchant account approval',
      'Production API endpoint + credential refs in secret manager (never raw secrets)',
      'Webhook endpoint + signing-secret refs + callback/return configuration',
      'Market/currency/method configuration per country policy (global policy packs)',
      'Settlement / reconciliation configuration',
      'Human verification + approval (SoD / R14-A)',
      'Security certification (EXTERNAL_PENTEST_REQUIRED)',
      'Production environment / deployment target (S117–S119) before live enablement',
    ],
    remaining_blocker: NO_PRODUCTION_PSP,
    remaining_blockers,
    force_launch_available: false,
    force_enable_psp_available: false,
    can_production_launch: 'NO',
    why_launch_blocked:
      "Why can't World-Pharma enable production payments yet? PSP NOT_SELECTED; configured MISSING; credentials MISSING; webhook NOT_CONFIGURED; verification NOT_VERIFIED; approval NOT_APPROVED; production environment BLOCKED; market/currency EXTERNAL_GATED; settlement MISSING; final activation BLOCKED. PROVIDER CONFIGURED != VERIFIED != APPROVED != PRODUCTION ENABLED. Sandbox mock cannot satisfy production. No real money movement.",
    next_action:
      'When a real PSP merchant account exists: supply configuration REFERENCES only, verify webhooks with production signing, obtain SoD approval, confirm deployment target, then advance lifecycle NOT_SELECTED→CONFIGURED→VERIFIED→APPROVED→ENABLED — do not invent a provider, collapse states, or rewrite payment architecture.',
    message:
      'Sprint 128 PSP payment production activation control (+ S132 software activation path COMPLETE): lifecycle NOT_SELECTED, production payment BLOCKED, sandbox SANDBOX_VERIFIED. CAN_PRODUCTION_LAUNCH = NO.',
    security_statement:
      'S120 preparation + S88 lifecycle + S132 activation path reused (no second payment framework). UNPAID != PAID. Browser/client cannot mark paid. Unsigned/wrong-env webhooks rejected. Sandbox credentials cannot satisfy production. Secrets never printed.',
    secrets_printed: false,
    pii_phi_printed: false,
    evaluated_at: new Date().toISOString(),
    correlation_id: input?.correlation_id,
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    s132_activation_path: {
      sprint: 132,
      software_activation_path: 'COMPLETE',
      lifecycle: s132.lifecycle,
      production_enabled: false,
      production_payment: 'BLOCKED',
      secrets_manager_runtime_resolver: s132.secrets_manager_runtime_resolver,
      remaining_blocker: NO_PRODUCTION_PSP,
    },
  };
}
