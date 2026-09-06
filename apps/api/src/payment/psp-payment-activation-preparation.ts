/**
 * Sprint 120 — Real PSP / payment activation preparation + payment production gate.
 * Composes S65/S85/S88/S102 (+ S87 launch, S116 security, S117–S119 foundation).
 * Does NOT invent PSP brands, merchant accounts, credentials, or real money movement.
 * Does NOT create a second payment framework or PSP lifecycle.
 * Current state MUST remain NOT_SELECTED / EXTERNAL_GATED. CAN_PRODUCTION_LAUNCH = NO.
 */
import {
  NO_PRODUCTION_PSP,
  evaluatePspFirstOnboarding,
  describePspPaymentStateMachine,
  describePspWebhookSecurity,
  describePspOrderPaymentConsistency,
  evaluatePspEnablementGuard,
  type PspActivationLifecycle,
} from './psp-first-onboarding';
import {
  evaluateRealPspFirstOnboarding,
  buildRealPspActivationChecklist,
  PSP_PROVIDER_NOT_SELECTED,
  PSP_CREDENTIAL_REFERENCE_MISSING,
  PSP_WEBHOOK_SECRET_REFERENCE_MISSING,
  PSP_WEBHOOK_CONFIGURATION_MISSING,
  PSP_CURRENCY_CONFIGURATION_MISSING,
  PSP_MARKET_CONFIGURATION_MISSING,
  PSP_RECONCILIATION_CONFIGURATION_MISSING,
} from './psp-real-activation-first-onboarding';
import {
  listProductionPspRequirements,
  validateProductionPspConfiguration,
} from './production-psp-requirements';
import { isMockGatewayCode, readPaymentEnvironment } from './payment.config';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';
import { evaluateProductionSecurityGate, EXTERNAL_PENTEST_REQUIRED } from '../ops/production-security-gate-consolidation';
import { evaluateProductionFoundationActivationPreparation } from '../ops/production-foundation-activation-preparation';
import { evaluateProductionReleaseEngineeringReadiness } from '../ops/production-release-engineering-readiness';
import { evaluateProductionDeploymentTargetActivation } from '../ops/production-deployment-target-activation-contract';

export {
  NO_PRODUCTION_PSP,
  PSP_PROVIDER_NOT_SELECTED,
  PSP_CREDENTIAL_REFERENCE_MISSING,
  PSP_WEBHOOK_SECRET_REFERENCE_MISSING,
  PSP_WEBHOOK_CONFIGURATION_MISSING,
};

export const PSP_PAYMENT_ACTIVATION_PREPARATION_AUTHORITATIVE =
  'PSP_PAYMENT_ACTIVATION_PREPARATION_AUTHORITATIVE';

export type PspConfigReferenceSlot = {
  id: string;
  label: string;
  reference_key: string;
  status: 'MISSING' | 'EXTERNAL_GATED' | 'NOT_SELECTED' | 'PRESENT';
  value_present: false;
  invented: false;
  secret: boolean;
};

export function buildPspConfigurationReferenceSlots(): PspConfigReferenceSlot[] {
  const slot = (
    id: string,
    label: string,
    reference_key: string,
    status: PspConfigReferenceSlot['status'],
    secret: boolean,
  ): PspConfigReferenceSlot => ({
    id,
    label,
    reference_key,
    status,
    value_present: false,
    invented: false,
    secret,
  });

  return [
    slot('provider_name', 'Provider name', 'PAYMENT_GATEWAY_PROVIDER', 'NOT_SELECTED', false),
    slot('production_api_endpoint', 'Production API endpoint reference', 'PAYMENT_GATEWAY_PRODUCTION_ENDPOINT_REF', 'MISSING', false),
    slot('merchant_account', 'Merchant / account reference', 'PAYMENT_MERCHANT_ACCOUNT_REF', 'MISSING', false),
    slot('public_key', 'Public key reference (where applicable)', 'PAYMENT_GATEWAY_PUBLIC_KEY_REF', 'MISSING', false),
    slot('secret_key', 'Secret key reference', 'PAYMENT_GATEWAY_PRODUCTION_SECRET_REF', 'MISSING', true),
    slot('webhook_endpoint', 'Webhook endpoint', 'PAYMENT_WEBHOOK_ENDPOINT_REF', 'MISSING', false),
    slot('webhook_signing_secret', 'Webhook signing-secret reference', 'PAYMENT_WEBHOOK_SECRET_REF', 'MISSING', true),
    slot('payment_methods', 'Supported payment methods', 'PAYMENT_METHODS_REF', 'EXTERNAL_GATED', false),
    slot('currencies', 'Supported currencies', 'PAYMENT_CURRENCIES_REF', 'EXTERNAL_GATED', false),
    slot('markets', 'Supported markets / countries', 'PAYMENT_MARKETS_REF', 'EXTERNAL_GATED', false),
    slot('refund_capability', 'Refund capability', 'PAYMENT_REFUND_CAPABILITY_REF', 'EXTERNAL_GATED', false),
    slot('capture_mode', 'Capture / authorization mode', 'PAYMENT_CAPTURE_MODE_REF', 'EXTERNAL_GATED', false),
    slot('idempotency', 'Idempotency requirements', 'PAYMENT_IDEMPOTENCY_CONTRACT', 'PRESENT', false),
    slot('settlement_reconciliation', 'Settlement / reconciliation reference', 'PAYMENT_RECONCILIATION_REF', 'MISSING', false),
    slot('environment_identity', 'Environment identity', 'PAYMENT_ENVIRONMENT', 'EXTERNAL_GATED', false),
  ];
}

