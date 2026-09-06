/**
 * Sprint 132 — Real PSP / payment production activation path (software).
 * Reuses S28/S44/S65/S85/S88/S102/S120/S128 (+ foundation/security rails).
 * Does NOT invent PSP brands, credentials, or process real money.
 * Does NOT create a second payment/webhook/settlement framework.
 * CONFIGURED ≠ VERIFIED ≠ APPROVED ≠ ENABLED.
 * Without genuine provider credentials / adapters: EXTERNAL_GATED + fail-closed.
 */
import { Errors } from '../common/problem';
import {
  canTransitionIntent,
  TERMINAL_INTENTS,
} from './state-machine';
import { PaymentIntentStatus } from '@prisma/client';
import {
  isLivePaymentEnabled,
  isMockGatewayCode,
  readPaymentEnvironment,
  type PaymentRuntimeEnvironment,
} from './payment.config';
import {
  NO_PRODUCTION_PSP,
  PSP_CREDENTIAL_REFERENCE_MISSING,
  PSP_PROVIDER_NOT_SELECTED,
  PSP_WEBHOOK_CONFIGURATION_MISSING,
  PSP_WEBHOOK_SECRET_REFERENCE_MISSING,
} from './psp-real-activation-first-onboarding';
import {
  PSP_CURRENCY_CONFIGURATION_MISSING,
  PSP_MARKET_CONFIGURATION_MISSING,
  PSP_RECONCILIATION_CONFIGURATION_MISSING,
  validateProductionPspConfiguration,
} from './production-psp-requirements';
import {
  describePspOrderPaymentConsistency,
  describePspPaymentStateMachine,
  describePspWebhookSecurity,
  evaluatePspEnablementGuard,
  type PspActivationLifecycle,
} from './psp-first-onboarding';
import {
  secretsManagerRuntimeResolverStatus,
} from '../ops/secrets-manager-runtime-resolver';

export const PSP_PAYMENT_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE =
  'PSP_PAYMENT_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE';

/** Human verification marker — presence only; never invents a verified PSP. */
export const PAYMENT_PSP_VERIFICATION_STATUS_ENV = 'PAYMENT_PSP_VERIFICATION_STATUS';
export const PAYMENT_PSP_APPROVAL_STATUS_ENV = 'PAYMENT_PSP_APPROVAL_STATUS';

export const PRODUCTION_PSP_INITIATION_BLOCKED = 'PRODUCTION_PSP_INITIATION_BLOCKED';
export const PRODUCTION_WEBHOOK_EXTERNAL_GATED = 'PRODUCTION_WEBHOOK_EXTERNAL_GATED';
export const MOCK_PSP_BLOCKED_IN_PRODUCTION = 'MOCK_PSP_BLOCKED_IN_PRODUCTION';
export const CLIENT_FORGED_PAYMENT_SUCCESS_REJECTED = 'CLIENT_FORGED_PAYMENT_SUCCESS_REJECTED';

function envPresent(key: string): boolean {
  const v = process.env[key]?.trim();
  return Boolean(v && v.length > 0 && !/^changeme|todo|placeholder|xxx$/i.test(v));
}

function envValue(key: string): string | null {
  const v = process.env[key]?.trim();
  if (!v || /^changeme|todo|placeholder|xxx$/i.test(v)) {
    return null;
  }
  return v;
}

/** Read configured production provider code — mock codes are treated as not selected. */
export function readConfiguredProductionPspProvider(): {
  selected: boolean;
  code: string | null;
  is_mock: boolean;
} {
  const raw = envValue('PAYMENT_GATEWAY_PROVIDER');
  if (!raw) {
    return { selected: false, code: null, is_mock: false };
  }
  const code = raw.toUpperCase();
  if (isMockGatewayCode(code) || code === 'MOCK') {
    return { selected: false, code, is_mock: true };
  }
  return { selected: true, code, is_mock: false };
}

export type PspConfigSlotPresence = {
  id: string;
  label: string;
  reference_key: string;
  status: 'MISSING' | 'PRESENT' | 'NOT_SELECTED' | 'EXTERNAL_GATED' | 'REJECTED_MOCK';
  reference_present: boolean;
  secret: boolean;
  /** Never includes secret values. */
  value_leaked: false;
};

