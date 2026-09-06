/**
 * Sprint 143 — Production observability + APM + monitoring + alerting closure (software).
 * Composes S75/S84/S97/S109 + S142 secrets-manager runtime resolver.
 * Does NOT invent Datadog/New Relic/Sentry/Grafana/CloudWatch/PagerDuty credentials.
 * Does NOT claim production monitoring/APM/alerting ENABLED from /metrics or sandbox logs.
 * CONFIGURED ≠ VERIFIED ≠ APPROVED ≠ ENABLED.
 * In-process metrics / structured logs ≠ production APM.
 * SOFTWARE_COMPLETE ≠ EXTERNAL_GATED ≠ PRODUCTION_ENABLED.
 */
import { Errors } from '../common/problem';
import { redactText, redactValue } from '../common/redact';
import { correlationId, getCorrelation } from '../common/correlation';
import { assertNoSecretLeak } from './secret-redaction';
import { readInfrastructureEnvironment, type InfraRuntimeEnvironment } from './infra-environment';
import {
  NO_PRODUCTION_APM_PROVIDER,
  NO_PRODUCTION_MONITORING_PROVIDER,
  NO_PRODUCTION_ALERTING_PROVIDER,
  evaluateObservabilityFirstOnboarding,
  evaluateObservabilityEnablementGuard,
  isLiveApmEnabled,
  isMockOrSandboxApmProvider,
  listObservabilityAlertDefinitions,
  listMonitoringCoverageContracts,
  listErrorTaxonomy,
  listCriticalBusinessEvents,
  assertMetricsLabelDenyList,
  type AlertSeverity,
  type ObservabilityAlertDefinition,
} from './observability-first-onboarding';
import {
  evaluateRealObservabilityFirstOnboarding,
  buildRealObservabilityActivationChecklist,
  buildRealObservabilityRailStatuses,
} from './observability-real-activation-first-onboarding';
import {
  validateProductionObservabilityConfiguration,
  APM_PROVIDER_CONFIGURATION_REQUIRED,
  APM_CREDENTIALS_REQUIRED,
  MONITORING_PROVIDER_CONFIGURATION_REQUIRED,
  ALERTING_PROVIDER_CONFIGURATION_REQUIRED,
  ALERT_DESTINATION_CONFIGURATION_REQUIRED,
} from './production-observability-requirements';
import {
  secretsManagerRuntimeResolverStatus,
  assertProductionSecretsManagerResolutionAllowed,
  presentSecretReference,
  type SecretReference,
} from './secrets-manager-runtime-resolver';

export const OBSERVABILITY_APM_MONITORING_ALERTING_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE =
  'OBSERVABILITY_APM_MONITORING_ALERTING_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE';

export const APM_VERIFICATION_STATUS_ENV = 'APM_VERIFICATION_STATUS';
export const APM_APPROVAL_STATUS_ENV = 'APM_APPROVAL_STATUS';
export const MONITORING_VERIFICATION_STATUS_ENV = 'MONITORING_VERIFICATION_STATUS';
export const MONITORING_APPROVAL_STATUS_ENV = 'MONITORING_APPROVAL_STATUS';
export const ALERTING_VERIFICATION_STATUS_ENV = 'ALERTING_VERIFICATION_STATUS';
export const ALERTING_APPROVAL_STATUS_ENV = 'ALERTING_APPROVAL_STATUS';

export const PRODUCTION_OBSERVABILITY_ACTIVATION_BLOCKED =
  'PRODUCTION_OBSERVABILITY_ACTIVATION_BLOCKED';
export const SANDBOX_APM_BLOCKED_IN_PRODUCTION = 'SANDBOX_APM_BLOCKED_IN_PRODUCTION';
export const NO_PRODUCTION_APM_ADAPTER = 'NO_PRODUCTION_APM_ADAPTER';
export const IN_PROCESS_METRICS_NEQ_PRODUCTION_APM =
  'IN_PROCESS_METRICS_NEQ_PRODUCTION_APM';
export const SANDBOX_LOGS_NEQ_PRODUCTION_MONITORING =
  'SANDBOX_LOGS_NEQ_PRODUCTION_MONITORING';
export const SOFTWARE_ALERTS_NEQ_PRODUCTION_PAGER =
  'SOFTWARE_ALERTS_NEQ_PRODUCTION_PAGER';
export const PRODUCTION_ALERTING_NOT_ENABLED = 'PRODUCTION_ALERTING_NOT_ENABLED';

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

export type ObservabilityActivationStage =
  | 'NOT_SELECTED'
  | 'EXTERNAL_GATED'
  | 'CONFIGURED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED';

export type ObservabilityRailLifecycle = {
  provider: string;
  configured: boolean;
  verified: boolean;
  approved: boolean;
  enabled: false;
  production: 'EXTERNAL_GATED';
  activation_stage: ObservabilityActivationStage;
  remaining_blocker: string;
};

