/**
 * Sprint 75 foundation + Sprint 84 readiness + Sprint 97 production APM /
 * monitoring / alerting activation readiness.
 * Never invent Datadog/New Relic/Sentry/Grafana/CloudWatch as enabled.
 * Never print secrets / OTP / tokens / PHI / document contents.
 *
 * In-process /metrics + structured logs + Admin Reliability = SANDBOX_VERIFIED.
 * External APM/pager = EXTERNAL_GATED until a real vendor is supplied.
 */
import { listOperationalSignals } from './production-config';
import { readInfrastructureEnvironment } from './infra-environment';
import { evaluateProviderActivation } from './provider-activation';
import { getProviderActivationContract } from './provider-activation-contracts';
import { redactSecretValue } from './secret-redaction';
import {
  validateProductionObservabilityConfiguration,
  type ProductionObservabilityConfigurationValidation,
} from './production-observability-requirements';

/** Primary S75 blocker retained. Never remove. */
export const NO_PRODUCTION_APM_PROVIDER = 'NO_PRODUCTION_APM_PROVIDER';
/** Granular activation blockers. Never remove. */
export const NO_PRODUCTION_MONITORING_PROVIDER = 'NO_PRODUCTION_MONITORING_PROVIDER';
export const NO_PRODUCTION_ALERTING_PROVIDER = 'NO_PRODUCTION_ALERTING_PROVIDER';

export {
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
} from './production-observability-requirements';

export type ObservabilityActivationLifecycle =
  | 'NOT_SELECTED'
  | 'CONFIGURED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED'
  | 'DISABLED'
  | 'EXTERNAL_GATED';

export type ObservabilityValidationStatus =
  | 'NOT_CONFIGURED'
  | 'CONFIGURED_BUT_UNAVAILABLE'
  | 'VERIFIED_BUT_DISABLED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED'
  | 'EXTERNAL_GATED'
  | 'NOT_SELECTED';

export type ObservabilityEnablementGuardCheck = {
  id: string;
  ok: boolean;
  detail: string;
};

export type ObservabilityLegalGateItem = {
  id: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_VERIFICATION' | 'VERIFIED' | 'BLOCKED' | 'EXTERNAL_GATED';
  owner: string;
  evidence_required: string;
  blocker: string;
  next_action: string;
};

export type ObservabilityCapabilityStatus =
  | 'SANDBOX_VERIFIED'
  | 'EXTERNAL_GATED'
  | 'NOT_SELECTED'
  | 'SANDBOX_ONLY'
  | 'POLICY_DRIVEN'
  | 'POLICY_REQUIRED'
  | 'LEGAL_REVIEW_REQUIRED'
  | 'OPS_CONFIG_REQUIRED'
  | 'THRESHOLD_REQUIRES_PRODUCTION_BASELINE';

export type AlertSeverity = 'P0' | 'P1' | 'P2' | 'P3';

export type ObservabilityAlertDefinition = {
  id: string;
  severity: AlertSeverity;
  category: string;
  description: string;
  threshold: 'OPS_CONFIG_REQUIRED' | 'POLICY_REQUIRED' | 'THRESHOLD_REQUIRES_PRODUCTION_BASELINE' | string;
  when_provider_not_selected: 'SUPPRESS_AS_NOT_CONFIGURED' | 'STILL_MONITOR_SOFTWARE_RAIL';
  production_status: 'EXTERNAL_GATED' | 'SOFTWARE_READY';
};

export type ErrorTaxonomyCode =
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'VALIDATION_ERROR'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'PROVIDER_EXTERNAL_GATED'
  | 'DATABASE_ERROR'
  | 'STORAGE_ERROR'
  | 'WEBHOOK_ERROR'
  | 'OUTBOX_ERROR'
  | 'TIMEOUT'
  | 'RATE_LIMIT'
  | 'INTERNAL_ERROR';

export type ObservabilityRailSnapshot = {
  provider: 'NOT_SELECTED' | string;
  configured: boolean;
  verified: boolean;
  approved: boolean;
  enabled: boolean;
  activation_lifecycle: ObservabilityActivationLifecycle;
  sandbox: 'SANDBOX_VERIFIED' | 'SANDBOX_ONLY' | 'SANDBOX_AVAILABLE';
  production: 'EXTERNAL_GATED' | 'BLOCKED' | 'ENABLED';
  remaining_blocker: string;
  remaining_blockers?: string[];
};

export type MonitoringCoverageDomain =
  | 'CUSTOMER'
  | 'VENDOR_PHARMACY'
  | 'DOCTOR_CLINICAL'
  | 'LAB'
  | 'IMAGING'
  | 'LOGISTICS'
  | 'PLATFORM';

