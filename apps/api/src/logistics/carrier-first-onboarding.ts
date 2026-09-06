/**
 * Sprint 67 foundation + Sprint 77 readiness + Sprint 90 production carrier /
 * logistics activation readiness.
 * Never invent carrier names, tracking numbers, drivers, GPS, or POD.
 * Credentials / configured ≠ production ENABLED.
 */
import {
  isLiveCarrierEnabled,
  isMockCarrierCode,
  readLogisticsEnvironment,
} from './carrier.config';
import { evaluateProviderActivation } from '../ops/provider-activation';
import { getProviderActivationContract } from '../ops/provider-activation-contracts';
import {
  CARRIER_PROVIDER_NOT_SELECTED,
  validateProductionCarrierConfiguration,
  type ProductionCarrierConfigurationValidation,
} from './production-carrier-requirements';

export const NO_PRODUCTION_CARRIER_ADAPTER = 'NO_PRODUCTION_CARRIER_ADAPTER';

export {
  CARRIER_PROVIDER_NOT_SELECTED,
  CARRIER_CREDENTIAL_REFERENCE_MISSING,
  CARRIER_WEBHOOK_CONFIGURATION_MISSING,
  CARRIER_WEBHOOK_SECRET_REFERENCE_MISSING,
  CARRIER_MARKET_CONFIGURATION_MISSING,
  CARRIER_SERVICEABILITY_CONFIGURATION_MISSING,
  CARRIER_TRACKING_CONFIGURATION_MISSING,
} from './production-carrier-requirements';

export type CarrierValidationStatus =
  | 'NOT_CONFIGURED'
  | 'CONFIGURED'
  | 'CONFIGURED_BUT_UNAVAILABLE'
  | 'VERIFIED_BUT_DISABLED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED'
  | 'EXTERNAL_GATED'
  | 'NOT_SELECTED'
  | 'DISABLED';

export type CarrierActivationLifecycle =
  | 'NOT_SELECTED'
  | 'CONFIGURED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED'
  | 'DISABLED'
  | 'EXTERNAL_GATED';

export type CarrierEnablementGuardCheck = {
  id: string;
  ok: boolean;
  detail: string;
};

/** Order → fulfillment → shipment success path (reuse existing domain states). */
export type ShipmentLifecycleMachine = {
  success_path: string[];
  exception_states: string[];
  notes: string[];
  shipment_creation: 'SANDBOX_ONLY' | 'EXTERNAL_GATED' | 'ENABLED';
  idempotent_booking: true;
};

export type TrackingEventMachine = {
  success_path: string[];
  exception_states: string[];
  duplicate_event_safe: true;
  terminal_overwrite_forbidden: true;
  notes: string[];
};

export type CarrierWebhookSecurity = {
  status: 'SANDBOX_ONLY' | 'EXTERNAL_GATED';
  signature_required: true;
  idempotent_receipts: true;
  replay_protection: true;
  unsigned_fail_closed: true;
  production_gated_without_provider: true;
};