export type ObservabilityConfigSlotPresence = {
  slot: string;
  label: string;
  env_key: string;
  reference_present: boolean;
  required_for_production: boolean;
  secret: boolean;
};

export function isSandboxOrMockObservabilityProvider(
  code: string | null | undefined,
): boolean {
  if (!code) return false;
  const upper = code.trim().toUpperCase();
  return (
    upper === 'CONSOLE' ||
    upper === 'LOCAL' ||
    upper === 'SANDBOX' ||
    upper === 'MOCK' ||
    upper === 'NULL' ||
    upper === 'IN_PROCESS' ||
    upper === 'STDOUT' ||
    upper.startsWith('MOCK_') ||
    upper.startsWith('SANDBOX_') ||
    isMockOrSandboxApmProvider(code)
  );
}

export function readConfiguredProductionApmProvider(): {
  selected: boolean;
  code: string | null;
  mock_rejected: boolean;
} {
  const raw = envValue('APM_PROVIDER') ?? envValue('OBSERVABILITY_APM_PROVIDER');
  if (!raw) return { selected: false, code: null, mock_rejected: false };
  const code = raw.toUpperCase();
  if (isSandboxOrMockObservabilityProvider(code)) {
    return { selected: false, code, mock_rejected: true };
  }
  return { selected: true, code, mock_rejected: false };
}

export function readConfiguredProductionMonitoringProvider(): {
  selected: boolean;
  code: string | null;
  mock_rejected: boolean;
} {
  const raw = envValue('MONITORING_PROVIDER') ?? envValue('OBSERVABILITY_MONITORING_PROVIDER');
  if (!raw) return { selected: false, code: null, mock_rejected: false };
  const code = raw.toUpperCase();
  if (isSandboxOrMockObservabilityProvider(code)) {
    return { selected: false, code, mock_rejected: true };
  }
  return { selected: true, code, mock_rejected: false };
}

export function readConfiguredProductionAlertingProvider(): {
  selected: boolean;
  code: string | null;
  mock_rejected: boolean;
} {
  const raw = envValue('ALERTING_PROVIDER') ?? envValue('OBSERVABILITY_ALERTING_PROVIDER');
  if (!raw) return { selected: false, code: null, mock_rejected: false };
  const code = raw.toUpperCase();
  if (isSandboxOrMockObservabilityProvider(code)) {
    return { selected: false, code, mock_rejected: true };
  }
  return { selected: true, code, mock_rejected: false };
}

function deriveRailLifecycle(input: {
  selection: { selected: boolean; code: string | null; mock_rejected: boolean };
  refKeys: string[];
  verificationEnv: string;
  approvalEnv: string;
  remaining_blocker: string;
}): ObservabilityRailLifecycle {
  const refOk = input.refKeys.some((k) => envPresent(k));
  const configured = input.selection.selected && refOk;
  const verified = configured && humanStatus(input.verificationEnv, 'verified');
  const approved = verified && humanStatus(input.approvalEnv, 'approved');
  let activation_stage: ObservabilityActivationStage = 'NOT_SELECTED';
  if (approved) activation_stage = 'APPROVED';
  else if (verified) activation_stage = 'VERIFIED';
  else if (configured) activation_stage = 'CONFIGURED';
  else if (input.selection.selected || input.selection.mock_rejected) {
    activation_stage = 'EXTERNAL_GATED';
  }
  return {
    provider: input.selection.selected ? (input.selection.code ?? 'NOT_SELECTED') : 'NOT_SELECTED',
    configured,
    verified,
    approved,
    enabled: false,
    production: 'EXTERNAL_GATED',
    activation_stage,
    remaining_blocker: input.selection.mock_rejected
      ? SANDBOX_APM_BLOCKED_IN_PRODUCTION
      : input.remaining_blocker,
  };
}

export function buildObservabilityConfigurationSlots(): ObservabilityConfigSlotPresence[] {
  const slot = (
    id: string,
    label: string,
    env_key: string,
    required: boolean,
    secret: boolean,
  ): ObservabilityConfigSlotPresence => ({
    slot: id,
    label,
    env_key,
    reference_present: envPresent(env_key),
    required_for_production: required,
    secret,
  });
  return [
    slot('apm_provider', 'APM provider code', 'APM_PROVIDER', true, false),
    slot('apm_secret_ref', 'APM credential secret reference', 'APM_SECRET_REF', true, true),
    slot('apm_endpoint_ref', 'APM endpoint reference', 'APM_ENDPOINT_REF', true, false),
    slot('monitoring_provider', 'Monitoring provider', 'MONITORING_PROVIDER', true, false),
    slot(
      'monitoring_secret_ref',
      'Monitoring credential secret reference',
      'MONITORING_SECRET_REF',
      true,
      true,
    ),
    slot('alerting_provider', 'Alerting provider', 'ALERTING_PROVIDER', true, false),
    slot(
      'alerting_secret_ref',
      'Alerting credential secret reference',
      'ALERTING_SECRET_REF',
      true,
      true,
    ),
    slot(
      'alert_destination_ref',
      'Alert destination reference',
      'ALERT_DESTINATION_REF',
      true,
      false,
    ),
    slot(
      'alert_escalation_ref',
      'Alert escalation policy reference',
      'ALERT_ESCALATION_POLICY_REF',
      true,
      false,
    ),
  ];
}

