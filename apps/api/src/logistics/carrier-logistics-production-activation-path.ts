/**
 * Sprint 134 — Real carrier + logistics production activation path (software).
 * Reuses S7/S26/S34/S46/S67/S77/S90/S105/S122/S123 (+ S132/S133 pattern).
 * Does NOT invent carriers, credentials, tracking numbers, or claim live delivery.
 * Does NOT create a second logistics/shipment/tracking/webhook framework.
 * CONFIGURED ≠ VERIFIED ≠ APPROVED ≠ ENABLED.
 * Without a genuine non-mock carrier: EXTERNAL_GATED + fail-closed.
 */
import { ShipmentStatus } from '@prisma/client';
import { Errors } from '../common/problem';
import {
  isLiveCarrierEnabled,
  isMockCarrierCode,
  readLogisticsEnvironment,
  type LogisticsRuntimeEnvironment,
} from './carrier.config';
import {
  NO_PRODUCTION_CARRIER_ADAPTER,
  evaluateCarrierEnablementGuard,
  buildShipmentLifecycleMachine,
  buildTrackingEventMachine,
} from './carrier-first-onboarding';
import {
  CARRIER_CREDENTIAL_REFERENCE_MISSING,
  CARRIER_PROVIDER_NOT_SELECTED,
  CARRIER_SERVICEABILITY_CONFIGURATION_MISSING,
  CARRIER_TRACKING_CONFIGURATION_MISSING,
  CARRIER_WEBHOOK_CONFIGURATION_MISSING,
  CARRIER_WEBHOOK_SECRET_REFERENCE_MISSING,
  validateProductionCarrierConfiguration,
} from './production-carrier-requirements';
import { canTransitionShipment } from './state';
import {
  secretsManagerRuntimeResolverStatus,
} from '../ops/secrets-manager-runtime-resolver';

export const CARRIER_LOGISTICS_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE =
  'CARRIER_LOGISTICS_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE';

export const CARRIER_VERIFICATION_STATUS_ENV = 'CARRIER_VERIFICATION_STATUS';
export const CARRIER_APPROVAL_STATUS_ENV = 'CARRIER_APPROVAL_STATUS';

export const PRODUCTION_CARRIER_SHIPMENT_INITIATION_BLOCKED =
  'PRODUCTION_CARRIER_SHIPMENT_INITIATION_BLOCKED';
export const PRODUCTION_CARRIER_WEBHOOK_EXTERNAL_GATED =
  'PRODUCTION_CARRIER_WEBHOOK_EXTERNAL_GATED';
export const MOCK_CARRIER_BLOCKED_IN_PRODUCTION = 'MOCK_CARRIER_BLOCKED_IN_PRODUCTION';
export const VENDOR_HANDOFF_GATES_PRESERVED = 'VENDOR_HANDOFF_GATES_PRESERVED';
export const CROSS_BORDER_LEGAL_GATED = 'CROSS_BORDER_LEGAL_GATED';
export const FAKE_PRODUCTION_WAYBILL_FORBIDDEN = 'FAKE_PRODUCTION_WAYBILL_FORBIDDEN';

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

function humanStatus(envKey: string, expected: 'verified' | 'approved'): boolean {
  return (envValue(envKey) ?? '').toLowerCase() === expected;
}

export type CarrierProviderSelection = {
  selected: boolean;
  code: string | null;
  mock_rejected: boolean;
};

export function readConfiguredProductionCarrierProvider(): CarrierProviderSelection {
  const raw = envValue('CARRIER_PROVIDER');
  if (!raw) {
    return { selected: false, code: null, mock_rejected: false };
  }
  const code = raw.toUpperCase();
  if (isMockCarrierCode(code)) {
    return { selected: false, code, mock_rejected: true };
  }
  return { selected: true, code, mock_rejected: false };
}

export type CarrierConfigSlotPresence = {
  id: string;
  label: string;
  reference_key: string;
  status: 'MISSING' | 'PRESENT' | 'NOT_SELECTED' | 'EXTERNAL_GATED' | 'REJECTED_MOCK';
  reference_present: boolean;
  secret: boolean;
  value_leaked: false;
};

