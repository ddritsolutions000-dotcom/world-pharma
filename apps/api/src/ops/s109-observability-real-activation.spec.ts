/**
 * Sprint 109 — Real APM / monitoring / alerting activation readiness
 * (no invented APM vendor / no production pager from sandbox).
 */
import {
  NO_PRODUCTION_APM_PROVIDER,
  NO_PRODUCTION_MONITORING_PROVIDER,
  NO_PRODUCTION_ALERTING_PROVIDER,
  NO_PRODUCTION_MONITORING,
  NO_PRODUCTION_ALERTING,
  APM_PROVIDER_NOT_SELECTED,
  APM_CREDENTIAL_REFERENCE_MISSING,
  APM_ENDPOINT_REFERENCE_MISSING,
  MONITORING_CONFIGURATION_MISSING,
  ALERTING_CONFIGURATION_MISSING,
  ALERT_DESTINATION_REFERENCE_MISSING,
  evaluateRealObservabilityFirstOnboarding,
  buildRealObservabilityActivationChecklist,
  buildRealObservabilityMarketStatuses,
  buildRealObservabilityRailStatuses,
} from './observability-real-activation-first-onboarding';
import { evaluateObservabilityFirstOnboarding } from './observability-first-onboarding';
import { evaluateProductionLaunchControl } from './production-launch-control';
import { assertNoSecretLeak } from './secret-redaction';

describe('S109 real observability activation contract', () => {
  it('reports Sprint 109 / NOT_SELECTED / no production APM', () => {
    const report = evaluateRealObservabilityFirstOnboarding();
    expect(report.sprint).toBe(109);
    expect(report.real_apm_provider_selected).toBe(false);
    expect(report.production_apm_enabled).toBe(false);
    expect(report.real_monitoring_provider_selected).toBe(false);
    expect(report.production_monitoring_enabled).toBe(false);
    expect(report.real_alerting_destination_configured).toBe(false);
    expect(report.production_alerting_enabled).toBe(false);
    expect(report.health_readiness_checks).toBe('PASS');
    expect(report.health_readiness_scope).toBe('SOFTWARE_SANDBOX');
    expect(report.sensitive_log_redaction).toBe('PASS');
    expect(report.enabled).toBe(false);
    expect(report.ready_for_activation).toBe(false);
    expect(report.force_launch_available).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_APM_PROVIDER);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        NO_PRODUCTION_APM_PROVIDER,
        NO_PRODUCTION_MONITORING_PROVIDER,
        NO_PRODUCTION_MONITORING,
        NO_PRODUCTION_ALERTING_PROVIDER,
        NO_PRODUCTION_ALERTING,
        APM_PROVIDER_NOT_SELECTED,
        APM_CREDENTIAL_REFERENCE_MISSING,
        APM_ENDPOINT_REFERENCE_MISSING,
        MONITORING_CONFIGURATION_MISSING,
        ALERTING_CONFIGURATION_MISSING,
        ALERT_DESTINATION_REFERENCE_MISSING,
      ]),
    );
    expect(report.control_plane).toBe('S100_REUSED');
    expect(report.foundation_plane).toBe('S101_REUSED');
    expect(report.s97_plane).toBe('COMPOSED');
    expect(report.secrets_printed).toBe(false);
    expect(report.fake_apm_invented).toBe(false);
    expect(report.native_android).toBe('DEVICE_NOT_AVAILABLE');
  });

  it('exposes checklist, rails, markets, alert lifecycle, composes S97', () => {
    const report = evaluateRealObservabilityFirstOnboarding();
    expect(buildRealObservabilityActivationChecklist().length).toBeGreaterThanOrEqual(12);
    expect(buildRealObservabilityRailStatuses().map((r) => r.rail)).toEqual([
      'APM',
      'MONITORING',
      'ALERTING',
    ]);
    expect(report.rails.every((r) => r.production_enabled === false)).toBe(true);
    expect(buildRealObservabilityMarketStatuses().map((m) => m.market)).toEqual([
      'GLOBAL',
      'IN',
      'AE',
      'US',
    ]);
    expect(report.alert_lifecycle.states).toEqual(
      expect.arrayContaining(['TRIGGERED', 'ACKNOWLEDGED', 'RESOLVED', 'SUPPRESSED']),
    );
    expect(report.alert_lifecycle.severities).toEqual(['P0', 'P1', 'P2', 'P3']);
    expect(report.alert_lifecycle.not_selected_not_provider_down).toBe(true);
    expect(report.health_model.liveness).toBe('SOFTWARE_READY');
    expect(report.health_model.production_readiness).toBe('EXTERNAL_GATED');

    const s97 = evaluateObservabilityFirstOnboarding();
    expect(s97.sprint).toBe(97);
    expect(s97.enabled).toBe(false);
    expect(s97.apm?.enabled ?? false).toBe(false);
    expect(String(s97.production)).toMatch(/EXTERNAL_GATED/);
  });
});

describe('S109 security + launch integration', () => {
  it('never leaks secrets and does not bypass S87', () => {
    expect(assertNoSecretLeak(JSON.stringify(evaluateRealObservabilityFirstOnboarding()))).toBe(
      true,
    );
    const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
    expect(launch.can_production_launch).toBe('NO');
    expect(launch.force_launch_available).toBe(false);
    expect(launch.rails.some((r) => r.rail_id === 'APM')).toBe(true);
  });

  it('no hardcoded UPI/INR/₹/+91/IST or invented APM brands', () => {
    const blob = JSON.stringify(evaluateRealObservabilityFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/\bDatadog\b|\bNew Relic\b|\bSentry\b|\bGrafana Cloud\b/i);
    expect(blob).not.toMatch(/sk_live_|postgresql:\/\/[^:]+:[^@]+@|BEGIN PRIVATE KEY/);
  });
});