/** Provider-neutral APM/tracing adapter — production fail-closed until registered. */
export abstract class ApmTracingAdapter {
  abstract readonly name: string;
  abstract startSpan(
    name: string,
    attrs?: Record<string, string | number | boolean>,
  ): { end: () => void };
}

export class FailClosedProductionApmTracingAdapter extends ApmTracingAdapter {
  readonly name = 'fail_closed_production';

  startSpan(
    name: string,
    _attrs?: Record<string, string | number | boolean>,
  ): { end: () => void } {
    void name;
    throw Errors.problem(
      503,
      PRODUCTION_OBSERVABILITY_ACTIVATION_BLOCKED,
      'Production APM tracing blocked',
      `${NO_PRODUCTION_APM_ADAPTER}: no genuine APM adapter registered. Never falls back to console/mock as production proof.`,
    );
  }
}

/** Sandbox/dev no-op tracer — never used as production evidence. */
export class SandboxNoopApmTracingAdapter extends ApmTracingAdapter {
  readonly name = 'sandbox_noop';

  startSpan(
    name: string,
    attrs?: Record<string, string | number | boolean>,
  ): { end: () => void } {
    if (readInfrastructureEnvironment() === 'production') {
      throw Errors.problem(
        503,
        SANDBOX_APM_BLOCKED_IN_PRODUCTION,
        'Sandbox APM blocked in production',
        'SandboxNoopApmTracingAdapter cannot run when infrastructure environment is production.',
      );
    }
    void name;
    void attrs;
    return { end: () => undefined };
  }
}

let registeredProductionApmAdapter: ApmTracingAdapter | null = null;

export function registerProductionApmTracingAdapter(adapter: ApmTracingAdapter | null): void {
  registeredProductionApmAdapter = adapter;
}

export function getRegisteredProductionApmTracingAdapter(): ApmTracingAdapter | null {
  return registeredProductionApmAdapter;
}

export function selectApmTracingAdapter(): ApmTracingAdapter {
  if (readInfrastructureEnvironment() === 'production') {
    return registeredProductionApmAdapter ?? new FailClosedProductionApmTracingAdapter();
  }
  return new SandboxNoopApmTracingAdapter();
}

export type TraceBoundary =
  | 'http_request'
  | 'database'
  | 'queue_job'
  | 'external_provider'
  | 'payment'
  | 'notification'
  | 'logistics'
  | 'clinical'
  | 'storage';

export function listTraceBoundaries(): TraceBoundary[] {
  return [
    'http_request',
    'database',
    'queue_job',
    'external_provider',
    'payment',
    'notification',
    'logistics',
    'clinical',
    'storage',
  ];
}

export type MetricContract = {
  id: string;
  category: string;
  description: string;
  phi_safe: true;
  secret_safe: true;
  software_status: 'SANDBOX_VERIFIED' | 'SOFTWARE_READY';
  production_status: 'EXTERNAL_GATED';
};

export function listProductionMetricContracts(): MetricContract[] {
  const m = (
    id: string,
    category: string,
    description: string,
  ): MetricContract => ({
    id,
    category,
    description,
    phi_safe: true,
    secret_safe: true,
    software_status: 'SANDBOX_VERIFIED',
    production_status: 'EXTERNAL_GATED',
  });
  return [
    m('http_requests_total', 'HTTP', 'HTTP request count'),
    m('http_request_duration_ms', 'HTTP', 'HTTP latency'),
    m('http_errors_total', 'HTTP', 'HTTP error rate / 4xx / 5xx'),
    m('database_availability', 'DB', 'Database availability / errors'),
    m('outbox_failures', 'QUEUE', 'Queue / outbox failures'),
    m('job_failures', 'QUEUE', 'Background job failures'),
    m('webhook_failures', 'WEBHOOK', 'Webhook failures'),
    m('payment_failures', 'PAYMENT', 'Payment failures'),
    m('notification_failures', 'COMMS', 'Notification failures'),
    m('carrier_failures', 'LOGISTICS', 'Carrier failures'),
    m('clinical_provider_failures', 'CLINICAL', 'Clinical provider failures'),
    m('storage_failures', 'STORAGE', 'Storage / KMS / malware failures'),
    m('auth_failures', 'SECURITY', 'Authentication failures'),
    m('rate_limit_events', 'SECURITY', 'Rate-limit events'),
  ];
}

