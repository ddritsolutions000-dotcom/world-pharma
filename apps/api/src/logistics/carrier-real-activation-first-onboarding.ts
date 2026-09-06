/**
 * Sprint 105 — Real carrier / logistics production activation readiness.
 * Composes S67/S77/S90. Never invents carriers, credentials, tracking, GPS, or POD.
 * Never creates real shipments or books live carriers.
 */
import {
  NO_PRODUCTION_CARRIER_ADAPTER,
  evaluateCarrierFirstOnboarding,
  type CarrierActivationLifecycle,
} from './carrier-first-onboarding';
import {
  CARRIER_CREDENTIAL_REFERENCE_MISSING,
  CARRIER_MARKET_CONFIGURATION_MISSING,
  CARRIER_PROVIDER_NOT_SELECTED,
  CARRIER_SERVICEABILITY_CONFIGURATION_MISSING,
  CARRIER_TRACKING_CONFIGURATION_MISSING,
  CARRIER_WEBHOOK_CONFIGURATION_MISSING,
  CARRIER_WEBHOOK_SECRET_REFERENCE_MISSING,
  validateProductionCarrierConfiguration,
} from './production-carrier-requirements';
import { evaluateProductionFoundationFirstOnboarding } from '../ops/production-foundation-first-onboarding';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';

export {
  NO_PRODUCTION_CARRIER_ADAPTER,
  CARRIER_PROVIDER_NOT_SELECTED,
  CARRIER_CREDENTIAL_REFERENCE_MISSING,
  CARRIER_WEBHOOK_SECRET_REFERENCE_MISSING,
  CARRIER_WEBHOOK_CONFIGURATION_MISSING,
  CARRIER_MARKET_CONFIGURATION_MISSING,
  CARRIER_SERVICEABILITY_CONFIGURATION_MISSING,
  CARRIER_TRACKING_CONFIGURATION_MISSING,
};

export type RealCarrierLifecycle =
  | 'NOT_SELECTED'
  | 'CONFIGURATION_REQUIRED'
  | 'CREDENTIALS_REQUIRED'
  | 'VERIFICATION_REQUIRED'
  | 'APPROVAL_REQUIRED'
  | 'READY_FOR_ACTIVATION'
  | 'ENABLED'
  | 'DISABLED'
  | 'EXTERNAL_GATED';

export type RealCarrierMarketStatus = {
  market: 'GLOBAL' | 'IN' | 'AE' | 'US';
  lifecycle: RealCarrierLifecycle;
  sandbox: 'SANDBOX_VERIFIED';
  production: 'PRODUCTION_NOT_CONFIGURED' | 'PRODUCTION_EXTERNAL_GATED' | 'ENABLED';
  blocker: string;
  cross_border_medicine: 'LEGAL_GATED' | 'EXTERNAL_GATED';
};

export type RealCarrierChecklistItem = {
  id: string;
  label: string;
  mandatory: boolean;
  status: 'MISSING' | 'PRESENT' | 'PENDING' | 'N/A';
};

function mapLifecycle(s90: CarrierActivationLifecycle): RealCarrierLifecycle {
  if (s90 === 'ENABLED') return 'ENABLED';
  if (s90 === 'DISABLED') return 'DISABLED';
  if (s90 === 'NOT_SELECTED') return 'NOT_SELECTED';
  if (s90 === 'APPROVED') return 'APPROVAL_REQUIRED';
  if (s90 === 'VERIFIED') return 'VERIFICATION_REQUIRED';
  if (s90 === 'CONFIGURED') return 'CONFIGURATION_REQUIRED';
  return 'EXTERNAL_GATED';
}