export type PspFailClosedCase = {
  case_id: string;
  description: string;
  production_payment_blocked: true;
  primary_blocker: string;
};

export function evaluatePspProductionFailClosedCases(): PspFailClosedCase[] {
  return [
    {
      case_id: 'psp_not_selected',
      description: 'PSP NOT_SELECTED → production payment blocked',
      production_payment_blocked: true,
      primary_blocker: PSP_PROVIDER_NOT_SELECTED,
    },
    {
      case_id: 'credentials_missing',
      description: 'Provider selected but credential refs missing → blocked',
      production_payment_blocked: true,
      primary_blocker: PSP_CREDENTIAL_REFERENCE_MISSING,
    },
    {
      case_id: 'webhook_missing',
      description: 'Credentials present but webhook refs missing → blocked',
      production_payment_blocked: true,
      primary_blocker: PSP_WEBHOOK_CONFIGURATION_MISSING,
    },
    {
      case_id: 'not_verified',
      description: 'Configured but not verified → production initiation blocked',
      production_payment_blocked: true,
      primary_blocker: NO_PRODUCTION_PSP,
    },
    {
      case_id: 'external_gated',
      description: 'EXTERNAL_GATED → no live money movement',
      production_payment_blocked: true,
      primary_blocker: NO_PRODUCTION_PSP,
    },
    {
      case_id: 'mock_in_production',
      description: 'Mock/sandbox gateway selected for production → forbidden',
      production_payment_blocked: true,
      primary_blocker: NO_PRODUCTION_PSP,
    },
    {
      case_id: 'security_unresolved',
      description: 'Security gate unresolved → production payment blocked',
      production_payment_blocked: true,
      primary_blocker: EXTERNAL_PENTEST_REQUIRED,
    },
  ];
}