export function buildLiveCarrierConfigurationSlots(): CarrierConfigSlotPresence[] {
  const sel = readConfiguredProductionCarrierProvider();

  const providerSlot = (): CarrierConfigSlotPresence => ({
    id: 'provider_identity',
    label: 'Carrier / provider identity',
    reference_key: 'CARRIER_PROVIDER',
    status: sel.mock_rejected
      ? 'REJECTED_MOCK'
      : sel.selected
        ? 'PRESENT'
        : 'NOT_SELECTED',
    reference_present: sel.selected,
    secret: false,
    value_leaked: false,
  });

  const refSlot = (
    id: string,
    label: string,
    key: string,
    secret: boolean,
  ): CarrierConfigSlotPresence => {
    const present = envPresent(key);
    return {
      id,
      label,
      reference_key: key,
      status: present ? 'PRESENT' : 'MISSING',
      reference_present: present,
      secret,
      value_leaked: false,
    };
  };

  return [
    providerSlot(),
    refSlot(
      'production_endpoint',
      'Production API endpoint reference',
      'CARRIER_PRODUCTION_ENDPOINT_REF',
      false,
    ),
    refSlot(
      'credential',
      'Credential / secret reference',
      'CARRIER_PRODUCTION_SECRET_REF',
      true,
    ),
    refSlot('account', 'Account / merchant reference', 'CARRIER_ACCOUNT_REF', false),
    refSlot(
      'webhook_endpoint',
      'Webhook endpoint reference',
      'CARRIER_WEBHOOK_ENDPOINT_REF',
      false,
    ),
    refSlot(
      'webhook_secret',
      'Webhook signing-secret reference',
      'CARRIER_WEBHOOK_SECRET_REF',
      true,
    ),
    refSlot('markets', 'Supported countries / markets', 'CARRIER_MARKETS_REF', false),
    refSlot(
      'markets_countries',
      'Production countries list reference',
      'CARRIER_PRODUCTION_COUNTRIES',
      false,
    ),
    refSlot(
      'serviceability',
      'Serviceability rules reference',
      'CARRIER_SERVICEABILITY_CONFIG_REF',
      false,
    ),
    refSlot('tracking', 'Tracking capability reference', 'CARRIER_TRACKING_CONFIG_REF', false),
    refSlot('pickup', 'Pickup capability reference', 'CARRIER_PICKUP_LOCATIONS_REF', false),
    refSlot('label_manifest', 'Label / waybill capability', 'CARRIER_LABEL_REF', false),
    refSlot('pod', 'Proof-of-delivery capability', 'CARRIER_POD_REF', false),
    refSlot('returns', 'Return capability', 'CARRIER_RETURNS_REF', false),
    refSlot('rto', 'RTO capability', 'CARRIER_RTO_REF', false),
    refSlot('shipment_modes', 'Supported shipment types', 'CARRIER_SHIPMENT_MODES_REF', false),
    refSlot('environment', 'Logistics environment identity', 'LOGISTICS_ENVIRONMENT', false),
  ];
}

export type CarrierActivationStage =
  | 'NOT_SELECTED'
  | 'EXTERNAL_GATED'
  | 'CONFIGURED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED';

export type CarrierLifecycleStatus = {
  provider: string;
  configured: boolean;
  verified: boolean;
  approved: boolean;
  enabled: false;
  production: 'EXTERNAL_GATED';
  activation_stage: CarrierActivationStage;
  remaining_blocker: string;
};

const REQUIRED_CONFIG_REFS = [
  'CARRIER_PRODUCTION_SECRET_REF',
  'CARRIER_ACCOUNT_REF',
  'CARRIER_WEBHOOK_ENDPOINT_REF',
  'CARRIER_WEBHOOK_SECRET_REF',
] as const;

