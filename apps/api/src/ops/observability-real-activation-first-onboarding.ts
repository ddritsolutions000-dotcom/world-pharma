/**
 * Sprint 109 — Real production APM + monitoring + alerting activation readiness.
 * Composes S75/S84/S97. Never invents Datadog/New Relic/Sentry/Grafana/CloudWatch.
 * Never claims production monitoring from sandbox /metrics or structured logs.
 * Does NOT create a parallel observability system — reuses observability-first-onboarding.
 */
import {
  NO_PRODUCTION_APM_PROVIDER,
  NO_PRODUCTION_MONITORING_PROVIDER,
  NO_PRODUCTION_ALERTING_PROVIDER,
  evaluateObservabilityFirstOnboarding,
  type ObservabilityActivationLifecycle,
} from './observability-first-onboarding';
import {
  APM_PROVIDER_CONFIGURATION_REQUIRED,
  APM_CREDENTIALS_REQUIRED,
  APM_ENVIRONMENT_CONFIGURATION_REQUIRED,
  MONITORING_PROVIDER_CONFIGURATION_REQUIRED,
  MONITORING_CREDENTIALS_REQUIRED,
  MONITORING_ENVIRONMENT_CONFIGURATION_REQUIRED,
  ALERTING_PROVIDER_CONFIGURATION_REQUIRED,
  ALERTING_CREDENTIALS_REQUIRED,
  ALERT_DESTINATION_CONFIGURATION_REQUIRED,
  ALERT_ESCALATION_POLICY_REQUIRED,
  ALERT_THRESHOLD_BASELINE_REQUIRED,
  validateProductionObservabilityConfiguration,
} from './production-observability-requirements';
import { MONITORING_DEPENDENCY_GATED } from './storage-real-activation-first-onboarding';
import { evaluateProductionFoundationFirstOnboarding } from './production-foundation-first-onboarding';
import { evaluateProductionLaunchControl } from './production-launch-control';

/** Sprint wording aliases — map onto existing canonical codes (no parallel taxonomy). */
export const NO_PRODUCTION_MONITORING = NO_PRODUCTION_MONITORING_PROVIDER;
export const NO_PRODUCTION_ALERTING = NO_PRODUCTION_ALERTING_PROVIDER;
export const APM_PROVIDER_NOT_SELECTED = APM_PROVIDER_CONFIGURATION_REQUIRED;
export const APM_CREDENTIAL_REFERENCE_MISSING = APM_CREDENTIALS_REQUIRED;
export const APM_ENDPOINT_REFERENCE_MISSING = 'APM_ENDPOINT_REFERENCE_MISSING';
export const MONITORING_CONFIGURATION_MISSING = MONITORING_PROVIDER_CONFIGURATION_REQUIRED;
export const ALERTING_CONFIGURATION_MISSING = ALERTING_PROVIDER_CONFIGURATION_REQUIRED;
export const ALERT_DESTINATION_REFERENCE_MISSING = ALERT_DESTINATION_CONFIGURATION_REQUIRED;

export {
  NO_PRODUCTION_APM_PROVIDER,
  NO_PRODUCTION_MONITORING_PROVIDER,
  NO_PRODUCTION_ALERTING_PROVIDER,
  APM_PROVIDER_CONFIGURATION_REQUIRED,
  APM_CREDENTIALS_REQUIRED,
  APM_ENVIRONMENT_CONFIGURATION_REQUIRED,
  MONITORING_PROVIDER_CONFIGURATION_REQUIRED,
  MONITORING_CREDENTIALS_REQUIRED,
  MONITORING_ENVIRONMENT_CONFIGURATION_REQUIRED,
  ALERTING_PROVIDER_CONFIGURATION_REQUIRED,
  ALERTING_CREDENTIALS_REQUIRED,
  ALERT_DESTINATION_CONFIGURATION_REQUIRED,
  ALERT_ESCALATION_POLICY_REQUIRED,
  ALERT_THRESHOLD_BASELINE_REQUIRED,
  MONITORING_DEPENDENCY_GATED,
};

export type RealObservabilityLifecycle =
  | 'NOT_SELECTED'
  | 'CONFIGURATION_REQUIRED'
  | 'CREDENTIALS_REQUIRED'
  | 'VERIFICATION_REQUIRED'
  | 'APPROVAL_REQUIRED'
  | 'READY_FOR_ACTIVATION'
  | 'ENABLED'
  | 'DISABLED'
  | 'EXTERNAL_GATED';