export type CarrierFirstOnboardingReport = {
  /** Production activation readiness sprint; foundation S77 on S67 rail. */
  sprint: 90;
  foundation_sprint: 77;
  provider: 'NOT_SELECTED' | string;
  environment: 'sandbox' | 'production';
  configured: boolean;
  verified: boolean;
  approved: boolean;
  enabled: boolean;
  validation_status: CarrierValidationStatus;
  activation_lifecycle: CarrierActivationLifecycle;
  sandbox: 'SANDBOX_VERIFIED' | 'SANDBOX_AVAILABLE';
  production: 'EXTERNAL_GATED' | 'BLOCKED' | 'ENABLED';
  webhook: 'SANDBOX_ONLY' | 'EXTERNAL_GATED';
  serviceability: 'POLICY_DRIVEN' | 'EXTERNAL_GATED';
  carrier_coverage: 'CARRIER_COVERAGE_EXTERNAL_GATED' | 'POLICY_DRIVEN';
  tracking: 'SANDBOX_VERIFIED' | 'EXTERNAL_GATED' | 'SANDBOX_ONLY';
  shipment_creation: 'SANDBOX_ONLY' | 'EXTERNAL_GATED';
  cancellation: 'SANDBOX_VERIFIED' | 'EXTERNAL_GATED';
  returns: 'POLICY_REQUIRED' | 'SANDBOX_VERIFIED' | 'EXTERNAL_GATED';
  pod: 'DEVICE_NOT_AVAILABLE' | 'EXTERNAL_GATED' | 'SANDBOX_ONLY';
  label_generation: 'SANDBOX_ONLY' | 'EXTERNAL_GATED' | 'NOT_APPLICABLE';
  shipping_cost: 'SANDBOX_ONLY' | 'POLICY_DRIVEN' | 'EXTERNAL_GATED';
  cod: 'NOT_INVENTED' | 'SANDBOX_SEPARATE_FROM_DELIVERY' | 'EXTERNAL_GATED';
  native_device: 'DEVICE_NOT_AVAILABLE';
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
  real_carrier_available: false | true;
  activation_stage: string;
  remaining_blocker: typeof NO_PRODUCTION_CARRIER_ADAPTER | string;
  remaining_blockers: string[];
  next_action: string;
  enablement_guard: {
    can_enable: false | true;
    checks: CarrierEnablementGuardCheck[];
  };
  configuration_validation: ProductionCarrierConfigurationValidation;
  force_launch_available: false;
  country_policy: {
    status: 'POLICY_DRIVEN';
    hardcoded_market: false;
    markets_supported_for_evaluation: Array<'GLOBAL' | 'IN' | 'AE' | 'US'>;
    source_country_equals_customer_country: false;
    note: string;
  };
  shipment_lifecycle: ShipmentLifecycleMachine;
  tracking_events: TrackingEventMachine;
  webhook_security: CarrierWebhookSecurity;
  outbox_idempotency: {
    booking_keys: 'DETERMINISTIC';
    duplicate_shipment_prevented: true;
    duplicate_webhook_safe: true;
  };
  notification_integration: {
    statuses: string[];
    real_sms_email_push: 'EXTERNAL_GATED';
    sandbox_records_only: true;
  };
  observability: {
    correlation_id: true;
    safe_event_types: string[];
    no_full_webhook_payload_logging: true;
    not_selected_suppresses_false_outage: true;
  };
  secrets_printed: false;
  fake_gps_invented: false;
  fake_driver_invented: false;
  fake_pod_invented: false;
  message: string;
};

/** Deterministic validator — credentials alone never yield ENABLED. */
export function validateCarrierConfiguration(input: {
  providerSelected: boolean;
  nonMockAdapterRegistered: boolean;
  logisticsEnvironment: 'sandbox' | 'production';
  liveEnabled: boolean;
  humanApproved: boolean;
  credentialsPresent: boolean;
  accountIdentifierPresent: boolean;
  originPickupConfigured: boolean;
  serviceConfigured: boolean;
  countrySupportConfigured: boolean;
  webhookConfigured: boolean;
}): CarrierValidationStatus {
  if (!input.providerSelected) return 'NOT_SELECTED';
  if (!input.nonMockAdapterRegistered) return 'NOT_CONFIGURED';
  const core =
    input.credentialsPresent &&
    input.accountIdentifierPresent &&
    input.originPickupConfigured &&
    input.serviceConfigured &&
    input.countrySupportConfigured;
  if (!core) return 'NOT_CONFIGURED';
  if (!input.webhookConfigured || input.logisticsEnvironment !== 'production') {
    return 'CONFIGURED_BUT_UNAVAILABLE';
  }
  if (!input.humanApproved) return 'VERIFIED';
  if (!input.liveEnabled) return 'VERIFIED_BUT_DISABLED';
  return 'APPROVED';
}

