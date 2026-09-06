/**
 * Sprint 143 — Production observability + APM + monitoring + alerting closure (unit).
 * No invented APM vendors / no live pager / secrets never printed.
 */
import { ProblemException } from '../common/problem';
import { newCorrelation, runWithCorrelation } from '../common/correlation';
import { assertNoSecretLeak } from './secret-redaction';
import { NO_PRODUCTION_APM_PROVIDER } from './observability-first-onboarding';
import { evaluateSecretsManagerRuntimeResolver } from './secrets-manager-runtime-resolver';
import {
  FailClosedProductionApmTracingAdapter,
  IN_PROCESS_METRICS_NEQ_PRODUCTION_APM,
  NO_PRODUCTION_APM_ADAPTER,
  PRODUCTION_OBSERVABILITY_ACTIVATION_BLOCKED,
  SANDBOX_APM_BLOCKED_IN_PRODUCTION,
  SandboxNoopApmTracingAdapter,
  assertInProcessMetricsNotProductionApm,
  assertProductionObservabilityActivationAllowed,
  buildSafeStructuredLogLine,
  dispatchProductionAlertContract,
  evaluateHealthReadinessContract,
  evaluateObservabilityApmMonitoringAlertingProductionActivationPath,
  evaluateStructuredLoggingContract,
  fingerprintAlert,
  listCriticalAlertContracts,
  listDomainHealthCoverage,
  listProductionMetricContracts,
  listTraceBoundaries,
  listWarningAlertContracts,
  registerProductionApmTracingAdapter,
  resetAlertDedupeWindowForTests,
  selectApmTracingAdapter,
} from './observability-apm-monitoring-alerting-production-activation-path';

