/**
 * Sprint 97 — Production APM / monitoring / alerting activation readiness
 * (no fake APM/pager).
 */
import {
  ALERTING_CREDENTIALS_REQUIRED,
  ALERTING_PROVIDER_CONFIGURATION_REQUIRED,
  ALERT_DESTINATION_CONFIGURATION_REQUIRED,
  ALERT_ESCALATION_POLICY_REQUIRED,
  ALERT_THRESHOLD_BASELINE_REQUIRED,
  APM_CREDENTIALS_REQUIRED,
  APM_ENVIRONMENT_CONFIGURATION_REQUIRED,
  APM_PROVIDER_CONFIGURATION_REQUIRED,
  MONITORING_CREDENTIALS_REQUIRED,
  MONITORING_ENVIRONMENT_CONFIGURATION_REQUIRED,
  MONITORING_PROVIDER_CONFIGURATION_REQUIRED,
  NO_PRODUCTION_ALERTING_PROVIDER,
  NO_PRODUCTION_APM_PROVIDER,
  NO_PRODUCTION_MONITORING_PROVIDER,
  evaluateObservabilityEnablementGuard,
  evaluateObservabilityFirstOnboarding,
  listAlertDestinationReadiness,
  listMonitoringCoverageContracts,
  validateObservabilityConfiguration,
} from './observability-first-onboarding';
import { validateProductionObservabilityConfiguration } from './production-observability-requirements';

describe('S97 observability triad activation contract', () => {
  it('reports Sprint 97 / three rails NOT_SELECTED / EXTERNAL_GATED with blockers', () => {
    const report = evaluateObservabilityFirstOnboarding();
    expect(report.sprint).toBe(97);
    expect(report.foundation_sprint).toBe(84);
    expect(report.activation_lifecycle).toBe('NOT_SELECTED');
    expect(report.apm.provider).toBe('NOT_SELECTED');
    expect(report.monitoring.provider).toBe('NOT_SELECTED');
    expect(report.alerting_rail.provider).toBe('NOT_SELECTED');
    expect(report.apm.production).toBe('EXTERNAL_GATED');
    expect(report.monitoring.production).toBe('EXTERNAL_GATED');
    expect(report.alerting_rail.production).toBe('EXTERNAL_GATED');
    expect(report.force_launch_available).toBe(false);
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_APM_PROVIDER);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
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
      ]),
    );
    expect(report.fake_apm_provider_invented).toBe(false);
    expect(report.fake_production_alert_delivered).toBe(false);
    expect(report.real_monitoring_available).toBe(false);
    expect(report.real_alerting_available).toBe(false);
  });

  it('configuration readiness + monitoring coverage + destinations stay gated', () => {
    const v = validateProductionObservabilityConfiguration();
    expect(v.ready_for_activation).toBe(false);
    expect(v.secrets_exposed).toBe(false);
    expect(v.phi_exposed).toBe(false);
    expect(v.otp_exposed).toBe(false);
    expect(v.tokens_exposed).toBe(false);
    expect(v.configuration_readiness.apm.production_activation).toBe('EXTERNAL_GATED');
    expect(v.configuration_readiness.monitoring.production_activation).toBe('EXTERNAL_GATED');
    expect(v.configuration_readiness.alerting.production_activation).toBe('EXTERNAL_GATED');
    expect(v.eligibility.in_process_metrics_equals_production_apm).toBe(false);
    expect(v.eligibility.sandbox_logs_equals_production_monitoring).toBe(false);
    expect(v.eligibility.software_alerts_equals_production_pager).toBe(false);

    const coverage = listMonitoringCoverageContracts();
    expect(coverage.map((c) => c.domain)).toEqual(
      expect.arrayContaining([
        'CUSTOMER',
        'VENDOR_PHARMACY',
        'DOCTOR_CLINICAL',
        'LAB',
        'IMAGING',
        'LOGISTICS',
        'PLATFORM',
      ]),
    );

    const dest = listAlertDestinationReadiness();
    expect(dest.email).toBe('EXTERNAL_GATED');
    expect(dest.pager_oncall).toBe('EXTERNAL_GATED');

    const report = evaluateObservabilityFirstOnboarding();
    expect(report.country_policy.markets_supported_for_evaluation).toEqual([
      'GLOBAL',
      'IN',
      'AE',
      'US',
    ]);
    expect(report.alert_destinations.incident_management).toBe('EXTERNAL_GATED');
    expect(report.permission_model.customer_cannot_access_admin_reliability).toBe(true);
    expect(report.structured_logging_never_fields).toEqual(
      expect.arrayContaining(['otp', 'access_token', 'phi', 'kms_secrets']),
    );
  });
});

describe('S97 lifecycle + enablement + globalization', () => {
  it('never ENABLE from in-process metrics alone', () => {
    expect(
      validateObservabilityConfiguration({
        providerSelected: true,
        nonMockProductionApmRegistered: true,
        infrastructureEnvironment: 'production',
        apmLiveEnabled: true,
        humanApproved: true,
        metricsEndpointConfigured: true,
        logShippingConfigured: true,
        alertingConfigured: true,
        phiRedactionAttested: true,
        retentionConfigured: true,
        legalComplianceConfigured: true,
      }),
    ).toBe('APPROVED');

    expect(
      evaluateObservabilityEnablementGuard({
        nonMockProductionApmRegistered: false,
        infrastructureEnvironment: 'production',
        apmLiveEnabled: true,
        humanApproved: true,
        alertingConfigured: true,
        phiRedactionAttested: true,
        retentionConfigured: true,
        legalComplianceClear: true,
        pagerOnCallConfigured: true,
        emergencyDisabled: false,
        monitoringProviderRegistered: true,
      }).can_enable,
    ).toBe(false);

    const report = evaluateObservabilityFirstOnboarding();
    expect(report.failure_modes.sandbox_metrics_not_production_apm).toBe(true);
    expect(report.enablement_guard.can_enable).toBe(false);
  });

  it('no hardcoded UPI/INR/₹/+91/IST or invented APM vendors', () => {
    const blob = JSON.stringify(evaluateObservabilityFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/\bDatadog\b|\bNewRelic\b|\bSentry\b|\bCloudWatch\b/i);
    expect(blob).not.toMatch(/password=|api_key=|BEGIN PRIVATE KEY|eyJ/);
  });
});