export function buildRealCarrierActivationChecklist(): RealCarrierChecklistItem[] {
  const v = validateProductionCarrierConfiguration();
  return [
    {
      id: 'carrier_selected',
      label: 'Real carrier selected?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'commercial_relationship',
      label: 'Commercial/account relationship established?',
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
      id: 'api_endpoint',
      label: 'API endpoint configured?',
      mandatory: true,
      status: v.account_reference.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'webhook_endpoint',
      label: 'Webhook endpoint configured?',
      mandatory: true,
      status: v.webhook_configuration.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'webhook_signing',
      label: 'Webhook signing/security configured?',
      mandatory: true,
      status: v.webhook_secret_reference.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'market_coverage',
      label: 'Market coverage configured?',
      mandatory: true,
      status: v.market_configuration.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'serviceability',
      label: 'Serviceability configured?',
      mandatory: true,
      status: v.serviceability_configuration.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'shipment_types',
      label: 'Supported shipment types configured?',
      mandatory: true,
      status: 'PENDING',
    },
    {
      id: 'pickup_locations',
      label: 'Pickup locations configured?',
      mandatory: true,
      status: 'PENDING',
    },
    {
      id: 'delivery_zones',
      label: 'Delivery zones configured?',
      mandatory: true,
      status: 'PENDING',
    },
    {
      id: 'tracking',
      label: 'Tracking capability configured?',
      mandatory: true,
      status: v.tracking_configuration.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'cancellation',
      label: 'Cancellation capability configured?',
      mandatory: true,
      status: 'PENDING',
    },
    {
      id: 'returns_rto',
      label: 'Returns/RTO capability configured?',
      mandatory: true,
      status: 'PENDING',
    },
    {
      id: 'proof_of_delivery',
      label: 'Proof-of-delivery capability configured?',
      mandatory: false,
      status: 'N/A',
    },
    {
      id: 'sla_service',
      label: 'SLA/service configuration complete?',
      mandatory: true,
      status: 'PENDING',
    },
    {
      id: 'legal_commercial',
      label: 'Legal/commercial approval complete?',
      mandatory: true,
      status: 'PENDING',
    },
    {
      id: 'sandbox_verification',
      label: 'Sandbox verification complete?',
      mandatory: true,
      status: 'PRESENT',
    },
    {
      id: 'production_verification',
      label: 'Production verification complete?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'monitoring',
      label: 'Monitoring configured?',
      mandatory: true,
      status: 'PENDING',
    },
    {
      id: 'rollback_disable',
      label: 'Disable/rollback procedure available?',
      mandatory: true,
      status: 'PRESENT',
    },
  ];
}

export function buildRealCarrierMarketStatuses(): RealCarrierMarketStatus[] {
  return (['GLOBAL', 'IN', 'AE', 'US'] as const).map((market) => ({
    market,
    lifecycle: 'NOT_SELECTED' as const,
    sandbox: 'SANDBOX_VERIFIED' as const,
    production: 'PRODUCTION_EXTERNAL_GATED' as const,
    blocker: NO_PRODUCTION_CARRIER_ADAPTER,
    cross_border_medicine: 'LEGAL_GATED' as const,
  }));
}

export type RealCarrierFirstOnboardingReport = {
  sprint: 105;
  foundation_sprints: string;
  activation_lifecycle: RealCarrierLifecycle;
  environment: 'sandbox' | 'production';
  provider: 'NOT_SELECTED';
  real_carrier_selected: false;
  configured: boolean;
  verified: boolean;
  approved: boolean;
  enabled: false;
  sandbox: 'SANDBOX_VERIFIED';
  production: 'EXTERNAL_GATED';
  sandbox_shipment: 'SANDBOX_VERIFIED';
  production_shipment: 'EXTERNAL_GATED';
  webhook: string;
  serviceability: string;
  tracking: string;
  returns_rto: string;
  pod: 'DEVICE_NOT_AVAILABLE';
  cancellation: string;
  ready_for_activation: false;
  real_shipment_created: false;
  production_carrier_enabled: false;
  configuration_readiness: ReturnType<
    typeof validateProductionCarrierConfiguration
  >['configuration_readiness'];
  checklist: RealCarrierChecklistItem[];
  markets: RealCarrierMarketStatus[];
  shipment_lifecycle: ReturnType<typeof evaluateCarrierFirstOnboarding>['shipment_lifecycle'];
  tracking_events: ReturnType<typeof evaluateCarrierFirstOnboarding>['tracking_events'];
  webhook_security: ReturnType<typeof evaluateCarrierFirstOnboarding>['webhook_security'];
  outbox_idempotency: ReturnType<typeof evaluateCarrierFirstOnboarding>['outbox_idempotency'];
  country_policy: ReturnType<typeof evaluateCarrierFirstOnboarding>['country_policy'];
  cross_border: {
    customer_may_differ_from_source: true;
    medicine_import: 'LEGAL_GATED';
    customs_documentation: 'EXTERNAL_GATED';
    never_declare_legal_availability_from_software_alone: true;
  };
  address_privacy: {
    customer_own_only: true;
    vendor_fulfillment_minimum: true;
    no_unrelated_exposure: true;
  };
  permission_model: {
    customer_cannot_access_admin_carrier: true;
    vendor_cannot_configure_carrier: true;
    doctor_cannot_configure_carrier: true;
    vendor_cannot_impersonate_carrier: true;
    unauthorized_api_rejected: true;
    secrets_never_returned: true;
  };
  remaining_blocker: typeof NO_PRODUCTION_CARRIER_ADAPTER;
  remaining_blockers: string[];
  next_action: string;
  force_launch_available: false;
  force_deploy_available: false;
  can_production_launch: 'NO';
  launch_control_overall: string;
  control_plane: 'S100_REUSED';
  foundation_plane: 'S101_REUSED';
  s90_plane: 'COMPOSED';
  evaluated_at: string;
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  native_rider: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
  secrets_printed: false;
  fake_carrier_invented: false;
  fake_tracking_invented: false;
  fake_gps_invented: false;
  fake_pod_invented: false;
  message: string;
};