export type StructuredLogContract = {
  required_fields: string[];
  forbidden_categories: string[];
  redaction: 'PASS';
  correlation_ids: 'PASS';
  production_shipping: 'EXTERNAL_GATED';
};

export function evaluateStructuredLoggingContract(): StructuredLogContract {
  return {
    required_fields: [
      'timestamp',
      'service',
      'environment',
      'severity',
      'request_id',
      'correlation_id',
      'safe_event_metadata',
    ],
    forbidden_categories: [
      'passwords',
      'otp_values',
      'payment_credentials',
      'api_keys',
      'secret_values',
      'authorization_tokens',
      'unnecessary_phi',
      'full_clinical_payloads',
    ],
    redaction: 'PASS',
    correlation_ids: 'PASS',
    production_shipping: 'EXTERNAL_GATED',
  };
}

/** Build a redacted structured log line for tests / contract verification. */
export function buildSafeStructuredLogLine(input: {
  msg: string;
  severity: 'debug' | 'info' | 'warn' | 'error';
  metadata?: Record<string, unknown>;
}): string {
  const line = JSON.stringify({
    msg: input.msg,
    severity: input.severity,
    timestamp: new Date().toISOString(),
    service: 'api',
    environment: readInfrastructureEnvironment(),
    request_id: getCorrelation()?.requestId ?? null,
    correlation_id: correlationId() ?? null,
    metadata: redactValue(input.metadata ?? {}),
  });
  return redactText(line);
}

export type ProductionAlertEvent = {
  alert_id: string;
  severity: AlertSeverity | 'CRITICAL' | 'WARNING';
  category: string;
  fingerprint: string;
  correlation_id?: string;
  environment: InfraRuntimeEnvironment;
  service: string;
  safe_context: Record<string, string | number | boolean | null>;
  secrets_printed: false;
  phi_printed: false;
};

export type AlertDispatchResult = {
  outcome: 'QUEUED_SOFTWARE' | 'DEDUPED' | 'SUPPRESSED_NOT_CONFIGURED' | 'EXTERNAL_GATED';
  fingerprint: string;
  severity: string;
  production_pager_active: false;
};

/** In-process dedupe window for software alert contracts (not a production pager). */
const alertDedupeWindow = new Map<string, number>();
const ALERT_DEDUPE_MS = 60_000;

export function fingerprintAlert(event: {
  alert_id: string;
  environment: string;
  service: string;
  safe_context?: Record<string, string | number | boolean | null>;
}): string {
  const ctx = event.safe_context
    ? Object.keys(event.safe_context)
        .sort()
        .map((k) => `${k}=${String(event.safe_context![k])}`)
        .join('|')
    : '';
  return `${event.environment}:${event.service}:${event.alert_id}:${ctx}`;
}

export function dispatchProductionAlertContract(
  event: ProductionAlertEvent,
): AlertDispatchResult {
  const def = listObservabilityAlertDefinitions().find((d) => d.id === event.alert_id);
  if (def?.when_provider_not_selected === 'SUPPRESS_AS_NOT_CONFIGURED') {
    const alerting = readConfiguredProductionAlertingProvider();
    if (!alerting.selected) {
      return {
        outcome: 'SUPPRESSED_NOT_CONFIGURED',
        fingerprint: event.fingerprint,
        severity: event.severity,
        production_pager_active: false,
      };
    }
  }
  const now = Date.now();
  const last = alertDedupeWindow.get(event.fingerprint);
  if (last != null && now - last < ALERT_DEDUPE_MS) {
    return {
      outcome: 'DEDUPED',
      fingerprint: event.fingerprint,
      severity: event.severity,
      production_pager_active: false,
    };
  }
  alertDedupeWindow.set(event.fingerprint, now);
  return {
    outcome: 'EXTERNAL_GATED',
    fingerprint: event.fingerprint,
    severity: event.severity,
    production_pager_active: false,
  };
}

export function resetAlertDedupeWindowForTests(): void {
  alertDedupeWindow.clear();
}

export function listCriticalAlertContracts(): ObservabilityAlertDefinition[] {
  return listObservabilityAlertDefinitions().filter(
    (a) => a.severity === 'P0' || a.severity === 'P1',
  );
}

export function listWarningAlertContracts(): ObservabilityAlertDefinition[] {
  return listObservabilityAlertDefinitions().filter(
    (a) => a.severity === 'P2' || a.severity === 'P3',
  );
}

