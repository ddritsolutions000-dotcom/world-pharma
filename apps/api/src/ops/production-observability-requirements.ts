/**
 * Sprint 97 — Production APM / monitoring / alerting configuration validation.
 * Never invent Datadog/New Relic/Sentry/Grafana/CloudWatch as enabled.
 * Never expose secrets — only reference_present / configured flags.
 */
import { readInfrastructureEnvironment } from './infra-environment';

export const APM_PROVIDER_CONFIGURATION_REQUIRED = 'APM_PROVIDER_CONFIGURATION_REQUIRED';
export const APM_CREDENTIALS_REQUIRED = 'APM_CREDENTIALS_REQUIRED';
export const APM_ENVIRONMENT_CONFIGURATION_REQUIRED = 'APM_ENVIRONMENT_CONFIGURATION_REQUIRED';
export const MONITORING_PROVIDER_CONFIGURATION_REQUIRED =
  'MONITORING_PROVIDER_CONFIGURATION_REQUIRED';
export const MONITORING_CREDENTIALS_REQUIRED = 'MONITORING_CREDENTIALS_REQUIRED';
export const MONITORING_ENVIRONMENT_CONFIGURATION_REQUIRED =
  'MONITORING_ENVIRONMENT_CONFIGURATION_REQUIRED';
export const ALERTING_PROVIDER_CONFIGURATION_REQUIRED = 'ALERTING_PROVIDER_CONFIGURATION_REQUIRED';
export const ALERTING_CREDENTIALS_REQUIRED = 'ALERTING_CREDENTIALS_REQUIRED';
export const ALERT_DESTINATION_CONFIGURATION_REQUIRED = 'ALERT_DESTINATION_CONFIGURATION_REQUIRED';
export const ALERT_ESCALATION_POLICY_REQUIRED = 'ALERT_ESCALATION_POLICY_REQUIRED';
export const ALERT_THRESHOLD_BASELINE_REQUIRED = 'ALERT_THRESHOLD_BASELINE_REQUIRED';

export type ObservabilityConfigPresence = {
  key: string;
  reference_present: boolean;
  configured: boolean;
};

export type ObservabilityTriadConfigurationReadiness = {
  apm: {
    provider: 'NOT_SELECTED' | string;
    configuration: 'READY' | 'MISSING';
    credentials: 'READY' | 'MISSING';
    environment: 'READY' | 'MISSING' | 'EXTERNAL_GATED';
    production_activation: 'EXTERNAL_GATED' | 'READY';
  };
  monitoring: {
    provider: 'NOT_SELECTED' | string;
    configuration: 'READY' | 'MISSING';
    credentials: 'READY' | 'MISSING';
    environment: 'READY' | 'MISSING' | 'EXTERNAL_GATED';
    coverage_contract: 'SANDBOX_DEFINED' | 'READY';
    production_activation: 'EXTERNAL_GATED' | 'READY';
  };
  alerting: {
    provider: 'NOT_SELECTED' | string;
    configuration: 'READY' | 'MISSING';
    credentials: 'READY' | 'MISSING';
    destinations: 'READY' | 'MISSING' | 'EXTERNAL_GATED';
    escalation_policy: 'READY' | 'MISSING' | 'EXTERNAL_GATED';
    thresholds: 'THRESHOLD_REQUIRES_PRODUCTION_BASELINE' | 'READY';
    production_activation: 'EXTERNAL_GATED' | 'READY';
  };
  environment: 'SANDBOX' | 'PRODUCTION';
};

export type ProductionObservabilityConfigurationValidation = {
  environment: 'sandbox' | 'production';
  apm_live_enabled: boolean;
  apm_provider_selected: boolean;
  monitoring_provider_selected: boolean;
  alerting_provider_selected: boolean;
  apm_credential_reference: ObservabilityConfigPresence;
  apm_endpoint_reference: ObservabilityConfigPresence;
  monitoring_credential_reference: ObservabilityConfigPresence;
  alerting_credential_reference: ObservabilityConfigPresence;
  alert_destination_reference: ObservabilityConfigPresence;
  escalation_policy_reference: ObservabilityConfigPresence;
  blockers: string[];
  ready_for_activation: false;
  secrets_exposed: false;
  phi_exposed: false;
  otp_exposed: false;
  tokens_exposed: false;
  configuration_readiness: ObservabilityTriadConfigurationReadiness;
  eligibility: {
    in_process_metrics_equals_production_apm: false;
    sandbox_logs_equals_production_monitoring: false;
    software_alerts_equals_production_pager: false;
  };
  message: string;
};

function refPresent(envKey: string): boolean {
  const v = process.env[envKey]?.trim();
  return Boolean(v && v.length > 0 && !/^changeme|todo|placeholder|xxx$/i.test(v));
}

function presence(key: string): ObservabilityConfigPresence {
  const present = refPresent(key);
  return { key, reference_present: present, configured: present };
}

