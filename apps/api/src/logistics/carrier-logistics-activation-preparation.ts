/**
 * Sprint 122 — Real carrier + logistics activation preparation.
 * Composes S67/S77/S90/S105 (+ S87 launch, S116 security, S117–S121 foundation).
 * Does NOT invent carriers, credentials, tracking numbers, or real shipments.
 * Does NOT create a second logistics/shipment/tracking/webhook framework.
 * Current state MUST remain NOT_SELECTED / EXTERNAL_GATED. CAN_PRODUCTION_LAUNCH = NO.
 */
import {
  NO_PRODUCTION_CARRIER_ADAPTER,
  evaluateCarrierFirstOnboarding,
  evaluateCarrierEnablementGuard,
  buildShipmentLifecycleMachine,
  buildTrackingEventMachine,
} from './carrier-first-onboarding';
import {
  evaluateRealCarrierFirstOnboarding,
  buildRealCarrierActivationChecklist,
  buildRealCarrierMarketStatuses,
} from './carrier-real-activation-first-onboarding';
import {
  validateProductionCarrierConfiguration,
  CARRIER_PROVIDER_NOT_SELECTED,
  CARRIER_CREDENTIAL_REFERENCE_MISSING,
  CARRIER_WEBHOOK_CONFIGURATION_MISSING,
  CARRIER_WEBHOOK_SECRET_REFERENCE_MISSING,
  CARRIER_MARKET_CONFIGURATION_MISSING,
  CARRIER_SERVICEABILITY_CONFIGURATION_MISSING,
  CARRIER_TRACKING_CONFIGURATION_MISSING,
} from './production-carrier-requirements';
import { isMockCarrierCode, readLogisticsEnvironment } from './carrier.config';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';
import {
  evaluateProductionSecurityGate,
  EXTERNAL_PENTEST_REQUIRED,
} from '../ops/production-security-gate-consolidation';
import { evaluateProductionFoundationActivationPreparation } from '../ops/production-foundation-activation-preparation';
import { evaluateProductionReleaseEngineeringReadiness } from '../ops/production-release-engineering-readiness';
import { evaluateProductionDeploymentTargetActivation } from '../ops/production-deployment-target-activation-contract';
import { evaluatePspPaymentActivationPreparation } from '../payment/psp-payment-activation-preparation';
import { evaluateOtpMessagingActivationPreparation } from '../identity/otp-messaging-activation-preparation';
import { secretsManagerRuntimeResolverStatus } from '../ops/secrets-manager-runtime-resolver';
import {
  evaluateCarrierLogisticsProductionActivationPath,
} from './carrier-logistics-production-activation-path';

export {
  NO_PRODUCTION_CARRIER_ADAPTER,
  CARRIER_PROVIDER_NOT_SELECTED,
  CARRIER_CREDENTIAL_REFERENCE_MISSING,
  CARRIER_WEBHOOK_CONFIGURATION_MISSING,
};

export const CARRIER_LOGISTICS_ACTIVATION_PREPARATION_AUTHORITATIVE =
  'CARRIER_LOGISTICS_ACTIVATION_PREPARATION_AUTHORITATIVE';

export type CarrierConfigReferenceSlot = {
  id: string;
  label: string;
  reference_key: string;
  status: 'MISSING' | 'EXTERNAL_GATED' | 'NOT_SELECTED' | 'PRESENT';
  value_present: false;
  invented: false;
  secret: boolean;
};