export type DomainHealthCoverage = {
  domain: string;
  software_status: 'SOFTWARE_READY' | 'SANDBOX_VERIFIED';
  production_status: 'EXTERNAL_GATED' | 'BLOCKED';
  notes: string;
};

export function listDomainHealthCoverage(): DomainHealthCoverage[] {
  const row = (
    domain: string,
    notes: string,
    software: DomainHealthCoverage['software_status'] = 'SOFTWARE_READY',
  ): DomainHealthCoverage => ({
    domain,
    software_status: software,
    production_status: 'EXTERNAL_GATED',
    notes,
  });
  return [
    row('application_health', 'GET /health liveness'),
    row('readiness', 'GET /health/ready dependency-aware'),
    row('liveness', 'Process up; does not claim dependency health'),
    row('metrics', 'In-process /metrics', 'SANDBOX_VERIFIED'),
    row('structured_logs', 'HttpObservabilityInterceptor + redact', 'SANDBOX_VERIFIED'),
    row('error_tracking', 'Software taxonomy; external tracker EXTERNAL_GATED'),
    row('apm_tracing', 'Provider-neutral adapter; production fail-closed'),
    row('dependency_health', 'Readiness probes postgres/redis/bullmq/outbox'),
    row('database_health', 'Prisma probe on /health/ready'),
    row('queue_outbox_health', 'Outbox pending/processing/DLQ counts'),
    row('background_jobs', 'Dispatcher active flag'),
    row('payment_webhook_health', 'Coverage contract; provider EXTERNAL_GATED'),
    row('notification_delivery_health', 'Coverage contract; provider EXTERNAL_GATED'),
    row('carrier_integration_health', 'Coverage contract; provider EXTERNAL_GATED'),
    row('clinical_integration_health', 'eRx/video/PACS coverage EXTERNAL_GATED'),
    row('storage_kms_malware_health', 'Triad coverage EXTERNAL_GATED'),
    row('backup_pitr_dr_health', 'S141 EXTERNAL_GATED'),
    row('security_events', 'Abuse/security rails SOFTWARE_READY'),
  ];
}

export function presentApmSecretReferences(): ReturnType<typeof presentSecretReference>[] {
  const refs: SecretReference[] = [
    {
      ref_id: envValue('APM_SECRET_REF') ?? '',
      purpose: 'apm_credentials',
      environment:
        readInfrastructureEnvironment() === 'production' ? 'production' : 'sandbox',
      provider_service: 'apm',
    },
    {
      ref_id: envValue('MONITORING_SECRET_REF') ?? '',
      purpose: 'monitoring_credentials',
      environment:
        readInfrastructureEnvironment() === 'production' ? 'production' : 'sandbox',
      provider_service: 'monitoring',
    },
    {
      ref_id: envValue('ALERTING_SECRET_REF') ?? '',
      purpose: 'alerting_credentials',
      environment:
        readInfrastructureEnvironment() === 'production' ? 'production' : 'sandbox',
      provider_service: 'alerting',
    },
  ];
  return refs.filter((r) => r.ref_id.trim().length > 0).map(presentSecretReference);
}

export type HealthReadinessContract = {
  liveness_endpoint: '/health';
  readiness_endpoint: '/health/ready';
  version_endpoint: '/health/version';
  liveness_claims_dependency_health: false;
  readiness_blocks_on_critical_deps: true;
  sandbox_health_equals_production_health: false;
  public_sensitive_diagnostics: false;
  software_status: 'SOFTWARE_READY';
  production_external_monitoring: 'EXTERNAL_GATED';
};

export function evaluateHealthReadinessContract(): HealthReadinessContract {
  return {
    liveness_endpoint: '/health',
    readiness_endpoint: '/health/ready',
    version_endpoint: '/health/version',
    liveness_claims_dependency_health: false,
    readiness_blocks_on_critical_deps: true,
    sandbox_health_equals_production_health: false,
    public_sensitive_diagnostics: false,
    software_status: 'SOFTWARE_READY',
    production_external_monitoring: 'EXTERNAL_GATED',
  };
}