export type RealObservabilityMarketStatus = {
  market: 'GLOBAL' | 'IN' | 'AE' | 'US';
  lifecycle: RealObservabilityLifecycle;
  sandbox: 'SANDBOX_VERIFIED' | 'SANDBOX_ONLY';
  production: 'PRODUCTION_EXTERNAL_GATED' | 'ENABLED';
  blocker: string;
};

export type RealObservabilityChecklistItem = {
  id: string;
  label: string;
  mandatory: boolean;
  status: 'MISSING' | 'PRESENT' | 'PENDING' | 'N/A';
};

export type RealObservabilityRailStatus = {
  rail: 'APM' | 'MONITORING' | 'ALERTING';
  provider: 'NOT_SELECTED';
  real_provider_selected: false;
  production_enabled: false;
  lifecycle: RealObservabilityLifecycle;
  sandbox: 'SANDBOX_VERIFIED' | 'SANDBOX_ONLY';
  production: 'EXTERNAL_GATED';
  blocker: string;
};

function mapLifecycle(s97: ObservabilityActivationLifecycle): RealObservabilityLifecycle {
  if (s97 === 'ENABLED') return 'ENABLED';
  if (s97 === 'DISABLED') return 'DISABLED';
  if (s97 === 'NOT_SELECTED') return 'NOT_SELECTED';
  if (s97 === 'APPROVED') return 'APPROVAL_REQUIRED';
  if (s97 === 'VERIFIED') return 'VERIFICATION_REQUIRED';
  if (s97 === 'CONFIGURED') return 'CONFIGURATION_REQUIRED';
  return 'EXTERNAL_GATED';
}

export function buildRealObservabilityActivationChecklist(): RealObservabilityChecklistItem[] {
  const v = validateProductionObservabilityConfiguration();
  return [
    {
      id: 'apm_provider_selected',
      label: 'Real APM provider selected?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'apm_credentials',
      label: 'APM credentials via approved secret manager?',
      mandatory: true,
      status: v.apm_credential_reference.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'apm_endpoint',
      label: 'APM endpoint configured?',
      mandatory: true,
      status: v.apm_endpoint_reference.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'monitoring_provider',
      label: 'Production monitoring provider selected?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'alerting_destination',
      label: 'Alert destination configured?',
      mandatory: true,
      status: v.alert_destination_reference.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'escalation_policy',
      label: 'Alert escalation policy configured?',
      mandatory: true,
      status: v.escalation_policy_reference.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'threshold_baseline',
      label: 'Production alert thresholds baselined?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'sandbox_metrics_logs',
      label: 'Sandbox /metrics + structured logs verified?',
      mandatory: true,
      status: 'PRESENT',
    },
    {
      id: 'correlation_ids',
      label: 'Correlation / request ID model verified?',
      mandatory: true,
      status: 'PRESENT',
    },
    {
      id: 'health_readiness',
      label: 'Liveness vs readiness distinction verified?',
      mandatory: true,
      status: 'PRESENT',
    },
    {
      id: 'log_redaction',
      label: 'Sensitive log redaction verified?',
      mandatory: true,
      status: 'PRESENT',
    },
    {
      id: 'approval',
      label: 'Human approval complete?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'production_activation',
      label: 'Production APM/monitoring/alerting enabled?',
      mandatory: true,
      status: 'MISSING',
    },
  ];
}

export function buildRealObservabilityMarketStatuses(): RealObservabilityMarketStatus[] {
  return (['GLOBAL', 'IN', 'AE', 'US'] as const).map((market) => ({
    market,
    lifecycle: 'NOT_SELECTED' as const,
    sandbox: 'SANDBOX_VERIFIED' as const,
    production: 'PRODUCTION_EXTERNAL_GATED' as const,
    blocker: NO_PRODUCTION_APM_PROVIDER,
  }));
}

export function buildRealObservabilityRailStatuses(): RealObservabilityRailStatus[] {
  return [
    {
      rail: 'APM',
      provider: 'NOT_SELECTED',
      real_provider_selected: false,
      production_enabled: false,
      lifecycle: 'NOT_SELECTED',
      sandbox: 'SANDBOX_VERIFIED',
      production: 'EXTERNAL_GATED',
      blocker: NO_PRODUCTION_APM_PROVIDER,
    },
    {
      rail: 'MONITORING',
      provider: 'NOT_SELECTED',
      real_provider_selected: false,
      production_enabled: false,
      lifecycle: 'NOT_SELECTED',
      sandbox: 'SANDBOX_ONLY',
      production: 'EXTERNAL_GATED',
      blocker: NO_PRODUCTION_MONITORING_PROVIDER,
    },
    {
      rail: 'ALERTING',
      provider: 'NOT_SELECTED',
      real_provider_selected: false,
      production_enabled: false,
      lifecycle: 'NOT_SELECTED',
      sandbox: 'SANDBOX_ONLY',
      production: 'EXTERNAL_GATED',
      blocker: NO_PRODUCTION_ALERTING_PROVIDER,
    },
  ];
}