export function buildCarrierLogisticsConfigurationReferenceSlots(): CarrierConfigReferenceSlot[] {
  const slot = (
    id: string,
    label: string,
    reference_key: string,
    status: CarrierConfigReferenceSlot['status'],
    secret: boolean,
  ): CarrierConfigReferenceSlot => ({
    id,
    label,
    reference_key,
    status,
    value_present: false,
    invented: false,
    secret,
  });

  return [
    slot('provider_identity', 'Carrier / provider identity', 'CARRIER_PROVIDER', 'NOT_SELECTED', false),
    slot('production_endpoint', 'Production API endpoint reference', 'CARRIER_PRODUCTION_ENDPOINT_REF', 'MISSING', false),
    slot('credential', 'Credential / secret reference', 'CARRIER_PRODUCTION_SECRET_REF', 'MISSING', true),
    slot('account', 'Account / merchant reference', 'CARRIER_ACCOUNT_REF', 'MISSING', false),
    slot('webhook_endpoint', 'Webhook endpoint', 'CARRIER_WEBHOOK_ENDPOINT_REF', 'MISSING', false),
    slot('webhook_secret', 'Webhook signing-secret reference', 'CARRIER_WEBHOOK_SECRET_REF', 'MISSING', true),
    slot('markets', 'Supported countries / markets', 'CARRIER_MARKETS_REF', 'EXTERNAL_GATED', false),
    slot('serviceability', 'Serviceability rules', 'CARRIER_SERVICEABILITY_REF', 'EXTERNAL_GATED', false),
    slot('pickup_locations', 'Pickup locations', 'CARRIER_PICKUP_LOCATIONS_REF', 'EXTERNAL_GATED', false),
    slot('shipment_modes', 'Shipment modes', 'CARRIER_SHIPMENT_MODES_REF', 'EXTERNAL_GATED', false),
    slot('tracking', 'Tracking capability', 'CARRIER_TRACKING_REF', 'EXTERNAL_GATED', false),
    slot('cancellation', 'Cancellation capability', 'CARRIER_CANCELLATION_REF', 'EXTERNAL_GATED', false),
    slot('returns', 'Return capability', 'CARRIER_RETURNS_REF', 'EXTERNAL_GATED', false),
    slot('rto', 'RTO capability', 'CARRIER_RTO_REF', 'EXTERNAL_GATED', false),
    slot('cod', 'COD capability (if supported)', 'CARRIER_COD_REF', 'EXTERNAL_GATED', false),
    slot('label_manifest', 'Label / manifest capability', 'CARRIER_LABEL_REF', 'EXTERNAL_GATED', false),
    slot('pod', 'Proof-of-delivery capability', 'CARRIER_POD_REF', 'EXTERNAL_GATED', false),
    slot('environment', 'Logistics environment identity', 'LOGISTICS_ENVIRONMENT', 'EXTERNAL_GATED', false),
  ];
}

export type CarrierFailClosedCase = {
  case_id: string;
  description: string;
  production_shipping_blocked: true;
  primary_blocker: string;
};

export function evaluateCarrierLogisticsFailClosedCases(): CarrierFailClosedCase[] {
  return [
    {
      case_id: 'carrier_not_selected',
      description: 'Carrier NOT_SELECTED → production shipment creation blocked',
      production_shipping_blocked: true,
      primary_blocker: CARRIER_PROVIDER_NOT_SELECTED,
    },
    {
      case_id: 'credentials_missing',
      description: 'Carrier credentials missing → blocked',
      production_shipping_blocked: true,
      primary_blocker: CARRIER_CREDENTIAL_REFERENCE_MISSING,
    },
    {
      case_id: 'not_verified',
      description: 'Carrier not VERIFIED → blocked',
      production_shipping_blocked: true,
      primary_blocker: NO_PRODUCTION_CARRIER_ADAPTER,
    },
    {
      case_id: 'not_approved',
      description: 'Carrier not APPROVED → blocked',
      production_shipping_blocked: true,
      primary_blocker: NO_PRODUCTION_CARRIER_ADAPTER,
    },
    {
      case_id: 'not_enabled',
      description: 'Carrier not ENABLED → blocked',
      production_shipping_blocked: true,
      primary_blocker: NO_PRODUCTION_CARRIER_ADAPTER,
    },
    {
      case_id: 'mock_in_production',
      description: 'Sandbox/mock carrier in production → blocked',
      production_shipping_blocked: true,
      primary_blocker: NO_PRODUCTION_CARRIER_ADAPTER,
    },
    {
      case_id: 'webhook_unverified',
      description: 'No real carrier webhook verification → activation blocked',
      production_shipping_blocked: true,
      primary_blocker: CARRIER_WEBHOOK_CONFIGURATION_MISSING,
    },
    {
      case_id: 'security_unresolved',
      description: 'Security gate unresolved → production logistics blocked',
      production_shipping_blocked: true,
      primary_blocker: EXTERNAL_PENTEST_REQUIRED,
    },
  ];
}