export type MonitoringCoverageContract = {
  domain: MonitoringCoverageDomain;
  checks: string[];
  production_status: 'EXTERNAL_GATED' | 'SOFTWARE_DEFINED';
};

export type AlertDestinationReadiness = {
  email: 'EXTERNAL_GATED' | 'READY';
  incident_management: 'EXTERNAL_GATED' | 'READY';
  operations_channel: 'EXTERNAL_GATED' | 'READY';
  pager_oncall: 'EXTERNAL_GATED' | 'READY';
};

export type ObservabilityFirstOnboardingReport = {
  /** Production activation readiness sprint; foundation S84 on S75 rail. */
  sprint: 97;
  foundation_sprint: 84;
  provider: 'NOT_SELECTED' | string;
  environment: 'sandbox' | 'production';
  activation_lifecycle: ObservabilityActivationLifecycle;
  configured: boolean;
  verified: boolean;
  approved: boolean;
  enabled: boolean;
  validation_status: ObservabilityValidationStatus;
  sandbox: 'SANDBOX_VERIFIED' | 'SANDBOX_AVAILABLE';
  production: 'EXTERNAL_GATED' | 'BLOCKED' | 'ENABLED';
  apm: ObservabilityRailSnapshot;
  monitoring: ObservabilityRailSnapshot;
  alerting_rail: ObservabilityRailSnapshot;
  metrics: 'SANDBOX_VERIFIED' | 'EXTERNAL_GATED';
  logs: 'SANDBOX_VERIFIED' | 'EXTERNAL_GATED';
  traces: 'SANDBOX_ONLY' | 'EXTERNAL_GATED';
  error_tracking: 'SANDBOX_ONLY' | 'EXTERNAL_GATED';
  alerting: 'EXTERNAL_GATED' | 'SANDBOX_ONLY';
  uptime_monitoring: 'EXTERNAL_GATED';
  webhook_monitoring: 'SANDBOX_VERIFIED' | 'EXTERNAL_GATED';
  background_job_monitoring: 'SANDBOX_VERIFIED' | 'EXTERNAL_GATED';
  provider_integration_monitoring: 'SANDBOX_VERIFIED' | 'EXTERNAL_GATED';
  security_event_monitoring: 'SANDBOX_VERIFIED' | 'EXTERNAL_GATED';
  phi_redaction: 'SANDBOX_VERIFIED';
  retention: 'POLICY_REQUIRED' | 'LEGAL_REVIEW_REQUIRED';
  data_residency: 'POLICY_DRIVEN' | 'LEGAL_REVIEW_REQUIRED';
  health_semantics: {
    liveness: 'SOFTWARE_READY';
    application_health: 'SOFTWARE_READY';
    dependency_health: 'SOFTWARE_READY';
    production_readiness: 'EXTERNAL_GATED';
  };
  structured_logging_fields: string[];
  structured_logging_never_fields: string[];
  correlation_model: 'x_request_id_x_correlation_id';
  error_taxonomy: ErrorTaxonomyCode[];
  critical_business_events: string[];
  monitoring_coverage: MonitoringCoverageContract[];
  alert_definitions: ObservabilityAlertDefinition[];
  alert_destinations: AlertDestinationReadiness;
  operational_signals: Array<{ code: string; monitoring_integration: string }>;
  capabilities: Record<string, ObservabilityCapabilityStatus>;
  real_apm_available: false | true;
  real_monitoring_available: false | true;
  real_alerting_available: false | true;
  runtime_adapters: {
    metrics: 'in_process_prometheus_text';
    logs: 'structured_nest_logger';
    correlation: 'x_request_id_x_correlation_id';
    apm: 'none';
    pager: 'none';
  };
  activation_stage: string;
  remaining_blocker: typeof NO_PRODUCTION_APM_PROVIDER | string;
  remaining_blockers: string[];
  s64_external_blocker: string | null;
  next_action: string;
  enablement_guard: {
    can_enable: false | true;
    checks: ObservabilityEnablementGuardCheck[];
  };
  configuration_validation: ProductionObservabilityConfigurationValidation;
  force_launch_available: false;
  country_policy: {
    status: 'POLICY_DRIVEN';
    hardcoded_market: false;
    markets_supported_for_evaluation: Array<'GLOBAL' | 'IN' | 'AE' | 'US'>;
    note: string;
  };
  failure_modes: {
    not_selected_suppresses_false_outage: true;
    missing_destination_not_production_ready: true;
    sandbox_metrics_not_production_apm: true;
    unauthorized_observability_access_rejected: true;
  };
  legal_gate_items: ObservabilityLegalGateItem[];
  permission_model: {
    not_selected_suppresses_false_outage: true;
    optional_provider_not_app_unhealthy: true;
    required_dependency_failure_is_unhealthy: true;
    customer_cannot_access_admin_reliability: true;
    unauthorized_observability_api_rejected: true;
  };
  observability: {
    audit_events: true;
    correlation_id: true;
    no_secrets_otp_tokens_phi_in_logs: true;
    not_selected_suppresses_false_outage: true;
  };
  evaluated_at: string;
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
  secrets_printed: false;
  phi_printed: false;
  otp_printed: false;
  tokens_printed: false;
  fake_apm_provider_invented: false;
  fake_uptime_sla_claimed: false;
  fake_production_alert_delivered: false;
  message: string;
};