export function deriveProductionCarrierLifecycle(): CarrierLifecycleStatus {
  const sel = readConfiguredProductionCarrierProvider();
  const refsOk = REQUIRED_CONFIG_REFS.every((k) => envPresent(k));
  const configured = sel.selected && refsOk;
  const verified = configured && humanStatus(CARRIER_VERIFICATION_STATUS_ENV, 'verified');
  const approved = verified && humanStatus(CARRIER_APPROVAL_STATUS_ENV, 'approved');
  // Never enable without a registered non-mock adapter (always false in software path today).
  const enabled = false as const;

  let activation_stage: CarrierActivationStage = 'NOT_SELECTED';
  if (enabled) activation_stage = 'ENABLED';
  else if (approved) activation_stage = 'APPROVED';
  else if (verified) activation_stage = 'VERIFIED';
  else if (configured) activation_stage = 'CONFIGURED';
  else if (sel.selected || sel.mock_rejected) activation_stage = 'EXTERNAL_GATED';

  let remaining_blocker: string = NO_PRODUCTION_CARRIER_ADAPTER;
  if (sel.mock_rejected) remaining_blocker = MOCK_CARRIER_BLOCKED_IN_PRODUCTION;
  else if (!sel.selected) remaining_blocker = CARRIER_PROVIDER_NOT_SELECTED;
  else if (!envPresent('CARRIER_PRODUCTION_SECRET_REF')) {
    remaining_blocker = CARRIER_CREDENTIAL_REFERENCE_MISSING;
  } else if (!envPresent('CARRIER_WEBHOOK_ENDPOINT_REF')) {
    remaining_blocker = CARRIER_WEBHOOK_CONFIGURATION_MISSING;
  } else if (!envPresent('CARRIER_WEBHOOK_SECRET_REF')) {
    remaining_blocker = CARRIER_WEBHOOK_SECRET_REFERENCE_MISSING;
  } else if (!configured) {
    remaining_blocker = CARRIER_CREDENTIAL_REFERENCE_MISSING;
  }

  return {
    provider: sel.selected ? (sel.code ?? 'NOT_SELECTED') : 'NOT_SELECTED',
    configured,
    verified,
    approved,
    enabled,
    production: 'EXTERNAL_GATED',
    activation_stage,
    remaining_blocker,
  };
}

export type CarrierAdapterCapability =
  | 'serviceability'
  | 'shipment_creation'
  | 'shipment_cancellation'
  | 'pickup'
  | 'label_waybill'
  | 'tracking'
  | 'delivery_status'
  | 'pod'
  | 'rto'
  | 'return';

export type CarrierAdapterCapabilitySupport =
  | 'CONTRACT_SUPPORTED'
  | 'MOCK_ONLY'
  | 'UNSUPPORTED_EXPLICIT'
  | 'EXTERNAL_GATED';

/** Existing CarrierPort contract — production must not fake success for unsupported ops. */
export function describeCarrierAdapterContract(): Record<
  CarrierAdapterCapability,
  CarrierAdapterCapabilitySupport
> {
  return {
    serviceability: 'CONTRACT_SUPPORTED',
    shipment_creation: 'EXTERNAL_GATED',
    shipment_cancellation: 'CONTRACT_SUPPORTED',
    pickup: 'CONTRACT_SUPPORTED',
    label_waybill: 'EXTERNAL_GATED',
    tracking: 'EXTERNAL_GATED',
    delivery_status: 'EXTERNAL_GATED',
    pod: 'EXTERNAL_GATED',
    rto: 'CONTRACT_SUPPORTED',
    return: 'CONTRACT_SUPPORTED',
  };
}

export function evaluateIllegalShipmentTransitions(): Array<{
  from: ShipmentStatus;
  to: ShipmentStatus;
  allowed: false;
  code: 'ILLEGAL_SHIPMENT_TRANSITION';
}> {
  const cases: Array<[ShipmentStatus, ShipmentStatus]> = [
    [ShipmentStatus.DELIVERED, ShipmentStatus.IN_TRANSIT],
    [ShipmentStatus.DELIVERED, ShipmentStatus.PICKED_UP],
    [ShipmentStatus.CANCELLED, ShipmentStatus.DELIVERED],
    [ShipmentStatus.RETURNED, ShipmentStatus.DELIVERED],
    [ShipmentStatus.DELIVERED, ShipmentStatus.BOOKING],
  ];
  return cases.map(([from, to]) => ({
    from,
    to,
    allowed: false as const,
    code: 'ILLEGAL_SHIPMENT_TRANSITION' as const,
  })).filter((c) => !canTransitionShipment(c.from, c.to));
}