export function evaluateCarrierEnablementGuard(input: {
  nonMockAdapterRegistered: boolean;
  logisticsEnvironment: 'sandbox' | 'production';
  liveEnabled: boolean;
  humanApproved: boolean;
  webhookProductionReady: boolean;
  emergencyDisabled: boolean;
  countryCoverageConfigured?: boolean;
  legalComplianceClear?: boolean;
}): { can_enable: false | true; checks: CarrierEnablementGuardCheck[] } {
  const checks: CarrierEnablementGuardCheck[] = [
    {
      id: 'non_mock_adapter',
      ok: input.nonMockAdapterRegistered,
      detail: input.nonMockAdapterRegistered
        ? 'Non-mock carrier adapter registered'
        : `Only MockCarrierAdapter — ${NO_PRODUCTION_CARRIER_ADAPTER}`,
    },
    {
      id: 'environment_production',
      ok: input.logisticsEnvironment === 'production',
      detail: `LOGISTICS_ENVIRONMENT=${input.logisticsEnvironment}`,
    },
    {
      id: 'live_flag',
      ok: input.liveEnabled,
      detail: input.liveEnabled ? 'CARRIER_LIVE_ENABLED=true' : 'CARRIER_LIVE_ENABLED is not true',
    },
    {
      id: 'human_approved',
      ok: input.humanApproved,
      detail: input.humanApproved
        ? 'Human approval recorded'
        : 'PROVIDER_APPROVED_CARRIER missing',
    },
    {
      id: 'webhook_production',
      ok: input.webhookProductionReady,
      detail: input.webhookProductionReady
        ? 'Production carrier webhook ready'
        : 'Production carrier webhook EXTERNAL_GATED (sandbox mock verify only)',
    },
    {
      id: 'country_coverage',
      ok: input.countryCoverageConfigured !== false,
      detail:
        input.countryCoverageConfigured === false
          ? 'Carrier country coverage POLICY_REQUIRED'
          : 'Serviceability remains POLICY_DRIVEN; live coverage EXTERNAL_GATED until adapter',
    },
    {
      id: 'legal_compliance',
      ok: input.legalComplianceClear !== false,
      detail:
        input.legalComplianceClear === false
          ? 'LEGAL_REVIEW_REQUIRED for production carrier'
          : 'Legal/compliance gate tracked separately; not blocking sandbox',
    },
    {
      id: 'not_emergency_disabled',
      ok: !input.emergencyDisabled,
      detail: input.emergencyDisabled ? 'Emergency disable active' : 'No emergency disable',
    },
  ];
  return { can_enable: checks.every((c) => c.ok) ? true : false, checks };
}

export function buildShipmentLifecycleMachine(): ShipmentLifecycleMachine {
  return {
    success_path: [
      'ORDER',
      'ALLOCATED',
      'PICKING',
      'PACKED',
      'READY_TO_SHIP',
      'SHIPMENT_CREATED',
      'IN_TRANSIT',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ],
    exception_states: [
      'CANCELLED',
      'FAILED',
      'RETURN_REQUESTED',
      'RETURNED',
      'LOST',
      'UNDELIVERABLE',
    ],
    notes: [
      'Reuse existing order/fulfillment/shipment domain states — do not invent a second machine.',
      'Invalid transitions must be rejected server-side.',
      'DELIVERED requires authorized POD/delivery confirmation — not mere shipment existence.',
    ],
    shipment_creation: 'SANDBOX_ONLY',
    idempotent_booking: true,
  };
}

export function buildTrackingEventMachine(): TrackingEventMachine {
  return {
    success_path: [
      'LABEL_CREATED',
      'PICKED_UP',
      'IN_TRANSIT',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ],
    exception_states: ['FAILED', 'EXCEPTION', 'UNDELIVERABLE', 'RETURNING', 'RETURNED'],
    duplicate_event_safe: true,
    terminal_overwrite_forbidden: true,
    notes: [
      'Duplicate tracking events are idempotent.',
      'Older events must not overwrite newer terminal states.',
      'Do not fabricate live carrier events; sandbox events remain SANDBOX_VERIFIED.',
    ],
  };
}