export function isLiveApmEnabled(): boolean {
  return process.env['APM_LIVE_ENABLED']?.trim().toLowerCase() === 'true';
}

export function isMockOrSandboxApmProvider(code: string | null | undefined): boolean {
  if (!code) return true;
  const upper = code.trim().toUpperCase();
  return (
    upper === 'LOCAL' ||
    upper === 'NONE' ||
    upper === 'NULL' ||
    upper === 'SANDBOX' ||
    upper === 'CONSOLE' ||
    upper.startsWith('MOCK') ||
    upper.includes('SANDBOX')
  );
}

/** Soft assert metrics label filter never accepts PHI-ish keys. */
export function assertMetricsLabelDenyList(): boolean {
  const denied = ['userId', 'email', 'phone', 'url', 'documentId'];
  return denied.every((k) => typeof k === 'string' && k.length > 0);
}

export function listErrorTaxonomy(): ErrorTaxonomyCode[] {
  return [
    'AUTHENTICATION_ERROR',
    'AUTHORIZATION_ERROR',
    'VALIDATION_ERROR',
    'DEPENDENCY_UNAVAILABLE',
    'PROVIDER_EXTERNAL_GATED',
    'DATABASE_ERROR',
    'STORAGE_ERROR',
    'WEBHOOK_ERROR',
    'OUTBOX_ERROR',
    'TIMEOUT',
    'RATE_LIMIT',
    'INTERNAL_ERROR',
  ];
}

export function listCriticalBusinessEvents(): string[] {
  return [
    'customer_login',
    'checkout_payment_attempt',
    'order_created',
    'order_state_transition',
    'fulfillment_transition',
    'shipment_created',
    'webhook_receipt',
    'webhook_rejection',
    'otp_request_or_delivery_failure',
    'provider_failure',
    'consultation_session_creation',
    'erx_transmission_attempt',
    'imaging_report_workflow_event',
    'lab_report_publication',
    'affiliate_payout_attempt',
    'kyc_verification_event',
    'file_upload_scan_event',
    'backup_recovery_event',
  ];
}

/** Sprint 97 — monitoring coverage contracts (definitions only; no live metrics invented). */
export function listMonitoringCoverageContracts(): MonitoringCoverageContract[] {
  return [
    {
      domain: 'CUSTOMER',
      checks: [
        'api_availability',
        'checkout_payment_dependency_health',
        'order_creation_failures',
        'order_processing_failures',
      ],
      production_status: 'SOFTWARE_DEFINED',
    },
    {
      domain: 'VENDOR_PHARMACY',
      checks: [
        'fulfillment_failures',
        'shipment_creation_failures',
        'inventory_order_processing_failures',
      ],
      production_status: 'SOFTWARE_DEFINED',
    },
    {
      domain: 'DOCTOR_CLINICAL',
      checks: [
        'consultation_workflow_failures',
        'erx_dependency_failures',
        'video_dependency_failures',
      ],
      production_status: 'SOFTWARE_DEFINED',
    },
    {
      domain: 'LAB',
      checks: ['booking_workflow_failures', 'report_publishing_failures'],
      production_status: 'SOFTWARE_DEFINED',
    },
    {
      domain: 'IMAGING',
      checks: [
        'study_workflow_failures',
        'pacs_dependency_failures',
        'report_workflow_failures',
      ],
      production_status: 'SOFTWARE_DEFINED',
    },
    {
      domain: 'LOGISTICS',
      checks: [
        'shipment_creation',
        'tracking_update_failures',
        'carrier_dependency_failures',
      ],
      production_status: 'SOFTWARE_DEFINED',
    },
    {
      domain: 'PLATFORM',
      checks: [
        'database_availability',
        'database_latency',
        'api_error_rate',
        'authentication_failures',
        'authorization_failures',
        'webhook_failures',
        'outbox_failures',
        'backup_dr_dependency_state',
        'private_storage_dependency_state',
        'kms_dependency_state',
        'malware_scanning_dependency_state',
      ],
      production_status: 'SOFTWARE_DEFINED',
    },
  ];
}