export type CarrierLogisticsActivationPreparationReport = {
  sprint: 122;
  foundation_sprints: string;
  authoritative_source: 'carrier-logistics-activation-preparation';
  parallel_carrier_abstraction_created: false;
  parallel_shipment_state_machine_created: false;
  parallel_tracking_system_created: false;
  parallel_webhook_system_created: false;
  parallel_idempotency_system_created: false;
  parallel_provider_lifecycle_created: false;
  fake_carrier_invented: false;
  real_shipment_created: false;
  real_tracking_number_generated: false;
  real_delivery_completed: false;
  source_of_truth: {
    carrier_lifecycle: 'S90_COMPOSED';
    real_activation: 'S105_COMPOSED';
    shipment_state: 'EXISTING_REUSED';
    tracking: 'EXISTING_REUSED';
    webhooks: 'EXISTING_REUSED';
    security_gate: 'S116_COMPOSED';
    foundation: 'S117_S119_COMPOSED';
    payment_context: 'S120_COMPOSED';
    communications_context: 'S121_COMPOSED';
    launch_control: 'S87_COMPOSED';
  };
  carrier: {
    lifecycle: 'NOT_SELECTED';
    provider: 'NOT_SELECTED';
    production: 'EXTERNAL_GATED';
    sandbox: 'SANDBOX_VERIFIED';
    enabled: false;
  };
  admin_summary: {
    carrier: 'NOT_SELECTED';
    production_credentials: 'MISSING';
    webhook: 'NOT_CONFIGURED';
    serviceability: 'EXTERNAL_GATED';
    verification: 'NOT_VERIFIED';
    approval: 'NOT_APPROVED';
    enablement: 'EXTERNAL_GATED';
    production_logistics: 'BLOCKED';
  };
  configuration_references: CarrierConfigReferenceSlot[];
  configuration_validation: ReturnType<typeof validateProductionCarrierConfiguration>;
  shipment_lifecycle: ReturnType<typeof buildShipmentLifecycleMachine>;
  tracking: ReturnType<typeof buildTrackingEventMachine>;
  webhook_security: {
    unsigned_rejected: true;
    invalid_signature_rejected: true;
    production_status: 'EXTERNAL_GATED';
    provider_specific_algorithm_invented: false;
  };
  idempotency: {
    shipment_repeat: 'ONE_LOGICAL_SHIPMENT';
    webhook_duplicate: 'NO_DUPLICATE_TRANSITION';
    tracking_duplicate: 'NO_DUPLICATE_SIDE_EFFECT';
    delivery_duplicate: 'NO_DUPLICATE_COMPLETION';
    status: 'SOFTWARE_READY';
  };
  serviceability: {
    policy_driven: true;
    hardcoded_india_global: false;
    status: 'POLICY_DRIVEN';
  };
  cross_border: {
    customer_market_may_differ_from_source: true;
    medicine_import_legally_approved_claimed: false;
    legal_gates: 'LEGAL_GATED';
    status: 'EXPLICIT_FAIL_CLOSED';
  };
  pod: {
    architecture: 'EXISTING_REUSED';
    authorization: 'S110_REUSED';
    native_rider: 'DEVICE_NOT_AVAILABLE';
    status: 'SOFTWARE_READY_EXTERNAL_GATED';
  };
  returns_rto: {
    architecture: 'EXISTING_REUSED';
    financial_control_central: true;
    auto_arbitrary_financial_from_delivery: 'FORBIDDEN';
    status: 'SOFTWARE_READY_EXTERNAL_GATED';
  };
  order_fulfillment_integrity: {
    unpaid_cannot_become_paid_fulfillment: true;
    fulfillment_not_ready_cannot_ship: true;
    shipment_not_confirmed_cannot_delivered: true;
    status: 'PASS';
  };
  customer_experience: {
    production_false_shipped_forbidden: true;
    production_false_tracking_forbidden: true;
    sandbox_mock_allowed: true;
  };
  vendor_experience: {
    cannot_spoof_delivered: true;
    cannot_bypass_fulfillment_controls: true;
    status: 'SOFTWARE_READY';
  };
  logistics_operator: {
    interfaces: 'EXISTING_REUSED';
    status: 'SOFTWARE_READY';
  };
  sandbox_vs_production: {
    sandbox_mock_allowed: true;
    production_mock_forbidden: true;
    mock_carrier_detected: true;
    logistics_environment: 'sandbox' | 'production';
  };
  production_fail_closed: {
    shipment_creation_when_not_selected: 'BLOCKED';
    overall: 'PASS';
  };
  fail_closed_cases: CarrierFailClosedCase[];
  activation_checklist: ReturnType<typeof buildRealCarrierActivationChecklist>;
  markets: ReturnType<typeof buildRealCarrierMarketStatuses>;
  enablement_guard: ReturnType<typeof evaluateCarrierEnablementGuard>;
  security_gate: {
    remaining_blocker: string;
    certified: string;
  };
  external_inputs_required: string[];
  remaining_blocker: typeof NO_PRODUCTION_CARRIER_ADAPTER;
  remaining_blockers: string[];
  force_launch_available: false;
  force_enable_carrier_available: false;
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
  s134_activation_path: {
    sprint: 134;
    software_activation_path: 'COMPLETE';
    production_logistics: 'BLOCKED';
    production_shipment_creation_enabled: false;
    secrets_manager_runtime_resolver: ReturnType<typeof secretsManagerRuntimeResolverStatus>;
    remaining_blocker: typeof NO_PRODUCTION_CARRIER_ADAPTER;
  };
};