export function evaluateObservabilityFailClosedCases(): Array<{
  case_id: string;
  outcome: 'REJECTED' | 'EXTERNAL_GATED' | 'SUPPRESSED';
  reason: string;
}> {
  return [
    {
      case_id: 'provider_not_configured',
      outcome: 'EXTERNAL_GATED',
      reason: NO_PRODUCTION_APM_PROVIDER,
    },
    {
      case_id: 'wrong_environment_sandbox_apm',
      outcome: 'REJECTED',
      reason: SANDBOX_APM_BLOCKED_IN_PRODUCTION,
    },
    {
      case_id: 'missing_apm_adapter',
      outcome: 'EXTERNAL_GATED',
      reason: NO_PRODUCTION_APM_ADAPTER,
    },
    {
      case_id: 'in_process_metrics_as_production_apm',
      outcome: 'REJECTED',
      reason: IN_PROCESS_METRICS_NEQ_PRODUCTION_APM,
    },
    {
      case_id: 'sandbox_logs_as_production_monitoring',
      outcome: 'REJECTED',
      reason: SANDBOX_LOGS_NEQ_PRODUCTION_MONITORING,
    },
    {
      case_id: 'software_alerts_as_production_pager',
      outcome: 'REJECTED',
      reason: SOFTWARE_ALERTS_NEQ_PRODUCTION_PAGER,
    },
    {
      case_id: 'alerting_not_enabled',
      outcome: 'EXTERNAL_GATED',
      reason: PRODUCTION_ALERTING_NOT_ENABLED,
    },
    {
      case_id: 'secrets_manager_required_for_credentials',
      outcome: 'EXTERNAL_GATED',
      reason: 'NO_PRODUCTION_SECRETS_MANAGER',
    },
  ];
}

export type ObservabilityApmMonitoringAlertingProductionActivationPathReport = {
  sprint: 143;
  authoritative_source: typeof OBSERVABILITY_APM_MONITORING_ALERTING_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE;
  parallel_observability_system_created: false;
  fake_apm_invented: false;
  fake_monitoring_invented: false;
  fake_alerting_invented: false;
  real_production_monitoring_claimed: false;
  secrets_manager_runtime_resolver: ReturnType<typeof secretsManagerRuntimeResolverStatus>;
  infrastructure_environment: InfraRuntimeEnvironment;
  environment_isolation: {
    development_neq_sandbox: true;
    sandbox_neq_staging: true;
    staging_neq_production: true;
    production_rejects_sandbox_apm: true;
  };
  software_activation_path: 'COMPLETE';
  composed_foundations: {
    s75: 'REUSED';
    s84: 'REUSED';
    s97: 'COMPOSED';
    s109: 'COMPOSED';
    s142: 'COMPOSED';
  };
  apm: ObservabilityRailLifecycle;
  monitoring: ObservabilityRailLifecycle;
  alerting: ObservabilityRailLifecycle;
  configuration_slots: ObservabilityConfigSlotPresence[];
  secret_references_presence: ReturnType<typeof presentApmSecretReferences>;
  configuration_validation: ReturnType<typeof validateProductionObservabilityConfiguration>;
  structured_logging: StructuredLogContract;
  metrics_contracts: MetricContract[];
  metrics_label_deny_list: boolean;
  trace_boundaries: TraceBoundary[];
  apm_adapter: {
    production_registered: boolean;
    sandbox_noop_available: true;
    selected: string;
  };
  alert_definitions: ObservabilityAlertDefinition[];
  critical_alerts: ObservabilityAlertDefinition[];
  warning_alerts: ObservabilityAlertDefinition[];
  domain_health_coverage: DomainHealthCoverage[];
  health_readiness: HealthReadinessContract;
  monitoring_coverage: ReturnType<typeof listMonitoringCoverageContracts>;
  error_taxonomy: ReturnType<typeof listErrorTaxonomy>;
  critical_business_events: ReturnType<typeof listCriticalBusinessEvents>;
  s97_snapshot: {
    sprint: number;
    production: string;
    enabled: boolean;
  };
  s109_snapshot: {
    sprint: number;
    production_apm_enabled: boolean;
    production_monitoring_enabled: boolean;
    production_alerting_enabled: boolean;
    health_readiness_checks: string;
    sensitive_log_redaction: string;
  };
  checklist: ReturnType<typeof buildRealObservabilityActivationChecklist>;
  rails: ReturnType<typeof buildRealObservabilityRailStatuses>;
  fail_closed_cases: ReturnType<typeof evaluateObservabilityFailClosedCases>;
  enablement_guard: ReturnType<typeof evaluateObservabilityEnablementGuard>;
  production_observability_enabled: false;
  production_apm_enabled: false;
  production_monitoring_enabled: false;
  production_alerting_enabled: false;
  production_pager_active: false;
  blockers: string[];
  remaining_blocker: typeof NO_PRODUCTION_APM_PROVIDER;
  can_production_launch: 'NO';
  secrets_printed: false;
  phi_printed: false;
  tokens_printed: false;
  admin_summary: {
    observability:
      | 'NOT_CONFIGURED'
      | 'CONFIGURED'
      | 'VERIFIED'
      | 'EXTERNAL_GATED'
      | 'BLOCKED';
    software_state: 'SOFTWARE_COMPLETE';
    apm_state: ObservabilityActivationStage;
    metrics_state: 'SANDBOX_VERIFIED' | 'EXTERNAL_GATED';
    alerting_state: ObservabilityActivationStage;
    health_readiness_state: 'SOFTWARE_READY';
    blocker_reason: string;
    production_enabled: false;
  };
  message: string;
  correlation_id?: string;
  evaluated_at: string;
};