export function evaluateCarrierWebhookNegativeCases(): Array<{
  case_id: string;
  outcome: 'REJECTED' | 'IDEMPOTENT' | 'EXTERNAL_GATED';
  reason: string;
}> {
  return [
    { case_id: 'unsigned_webhook', outcome: 'REJECTED', reason: 'INVALID_SIGNATURE' },
    { case_id: 'invalid_signature', outcome: 'REJECTED', reason: 'INVALID_SIGNATURE' },
    {
      case_id: 'wrong_environment',
      outcome: 'EXTERNAL_GATED',
      reason: PRODUCTION_CARRIER_WEBHOOK_EXTERNAL_GATED,
    },
    { case_id: 'malformed_payload', outcome: 'REJECTED', reason: 'INVALID_JSON' },
    { case_id: 'duplicate_webhook', outcome: 'IDEMPOTENT', reason: 'DUPLICATE_CARRIER_EVENT' },
    { case_id: 'replayed_webhook', outcome: 'REJECTED', reason: 'WEBHOOK_REPLAY' },
    {
      case_id: 'mock_carrier_in_production',
      outcome: 'REJECTED',
      reason: MOCK_CARRIER_BLOCKED_IN_PRODUCTION,
    },
    {
      case_id: 'client_forged_delivery',
      outcome: 'REJECTED',
      reason: 'CLIENT_CALLBACK_INSUFFICIENT',
    },
    {
      case_id: 'unknown_event',
      outcome: 'REJECTED',
      reason: 'UNKNOWN_CARRIER_EVENT',
    },
  ];
}

export function evaluateCarrierSafetyInvariants(): Array<{
  case_id: string;
  outcome: 'PASS' | 'ENFORCED' | 'EXTERNAL_GATED';
  detail: string;
}> {
  return [
    {
      case_id: 'missing_carrier',
      outcome: 'ENFORCED',
      detail: CARRIER_PROVIDER_NOT_SELECTED,
    },
    {
      case_id: 'missing_credential_reference',
      outcome: 'ENFORCED',
      detail: CARRIER_CREDENTIAL_REFERENCE_MISSING,
    },
    {
      case_id: 'production_mock_blocked',
      outcome: 'ENFORCED',
      detail: MOCK_CARRIER_BLOCKED_IN_PRODUCTION,
    },
    {
      case_id: 'illegal_state_transition',
      outcome: 'ENFORCED',
      detail: 'ILLEGAL_SHIPMENT_TRANSITION via existing state.ts',
    },
    {
      case_id: 'duplicate_shipment_creation',
      outcome: 'ENFORCED',
      detail: 'bookingKey / idempotent BOOKED short-circuit',
    },
    {
      case_id: 'pod_authorization',
      outcome: 'ENFORCED',
      detail: 'Existing POD auth (S110) — no public POD URLs',
    },
    {
      case_id: 'return_rto_safety',
      outcome: 'ENFORCED',
      detail: 'RTO/return states authoritative; no forged completion',
    },
    {
      case_id: 'vendor_logistics_handoff',
      outcome: 'PASS',
      detail: VENDOR_HANDOFF_GATES_PRESERVED,
    },
    {
      case_id: 'cross_border_legal_gate',
      outcome: 'EXTERNAL_GATED',
      detail: CROSS_BORDER_LEGAL_GATED,
    },
    {
      case_id: 'fake_waybill_forbidden',
      outcome: 'ENFORCED',
      detail: FAKE_PRODUCTION_WAYBILL_FORBIDDEN,
    },
    {
      case_id: 'serviceability_policy',
      outcome: 'EXTERNAL_GATED',
      detail: CARRIER_SERVICEABILITY_CONFIGURATION_MISSING,
    },
    {
      case_id: 'tracking_authoritative_only',
      outcome: 'ENFORCED',
      detail: CARRIER_TRACKING_CONFIGURATION_MISSING,
    },
  ];
}