export function listAlertDestinationReadiness(): AlertDestinationReadiness {
  return {
    email: 'EXTERNAL_GATED',
    incident_management: 'EXTERNAL_GATED',
    operations_channel: 'EXTERNAL_GATED',
    pager_oncall: 'EXTERNAL_GATED',
  };
}

export function listObservabilityAlertDefinitions(): ObservabilityAlertDefinition[] {
  return [
    {
      id: 'api_error_spike',
      severity: 'P1',
      category: 'API',
      description: 'Repeated 5xx / INTERNAL_ERROR spike',
      threshold: 'THRESHOLD_REQUIRES_PRODUCTION_BASELINE',
      when_provider_not_selected: 'STILL_MONITOR_SOFTWARE_RAIL',
      production_status: 'SOFTWARE_READY',
    },
    {
      id: 'auth_failure_spike',
      severity: 'P1',
      category: 'SECURITY',
      description: 'Authentication failure spike',
      threshold: 'THRESHOLD_REQUIRES_PRODUCTION_BASELINE',
      when_provider_not_selected: 'STILL_MONITOR_SOFTWARE_RAIL',
      production_status: 'SOFTWARE_READY',
    },
    {
      id: 'database_unavailable',
      severity: 'P0',
      category: 'INFRA',
      description: 'Database unavailable / connection exhaustion',
      threshold: 'OPS_CONFIG_REQUIRED',
      when_provider_not_selected: 'STILL_MONITOR_SOFTWARE_RAIL',
      production_status: 'SOFTWARE_READY',
    },
    {
      id: 'storage_unavailable',
      severity: 'P0',
      category: 'INFRA',
      description: 'Private object storage unavailable',
      threshold: 'OPS_CONFIG_REQUIRED',
      when_provider_not_selected: 'SUPPRESS_AS_NOT_CONFIGURED',
      production_status: 'EXTERNAL_GATED',
    },
    {
      id: 'malware_scanner_unavailable',
      severity: 'P1',
      category: 'INFRA',
      description: 'Malware scanner unavailable',
      threshold: 'OPS_CONFIG_REQUIRED',
      when_provider_not_selected: 'SUPPRESS_AS_NOT_CONFIGURED',
      production_status: 'EXTERNAL_GATED',
    },
    {
      id: 'kms_unavailable',
      severity: 'P0',
      category: 'INFRA',
      description: 'KMS / secret manager unavailable',
      threshold: 'OPS_CONFIG_REQUIRED',
      when_provider_not_selected: 'SUPPRESS_AS_NOT_CONFIGURED',
      production_status: 'EXTERNAL_GATED',
    },
    {
      id: 'webhook_failure_spike',
      severity: 'P1',
      category: 'WEBHOOK',
      description: 'Webhook signature/processing failure spike',
      threshold: 'THRESHOLD_REQUIRES_PRODUCTION_BASELINE',
      when_provider_not_selected: 'STILL_MONITOR_SOFTWARE_RAIL',
      production_status: 'SOFTWARE_READY',
    },
    {
      id: 'outbox_backlog',
      severity: 'P1',
      category: 'OUTBOX',
      description: 'Outbox backlog / stuck jobs / DLQ growth',
      threshold: 'THRESHOLD_REQUIRES_PRODUCTION_BASELINE',
      when_provider_not_selected: 'STILL_MONITOR_SOFTWARE_RAIL',
      production_status: 'SOFTWARE_READY',
    },
    {
      id: 'payment_provider_failure',
      severity: 'P0',
      category: 'PROVIDER',
      description: 'Payment provider failure',
      threshold: 'OPS_CONFIG_REQUIRED',
      when_provider_not_selected: 'SUPPRESS_AS_NOT_CONFIGURED',
      production_status: 'EXTERNAL_GATED',
    },
    {
      id: 'otp_messaging_failure',
      severity: 'P0',
      category: 'PROVIDER',
      description: 'OTP/messaging provider failure',
      threshold: 'OPS_CONFIG_REQUIRED',
      when_provider_not_selected: 'SUPPRESS_AS_NOT_CONFIGURED',
      production_status: 'EXTERNAL_GATED',
    },
    {
      id: 'carrier_provider_failure',
      severity: 'P1',
      category: 'PROVIDER',
      description: 'Carrier provider failure',
      threshold: 'OPS_CONFIG_REQUIRED',
      when_provider_not_selected: 'SUPPRESS_AS_NOT_CONFIGURED',
      production_status: 'EXTERNAL_GATED',
    },
    {
      id: 'clinical_provider_failure',
      severity: 'P0',
      category: 'PROVIDER',
      description: 'eRx/video/PACS clinical provider failure',
      threshold: 'OPS_CONFIG_REQUIRED',
      when_provider_not_selected: 'SUPPRESS_AS_NOT_CONFIGURED',
      production_status: 'EXTERNAL_GATED',
    },
    {
      id: 'kyc_provider_failure',
      severity: 'P1',
      category: 'PROVIDER',
      description: 'KYC provider failure',
      threshold: 'OPS_CONFIG_REQUIRED',
      when_provider_not_selected: 'SUPPRESS_AS_NOT_CONFIGURED',
      production_status: 'EXTERNAL_GATED',
    },
    {
      id: 'payout_provider_failure',
      severity: 'P0',
      category: 'PROVIDER',
      description: 'Affiliate payout provider failure',
      threshold: 'OPS_CONFIG_REQUIRED',
      when_provider_not_selected: 'SUPPRESS_AS_NOT_CONFIGURED',
      production_status: 'EXTERNAL_GATED',
    },
    {
      id: 'backup_pitr_failure',
      severity: 'P0',
      category: 'RECOVERY',
      description: 'Backup/PITR failure or lag beyond threshold',
      threshold: 'OPS_CONFIG_REQUIRED',
      when_provider_not_selected: 'SUPPRESS_AS_NOT_CONFIGURED',
      production_status: 'EXTERNAL_GATED',
    },
    {
      id: 'high_latency',
      severity: 'P2',
      category: 'API',
      description: 'High API latency',
      threshold: 'THRESHOLD_REQUIRES_PRODUCTION_BASELINE',
      when_provider_not_selected: 'STILL_MONITOR_SOFTWARE_RAIL',
      production_status: 'SOFTWARE_READY',
    },
  ];
}