export function evaluateRealCarrierFirstOnboarding(
  input?: { correlation_id?: string },
): RealCarrierFirstOnboardingReport {
  const s90 = evaluateCarrierFirstOnboarding();
  const foundation = evaluateProductionFoundationFirstOnboarding();
  const launch = evaluateProductionLaunchControl({
    market: 'GLOBAL',
    service_scope: 'GLOBAL',
    correlation_id: input?.correlation_id,
  });
  const checklist = buildRealCarrierActivationChecklist();
  const markets = buildRealCarrierMarketStatuses();
  const config = validateProductionCarrierConfiguration();

  const remaining_blockers = [
    NO_PRODUCTION_CARRIER_ADAPTER,
    CARRIER_PROVIDER_NOT_SELECTED,
    CARRIER_CREDENTIAL_REFERENCE_MISSING,
    CARRIER_WEBHOOK_SECRET_REFERENCE_MISSING,
    CARRIER_WEBHOOK_CONFIGURATION_MISSING,
    CARRIER_MARKET_CONFIGURATION_MISSING,
    CARRIER_SERVICEABILITY_CONFIGURATION_MISSING,
    CARRIER_TRACKING_CONFIGURATION_MISSING,
    ...foundation.remaining_blockers.filter((b) =>
      [
        'NO_PRODUCTION_ENVIRONMENT',
        'NO_PRODUCTION_SECRETS_MANAGER',
        'NO_PRODUCTION_DATABASE',
        'NO_PRODUCTION_DEPLOYMENT_TARGET',
      ].includes(b),
    ),
    ...s90.remaining_blockers.slice(0, 6),
  ];

  return {
    sprint: 105,
    foundation_sprints: '7,26,46,67,77,87,90,95,97,98,100,101,102,103,104',
    activation_lifecycle: mapLifecycle(s90.activation_lifecycle),
    environment: s90.environment,
    provider: 'NOT_SELECTED',
    real_carrier_selected: false,
    configured: s90.configured,
    verified: s90.verified,
    approved: s90.approved,
    enabled: false,
    sandbox: 'SANDBOX_VERIFIED',
    production: 'EXTERNAL_GATED',
    sandbox_shipment: 'SANDBOX_VERIFIED',
    production_shipment: 'EXTERNAL_GATED',
    webhook: String(s90.webhook),
    serviceability: String(s90.serviceability),
    tracking: String(s90.tracking),
    returns_rto: String(s90.returns),
    pod: 'DEVICE_NOT_AVAILABLE',
    cancellation: String(s90.cancellation),
    ready_for_activation: false,
    real_shipment_created: false,
    production_carrier_enabled: false,
    configuration_readiness: config.configuration_readiness,
    checklist,
    markets,
    shipment_lifecycle: s90.shipment_lifecycle,
    tracking_events: s90.tracking_events,
    webhook_security: s90.webhook_security,
    outbox_idempotency: s90.outbox_idempotency,
    country_policy: s90.country_policy,
    cross_border: {
      customer_may_differ_from_source: true,
      medicine_import: 'LEGAL_GATED',
      customs_documentation: 'EXTERNAL_GATED',
      never_declare_legal_availability_from_software_alone: true,
    },
    address_privacy: {
      customer_own_only: true,
      vendor_fulfillment_minimum: true,
      no_unrelated_exposure: true,
    },
    permission_model: {
      customer_cannot_access_admin_carrier: true,
      vendor_cannot_configure_carrier: true,
      doctor_cannot_configure_carrier: true,
      vendor_cannot_impersonate_carrier: true,
      unauthorized_api_rejected: true,
      secrets_never_returned: true,
    },
    remaining_blocker: NO_PRODUCTION_CARRIER_ADAPTER,
    remaining_blockers: [...new Set(remaining_blockers)],
    next_action:
      'Select a real carrier + commercial account, vault credential/webhook refs via S101 secrets manager, complete market/serviceability/legal gates, then human approval. Do not invent carriers, tracking numbers, or book live shipments.',
    force_launch_available: false,
    force_deploy_available: false,
    can_production_launch: 'NO',
    launch_control_overall: launch.overall_status,
    control_plane: 'S100_REUSED',
    foundation_plane: 'S101_REUSED',
    s90_plane: 'COMPOSED',
    evaluated_at: new Date().toISOString(),
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    native_rider: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    secrets_printed: false,
    fake_carrier_invented: false,
    fake_tracking_invented: false,
    fake_gps_invented: false,
    fake_pod_invented: false,
    message:
      'Sprint 105 real carrier activation readiness: provider NOT_SELECTED / EXTERNAL_GATED. Sandbox MockCarrierAdapter remains SANDBOX_VERIFIED. PRODUCTION CARRIER ENABLED = NO. REAL SHIPMENT CREATED = NO. CAN_PRODUCTION_LAUNCH = NO. Cross-border medicine LEGAL_GATED. Native rider/POD DEVICE_NOT_AVAILABLE.',
  };
}