export function validateProductionObservabilityConfiguration(input?: {
  apmSelected?: boolean;
  monitoringSelected?: boolean;
  alertingSelected?: boolean;
}): ProductionObservabilityConfigurationValidation {
  const infraEnv = readInfrastructureEnvironment();
  const apmSelected = Boolean(input?.apmSelected);
  const monitoringSelected = Boolean(input?.monitoringSelected);
  const alertingSelected = Boolean(input?.alertingSelected);
  const apmLive = process.env['APM_LIVE_ENABLED']?.trim().toLowerCase() === 'true';

  const apm_credential_reference = presence('APM_SECRET_REF');
  const apm_endpoint_reference = presence('APM_ENDPOINT_REF');
  const monitoring_credential_reference = presence('MONITORING_SECRET_REF');
  const alerting_credential_reference = presence('ALERTING_SECRET_REF');
  const alert_destination_reference = presence('ALERT_DESTINATION_REF');
  const escalation_policy_reference = presence('ALERT_ESCALATION_POLICY_REF');

  const blockers: string[] = [];
  if (!apmSelected || !apm_endpoint_reference.reference_present) {
    blockers.push(APM_PROVIDER_CONFIGURATION_REQUIRED);
  }
  if (!apm_credential_reference.reference_present) blockers.push(APM_CREDENTIALS_REQUIRED);
  if (infraEnv !== 'production') blockers.push(APM_ENVIRONMENT_CONFIGURATION_REQUIRED);
  if (!monitoringSelected) blockers.push(MONITORING_PROVIDER_CONFIGURATION_REQUIRED);
  if (!monitoring_credential_reference.reference_present) {
    blockers.push(MONITORING_CREDENTIALS_REQUIRED);
  }
  if (infraEnv !== 'production') blockers.push(MONITORING_ENVIRONMENT_CONFIGURATION_REQUIRED);
  if (!alertingSelected) blockers.push(ALERTING_PROVIDER_CONFIGURATION_REQUIRED);
  if (!alerting_credential_reference.reference_present) blockers.push(ALERTING_CREDENTIALS_REQUIRED);
  if (!alert_destination_reference.reference_present) {
    blockers.push(ALERT_DESTINATION_CONFIGURATION_REQUIRED);
  }
  if (!escalation_policy_reference.reference_present) {
    blockers.push(ALERT_ESCALATION_POLICY_REQUIRED);
  }
  blockers.push(ALERT_THRESHOLD_BASELINE_REQUIRED);

  const missing = (ok: boolean) => (ok ? ('READY' as const) : ('MISSING' as const));

  const configuration_readiness: ObservabilityTriadConfigurationReadiness = {
    apm: {
      provider: apmSelected ? 'SELECTED' : 'NOT_SELECTED',
      configuration: missing(apmSelected && apm_endpoint_reference.reference_present),
      credentials: missing(apm_credential_reference.reference_present),
      environment: infraEnv === 'production' ? 'READY' : 'EXTERNAL_GATED',
      production_activation: 'EXTERNAL_GATED',
    },
    monitoring: {
      provider: monitoringSelected ? 'SELECTED' : 'NOT_SELECTED',
      configuration: missing(monitoringSelected),
      credentials: missing(monitoring_credential_reference.reference_present),
      environment: infraEnv === 'production' ? 'READY' : 'EXTERNAL_GATED',
      coverage_contract: 'SANDBOX_DEFINED',
      production_activation: 'EXTERNAL_GATED',
    },
    alerting: {
      provider: alertingSelected ? 'SELECTED' : 'NOT_SELECTED',
      configuration: missing(alertingSelected),
      credentials: missing(alerting_credential_reference.reference_present),
      destinations: alert_destination_reference.reference_present ? 'READY' : 'EXTERNAL_GATED',
      escalation_policy: escalation_policy_reference.reference_present
        ? 'READY'
        : 'EXTERNAL_GATED',
      thresholds: 'THRESHOLD_REQUIRES_PRODUCTION_BASELINE',
      production_activation: 'EXTERNAL_GATED',
    },
    environment: infraEnv === 'production' ? 'PRODUCTION' : 'SANDBOX',
  };

  return {
    environment: infraEnv,
    apm_live_enabled: apmLive,
    apm_provider_selected: apmSelected,
    monitoring_provider_selected: monitoringSelected,
    alerting_provider_selected: alertingSelected,
    apm_credential_reference,
    apm_endpoint_reference,
    monitoring_credential_reference,
    alerting_credential_reference,
    alert_destination_reference,
    escalation_policy_reference,
    blockers,
    ready_for_activation: false,
    secrets_exposed: false,
    phi_exposed: false,
    otp_exposed: false,
    tokens_exposed: false,
    configuration_readiness,
    eligibility: {
      in_process_metrics_equals_production_apm: false,
      sandbox_logs_equals_production_monitoring: false,
      software_alerts_equals_production_pager: false,
    },
    message:
      'APM / monitoring / alerting NOT_SELECTED — production vault references missing. In-process /metrics + structured logs are not production APM/pager.',
  };
}