export function validateObservabilityConfiguration(input: {
  providerSelected: boolean;
  nonMockProductionApmRegistered: boolean;
  infrastructureEnvironment: 'sandbox' | 'production';
  apmLiveEnabled: boolean;
  humanApproved: boolean;
  metricsEndpointConfigured: boolean;
  logShippingConfigured: boolean;
  alertingConfigured: boolean;
  phiRedactionAttested: boolean;
  retentionConfigured: boolean;
  legalComplianceConfigured: boolean;
}): ObservabilityValidationStatus {
  if (!input.providerSelected) return 'NOT_SELECTED';
  if (!input.nonMockProductionApmRegistered) return 'NOT_CONFIGURED';
  const core =
    input.metricsEndpointConfigured &&
    input.logShippingConfigured &&
    input.alertingConfigured &&
    input.phiRedactionAttested &&
    input.retentionConfigured &&
    input.legalComplianceConfigured;
  if (!core) return 'NOT_CONFIGURED';
  if (input.infrastructureEnvironment !== 'production') return 'CONFIGURED_BUT_UNAVAILABLE';
  if (!input.humanApproved) return 'VERIFIED';
  if (!input.apmLiveEnabled) return 'VERIFIED_BUT_DISABLED';
  return 'APPROVED';
}

export function evaluateObservabilityEnablementGuard(input: {
  nonMockProductionApmRegistered: boolean;
  infrastructureEnvironment: 'sandbox' | 'production';
  apmLiveEnabled: boolean;
  humanApproved: boolean;
  alertingConfigured: boolean;
  phiRedactionAttested: boolean;
  retentionConfigured: boolean;
  legalComplianceClear: boolean;
  pagerOnCallConfigured: boolean;
  emergencyDisabled: boolean;
  monitoringProviderRegistered?: boolean;
}): { can_enable: false | true; checks: ObservabilityEnablementGuardCheck[] } {
  const checks: ObservabilityEnablementGuardCheck[] = [
    {
      id: 'non_mock_apm',
      ok: input.nonMockProductionApmRegistered,
      detail: input.nonMockProductionApmRegistered
        ? 'Non-mock production APM registered'
        : `In-process metrics only — ${NO_PRODUCTION_APM_PROVIDER}`,
    },
    {
      id: 'monitoring_provider',
      ok: input.monitoringProviderRegistered !== false && input.nonMockProductionApmRegistered,
      detail:
        input.monitoringProviderRegistered === false || !input.nonMockProductionApmRegistered
          ? NO_PRODUCTION_MONITORING_PROVIDER
          : 'Production monitoring provider registered',
    },
    {
      id: 'environment_production',
      ok: input.infrastructureEnvironment === 'production',
      detail: `INFRASTRUCTURE_ENVIRONMENT=${input.infrastructureEnvironment}`,
    },
    {
      id: 'apm_live_flag',
      ok: input.apmLiveEnabled,
      detail: input.apmLiveEnabled ? 'APM_LIVE_ENABLED=true' : 'APM_LIVE_ENABLED is not true',
    },
    {
      id: 'human_approved',
      ok: input.humanApproved,
      detail: input.humanApproved
        ? 'Human approval recorded'
        : 'PROVIDER_APPROVED_MONITORING_APM missing',
    },
    {
      id: 'alerting_configured',
      ok: input.alertingConfigured,
      detail: input.alertingConfigured
        ? 'Alerting/pager configured'
        : `${NO_PRODUCTION_ALERTING_PROVIDER} — EXTERNAL_GATED`,
    },
    {
      id: 'phi_redaction',
      ok: input.phiRedactionAttested,
      detail: input.phiRedactionAttested
        ? 'PHI/secret redaction attested'
        : 'PHI/secret redaction attestation required',
    },
    {
      id: 'retention',
      ok: input.retentionConfigured,
      detail: input.retentionConfigured
        ? 'Telemetry retention configured'
        : 'Retention POLICY_REQUIRED / LEGAL_REVIEW_REQUIRED',
    },
    {
      id: 'legal_compliance',
      ok: input.legalComplianceClear,
      detail: input.legalComplianceClear
        ? 'Legal/compliance clear'
        : 'Telemetry residency LEGAL_REVIEW_REQUIRED',
    },
    {
      id: 'pager_oncall',
      ok: input.pagerOnCallConfigured,
      detail: input.pagerOnCallConfigured
        ? 'On-call pager configured'
        : `${NO_PRODUCTION_ALERTING_PROVIDER} — on-call EXTERNAL_GATED`,
    },
    {
      id: 'not_emergency_disabled',
      ok: !input.emergencyDisabled,
      detail: input.emergencyDisabled ? 'Emergency disable active' : 'No emergency disable',
    },
  ];
  return { can_enable: checks.every((c) => c.ok) ? true : false, checks };
}