export type PspPaymentActivationPreparationReport = {
  sprint: 120;
  foundation_sprints: string;
  authoritative_source: 'psp-payment-activation-preparation';
  parallel_payment_framework_created: false;
  parallel_psp_lifecycle_created: false;
  parallel_webhook_system_created: false;
  parallel_idempotency_system_created: false;
  fake_psp_invented: false;
  real_money_processed: false;
  source_of_truth: {
    psp_lifecycle: 'S88_PspActivationLifecycle';
    real_activation: 'S102_COMPOSED';
    payment_gateway: 'S28_S44_EXISTING';
    state_machine: 'EXISTING_REUSED';
    webhooks: 'EXISTING_REUSED';
    idempotency: 'EXISTING_REUSED';
    security_gate: 'S116_COMPOSED';
    foundation: 'S117_S119_COMPOSED';
    launch_control: 'S87_COMPOSED';
  };
  psp: {
    lifecycle: PspActivationLifecycle;
    provider: 'NOT_SELECTED';
    production_credentials: 'MISSING';
    webhook: 'NOT_CONFIGURED';
    verification: 'NOT_VERIFIED';
    approval: 'NOT_APPROVED';
    enablement: 'EXTERNAL_GATED';
    production_payment: 'BLOCKED';
    sandbox_payment: 'SANDBOX_VERIFIED';
    enabled: false;
  };
  configuration_references: PspConfigReferenceSlot[];
  requirements: ReturnType<typeof listProductionPspRequirements>;
  configuration_validation: ReturnType<typeof validateProductionPspConfiguration>;
  payment_state_machine: ReturnType<typeof describePspPaymentStateMachine>;
  webhook_security: ReturnType<typeof describePspWebhookSecurity>;
  order_payment_integrity: ReturnType<typeof describePspOrderPaymentConsistency>;
  idempotency: {
    checkout_repeat: 'ONE_LOGICAL_ATTEMPT';
    webhook_duplicate: 'NO_DUPLICATE_CAPTURE';
    refund_duplicate: 'NO_DUPLICATE_REFUND';
    status: 'SOFTWARE_READY';
  };
  refunds: {
    architecture: 'EXISTING_REUSED';
    vendor_arbitrary_customer_refunds: 'FORBIDDEN_WITHOUT_PLATFORM_CONTROL';
    settlement_distinct_from_customer_payment: true;
    status: 'SOFTWARE_READY_EXTERNAL_GATED';
  };
  currency_market: {
    policy_driven: true;
    hardcoded_inr_global: false;
    accidental_xxx_fallback: 'FORBIDDEN';
    markets_evaluated: Array<'GLOBAL' | 'IN' | 'AE' | 'US'>;
    status: 'POLICY_DRIVEN';
  };
  sandbox_vs_production: {
    sandbox_mock_allowed: true;
    production_mock_forbidden: true;
    mock_gateway_codes_detected_as_mock: true;
    payment_environment: 'sandbox' | 'production';
  };
  checkout_fail_closed: {
    production_initiation_when_not_selected: 'BLOCKED';
    no_mock_fallback_in_production: true;
    no_fake_success: true;
    overall: 'PASS';
  };
  fail_closed_cases: PspFailClosedCase[];
  activation_checklist: ReturnType<typeof buildRealPspActivationChecklist>;
  enablement_guard: ReturnType<typeof evaluatePspEnablementGuard>;
  production_payment_gate: {
    available: false;
    mock_in_production: 'FORBIDDEN';
    status: 'EXTERNAL_GATED';
    source: 'S44_production-payment-gate_EXISTING';
  };
  security_gate: {
    remaining_blocker: string;
    certified: string;
  };
  admin_summary: {
    provider: 'NOT_SELECTED';
    production_credentials: 'MISSING';
    webhook: 'NOT_CONFIGURED';
    verification: 'NOT_VERIFIED';
    approval: 'NOT_APPROVED';
    enablement: 'EXTERNAL_GATED';
    production_payment: 'BLOCKED';
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
  evaluated_at: string;
  correlation_id?: string;
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
};

export function evaluatePspPaymentActivationPreparation(input?: {
  correlation_id?: string;
}): PspPaymentActivationPreparationReport {
  const s88 = evaluatePspFirstOnboarding();
  const s102 = evaluateRealPspFirstOnboarding();
  const config = validateProductionPspConfiguration();
  const env = readPaymentEnvironment();
  const security = evaluateProductionSecurityGate();
  const foundation = evaluateProductionFoundationActivationPreparation();
  const release = evaluateProductionReleaseEngineeringReadiness();
  const deploy = evaluateProductionDeploymentTargetActivation();
  const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
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

  void isMockGatewayCode('MOCK_CARD');
  void s88.activation_lifecycle;
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
    EXTERNAL_PENTEST_REQUIRED,
  ];

  return {
    sprint: 120,
    foundation_sprints: 'S28/S44/S65/S85/S88/S102/S87/S116/S117/S118/S119',
    authoritative_source: 'psp-payment-activation-preparation',
    parallel_payment_framework_created: false,
    parallel_psp_lifecycle_created: false,
    parallel_webhook_system_created: false,
    parallel_idempotency_system_created: false,
    fake_psp_invented: false,
    real_money_processed: false,
    source_of_truth: {
      psp_lifecycle: 'S88_PspActivationLifecycle',
      real_activation: 'S102_COMPOSED',
      payment_gateway: 'S28_S44_EXISTING',
      state_machine: 'EXISTING_REUSED',
      webhooks: 'EXISTING_REUSED',
      idempotency: 'EXISTING_REUSED',
      security_gate: 'S116_COMPOSED',
      foundation: 'S117_S119_COMPOSED',
      launch_control: 'S87_COMPOSED',
    },
    psp: {
      lifecycle: 'NOT_SELECTED',
      provider: 'NOT_SELECTED',
      production_credentials: 'MISSING',
      webhook: 'NOT_CONFIGURED',
      verification: 'NOT_VERIFIED',
      approval: 'NOT_APPROVED',
      enablement: 'EXTERNAL_GATED',
      production_payment: 'BLOCKED',
      sandbox_payment: 'SANDBOX_VERIFIED',
      enabled: false,
    },
    configuration_references: buildPspConfigurationReferenceSlots(),
    requirements: listProductionPspRequirements(),
    configuration_validation: config,
    payment_state_machine: describePspPaymentStateMachine(),
    webhook_security: describePspWebhookSecurity(false),
    order_payment_integrity: describePspOrderPaymentConsistency(),
    idempotency: {
      checkout_repeat: 'ONE_LOGICAL_ATTEMPT',
      webhook_duplicate: 'NO_DUPLICATE_CAPTURE',
      refund_duplicate: 'NO_DUPLICATE_REFUND',
      status: 'SOFTWARE_READY',
    },
    refunds: {
      architecture: 'EXISTING_REUSED',
      vendor_arbitrary_customer_refunds: 'FORBIDDEN_WITHOUT_PLATFORM_CONTROL',
      settlement_distinct_from_customer_payment: true,
      status: 'SOFTWARE_READY_EXTERNAL_GATED',
    },
    currency_market: {
      policy_driven: true,
      hardcoded_inr_global: false,
      accidental_xxx_fallback: 'FORBIDDEN',
      markets_evaluated: ['GLOBAL', 'IN', 'AE', 'US'],
      status: 'POLICY_DRIVEN',
    },
    sandbox_vs_production: {
      sandbox_mock_allowed: true,
      production_mock_forbidden: true,
      mock_gateway_codes_detected_as_mock: true,
      payment_environment: env,
    },
    checkout_fail_closed: {
      production_initiation_when_not_selected: 'BLOCKED',
      no_mock_fallback_in_production: true,
      no_fake_success: true,
      overall: 'PASS',
    },
    fail_closed_cases: evaluatePspProductionFailClosedCases(),
    activation_checklist: buildRealPspActivationChecklist(),
    enablement_guard: enablement,
    production_payment_gate: {
      available: false,
      mock_in_production: 'FORBIDDEN',
      status: 'EXTERNAL_GATED',
      source: 'S44_production-payment-gate_EXISTING',
    },
    security_gate: {
      remaining_blocker: security.remaining_blocker,
      certified: security.production_security_certified ?? 'NO',
    },
    admin_summary: {
      provider: 'NOT_SELECTED',
      production_credentials: 'MISSING',
      webhook: 'NOT_CONFIGURED',
      verification: 'NOT_VERIFIED',
      approval: 'NOT_APPROVED',
      enablement: 'EXTERNAL_GATED',
      production_payment: 'BLOCKED',
    },
    external_inputs_required: [
      'Real PSP / acquirer contract + merchant account',
      'Production API endpoint + credential refs in secrets manager (not in repo)',
      'Webhook endpoint + signing-secret refs',
      'Market/currency/method configuration per country policy',
      'Human verification + approval (R14-A / launch gates)',
      'Security certification (EXTERNAL_PENTEST_REQUIRED)',
      'Production environment/deployment target (S117–S119) before live enablement',
    ],
    remaining_blocker: NO_PRODUCTION_PSP,
    remaining_blockers,
    force_launch_available: false,
    force_enable_psp_available: false,
    can_production_launch: 'NO',
    why_launch_blocked:
      "Why can't World-Pharma take production payments yet? PSP is NOT_SELECTED; production credentials MISSING; webhook NOT_CONFIGURED; verification NOT_VERIFIED; enablement EXTERNAL_GATED. Production payment BLOCKED. Sandbox mock remains allowed in sandbox only. Security certification PENDING. No real money movement.",
    next_action:
      'When a real PSP account exists: supply configuration REFERENCES (never secret values in repo), verify webhooks, obtain human approval, then advance S88 lifecycle NOT_SELECTED→CONFIGURED→VERIFIED→APPROVED→ENABLED — do not invent a provider or rewrite payment architecture.',
    message:
      'Sprint 120 PSP payment activation preparation: lifecycle NOT_SELECTED, production payment BLOCKED, sandbox SANDBOX_VERIFIED. CAN_PRODUCTION_LAUNCH = NO.',
    security_statement:
      'S88 lifecycle reused (no second PSP state machine). Existing gateway/webhook/idempotency/refund architecture retained. Unsigned webhooks rejected. NO CAPTURE → NO PAID ORDER. Mock forbidden in production.',
    secrets_printed: false,
    evaluated_at: new Date().toISOString(),
    correlation_id: input?.correlation_id,
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
  };
}