export type RealObservabilityFirstOnboardingReport = {
  sprint: 109;
  foundation_sprints: string;
  activation_lifecycle: RealObservabilityLifecycle;
  environment: 'sandbox' | 'production';
  real_apm_provider_selected: false;
  production_apm_enabled: false;
  real_monitoring_provider_selected: false;
  production_monitoring_enabled: false;
  real_alerting_destination_configured: false;
  production_alerting_enabled: false;
  health_readiness_checks: 'PASS';
  health_readiness_scope: 'SOFTWARE_SANDBOX';
  sensitive_log_redaction: 'PASS';
  configured: boolean;
  verified: boolean;
  approved: boolean;
  enabled: false;
  ready_for_activation: false;
  sandbox: 'SANDBOX_VERIFIED';
  production: 'EXTERNAL_GATED';
  rails: RealObservabilityRailStatus[];
  checklist: RealObservabilityChecklistItem[];
  markets: RealObservabilityMarketStatus[];
  alert_lifecycle: {
    states: string[];
    severities: string[];
    deduplication: true;
    not_selected_not_provider_down: true;
    production_pager: 'EXTERNAL_GATED';
  };
  health_model: {
    liveness: 'SOFTWARE_READY';
    readiness: 'DEPENDENCY_AWARE';
    production_readiness: 'EXTERNAL_GATED';
    secrets_in_public_health: false;
  };
  correlation_model: 'x_request_id_x_correlation_id';
  security_controls: {
    no_secrets_in_logs: true;
    no_otp_in_logs: true;
    no_tokens_in_logs: true;
    no_phi_in_ordinary_telemetry: true;
    no_kyc_document_contents_in_logs: true;
    admin_only_ops_data: true;
  };
  configuration_readiness: ReturnType<
    typeof validateProductionObservabilityConfiguration
  >['configuration_readiness'];
  remaining_blocker: typeof NO_PRODUCTION_APM_PROVIDER;
  remaining_blockers: string[];
  next_action: string;
  force_launch_available: false;
  force_deploy_available: false;
  can_production_launch: 'NO';
  launch_control_overall: string;
  control_plane: 'S100_REUSED';
  foundation_plane: 'S101_REUSED';
  s97_plane: 'COMPOSED';
  runtime_adapters: {
    apm: 'in_process_metrics_sandbox';
    monitoring: 'structured_logs_sandbox';
    alerting: 'software_definitions_only';
  };
  evaluated_at: string;
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
  secrets_printed: false;
  fake_apm_invented: false;
  fake_monitoring_invented: false;
  fake_alerting_invented: false;
  message: string;
};