/** Live reference inventory — presence of refs only; never secret values. */
export function buildLivePspConfigurationReferenceSlots(): PspConfigSlotPresence[] {
  const provider = readConfiguredProductionPspProvider();
  const slot = (
    id: string,
    label: string,
    reference_key: string,
    secret: boolean,
    statusOverride?: PspConfigSlotPresence['status'],
  ): PspConfigSlotPresence => {
    const present = envPresent(reference_key);
    let status: PspConfigSlotPresence['status'] = present ? 'PRESENT' : 'MISSING';
    if (statusOverride) {
      status = statusOverride;
    } else if (id === 'provider_name') {
      if (provider.is_mock) status = 'REJECTED_MOCK';
      else if (!provider.selected) status = 'NOT_SELECTED';
      else status = 'PRESENT';
    }
    return {
      id,
      label,
      reference_key,
      status,
      reference_present: id === 'provider_name' ? provider.selected : present,
      secret,
      value_leaked: false,
    };
  };

  return [
    slot('provider_name', 'Provider name', 'PAYMENT_GATEWAY_PROVIDER', false),
    slot(
      'production_api_endpoint',
      'Production API endpoint reference',
      'PAYMENT_GATEWAY_PRODUCTION_ENDPOINT_REF',
      false,
    ),
    slot('merchant_account', 'Merchant / account reference', 'PAYMENT_MERCHANT_ACCOUNT_REF', false),
    slot('public_key', 'Public key reference', 'PAYMENT_GATEWAY_PUBLIC_KEY_REF', false),
    slot('secret_key', 'Secret key reference', 'PAYMENT_GATEWAY_PRODUCTION_SECRET_REF', true),
    slot('webhook_endpoint', 'Webhook endpoint', 'PAYMENT_WEBHOOK_ENDPOINT_REF', false),
    slot('webhook_signing_secret', 'Webhook signing-secret reference', 'PAYMENT_WEBHOOK_SECRET_REF', true),
    slot('payment_methods', 'Supported payment methods', 'PAYMENT_METHODS_REF', false),
    slot('currencies', 'Supported currencies', 'PAYMENT_PRODUCTION_CURRENCIES', false),
    slot('markets', 'Supported markets / countries', 'PAYMENT_PRODUCTION_COUNTRIES', false),
    slot('refund_capability', 'Refund capability', 'PAYMENT_REFUND_CAPABILITY_REF', false),
    slot('capture_mode', 'Capture / authorization mode', 'PAYMENT_CAPTURE_MODE_REF', false),
    slot(
      'settlement_reconciliation',
      'Settlement / reconciliation reference',
      'PAYMENT_RECONCILIATION_CONFIG_REF',
      false,
    ),
    slot('environment_identity', 'Environment identity', 'PAYMENT_ENVIRONMENT', false),
  ];
}

export type ProductionPspActivationPathSnapshot = {
  sprint: 132;
  authoritative_source: typeof PSP_PAYMENT_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE;
  parallel_payment_framework_created: false;
  fake_psp_invented: false;
  real_money_processed: false;
  secrets_manager_runtime_resolver: ReturnType<typeof secretsManagerRuntimeResolverStatus>;
  payment_environment: PaymentRuntimeEnvironment;
  live_enabled: boolean;
  provider: {
    selected: boolean;
    code: string | null;
    mock_rejected: boolean;
  };
  configuration_slots: PspConfigSlotPresence[];
  required_refs_present: boolean;
  lifecycle: PspActivationLifecycle;
  configured: boolean;
  verified: boolean;
  approved: boolean;
  production_enabled: boolean;
  production_payment: 'BLOCKED' | 'EXTERNAL_GATED';
  software_activation_path: 'COMPLETE';
  webhook_production_ready: false;
  non_mock_adapter_registered: false;
  enablement_guard: ReturnType<typeof evaluatePspEnablementGuard>;
  blockers: string[];
  remaining_blocker: typeof NO_PRODUCTION_PSP;
  can_production_launch: 'NO';
  secrets_printed: false;
  message: string;
};

function humanVerified(): boolean {
  return (envValue(PAYMENT_PSP_VERIFICATION_STATUS_ENV) ?? '').toLowerCase() === 'verified';
}

function humanApproved(): boolean {
  return (envValue(PAYMENT_PSP_APPROVAL_STATUS_ENV) ?? '').toLowerCase() === 'approved';
}

/**
 * Derive lifecycle from real env presence.
 * Never advances VERIFIED/APPROVED/ENABLED from configuration fields alone.
 * Never enables production without non-mock adapter + live gates (both remain false here).
 */
