/**
 * Sprint 75 — Observability / APM / alerting readiness (no fake APM vendor).
 */
import {
  assertMetricsLabelDenyList,
  evaluateObservabilityEnablementGuard,
  evaluateObservabilityFirstOnboarding,
  isLiveApmEnabled,
  isMockOrSandboxApmProvider,
  listCriticalBusinessEvents,
  listErrorTaxonomy,
  listObservabilityAlertDefinitions,
  listObservabilityLegalGateItems,
  validateObservabilityConfiguration,
} from './observability-first-onboarding';
import { evaluateProviderActivation } from './provider-activation';
import { getProviderActivationContract } from './provider-activation-contracts';
import { redactSecretValue } from './secret-redaction';
import { readInfrastructureEnvironment } from './infra-environment';

describe('S75 observability availability', () => {
  it('reports NOT_SELECTED / EXTERNAL_GATED — no production APM', () => {
    const report = evaluateObservabilityFirstOnboarding();
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.real_apm_available).toBe(false);
    expect(report.configured).toBe(false);
    expect(report.enabled).toBe(false);
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.sandbox).toBe('SANDBOX_VERIFIED');
    expect(report.metrics).toBe('SANDBOX_VERIFIED');
    expect(report.logs).toBe('SANDBOX_VERIFIED');
    expect(report.alerting).toBe('EXTERNAL_GATED');
    expect(report.remaining_blocker).toBe('NO_PRODUCTION_APM_PROVIDER');
    expect(report.phi_redaction).toBe('SANDBOX_VERIFIED');
    expect(report.health_semantics.production_readiness).toBe('EXTERNAL_GATED');
    expect(report.health_semantics.application_health).toBe('SOFTWARE_READY');
    expect(report.enablement_guard.can_enable).toBe(false);
    expect(report.secrets_printed).toBe(false);
    expect(report.phi_printed).toBe(false);
    expect(report.otp_printed).toBe(false);
    expect(report.tokens_printed).toBe(false);
  });
});

describe('S75 configuration validator', () => {
  const base = {
    providerSelected: true,
    nonMockProductionApmRegistered: true,
    infrastructureEnvironment: 'production' as const,
    apmLiveEnabled: false,
    humanApproved: false,
    metricsEndpointConfigured: true,
    logShippingConfigured: true,
    alertingConfigured: true,
    phiRedactionAttested: true,
    retentionConfigured: true,
    legalComplianceConfigured: true,
  };

  it('NOT_SELECTED when provider not chosen', () => {
    expect(validateObservabilityConfiguration({ ...base, providerSelected: false })).toBe(
      'NOT_SELECTED',
    );
  });

  it('NOT_CONFIGURED without APM/alerting/retention', () => {
    expect(
      validateObservabilityConfiguration({ ...base, nonMockProductionApmRegistered: false }),
    ).toBe('NOT_CONFIGURED');
    expect(validateObservabilityConfiguration({ ...base, alertingConfigured: false })).toBe(
      'NOT_CONFIGURED',
    );
  });

  it('VERIFIED → VERIFIED_BUT_DISABLED → APPROVED (metrics ≠ ENABLED)', () => {
    expect(validateObservabilityConfiguration(base)).toBe('VERIFIED');
    expect(
      validateObservabilityConfiguration({ ...base, humanApproved: true, apmLiveEnabled: false }),
    ).toBe('VERIFIED_BUT_DISABLED');
    expect(
      validateObservabilityConfiguration({ ...base, humanApproved: true, apmLiveEnabled: true }),
    ).toBe('APPROVED');
  });
});

describe('S75 enablement guard', () => {
  it('never enables without production APM', () => {
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
    });
    expect(guard.can_enable).toBe(true);
  });

  it('emergency disable blocks enablement', () => {
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
      emergencyDisabled: true,
    });
    expect(guard.can_enable).toBe(false);
  });
});

describe('S75 taxonomy + alerts + redaction', () => {
  it('exposes error taxonomy and critical events', () => {
    expect(listErrorTaxonomy()).toEqual(
      expect.arrayContaining(['WEBHOOK_ERROR', 'OUTBOX_ERROR', 'PROVIDER_EXTERNAL_GATED']),
    );
    expect(listCriticalBusinessEvents()).toEqual(
      expect.arrayContaining(['webhook_rejection', 'customer_login', 'backup_recovery_event']),
    );  });

  it('alert definitions suppress NOT_SELECTED providers and keep software rails', () => {
    const alerts = listObservabilityAlertDefinitions();
    expect(alerts.length).toBeGreaterThanOrEqual(10);
    expect(alerts.find((a) => a.id === 'payment_provider_failure')?.when_provider_not_selected).toBe(
      'SUPPRESS_AS_NOT_CONFIGURED',
    );
    expect(alerts.find((a) => a.id === 'outbox_backlog')?.when_provider_not_selected).toBe(
      'STILL_MONITOR_SOFTWARE_RAIL',
    );
    expect(alerts.every((a) => ['P0', 'P1', 'P2', 'P3'].includes(a.severity))).toBe(true);
    expect(alerts.some((a) => a.threshold === 'OPS_CONFIG_REQUIRED')).toBe(true);
  });

  it('secret redaction and metrics deny-list hold', () => {
    expect(redactSecretValue('super-secret-value-must-not-leak-abcdef')).toBe('SET');
    expect(assertMetricsLabelDenyList()).toBe(true);
  });
});

describe('S75 sandbox/production + globalization', () => {
  const prev = {
    env: process.env['INFRASTRUCTURE_ENVIRONMENT'],
    apm: process.env['APM_LIVE_ENABLED'],
  };

  afterEach(() => {
    const restore = (k: string, v: string | undefined) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    };
    restore('INFRASTRUCTURE_ENVIRONMENT', prev.env);
    restore('APM_LIVE_ENABLED', prev.apm);
  });

  it('treats LOCAL/MOCK/CONSOLE as non-production APM', () => {
    expect(isMockOrSandboxApmProvider('LOCAL')).toBe(true);
    expect(isMockOrSandboxApmProvider('MOCK_APM')).toBe(true);
    expect(isMockOrSandboxApmProvider('DATADOG_PROD')).toBe(false);
  });

  it('APM_LIVE alone does not select production provider', () => {
    process.env['INFRASTRUCTURE_ENVIRONMENT'] = 'production';
    process.env['APM_LIVE_ENABLED'] = 'true';
    expect(readInfrastructureEnvironment()).toBe('production');
    expect(isLiveApmEnabled()).toBe(true);
    const report = evaluateObservabilityFirstOnboarding();
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.real_apm_available).toBe(false);
    expect(report.enablement_guard.can_enable).toBe(false);
  });

  it('MONITORING_APM contract remains NOT_SELECTED', () => {
    const row = evaluateProviderActivation(getProviderActivationContract('MONITORING_APM'));
    expect(row.provider_name).toBe('NOT_SELECTED');
    expect(row.enabled).toBe(false);
    expect(row.external_blocker).toBeTruthy();
  });

  it('legal gate items remain EXTERNAL_GATED', () => {
    const items = listObservabilityLegalGateItems();
    expect(items.length).toBeGreaterThanOrEqual(5);
    expect(items.every((i) => i.status === 'EXTERNAL_GATED' || i.status === 'BLOCKED')).toBe(true);
  });

  it('onboarding report has no hardcoded UPI/INR/₹/+91/IST and no secrets', () => {
    const blob = JSON.stringify(evaluateObservabilityFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/apiSecret|password=|eyJ|AKIA[0-9A-Z]{16}/i);
  });
});