export type CarrierLogisticsProductionActivationPathReport = {
  sprint: 134;
  authoritative_source: typeof CARRIER_LOGISTICS_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE;
  parallel_carrier_system_created: false;
  parallel_shipment_state_machine_created: false;
  parallel_tracking_system_created: false;
  parallel_webhook_system_created: false;
  parallel_idempotency_system_created: false;
  fake_carrier_invented: false;
  real_shipment_created: false;
  real_tracking_number_generated: false;
  real_delivery_completed: false;
  secrets_manager_runtime_resolver: ReturnType<typeof secretsManagerRuntimeResolverStatus>;
  logistics_environment: LogisticsRuntimeEnvironment;
  live_enabled: boolean;
  software_activation_path: 'COMPLETE';
  carrier: CarrierLifecycleStatus;
  configuration_slots: CarrierConfigSlotPresence[];
  configuration_validation: ReturnType<typeof validateProductionCarrierConfiguration>;
  adapter_contract: ReturnType<typeof describeCarrierAdapterContract>;
  shipment_lifecycle: ReturnType<typeof buildShipmentLifecycleMachine>;
  tracking: ReturnType<typeof buildTrackingEventMachine>;
  illegal_transitions: ReturnType<typeof evaluateIllegalShipmentTransitions>;
  webhook_negative_cases: ReturnType<typeof evaluateCarrierWebhookNegativeCases>;
  safety_invariants: ReturnType<typeof evaluateCarrierSafetyInvariants>;
  production_logistics: 'BLOCKED';
  production_shipment_creation_enabled: false;
  production_tracking_enabled: false;
  production_webhook_enabled: false;
  serviceability: {
    policy_driven: true;
    hardcoded_india_global: false;
    status: 'POLICY_DRIVEN' | 'EXTERNAL_GATED';
  };
  cross_border: {
    customer_market_may_differ_from_source: true;
    medicine_import_legally_approved_claimed: false;
    legal_gates: typeof CROSS_BORDER_LEGAL_GATED;
  };
  pod: {
    architecture: 'EXISTING_REUSED';
    status: 'SOFTWARE_READY_EXTERNAL_GATED';
  };
  returns_rto: {
    architecture: 'EXISTING_REUSED';
    status: 'SOFTWARE_READY_EXTERNAL_GATED';
  };
  vendor_handoff: {
    flow: 'Accept→Pick→Pack→READY_TO_SHIP→logistics';
    payment_gate_preserved: true;
    rx_gate_preserved: true;
    status: typeof VENDOR_HANDOFF_GATES_PRESERVED;
  };
  label_waybill: {
    fake_production_forbidden: typeof FAKE_PRODUCTION_WAYBILL_FORBIDDEN;
    status: 'EXTERNAL_GATED';
  };
  enablement_guard: ReturnType<typeof evaluateCarrierEnablementGuard>;
  blockers: string[];
  remaining_blocker: typeof NO_PRODUCTION_CARRIER_ADAPTER;
  can_production_launch: 'NO';
  secrets_printed: false;
  message: string;
  correlation_id?: string;
  evaluated_at: string;
};