describe('S143 observability APM monitoring alerting production activation path', () => {
  afterEach(() => {
    registerProductionApmTracingAdapter(null);
    resetAlertDedupeWindowForTests();
    delete process.env.INFRASTRUCTURE_ENVIRONMENT;
    delete process.env.APM_PROVIDER;
    delete process.env.APM_SECRET_REF;
    delete process.env.MONITORING_PROVIDER;
    delete process.env.ALERTING_PROVIDER;
  });

  it('reports SOFTWARE_COMPLETE / EXTERNAL_GATED / no fake vendors / S142 composed', () => {
    const report = evaluateObservabilityApmMonitoringAlertingProductionActivationPath();
    expect(report.sprint).toBe(143);
    expect(report.software_activation_path).toBe('COMPLETE');
    expect(report.secrets_manager_runtime_resolver).toBe('SOFTWARE_COMPLETE');
    expect(report.composed_foundations.s97).toBe('COMPOSED');
    expect(report.composed_foundations.s109).toBe('COMPOSED');
    expect(report.composed_foundations.s142).toBe('COMPOSED');
    expect(report.production_observability_enabled).toBe(false);
    expect(report.production_apm_enabled).toBe(false);
    expect(report.production_monitoring_enabled).toBe(false);
    expect(report.production_alerting_enabled).toBe(false);
    expect(report.production_pager_active).toBe(false);
    expect(report.fake_apm_invented).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_APM_PROVIDER);
    expect(report.admin_summary.software_state).toBe('SOFTWARE_COMPLETE');
    expect(report.admin_summary.production_enabled).toBe(false);
    expect(report.secrets_printed).toBe(false);
    expect(assertNoSecretLeak(JSON.stringify(report))).toBe(true);
  });

  it('enforces environment isolation + health/readiness contract', () => {
    const report = evaluateObservabilityApmMonitoringAlertingProductionActivationPath();
    expect(report.environment_isolation.development_neq_sandbox).toBe(true);
    expect(report.environment_isolation.sandbox_neq_staging).toBe(true);
    expect(report.environment_isolation.staging_neq_production).toBe(true);
    expect(report.environment_isolation.production_rejects_sandbox_apm).toBe(true);

    const health = evaluateHealthReadinessContract();
    expect(health.liveness_claims_dependency_health).toBe(false);
    expect(health.readiness_blocks_on_critical_deps).toBe(true);
    expect(health.sandbox_health_equals_production_health).toBe(false);
    expect(health.public_sensitive_diagnostics).toBe(false);
    expect(listDomainHealthCoverage().length).toBeGreaterThanOrEqual(15);
  });

  it('structured logging redacts secrets/OTP/tokens and carries correlation fields', () => {
    const store = newCorrelation('req-s143', 'corr-s143');
    const line = runWithCorrelation(store, () =>
      buildSafeStructuredLogLine({
        msg: 'ops_event',
        severity: 'info',
        metadata: {
          password: 'secret-password',
          otp: '123456',
          token: 'bearer-abc',
          note: 'safe',
        },
      }),
    );
    expect(line).toContain('corr-s143');
    expect(line).toContain('req-s143');
    expect(line).toMatch(/\[redacted\]/);
    expect(line).not.toContain('secret-password');
    expect(line).not.toContain('123456');
    expect(line).not.toContain('bearer-abc');

    const contract = evaluateStructuredLoggingContract();
    expect(contract.redaction).toBe('PASS');
    expect(contract.correlation_ids).toBe('PASS');
    expect(contract.production_shipping).toBe('EXTERNAL_GATED');
    expect(contract.forbidden_categories).toEqual(
      expect.arrayContaining(['passwords', 'otp_values', 'api_keys', 'unnecessary_phi']),
    );
  });

  it('metrics contracts are PHI/secret safe and not production-enabled', () => {
    const metrics = listProductionMetricContracts();
    expect(metrics.map((m) => m.id)).toEqual(
      expect.arrayContaining([
        'http_requests_total',
        'http_request_duration_ms',
        'http_errors_total',
        'payment_failures',
        'auth_failures',
        'rate_limit_events',
      ]),
    );
    expect(metrics.every((m) => m.phi_safe && m.secret_safe)).toBe(true);
    expect(metrics.every((m) => m.production_status === 'EXTERNAL_GATED')).toBe(true);
  });

  it('APM tracing adapter is provider-neutral and fail-closed in production', () => {
    process.env.INFRASTRUCTURE_ENVIRONMENT = 'sandbox';
    const sandbox = selectApmTracingAdapter();
    expect(sandbox).toBeInstanceOf(SandboxNoopApmTracingAdapter);
    const span = sandbox.startSpan('http_request', { route: '/health' });
    span.end();

    process.env.INFRASTRUCTURE_ENVIRONMENT = 'production';
    const prod = selectApmTracingAdapter();
    expect(prod).toBeInstanceOf(FailClosedProductionApmTracingAdapter);
    expect(() => prod.startSpan('http_request')).toThrow(ProblemException);

    expect(listTraceBoundaries()).toEqual(
      expect.arrayContaining(['http_request', 'payment', 'clinical', 'storage']),
    );

    expect(() => assertInProcessMetricsNotProductionApm()).toThrow(ProblemException);
    try {
      assertInProcessMetricsNotProductionApm();
    } catch (err) {
      expect((err as ProblemException).code).toBe(IN_PROCESS_METRICS_NEQ_PRODUCTION_APM);
    }
  });

  it('fail-closed: provider not configured / sandbox APM / secrets gate', () => {
    process.env.INFRASTRUCTURE_ENVIRONMENT = 'production';
    expect(() => assertProductionObservabilityActivationAllowed('s143')).toThrow(
      ProblemException,
    );
    try {
      assertProductionObservabilityActivationAllowed('s143');
    } catch (err) {
      expect((err as ProblemException).code).toBe(PRODUCTION_OBSERVABILITY_ACTIVATION_BLOCKED);
    }

    process.env.APM_PROVIDER = 'CONSOLE';
    expect(() => assertProductionObservabilityActivationAllowed('s143')).toThrow(
      ProblemException,
    );
    try {
      assertProductionObservabilityActivationAllowed('s143');
    } catch (err) {
      expect((err as ProblemException).code).toBe(SANDBOX_APM_BLOCKED_IN_PRODUCTION);
    }

    const report = evaluateObservabilityApmMonitoringAlertingProductionActivationPath();
    expect(report.fail_closed_cases.some((c) => c.reason === NO_PRODUCTION_APM_ADAPTER)).toBe(
      true,
    );
    expect(report.apm_adapter.production_registered).toBe(false);
  });

  it('alert severity + deduplication + no production pager', () => {
    resetAlertDedupeWindowForTests();
    expect(listCriticalAlertContracts().some((a) => a.severity === 'P0')).toBe(true);
    expect(listWarningAlertContracts().some((a) => a.severity === 'P2')).toBe(true);

    const fingerprint = fingerprintAlert({
      alert_id: 'api_error_spike',
      environment: 'sandbox',
      service: 'api',
      safe_context: { route: '/orders' },
    });
    const first = dispatchProductionAlertContract({
      alert_id: 'api_error_spike',
      severity: 'P1',
      category: 'API',
      fingerprint,
      environment: 'sandbox',
      service: 'api',
      safe_context: { route: '/orders' },
      secrets_printed: false,
      phi_printed: false,
    });
    expect(first.production_pager_active).toBe(false);
    expect(['EXTERNAL_GATED', 'QUEUED_SOFTWARE']).toContain(first.outcome);

    const second = dispatchProductionAlertContract({
      alert_id: 'api_error_spike',
      severity: 'P1',
      category: 'API',
      fingerprint,
      environment: 'sandbox',
      service: 'api',
      safe_context: { route: '/orders' },
      secrets_printed: false,
      phi_printed: false,
    });
    expect(second.outcome).toBe('DEDUPED');

    const suppressed = dispatchProductionAlertContract({
      alert_id: 'payment_provider_failure',
      severity: 'P0',
      category: 'PROVIDER',
      fingerprint: fingerprintAlert({
        alert_id: 'payment_provider_failure',
        environment: 'sandbox',
        service: 'api',
      }),
      environment: 'sandbox',
      service: 'api',
      safe_context: {},
      secrets_printed: false,
      phi_printed: false,
    });
    expect(suppressed.outcome).toBe('SUPPRESSED_NOT_CONFIGURED');
  });

  it('S142 secrets resolver integration remains SOFTWARE_COMPLETE', () => {
    const s142 = evaluateSecretsManagerRuntimeResolver();
    const s143 = evaluateObservabilityApmMonitoringAlertingProductionActivationPath();
    expect(s142.secrets_manager_runtime_resolver).toBe('SOFTWARE_COMPLETE');
    expect(s143.secrets_manager_runtime_resolver).toBe('SOFTWARE_COMPLETE');
    expect(s142.production_secrets_manager_enabled).toBe(false);
    expect(assertNoSecretLeak(JSON.stringify(s142))).toBe(true);
  });
});