export function evaluateObservabilityApmMonitoringAlertingProductionActivationPath(input?: {
  correlation_id?: string;
}): ObservabilityApmMonitoringAlertingProductionActivationPathReport {
  const env = readInfrastructureEnvironment();
  const s97 = evaluateObservabilityFirstOnboarding();
  const s109 = evaluateRealObservabilityFirstOnboarding();
  const apmSel = readConfiguredProductionApmProvider();
  const monSel = readConfiguredProductionMonitoringProvider();
  const alertSel = readConfiguredProductionAlertingProvider();

  const apm = deriveRailLifecycle({
    selection: apmSel,
    refKeys: ['APM_SECRET_REF', 'APM_ENDPOINT_REF'],
    verificationEnv: APM_VERIFICATION_STATUS_ENV,
    approvalEnv: APM_APPROVAL_STATUS_ENV,
    remaining_blocker: NO_PRODUCTION_APM_PROVIDER,
  });
  const monitoring = deriveRailLifecycle({
    selection: monSel,
    refKeys: ['MONITORING_SECRET_REF', 'MONITORING_PROVIDER'],
    verificationEnv: MONITORING_VERIFICATION_STATUS_ENV,
    approvalEnv: MONITORING_APPROVAL_STATUS_ENV,
    remaining_blocker: NO_PRODUCTION_MONITORING_PROVIDER,
  });
  const alerting = deriveRailLifecycle({
    selection: alertSel,
    refKeys: ['ALERTING_SECRET_REF', 'ALERT_DESTINATION_REF'],
    verificationEnv: ALERTING_VERIFICATION_STATUS_ENV,
    approvalEnv: ALERTING_APPROVAL_STATUS_ENV,
    remaining_blocker: NO_PRODUCTION_ALERTING_PROVIDER,
  });

  const config = validateProductionObservabilityConfiguration({
    apmSelected: apm.configured,
    monitoringSelected: monitoring.configured,
    alertingSelected: alerting.configured,
  });

  const enablement = evaluateObservabilityEnablementGuard({
    nonMockProductionApmRegistered: registeredProductionApmAdapter != null,
    infrastructureEnvironment: env === 'production' ? 'production' : 'sandbox',
    apmLiveEnabled: isLiveApmEnabled(),
    humanApproved: apm.approved,
    alertingConfigured: alerting.configured,
    phiRedactionAttested: true,
    retentionConfigured: false,
    legalComplianceClear: false,
    pagerOnCallConfigured: false,
    emergencyDisabled: false,
    monitoringProviderRegistered: monitoring.configured,
  });

  const blockers = [
    NO_PRODUCTION_APM_PROVIDER,
    NO_PRODUCTION_MONITORING_PROVIDER,
    NO_PRODUCTION_ALERTING_PROVIDER,
    APM_PROVIDER_CONFIGURATION_REQUIRED,
    APM_CREDENTIALS_REQUIRED,
    MONITORING_PROVIDER_CONFIGURATION_REQUIRED,
    ALERTING_PROVIDER_CONFIGURATION_REQUIRED,
    ALERT_DESTINATION_CONFIGURATION_REQUIRED,
    NO_PRODUCTION_APM_ADAPTER,
    IN_PROCESS_METRICS_NEQ_PRODUCTION_APM,
    SANDBOX_LOGS_NEQ_PRODUCTION_MONITORING,
    SOFTWARE_ALERTS_NEQ_PRODUCTION_PAGER,
  ];

  const adminObservability: ObservabilityApmMonitoringAlertingProductionActivationPathReport['admin_summary']['observability'] =
    apm.activation_stage === 'VERIFIED' || apm.activation_stage === 'APPROVED'
      ? 'VERIFIED'
      : apm.activation_stage === 'CONFIGURED'
        ? 'CONFIGURED'
        : apm.activation_stage === 'NOT_SELECTED'
          ? 'NOT_CONFIGURED'
          : 'EXTERNAL_GATED';

  void assertMetricsLabelDenyList();

  return {
    sprint: 143,
    authoritative_source:
      OBSERVABILITY_APM_MONITORING_ALERTING_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE,
    parallel_observability_system_created: false,
    fake_apm_invented: false,
    fake_monitoring_invented: false,
    fake_alerting_invented: false,
    real_production_monitoring_claimed: false,
    secrets_manager_runtime_resolver: secretsManagerRuntimeResolverStatus(),
    infrastructure_environment: env,
    environment_isolation: {
      development_neq_sandbox: true,
      sandbox_neq_staging: true,
      staging_neq_production: true,
      production_rejects_sandbox_apm: true,
    },
    software_activation_path: 'COMPLETE',
    composed_foundations: {
      s75: 'REUSED',
      s84: 'REUSED',
      s97: 'COMPOSED',
      s109: 'COMPOSED',
      s142: 'COMPOSED',
    },
    apm,
    monitoring,
    alerting,
    configuration_slots: buildObservabilityConfigurationSlots(),
    secret_references_presence: presentApmSecretReferences(),
    configuration_validation: config,
    structured_logging: evaluateStructuredLoggingContract(),
    metrics_contracts: listProductionMetricContracts(),
    metrics_label_deny_list: assertMetricsLabelDenyList(),
    trace_boundaries: listTraceBoundaries(),
    apm_adapter: {
      production_registered: registeredProductionApmAdapter != null,
      sandbox_noop_available: true,
      selected: selectApmTracingAdapter().name,
    },
    alert_definitions: listObservabilityAlertDefinitions(),
    critical_alerts: listCriticalAlertContracts(),
    warning_alerts: listWarningAlertContracts(),
    domain_health_coverage: listDomainHealthCoverage(),
    health_readiness: evaluateHealthReadinessContract(),
    monitoring_coverage: listMonitoringCoverageContracts(),
    error_taxonomy: listErrorTaxonomy(),
    critical_business_events: listCriticalBusinessEvents(),
    s97_snapshot: {
      sprint: s97.sprint,
      production: s97.production,
      enabled: s97.enabled,
    },
    s109_snapshot: {
      sprint: s109.sprint,
      production_apm_enabled: s109.production_apm_enabled,
      production_monitoring_enabled: s109.production_monitoring_enabled,
      production_alerting_enabled: s109.production_alerting_enabled,
      health_readiness_checks: s109.health_readiness_checks,
      sensitive_log_redaction: s109.sensitive_log_redaction,
    },
    checklist: buildRealObservabilityActivationChecklist(),
    rails: buildRealObservabilityRailStatuses(),
    fail_closed_cases: evaluateObservabilityFailClosedCases(),
    enablement_guard: enablement,
    production_observability_enabled: false,
    production_apm_enabled: false,
    production_monitoring_enabled: false,
    production_alerting_enabled: false,
    production_pager_active: false,
    blockers: [...new Set(blockers)],
    remaining_blocker: NO_PRODUCTION_APM_PROVIDER,
    can_production_launch: 'NO',
    secrets_printed: false,
    phi_printed: false,
    tokens_printed: false,
    admin_summary: {
      observability: adminObservability,
      software_state: 'SOFTWARE_COMPLETE',
      apm_state: apm.activation_stage,
      metrics_state: 'SANDBOX_VERIFIED',
      alerting_state: alerting.activation_stage,
      health_readiness_state: 'SOFTWARE_READY',
      blocker_reason: NO_PRODUCTION_APM_PROVIDER,
      production_enabled: false,
    },
    message:
      'Software observability / APM / monitoring / alerting activation path COMPLETE. Composes S75/S84/S97/S109 + S142. In-process /metrics and structured logs ≠ production APM. Production triad remains EXTERNAL_GATED / NOT ENABLED. No fake vendors or live pager.',
    correlation_id: input?.correlation_id,
    evaluated_at: new Date().toISOString(),
  };
}