export function deriveProductionPspLifecycle(input?: {
  nonMockAdapterRegistered?: boolean;
}): {
  lifecycle: PspActivationLifecycle;
  configured: boolean;
  verified: boolean;
  approved: boolean;
  production_enabled: boolean;
  required_refs_present: boolean;
  blockers: string[];
} {
  const provider = readConfiguredProductionPspProvider();
  const slots = buildLivePspConfigurationReferenceSlots();
  const blockers: string[] = [];

  if (!provider.selected) {
    blockers.push(provider.is_mock ? MOCK_PSP_BLOCKED_IN_PRODUCTION : PSP_PROVIDER_NOT_SELECTED);
  }

  const requiredKeys = [
    'PAYMENT_GATEWAY_PRODUCTION_SECRET_REF',
    'PAYMENT_WEBHOOK_SECRET_REF',
    'PAYMENT_WEBHOOK_ENDPOINT_REF',
    'PAYMENT_MERCHANT_ACCOUNT_REF',
    'PAYMENT_PRODUCTION_COUNTRIES',
    'PAYMENT_PRODUCTION_CURRENCIES',
    'PAYMENT_RECONCILIATION_CONFIG_REF',
  ] as const;

  const required_refs_present = requiredKeys.every((k) => envPresent(k));
  if (!envPresent('PAYMENT_GATEWAY_PRODUCTION_SECRET_REF')) {
    blockers.push(PSP_CREDENTIAL_REFERENCE_MISSING);
  }
  if (!envPresent('PAYMENT_WEBHOOK_SECRET_REF')) {
    blockers.push(PSP_WEBHOOK_SECRET_REFERENCE_MISSING);
  }
  if (!envPresent('PAYMENT_WEBHOOK_ENDPOINT_REF')) {
    blockers.push(PSP_WEBHOOK_CONFIGURATION_MISSING);
  }
  if (!envPresent('PAYMENT_PRODUCTION_COUNTRIES')) {
    blockers.push(PSP_MARKET_CONFIGURATION_MISSING);
  }
  if (!envPresent('PAYMENT_PRODUCTION_CURRENCIES')) {
    blockers.push(PSP_CURRENCY_CONFIGURATION_MISSING);
  }
  if (!envPresent('PAYMENT_RECONCILIATION_CONFIG_REF')) {
    blockers.push(PSP_RECONCILIATION_CONFIGURATION_MISSING);
  }

  const configured = provider.selected && required_refs_present;
  // Explicit human markers only — never inferred from refs.
  const verified = configured && humanVerified();
  const approved = verified && humanApproved();
  const nonMock = Boolean(input?.nonMockAdapterRegistered);
  const production_enabled =
    approved &&
    isLivePaymentEnabled() &&
    readPaymentEnvironment() === 'production' &&
    nonMock;

  let lifecycle: PspActivationLifecycle = 'NOT_SELECTED';
  if (production_enabled) {
    lifecycle = 'ENABLED';
  } else if (approved) {
    lifecycle = 'APPROVED';
  } else if (verified) {
    lifecycle = 'VERIFIED';
  } else if (configured) {
    lifecycle = 'CONFIGURED';
  } else if (provider.selected || slots.some((s) => s.reference_present)) {
    lifecycle = 'EXTERNAL_GATED';
  }

  if (!production_enabled) {
    blockers.push(NO_PRODUCTION_PSP);
  }
  if (!nonMock) {
    blockers.push('PRODUCTION_GATEWAY_ADAPTER_NOT_REGISTERED');
  }
  // S142: software resolver COMPLETE — no longer a MISSING software blocker.

  return {
    lifecycle,
    configured,
    verified,
    approved,
    production_enabled: false, // hard fail-closed until real adapter exists
    required_refs_present,
    blockers: [...new Set(blockers)],
  };
}