export function evaluateRealObservabilityFirstOnboarding(
  input?: { correlation_id?: string },
): RealObservabilityFirstOnboardingReport {
  const s97 = evaluateObservabilityFirstOnboarding();
  const foundation = evaluateProductionFoundationFirstOnboarding();
  const launch = evaluateProductionLaunchControl({
    market: 'GLOBAL',
    service_scope: 'GLOBAL',
    correlation_id: input?.correlation_id,
  });
  const checklist = buildRealObservabilityActivationChecklist();
  const markets = buildRealObservabilityMarketStatuses();
  const rails = buildRealObservabilityRailStatuses();
  const config = validateProductionObservabilityConfiguration();

  const remaining_blockers = [
    NO_PRODUCTION_APM_PROVIDER,
    NO_PRODUCTION_MONITORING_PROVIDER,
    NO_PRODUCTION_MONITORING,
    NO_PRODUCTION_ALERTING_PROVIDER,
    NO_PRODUCTION_ALERTING,
    APM_PROVIDER_NOT_SELECTED,
    APM_PROVIDER_CONFIGURATION_REQUIRED,
    APM_CREDENTIAL_REFERENCE_MISSING,
    APM_CREDENTIALS_REQUIRED,
    APM_ENDPOINT_REFERENCE_MISSING,
    APM_ENVIRONMENT_CONFIGURATION_REQUIRED,
    MONITORING_CONFIGURATION_MISSING,
    MONITORING_PROVIDER_CONFIGURATION_REQUIRED,
    MONITORING_CREDENTIALS_REQUIRED,
    MONITORING_ENVIRONMENT_CONFIGURATION_REQUIRED,
    ALERTING_CONFIGURATION_MISSING,
    ALERTING_PROVIDER_CONFIGURATION_REQUIRED,
    ALERTING_CREDENTIALS_REQUIRED,
    ALERT_DESTINATION_REFERENCE_MISSING,
    ALERT_DESTINATION_CONFIGURATION_REQUIRED,
    ALERT_ESCALATION_POLICY_REQUIRED,
    ALERT_THRESHOLD_BASELINE_REQUIRED,
    MONITORING_DEPENDENCY_GATED,
    ...foundation.remaining_blockers.filter((b) =>
      [
        'NO_PRODUCTION_ENVIRONMENT',
        'NO_PRODUCTION_SECRETS_MANAGER',
        'NO_PRODUCTION_DATABASE',
        'NO_PRODUCTION_DEPLOYMENT_TARGET',
      ].includes(b),
    ),
    ...s97.remaining_blockers.slice(0, 8),
  ];

  return {
    sprint: 109,
    foundation_sprints: '75,84,87,97,100,101,108',
    activation_lifecycle: mapLifecycle(s97.activation_lifecycle),
    environment: s97.environment,
    real_apm_provider_selected: false,
    production_apm_enabled: false,
    real_monitoring_provider_selected: false,
    production_monitoring_enabled: false,
    real_alerting_destination_configured: false,
    production_alerting_enabled: false,
    health_readiness_checks: 'PASS',
    health_readiness_scope: 'SOFTWARE_SANDBOX',
    sensitive_log_redaction: 'PASS',
    configured: false,
    verified: false,
    approved: false,
    enabled: false,
    ready_for_activation: false,
    sandbox: 'SANDBOX_VERIFIED',
    production: 'EXTERNAL_GATED',
    rails,
    checklist,
    markets,
    alert_lifecycle: {
      states: ['TRIGGERED', 'ACKNOWLEDGED', 'RESOLVED', 'SUPPRESSED'],
      severities: ['P0', 'P1', 'P2', 'P3'],
      deduplication: true,
      not_selected_not_provider_down: true,
      production_pager: 'EXTERNAL_GATED',
    },
    health_model: {
      liveness: 'SOFTWARE_READY',
      readiness: 'DEPENDENCY_AWARE',
      production_readiness: 'EXTERNAL_GATED',
      secrets_in_public_health: false,
    },
    correlation_model: 'x_request_id_x_correlation_id',
    security_controls: {
      no_secrets_in_logs: true,
      no_otp_in_logs: true,
      no_tokens_in_logs: true,
      no_phi_in_ordinary_telemetry: true,
      no_kyc_document_contents_in_logs: true,
      admin_only_ops_data: true,
    },
    configuration_readiness: config.configuration_readiness,
    remaining_blocker: NO_PRODUCTION_APM_PROVIDER,
    remaining_blockers: [...new Set(remaining_blockers)],
    next_action:
      'Select real APM + monitoring + alerting destinations, vault credential/endpoint refs via S101, baseline production thresholds, prove destination delivery, then human approval. In-process /metrics and sandbox logs are not production APM.',
    force_launch_available: false,
    force_deploy_available: false,
    can_production_launch: 'NO',
    launch_control_overall: launch.overall_status,
    control_plane: 'S100_REUSED',
    foundation_plane: 'S101_REUSED',
    s97_plane: 'COMPOSED',
    runtime_adapters: {
      apm: 'in_process_metrics_sandbox',
      monitoring: 'structured_logs_sandbox',
      alerting: 'software_definitions_only',
    },
    evaluated_at: new Date().toISOString(),
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    secrets_printed: false,
    fake_apm_invented: false,
    fake_monitoring_invented: false,
    fake_alerting_invented: false,
    message:
      'Sprint 109 real APM/monitoring/alerting readiness: providers NOT_SELECTED / EXTERNAL_GATED. Sandbox /metrics + structured logs + correlation IDs remain SANDBOX_VERIFIED. In-process metrics ≠ production APM. PRODUCTION APM/MONITORING/ALERTING ENABLED = NO. CAN_PRODUCTION_LAUNCH = NO.',
  };
}