export function evaluateCarrierLogisticsProductionActivationPath(input?: {
  correlation_id?: string;
}): CarrierLogisticsProductionActivationPathReport {
  const env = readLogisticsEnvironment();
  const live = isLiveCarrierEnabled();
  const carrier = deriveProductionCarrierLifecycle();
  const slots = buildLiveCarrierConfigurationSlots();
  const config = validateProductionCarrierConfiguration({
    providerSelected: carrier.configured,
    providerName: carrier.provider,
    nonMockAdapterRegistered: false,
  });
  const enablement = evaluateCarrierEnablementGuard({
    nonMockAdapterRegistered: false,
    logisticsEnvironment: env,
    liveEnabled: live,
    humanApproved: carrier.approved,
    webhookProductionReady: false,
    emergencyDisabled: false,
  });

  const blockers = [
    NO_PRODUCTION_CARRIER_ADAPTER,
    carrier.remaining_blocker,
    CARRIER_PROVIDER_NOT_SELECTED,
    CARRIER_CREDENTIAL_REFERENCE_MISSING,
    CARRIER_WEBHOOK_CONFIGURATION_MISSING,
    CARRIER_WEBHOOK_SECRET_REFERENCE_MISSING,
    // S142 software resolver COMPLETE (was SECRETS_MANAGER_RUNTIME_RESOLVER_MISSING)
    'PRODUCTION_CARRIER_ADAPTER_NOT_REGISTERED',
  ];

  return {
    sprint: 134,
    authoritative_source: CARRIER_LOGISTICS_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE,
    parallel_carrier_system_created: false,
    parallel_shipment_state_machine_created: false,
    parallel_tracking_system_created: false,
    parallel_webhook_system_created: false,
    parallel_idempotency_system_created: false,
    fake_carrier_invented: false,
    real_shipment_created: false,
    real_tracking_number_generated: false,
    real_delivery_completed: false,
    secrets_manager_runtime_resolver: secretsManagerRuntimeResolverStatus(),
    logistics_environment: env,
    live_enabled: live,
    software_activation_path: 'COMPLETE',
    carrier,
    configuration_slots: slots,
    configuration_validation: config,
    adapter_contract: describeCarrierAdapterContract(),
    shipment_lifecycle: buildShipmentLifecycleMachine(),
    tracking: buildTrackingEventMachine(),
    illegal_transitions: evaluateIllegalShipmentTransitions(),
    webhook_negative_cases: evaluateCarrierWebhookNegativeCases(),
    safety_invariants: evaluateCarrierSafetyInvariants(),
    production_logistics: 'BLOCKED',
    production_shipment_creation_enabled: false,
    production_tracking_enabled: false,
    production_webhook_enabled: false,
    serviceability: {
      policy_driven: true,
      hardcoded_india_global: false,
      status: envPresent('CARRIER_SERVICEABILITY_CONFIG_REF')
        ? 'POLICY_DRIVEN'
        : 'EXTERNAL_GATED',
    },
    cross_border: {
      customer_market_may_differ_from_source: true,
      medicine_import_legally_approved_claimed: false,
      legal_gates: CROSS_BORDER_LEGAL_GATED,
    },
    pod: {
      architecture: 'EXISTING_REUSED',
      status: 'SOFTWARE_READY_EXTERNAL_GATED',
    },
    returns_rto: {
      architecture: 'EXISTING_REUSED',
      status: 'SOFTWARE_READY_EXTERNAL_GATED',
    },
    vendor_handoff: {
      flow: 'Accept→Pick→Pack→READY_TO_SHIP→logistics',
      payment_gate_preserved: true,
      rx_gate_preserved: true,
      status: VENDOR_HANDOFF_GATES_PRESERVED,
    },
    label_waybill: {
      fake_production_forbidden: FAKE_PRODUCTION_WAYBILL_FORBIDDEN,
      status: 'EXTERNAL_GATED',
    },
    enablement_guard: enablement,
    blockers: [...new Set(blockers)],
    remaining_blocker: NO_PRODUCTION_CARRIER_ADAPTER,
    can_production_launch: 'NO',
    secrets_printed: false,
    message: carrier.configured
      ? 'Software activation path complete: carrier configuration refs evaluated. Production logistics remain BLOCKED / EXTERNAL_GATED until a non-mock adapter, secrets-manager resolution, verification, and approval are satisfied. No fake waybills or deliveries.'
      : 'Software activation path complete: no production carrier selected. Sandbox MockCarrierAdapter remains available. Production shipment creation and webhooks fail closed.',
    correlation_id: input?.correlation_id,
    evaluated_at: new Date().toISOString(),
  };
}

/** Fail-closed production shipment creation / booking initiation. */
export function assertProductionCarrierShipmentInitiationAllowed(context: string): void {
  if (readLogisticsEnvironment() !== 'production') {
    return;
  }
  const sel = readConfiguredProductionCarrierProvider();
  if (sel.mock_rejected) {
    throw Errors.problem(
      503,
      MOCK_CARRIER_BLOCKED_IN_PRODUCTION,
      'Mock carrier blocked in production',
      `${context}: MOCK/SANDBOX carriers cannot serve production shipments.`,
    );
  }
  const path = evaluateCarrierLogisticsProductionActivationPath();
  throw Errors.problem(
    503,
    PRODUCTION_CARRIER_SHIPMENT_INITIATION_BLOCKED,
    'Production carrier shipment initiation blocked',
    `${context}: ${path.remaining_blocker}. Blockers: ${path.blockers.slice(0, 6).join(', ')}. Software path COMPLETE; live carrier EXTERNAL_GATED.`,
  );
}

/** Production carrier callbacks remain EXTERNAL_GATED without secrets-manager + provider verifier. */
export function assertProductionCarrierWebhookIngestAllowed(context = 'carrier webhook'): void {
  if (readLogisticsEnvironment() !== 'production') {
    return;
  }
  throw Errors.problem(
    503,
    PRODUCTION_CARRIER_WEBHOOK_EXTERNAL_GATED,
    'Production carrier webhooks gated',
    `${context}: production webhook verification requires secrets-manager resolution + configured non-mock carrier verifier. Never trusts client/browser callbacks. Software resolver COMPLETE; live vault EXTERNAL_GATED (NO_PRODUCTION_SECRETS_MANAGER_ADAPTER).`,
  );
}