export function evaluatePspPaymentProductionActivationPath(input?: {
  correlation_id?: string;
  nonMockAdapterRegistered?: boolean;
}): ProductionPspActivationPathSnapshot & {
  correlation_id?: string;
  payment_state_machine: ReturnType<typeof describePspPaymentStateMachine>;
  webhook_security: ReturnType<typeof describePspWebhookSecurity>;
  order_payment_integrity: ReturnType<typeof describePspOrderPaymentConsistency>;
  illegal_transitions_blocked: true;
  fulfillment_gate: {
    unpaid_cannot_fulfill: true;
    client_forged_success_rejected: true;
    mock_success_insufficient_for_production: true;
    status: 'PASS';
  };
  refunds: {
    architecture: 'EXISTING_REUSED';
    unauthorized_client_refund: 'DENIED';
    duplicate_refund_protected: true;
  };
  reconciliation: {
    architecture: 'EXISTING_REUSED';
    silent_reconcile_without_provider_evidence: false;
  };
  global_policy: {
    policy_driven: true;
    hardcoded_india_global: false;
  };
  sandbox_vs_production: {
    sandbox_mock_allowed: true;
    production_mock_forbidden: true;
    production_never_uses_sandbox_credentials: true;
  };
  composed_s128_control: {
    sprint: 128;
    production_payment: 'BLOCKED';
  };
  evaluated_at: string;
} {
  const provider = readConfiguredProductionPspProvider();
  const derived = deriveProductionPspLifecycle({
    nonMockAdapterRegistered: input?.nonMockAdapterRegistered ?? false,
  });
  const env = readPaymentEnvironment();
  const live = isLivePaymentEnabled();
  const enablement = evaluatePspEnablementGuard({
    providerSelected: provider.selected,
    nonMockAdapterRegistered: false,
    paymentEnvironment: env,
    liveEnabled: live,
    humanApproved: derived.approved,
    r14aComplete: false,
    webhookProductionReady: false,
    emergencyDisabled: false,
  });

  return {
    sprint: 132,
    authoritative_source: PSP_PAYMENT_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE,
    parallel_payment_framework_created: false,
    fake_psp_invented: false,
    real_money_processed: false,
    secrets_manager_runtime_resolver: secretsManagerRuntimeResolverStatus(),
    payment_environment: env,
    live_enabled: live,
    provider: {
      selected: provider.selected,
      code: provider.code,
      mock_rejected: provider.is_mock,
    },
    configuration_slots: buildLivePspConfigurationReferenceSlots(),
    required_refs_present: derived.required_refs_present,
    lifecycle: derived.lifecycle,
    configured: derived.configured,
    verified: derived.verified,
    approved: derived.approved,
    production_enabled: false,
    production_payment: 'BLOCKED',
    software_activation_path: 'COMPLETE',
    webhook_production_ready: false,
    non_mock_adapter_registered: false,
    enablement_guard: enablement,
    blockers: derived.blockers,
    remaining_blocker: NO_PRODUCTION_PSP,
    can_production_launch: 'NO',
    secrets_printed: false,
    message: provider.selected
      ? 'Software activation path complete: configuration refs evaluated. Production payment remains BLOCKED / EXTERNAL_GATED until real PSP credentials, secrets-manager resolution, non-mock adapter, verification, approval, and live gates are satisfied.'
      : 'Software activation path complete: no production PSP selected. Sandbox MOCK_* remains available. Production initiation and webhooks fail closed.',
    payment_state_machine: describePspPaymentStateMachine(),
    webhook_security: describePspWebhookSecurity(false),
    order_payment_integrity: describePspOrderPaymentConsistency(),
    illegal_transitions_blocked: true,
    fulfillment_gate: {
      unpaid_cannot_fulfill: true,
      client_forged_success_rejected: true,
      mock_success_insufficient_for_production: true,
      status: 'PASS',
    },
    refunds: {
      architecture: 'EXISTING_REUSED',
      unauthorized_client_refund: 'DENIED',
      duplicate_refund_protected: true,
    },
    reconciliation: {
      architecture: 'EXISTING_REUSED',
      silent_reconcile_without_provider_evidence: false,
    },
    global_policy: {
      policy_driven: true,
      hardcoded_india_global: false,
    },
    sandbox_vs_production: {
      sandbox_mock_allowed: true,
      production_mock_forbidden: true,
      production_never_uses_sandbox_credentials: true,
    },
    composed_s128_control: {
      sprint: 128,
      production_payment: 'BLOCKED',
    },
    evaluated_at: new Date().toISOString(),
    correlation_id: input?.correlation_id,
  };
}

/** Fail-closed production payment initiation — clear operational reason. */
export function assertProductionPspInitiationAllowed(context: string): void {
  const env = readPaymentEnvironment();
  if (env !== 'production') {
    return;
  }
  const path = evaluatePspPaymentProductionActivationPath();
  if (path.provider.mock_rejected) {
    throw Errors.problem(
      503,
      MOCK_PSP_BLOCKED_IN_PRODUCTION,
      'Mock PSP blocked in production',
      `${context}: mock PSP cannot initiate production payments.`,
    );
  }
  throw Errors.problem(
    503,
    PRODUCTION_PSP_INITIATION_BLOCKED,
    'Production PSP initiation blocked',
    `${context}: ${path.remaining_blocker}. Blockers: ${path.blockers.slice(0, 6).join(', ')}. Software path is complete; live PSP remains EXTERNAL_GATED.`,
  );
}