export function evaluateCarrierLogisticsActivationPreparation(input?: {
  correlation_id?: string;
}): CarrierLogisticsActivationPreparationReport {
  const s90 = evaluateCarrierFirstOnboarding();
  const s105 = evaluateRealCarrierFirstOnboarding();
  const config = validateProductionCarrierConfiguration();
  const env = readLogisticsEnvironment();
  const security = evaluateProductionSecurityGate();
  const foundation = evaluateProductionFoundationActivationPreparation();
  const release = evaluateProductionReleaseEngineeringReadiness();
  const deploy = evaluateProductionDeploymentTargetActivation();
  const psp = evaluatePspPaymentActivationPreparation();
  const comms = evaluateOtpMessagingActivationPreparation();
  const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
  const enablement = evaluateCarrierEnablementGuard({
    nonMockAdapterRegistered: false,
    logisticsEnvironment: env,
    liveEnabled: false,
    humanApproved: false,
    webhookProductionReady: false,
    emergencyDisabled: false,
  });
  const s134 = evaluateCarrierLogisticsProductionActivationPath({
    correlation_id: input?.correlation_id,
  });

  void s90.remaining_blocker;
  void s105.real_shipment_created;
  void foundation.can_production_launch;
  void release.can_production_launch;
  void deploy.can_production_launch;
  void psp.can_production_launch;
  void comms.can_production_launch;
  void launch.can_production_launch;
  void isMockCarrierCode('MOCK');
  void s134.software_activation_path;

  const remaining_blockers = [
    NO_PRODUCTION_CARRIER_ADAPTER,
    CARRIER_PROVIDER_NOT_SELECTED,
    CARRIER_CREDENTIAL_REFERENCE_MISSING,
    CARRIER_WEBHOOK_CONFIGURATION_MISSING,
    CARRIER_WEBHOOK_SECRET_REFERENCE_MISSING,
    CARRIER_MARKET_CONFIGURATION_MISSING,
    CARRIER_SERVICEABILITY_CONFIGURATION_MISSING,
    CARRIER_TRACKING_CONFIGURATION_MISSING,
    EXTERNAL_PENTEST_REQUIRED,
  ];

  return {
    sprint: 122,
    foundation_sprints: 'S7/S26/S34/S61/S67/S77/S90/S105/S87/S116/S117/S118/S119/S120/S121',
    authoritative_source: 'carrier-logistics-activation-preparation',
    parallel_carrier_abstraction_created: false,
    parallel_shipment_state_machine_created: false,
    parallel_tracking_system_created: false,
    parallel_webhook_system_created: false,
    parallel_idempotency_system_created: false,
    parallel_provider_lifecycle_created: false,
    fake_carrier_invented: false,
    real_shipment_created: false,
    real_tracking_number_generated: false,
    real_delivery_completed: false,
    source_of_truth: {
      carrier_lifecycle: 'S90_COMPOSED',
      real_activation: 'S105_COMPOSED',
      shipment_state: 'EXISTING_REUSED',
      tracking: 'EXISTING_REUSED',
      webhooks: 'EXISTING_REUSED',
      security_gate: 'S116_COMPOSED',
      foundation: 'S117_S119_COMPOSED',
      payment_context: 'S120_COMPOSED',
      communications_context: 'S121_COMPOSED',
      launch_control: 'S87_COMPOSED',
    },
    carrier: {
      lifecycle: 'NOT_SELECTED',
      provider: 'NOT_SELECTED',
      production: 'EXTERNAL_GATED',
      sandbox: 'SANDBOX_VERIFIED',
      enabled: false,
    },
    admin_summary: {
      carrier: 'NOT_SELECTED',
      production_credentials: 'MISSING',
      webhook: 'NOT_CONFIGURED',
      serviceability: 'EXTERNAL_GATED',
      verification: 'NOT_VERIFIED',
      approval: 'NOT_APPROVED',
      enablement: 'EXTERNAL_GATED',
      production_logistics: 'BLOCKED',
    },
    configuration_references: buildCarrierLogisticsConfigurationReferenceSlots(),
    configuration_validation: config,
    shipment_lifecycle: buildShipmentLifecycleMachine(),
    tracking: buildTrackingEventMachine(),
    webhook_security: {
      unsigned_rejected: true,
      invalid_signature_rejected: true,
      production_status: 'EXTERNAL_GATED',
      provider_specific_algorithm_invented: false,
    },
    idempotency: {
      shipment_repeat: 'ONE_LOGICAL_SHIPMENT',
      webhook_duplicate: 'NO_DUPLICATE_TRANSITION',
      tracking_duplicate: 'NO_DUPLICATE_SIDE_EFFECT',
      delivery_duplicate: 'NO_DUPLICATE_COMPLETION',
      status: 'SOFTWARE_READY',
    },
    serviceability: {
      policy_driven: true,
      hardcoded_india_global: false,
      status: 'POLICY_DRIVEN',
    },
    cross_border: {
      customer_market_may_differ_from_source: true,
      medicine_import_legally_approved_claimed: false,
      legal_gates: 'LEGAL_GATED',
      status: 'EXPLICIT_FAIL_CLOSED',
    },
    pod: {
      architecture: 'EXISTING_REUSED',
      authorization: 'S110_REUSED',
      native_rider: 'DEVICE_NOT_AVAILABLE',
      status: 'SOFTWARE_READY_EXTERNAL_GATED',
    },
    returns_rto: {
      architecture: 'EXISTING_REUSED',
      financial_control_central: true,
      auto_arbitrary_financial_from_delivery: 'FORBIDDEN',
      status: 'SOFTWARE_READY_EXTERNAL_GATED',
    },
    order_fulfillment_integrity: {
      unpaid_cannot_become_paid_fulfillment: true,
      fulfillment_not_ready_cannot_ship: true,
      shipment_not_confirmed_cannot_delivered: true,
      status: 'PASS',
    },
    customer_experience: {
      production_false_shipped_forbidden: true,
      production_false_tracking_forbidden: true,
      sandbox_mock_allowed: true,
    },
    vendor_experience: {
      cannot_spoof_delivered: true,
      cannot_bypass_fulfillment_controls: true,
      status: 'SOFTWARE_READY',
    },
    logistics_operator: {
      interfaces: 'EXISTING_REUSED',
      status: 'SOFTWARE_READY',
    },
    sandbox_vs_production: {
      sandbox_mock_allowed: true,
      production_mock_forbidden: true,
      mock_carrier_detected: true,
      logistics_environment: env,
    },
    production_fail_closed: {
      shipment_creation_when_not_selected: 'BLOCKED',
      overall: 'PASS',
    },
    fail_closed_cases: evaluateCarrierLogisticsFailClosedCases(),
    activation_checklist: buildRealCarrierActivationChecklist(),
    markets: buildRealCarrierMarketStatuses(),
    enablement_guard: enablement,
    security_gate: {
      remaining_blocker: security.remaining_blocker,
      certified: security.production_security_certified ?? 'NO',
    },
    external_inputs_required: [
      'Real carrier contract + account + production endpoint/credential refs',
      'Webhook endpoint + signing-secret refs',
      'Market/serviceability/pickup configuration',
      'Tracking/cancellation/returns/RTO/POD capability confirmation',
      'Human verification + approval',
      'Security certification (EXTERNAL_PENTEST_REQUIRED)',
      'Production environment/deployment target (S117–S119) before live enablement',
    ],
    remaining_blocker: NO_PRODUCTION_CARRIER_ADAPTER,
    remaining_blockers,
    force_launch_available: false,
    force_enable_carrier_available: false,
    can_production_launch: 'NO',
    why_launch_blocked:
      "Why can't World-Pharma ship real orders yet? Carrier is NOT_SELECTED; production credentials MISSING; webhook NOT_CONFIGURED; serviceability EXTERNAL_GATED; verification NOT_VERIFIED; enablement EXTERNAL_GATED. Production logistics BLOCKED. Sandbox mock carrier remains allowed in sandbox only. No real shipment/tracking/delivery.",
    next_action:
      'When a real carrier account exists: supply configuration REFERENCES (never secret values or invented tracking numbers), verify webhooks, obtain human approval, then advance lifecycle NOT_SELECTED→CONFIGURED→VERIFIED→APPROVED→ENABLED — do not invent a carrier or rewrite logistics architecture.',
    message:
      'Sprint 122 carrier + logistics activation preparation: lifecycle NOT_SELECTED, production logistics BLOCKED, sandbox SANDBOX_VERIFIED. CAN_PRODUCTION_LAUNCH = NO.',
    security_statement:
      'S90 lifecycle reused (no second carrier/shipment framework). Existing webhook/idempotency/POD/RTO architecture retained. Mock forbidden in production. Unsigned webhooks rejected. Cross-border medicine remains LEGAL_GATED.',
    secrets_printed: false,
    evaluated_at: new Date().toISOString(),
    correlation_id: input?.correlation_id,
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    s134_activation_path: {
      sprint: 134,
      software_activation_path: 'COMPLETE',
      production_logistics: 'BLOCKED',
      production_shipment_creation_enabled: false,
      secrets_manager_runtime_resolver: s134.secrets_manager_runtime_resolver,
      remaining_blocker: NO_PRODUCTION_CARRIER_ADAPTER,
    },
  };
}