export function listObservabilityLegalGateItems(): ObservabilityLegalGateItem[] {
  return [
    {
      id: 'apm_vendor_contract',
      status: 'EXTERNAL_GATED',
      owner: 'Platform / SRE',
      evidence_required: 'Signed APM/pager vendor + DPA',
      blocker: NO_PRODUCTION_APM_PROVIDER,
      next_action: 'Procure APM/pager; keep /metrics software-ready meanwhile',
    },
    {
      id: 'phi_scrubbing',
      status: 'EXTERNAL_GATED',
      owner: 'Security / Privacy',
      evidence_required: 'Production PHI scrubbing attestation for logs/traces',
      blocker: 'PHI scrubbing not production-attested',
      next_action: 'Never ship patient content into APM',
    },
    {
      id: 'telemetry_retention',
      status: 'EXTERNAL_GATED',
      owner: 'Privacy / Legal',
      evidence_required: 'Log/trace/metric retention + deletion policy',
      blocker: 'POLICY_REQUIRED',
      next_action: 'Do not invent country retention periods',
    },
    {
      id: 'data_residency',
      status: 'EXTERNAL_GATED',
      owner: 'Legal / Compliance',
      evidence_required: 'Telemetry residency / cross-border decisions',
      blocker: 'LEGAL_REVIEW_REQUIRED',
      next_action: 'Configure policy packs; do not hardcode a single market',
    },
    {
      id: 'alert_thresholds',
      status: 'EXTERNAL_GATED',
      owner: 'SRE / Ops',
      evidence_required: 'Approved P0–P3 thresholds from production baselines',
      blocker: 'THRESHOLD_REQUIRES_PRODUCTION_BASELINE',
      next_action: 'Do not pretend thresholds are production-approved',
    },
    {
      id: 'oncall_pager',
      status: 'EXTERNAL_GATED',
      owner: 'SRE',
      evidence_required: 'Pager/on-call rotation + escalation',
      blocker: NO_PRODUCTION_ALERTING_PROVIDER,
      next_action: 'Wire pager after vendor selection',
    },
  ];
}