/** Authoritative carrier onboarding snapshot — MockCarrierAdapter only in this codebase. */
export function evaluateCarrierFirstOnboarding(): CarrierFirstOnboardingReport {
  const env = readLogisticsEnvironment();
  const live = isLiveCarrierEnabled();
  const activation = evaluateProviderActivation(getProviderActivationContract('CARRIER'));
  const humanApproved = process.env['PROVIDER_APPROVED_CARRIER']?.trim().toLowerCase() === 'true';
  const emergency =
    process.env['PROVIDER_EMERGENCY_DISABLE_ALL']?.trim().toLowerCase() === 'true' ||
    process.env['PROVIDER_EMERGENCY_DISABLE_CARRIER']?.trim().toLowerCase() === 'true';

  void isMockCarrierCode('MOCK_CARRIER');

  const real = false;
  const guard = evaluateCarrierEnablementGuard({
    nonMockAdapterRegistered: real,
    logisticsEnvironment: env,
    liveEnabled: live,
    humanApproved,
    webhookProductionReady: false,
    emergencyDisabled: emergency,
  });

  const validation_status = validateCarrierConfiguration({
    providerSelected: false,
    nonMockAdapterRegistered: real,
    logisticsEnvironment: env,
    liveEnabled: live,
    humanApproved,
    credentialsPresent: false,
    accountIdentifierPresent: false,
    originPickupConfigured: false,
    serviceConfigured: false,
    countrySupportConfigured: false,
    webhookConfigured: false,
  });

  const configuration_validation = validateProductionCarrierConfiguration({
    providerSelected: real,
    providerName: 'NOT_SELECTED',
    nonMockAdapterRegistered: real,
  });

  const remaining_blockers = [
    NO_PRODUCTION_CARRIER_ADAPTER,
    ...configuration_validation.blockers,
  ];

  return {
    sprint: 90,
    foundation_sprint: 77,
    provider: 'NOT_SELECTED',
    environment: env,
    configured: false,
    verified: false,
    approved: false,
    enabled: false,
    validation_status,
    activation_lifecycle: 'NOT_SELECTED',
    sandbox: 'SANDBOX_VERIFIED',
    production: 'EXTERNAL_GATED',
    webhook: 'SANDBOX_ONLY',
    serviceability: 'POLICY_DRIVEN',
    carrier_coverage: 'CARRIER_COVERAGE_EXTERNAL_GATED',
    tracking: 'SANDBOX_VERIFIED',
    shipment_creation: 'SANDBOX_ONLY',
    cancellation: 'SANDBOX_VERIFIED',
    returns: 'POLICY_REQUIRED',
    pod: 'DEVICE_NOT_AVAILABLE',
    label_generation: 'SANDBOX_ONLY',
    shipping_cost: 'SANDBOX_ONLY',
    cod: 'NOT_INVENTED',
    native_device: 'DEVICE_NOT_AVAILABLE',
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    real_carrier_available: real,
    activation_stage: activation.stage,
    remaining_blocker: NO_PRODUCTION_CARRIER_ADAPTER,
    remaining_blockers: [...new Set(remaining_blockers)],
    next_action:
      'Supply carrier contract + vault secret refs (CARRIER_PRODUCTION_SECRET_REF, CARRIER_WEBHOOK_*) + register non-mock carrier adapter; country coverage + legal clearance; set PROVIDER_APPROVED_CARRIER; then CARRIER_LIVE_ENABLED after guard can_enable=true',
    enablement_guard: guard,
    configuration_validation,
    force_launch_available: false,
    country_policy: {
      status: 'POLICY_DRIVEN',
      hardcoded_market: false,
      markets_supported_for_evaluation: ['GLOBAL', 'IN', 'AE', 'US'],
      source_country_equals_customer_country: false,
      note: 'Serviceability is policy-driven; fulfillment/source country is independent of customer market. Live carrier coverage remains EXTERNAL_GATED.',
    },
    shipment_lifecycle: buildShipmentLifecycleMachine(),
    tracking_events: buildTrackingEventMachine(),
    webhook_security: {
      status: 'SANDBOX_ONLY',
      signature_required: true,
      idempotent_receipts: true,
      replay_protection: true,
      unsigned_fail_closed: true,
      production_gated_without_provider: true,
    },
    outbox_idempotency: {
      booking_keys: 'DETERMINISTIC',
      duplicate_shipment_prevented: true,
      duplicate_webhook_safe: true,
    },
    notification_integration: {
      statuses: [
        'order_confirmed',
        'shipment_created',
        'in_transit',
        'out_for_delivery',
        'delivered',
        'exception',
        'return',
      ],
      real_sms_email_push: 'EXTERNAL_GATED',
      sandbox_records_only: true,
    },
    observability: {
      correlation_id: true,
      safe_event_types: [
        'shipment_create_attempt',
        'shipment_create_result',
        'tracking_event',
        'webhook_accepted_or_rejected',
        'delivery_attempt',
        'return',
        'carrier_dependency_failure',
      ],
      no_full_webhook_payload_logging: true,
      not_selected_suppresses_false_outage: true,
    },
    secrets_printed: false,
    fake_gps_invented: false,
    fake_driver_invented: false,
    fake_pod_invented: false,
    message: `No real carrier supplied (${NO_PRODUCTION_CARRIER_ADAPTER}). Provider NOT_SELECTED. Production EXTERNAL_GATED. Sandbox MockCarrierAdapter remains SANDBOX_VERIFIED. Native rider/POD DEVICE_NOT_AVAILABLE. Sprint 90 readiness on Sprint 77/67 foundation.`,
  };
}
