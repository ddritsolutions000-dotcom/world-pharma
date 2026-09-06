/**
 * Sprint 84 — Observability / APM / alerting activation readiness (no fake APM).
 */
import {
  NO_PRODUCTION_ALERTING_PROVIDER,
  NO_PRODUCTION_APM_PROVIDER,
  NO_PRODUCTION_MONITORING_PROVIDER,
  evaluateObservabilityEnablementGuard,
  evaluateObservabilityFirstOnboarding,
  isMockOrSandboxApmProvider,
  listCriticalBusinessEvents,
  listErrorTaxonomy,
  listObservabilityAlertDefinitions,
  listObservabilityLegalGateItems,
  validateObservabilityConfiguration,
} from './observability-first-onboarding';
import { evaluateProviderActivation } from './provider-activation';
import { getProviderActivationContract } from './provider-activation-contracts';

describe('S84 observability availability', () => {
  it('reports NOT_SELECTED / EXTERNAL_GATED — granular blockers', () => {
    const report = evaluateObservabilityFirstOnboarding();
    expect(report.sprint).toBeGreaterThanOrEqual(84);
    expect(report.foundation_sprint).toBeGreaterThanOrEqual(75);
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.apm.provider).toBe('NOT_SELECTED');
    expect(report.monitoring.provider).toBe('NOT_SELECTED');
    expect(report.alerting_rail.provider).toBe('NOT_SELECTED');
    expect(report.real_apm_available).toBe(false);
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.sandbox).toBe('SANDBOX_VERIFIED');
    expect(report.alerting).toBe('EXTERNAL_GATED');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_APM_PROVIDER);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        NO_PRODUCTION_APM_PROVIDER,
        NO_PRODUCTION_MONITORING_PROVIDER,
        NO_PRODUCTION_ALERTING_PROVIDER,
      ]),
    );
    expect(report.fake_apm_provider_invented).toBe(false);
    expect(report.fake_uptime_sla_claimed).toBe(false);
    expect(report.fake_production_alert_delivered).toBe(false);
    expect(report.enablement_guard.can_enable).toBe(false);
    expect(report.native_android).toBe('DEVICE_NOT_AVAILABLE');
  });
});

describe('S84 logging + correlation + taxonomy', () => {
  it('documents safe logging fields and error taxonomy', () => {
    const report = evaluateObservabilityFirstOnboarding();
    expect(report.structured_logging_fields).toContain('correlation_id');
    expect(report.structured_logging_never_fields).toContain('otp');
    expect(report.structured_logging_never_fields).toContain('phi');
    expect(report.correlation_model).toBe('x_request_id_x_correlation_id');
    expect(listErrorTaxonomy()).toContain('PROVIDER_EXTERNAL_GATED');
    expect(listCriticalBusinessEvents()).toContain('webhook_rejection');
    expect(report.permission_model.not_selected_suppresses_false_outage).toBe(true);
    expect(report.health_semantics.production_readiness).toBe('EXTERNAL_GATED');
    expect(report.health_semantics.application_health).toBe('SOFTWARE_READY');
  });
});

describe('S84 alert model', () => {
  it('uses P0–P3 and production-baseline thresholds where needed', () => {
    const alerts = listObservabilityAlertDefinitions();
    expect(alerts.some((a) => a.severity === 'P0')).toBe(true);
    expect(alerts.some((a) => a.threshold === 'THRESHOLD_REQUIRES_PRODUCTION_BASELINE')).toBe(true);
    const payment = alerts.find((a) => a.id === 'payment_provider_failure');
    expect(payment?.when_provider_not_selected).toBe('SUPPRESS_AS_NOT_CONFIGURED');
  });
});

describe('S84 enablement guard', () => {
  it('never enables without APM', () => {
    const guard = evaluateObservabilityEnablementGuard({
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
    });
    expect(guard.can_enable).toBe(false);
  });

  it('requires full checklist', () => {
    const guard = evaluateObservabilityEnablementGuard({
      nonMockProductionApmRegistered: true,
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
    });
    expect(guard.can_enable).toBe(true);
  });
});

describe('S84 configuration validator', () => {
  it('NOT_SELECTED when provider not chosen; credentials ≠ ENABLED', () => {
    expect(
      validateObservabilityConfiguration({
        providerSelected: false,
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
    ).toBe('NOT_SELECTED');
  });
});

describe('S84 sandbox/production fail-closed', () => {
  it('treats LOCAL/CONSOLE as non-production APM', () => {
    expect(isMockOrSandboxApmProvider('LOCAL')).toBe(true);
    expect(isMockOrSandboxApmProvider('CONSOLE')).toBe(true);
  });
});

describe('S84 legal gate + globalization', () => {
  it('legal items EXTERNAL_GATED; no INR/UPI/secrets', () => {
    const items = listObservabilityLegalGateItems();
    expect(items.every((i) => i.status === 'EXTERNAL_GATED' || i.status === 'BLOCKED')).toBe(true);
    const blob = JSON.stringify(evaluateObservabilityFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/apiSecret|eyJ|password=/);
  });

  it('MONITORING_APM contract remains NOT_SELECTED', () => {
    const row = evaluateProviderActivation(getProviderActivationContract('MONITORING_APM'));
    expect(row.provider_name).toBe('NOT_SELECTED');
    expect(row.enabled).toBe(false);
  });
});