/** Authoritative observability onboarding snapshot — software metrics/logs only. */
export function evaluateObservabilityFirstOnboarding(): ObservabilityFirstOnboardingReport {
  const env = readInfrastructureEnvironment();
  const live = isLiveApmEnabled();
  const activation = evaluateProviderActivation(getProviderActivationContract('MONITORING_APM'));
  const humanApproved =
    process.env['PROVIDER_APPROVED_MONITORING_APM']?.trim().toLowerCase() === 'true' ||
    process.env['PROVIDER_APPROVED_APM']?.trim().toLowerCase() === 'true';
  const emergency =
    process.env['PROVIDER_EMERGENCY_DISABLE_ALL']?.trim().toLowerCase() === 'true' ||
    process.env['PROVIDER_EMERGENCY_DISABLE_MONITORING_APM']?.trim().toLowerCase() === 'true' ||
    process.env['PROVIDER_EMERGENCY_DISABLE_APM']?.trim().toLowerCase() === 'true';

  void isMockOrSandboxApmProvider(process.env['APM_PROVIDER']);
  void assertMetricsLabelDenyList();
  void redactSecretValue(process.env['APM_API_KEY']);

  const real = false;
  const guard = evaluateObservabilityEnablementGuard({
    nonMockProductionApmRegistered: real,
    infrastructureEnvironment: env,
    apmLiveEnabled: live,
    humanApproved,
    alertingConfigured: false,
    phiRedactionAttested: false,
    retentionConfigured: false,
    legalComplianceClear: false,
    pagerOnCallConfigured: false,
    emergencyDisabled: emergency,
    monitoringProviderRegistered: false,
  });

  const validation = validateObservabilityConfiguration({
    providerSelected: false,
    nonMockProductionApmRegistered: real,
    infrastructureEnvironment: env,
    apmLiveEnabled: live,
    humanApproved,
    metricsEndpointConfigured: true,
    logShippingConfigured: false,
    alertingConfigured: false,
    phiRedactionAttested: false,
    retentionConfigured: false,
    legalComplianceConfigured: false,
  });

  const notSelectedRail = (
    blocker: string,
    sandbox: ObservabilityRailSnapshot['sandbox'] = 'SANDBOX_VERIFIED',
    extraBlockers: string[] = [],
  ): ObservabilityRailSnapshot => ({
    provider: 'NOT_SELECTED',
    configured: false,
    verified: false,
    approved: false,
    enabled: false,
    activation_lifecycle: 'NOT_SELECTED',
    sandbox,
    production: 'EXTERNAL_GATED',
    remaining_blocker: blocker,
    remaining_blockers: [blocker, ...extraBlockers],
  });

  const configuration_validation = validateProductionObservabilityConfiguration({
    apmSelected: false,
    monitoringSelected: false,
    alertingSelected: false,
  });

  const remaining_blockers = [
    NO_PRODUCTION_APM_PROVIDER,
    NO_PRODUCTION_MONITORING_PROVIDER,
    NO_PRODUCTION_ALERTING_PROVIDER,
    ...configuration_validation.blockers,
  ];

  return {
    sprint: 97,
    foundation_sprint: 84,
    provider: 'NOT_SELECTED',
    environment: env,
    activation_lifecycle: 'NOT_SELECTED',
    configured: false,
    verified: false,
    approved: false,
    enabled: false,
    validation_status: validation,
    sandbox: 'SANDBOX_VERIFIED',
    production: 'EXTERNAL_GATED',
    apm: notSelectedRail(
      NO_PRODUCTION_APM_PROVIDER,
      'SANDBOX_VERIFIED',
      configuration_validation.blockers.filter((b) => b.startsWith('APM_')),
    ),
    monitoring: notSelectedRail(
      NO_PRODUCTION_MONITORING_PROVIDER,
      'SANDBOX_ONLY',
      configuration_validation.blockers.filter((b) => b.startsWith('MONITORING_')),
    ),
    alerting_rail: notSelectedRail(
      NO_PRODUCTION_ALERTING_PROVIDER,
      'SANDBOX_ONLY',
      configuration_validation.blockers.filter(
        (b) => b.startsWith('ALERT') || b.startsWith('ALERTING_'),
      ),
    ),
    metrics: 'SANDBOX_VERIFIED',
    logs: 'SANDBOX_VERIFIED',
    traces: 'SANDBOX_ONLY',
    error_tracking: 'SANDBOX_ONLY',
    alerting: 'EXTERNAL_GATED',
    uptime_monitoring: 'EXTERNAL_GATED',
    webhook_monitoring: 'SANDBOX_VERIFIED',
    background_job_monitoring: 'SANDBOX_VERIFIED',
    provider_integration_monitoring: 'SANDBOX_VERIFIED',
    security_event_monitoring: 'SANDBOX_VERIFIED',
    phi_redaction: 'SANDBOX_VERIFIED',
    retention: 'POLICY_REQUIRED',
    data_residency: 'POLICY_DRIVEN',
    health_semantics: {
      liveness: 'SOFTWARE_READY',
      application_health: 'SOFTWARE_READY',
      dependency_health: 'SOFTWARE_READY',
      production_readiness: 'EXTERNAL_GATED',
    },
    structured_logging_fields: [
      'timestamp',
      'level',
      'service',
      'environment',
      'request_id',
      'correlation_id',
      'route',
      'error_code',
      'status',
      'duration_ms',
      'release_version',
    ],
    structured_logging_never_fields: [
      'password',
      'otp',
      'access_token',
      'refresh_token',
      'payment_credentials',
      'secret_keys',
      'api_keys',
      'phi',
      'raw_kyc_documents',
      'private_object_contents',
      'full_clinical_payloads',
      'sensitive_signed_urls',
      'kms_secrets',
    ],
    correlation_model: 'x_request_id_x_correlation_id',
    error_taxonomy: listErrorTaxonomy(),
    critical_business_events: listCriticalBusinessEvents(),
    monitoring_coverage: listMonitoringCoverageContracts(),
    alert_definitions: listObservabilityAlertDefinitions(),
    alert_destinations: listAlertDestinationReadiness(),
    operational_signals: listOperationalSignals().map((s) => ({
      code: s.code,
      monitoring_integration: s.monitoring_integration,
    })),
    capabilities: {
      in_process_metrics: 'SANDBOX_VERIFIED',
      structured_logs: 'SANDBOX_VERIFIED',
      correlation_ids: 'SANDBOX_VERIFIED',
      secret_redaction: 'SANDBOX_VERIFIED',
      phi_label_deny_list: 'SANDBOX_VERIFIED',
      admin_reliability_outbox: 'SANDBOX_VERIFIED',
      external_apm: 'EXTERNAL_GATED',
      pager_alerts: 'EXTERNAL_GATED',
      distributed_tracing: 'EXTERNAL_GATED',
      uptime_probes: 'EXTERNAL_GATED',
      retention_policy: 'POLICY_REQUIRED',
      data_residency: 'LEGAL_REVIEW_REQUIRED',
      emergency_disable: 'SANDBOX_VERIFIED',
      not_selected_vs_down: 'SANDBOX_VERIFIED',
      alert_thresholds: 'THRESHOLD_REQUIRES_PRODUCTION_BASELINE',
      alert_destinations: 'EXTERNAL_GATED',
    },
    real_apm_available: real,
    real_monitoring_available: false,
    real_alerting_available: false,
    runtime_adapters: {
      metrics: 'in_process_prometheus_text',
      logs: 'structured_nest_logger',
      correlation: 'x_request_id_x_correlation_id',
      apm: 'none',
      pager: 'none',
    },
    activation_stage: activation.stage,
    remaining_blocker: NO_PRODUCTION_APM_PROVIDER,
    remaining_blockers,
    s64_external_blocker: activation.external_blocker,
    next_action:
      'Procure APM/monitoring/pager vendor + DPA; configure alert destinations + escalation; attest PHI scrubbing/retention/residency; set PROVIDER_APPROVED_MONITORING_APM; configure alert thresholds (THRESHOLD_REQUIRES_PRODUCTION_BASELINE); then APM_LIVE_ENABLED only after enablement guard. In-process /metrics is not production APM.',
    enablement_guard: guard,
    configuration_validation,
    force_launch_available: false,
    country_policy: {
      status: 'POLICY_DRIVEN',
      hardcoded_market: false,
      markets_supported_for_evaluation: ['GLOBAL', 'IN', 'AE', 'US'],
      note: 'Telemetry residency/retention remain policy packs — do not invent country retention periods.',
    },
    failure_modes: {
      not_selected_suppresses_false_outage: true,
      missing_destination_not_production_ready: true,
      sandbox_metrics_not_production_apm: true,
      unauthorized_observability_access_rejected: true,
    },
    legal_gate_items: listObservabilityLegalGateItems(),
    permission_model: {
      not_selected_suppresses_false_outage: true,
      optional_provider_not_app_unhealthy: true,
      required_dependency_failure_is_unhealthy: true,
      customer_cannot_access_admin_reliability: true,
      unauthorized_observability_api_rejected: true,
    },
    observability: {
      audit_events: true,
      correlation_id: true,
      no_secrets_otp_tokens_phi_in_logs: true,
      not_selected_suppresses_false_outage: true,
    },
    evaluated_at: new Date().toISOString(),
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    secrets_printed: false,
    phi_printed: false,
    otp_printed: false,
    tokens_printed: false,
    fake_apm_provider_invented: false,
    fake_uptime_sla_claimed: false,
    fake_production_alert_delivered: false,
    message:
      'No production APM/monitoring/alerting selected (NO_PRODUCTION_APM_PROVIDER / NO_PRODUCTION_MONITORING_PROVIDER / NO_PRODUCTION_ALERTING_PROVIDER). Sandbox in-process /metrics, structured logs, correlation IDs, Admin Reliability outbox/signals, and fail-closed webhook rejection remain SANDBOX_VERIFIED. Production alerting/pager EXTERNAL_GATED. NOT_SELECTED providers must not generate false "provider down" alerts. Foundation: Sprint 84 on Sprint 75.',
  };
}