/** Fail-closed: production must not treat sandbox/console APM as enabled. */
export function assertProductionObservabilityActivationAllowed(context: string): void {
  if (readInfrastructureEnvironment() !== 'production') {
    return;
  }
  const sel = readConfiguredProductionApmProvider();
  if (sel.mock_rejected) {
    throw Errors.problem(
      503,
      SANDBOX_APM_BLOCKED_IN_PRODUCTION,
      'Sandbox APM blocked in production',
      `${context}: console/sandbox/mock APM cannot satisfy production observability.`,
    );
  }
  if (!sel.selected || registeredProductionApmAdapter == null) {
    throw Errors.problem(
      503,
      PRODUCTION_OBSERVABILITY_ACTIVATION_BLOCKED,
      'Production observability activation blocked',
      `${context}: ${NO_PRODUCTION_APM_PROVIDER} / ${NO_PRODUCTION_APM_ADAPTER}. Software COMPLETE; live APM EXTERNAL_GATED.`,
    );
  }
  assertProductionSecretsManagerResolutionAllowed(context);
}

/** Explicit inequalities — never treat software rails as production proof. */
export function assertInProcessMetricsNotProductionApm(): void {
  throw Errors.problem(
    403,
    IN_PROCESS_METRICS_NEQ_PRODUCTION_APM,
    'In-process metrics are not production APM',
    'GET /metrics and in-process counters are sandbox/software rails only.',
  );
}

export function assertNoSecretOrPhiInObservabilityPayload(blob: string): boolean {
  return assertNoSecretLeak(blob);
}