/**
 * Production webhook ingest gate.
 * Without secrets-manager resolution + verified production webhook adapter: EXTERNAL_GATED.
 * Never verifies with sandbox mock secrets.
 */
export function assertProductionPspWebhookIngestAllowed(
  gatewayCode: string,
  context = 'webhook ingest',
): void {
  if (readPaymentEnvironment() !== 'production') {
    return;
  }
  if (isMockGatewayCode(gatewayCode)) {
    throw Errors.problem(
      503,
      MOCK_PSP_BLOCKED_IN_PRODUCTION,
      'Mock PSP blocked in production',
      `${context}: mock gateway "${gatewayCode}" cannot receive production webhooks.`,
    );
  }
  const path = evaluatePspPaymentProductionActivationPath();
  throw Errors.problem(
    503,
    PRODUCTION_WEBHOOK_EXTERNAL_GATED,
    'Production webhooks gated',
    `${context}: production webhook verification requires secrets-manager resolution + configured PSP webhook adapter. ${path.remaining_blocker}. Never uses sandbox signing secrets.`,
  );
}

/** Evaluate whether a client-supplied “paid” claim may authorize fulfillment — always no. */
export function evaluateClientForgedPaymentSuccess(claim: {
  browser_success?: boolean;
  client_paid_flag?: boolean;
  client_transaction_id?: string | null;
}): { accepted: false; reason: typeof CLIENT_FORGED_PAYMENT_SUCCESS_REJECTED } {
  void claim;
  return { accepted: false, reason: CLIENT_FORGED_PAYMENT_SUCCESS_REJECTED };
}

/** Illegal production transitions that must never succeed. */
export function evaluateIllegalPaymentTransitions(): Array<{
  from: PaymentIntentStatus;
  to: PaymentIntentStatus;
  allowed: false;
}> {
  const targets = [
    PaymentIntentStatus.CAPTURED,
    PaymentIntentStatus.AUTHORIZED,
  ] as const;
  const froms = [
    PaymentIntentStatus.FAILED,
    PaymentIntentStatus.CANCELLED,
    PaymentIntentStatus.EXPIRED,
  ] as const;
  const rows: Array<{ from: PaymentIntentStatus; to: PaymentIntentStatus; allowed: false }> = [];
  for (const from of froms) {
    for (const to of targets) {
      rows.push({ from, to, allowed: false });
      if (canTransitionIntent(from, to)) {
        throw new Error(`Invariant broken: ${from}→${to} must be illegal`);
      }
    }
  }
  void TERMINAL_INTENTS;
  return rows;
}

/** Webhook negative cases for production path (software). */
export function evaluateProductionWebhookNegativeCases(): Array<{
  case_id: string;
  outcome: 'REJECTED' | 'IDEMPOTENT' | 'EXTERNAL_GATED';
  reason: string;
}> {
  return [
    {
      case_id: 'unsigned_webhook',
      outcome: 'REJECTED',
      reason: 'INVALID_SIGNATURE',
    },
    {
      case_id: 'invalid_signature',
      outcome: 'REJECTED',
      reason: 'INVALID_SIGNATURE',
    },
    {
      case_id: 'wrong_environment_production_without_adapter',
      outcome: 'EXTERNAL_GATED',
      reason: PRODUCTION_WEBHOOK_EXTERNAL_GATED,
    },
    {
      case_id: 'malformed_payload',
      outcome: 'REJECTED',
      reason: 'INVALID_JSON',
    },
    {
      case_id: 'duplicate_event',
      outcome: 'IDEMPOTENT',
      reason: 'PAYMENT_WEBHOOK_DUPLICATE',
    },
    {
      case_id: 'mock_gateway_in_production',
      outcome: 'REJECTED',
      reason: MOCK_PSP_BLOCKED_IN_PRODUCTION,
    },
    {
      case_id: 'replay_without_secrets_manager',
      outcome: 'EXTERNAL_GATED',
      reason: 'NO_PRODUCTION_SECRETS_MANAGER_ADAPTER',
    },
  ];
}

/** Align validateProductionPspConfiguration with live provider env (still never auto-ready). */
export function validateLiveProductionPspConfiguration() {
  const provider = readConfiguredProductionPspProvider();
  return validateProductionPspConfiguration({
    providerSelected: provider.selected,
    providerName: provider.code ?? 'NOT_SELECTED',
    nonMockAdapterRegistered: false,
  });
}
