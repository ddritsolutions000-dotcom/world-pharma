/**
 * Sprint 100 — Production provider onboarding control plane
 * (no invented credentials / no auto-enable).
 */
import { evaluateProductionProviderOnboardingFirstOnboarding } from './production-provider-onboarding-first-onboarding';
import {
  buildActivationSequence,
  buildDependencyGraph,
  buildProviderOnboardingRows,
  evaluateProviderOnboardingControlPlane,
  filterOnboardingRows,
} from './production-provider-onboarding-requirements';
import { evaluateProductionLaunchControl } from './production-launch-control';
import { assertNoSecretLeak } from './secret-redaction';

describe('S100 provider onboarding control plane', () => {
  it('reports Sprint 100 / EXTERNAL_GATED / no providers enabled', () => {
    const report = evaluateProductionProviderOnboardingFirstOnboarding();
    expect(report.sprint).toBe(100);
    expect(report.control_plane).toBe('SOFTWARE_READY');
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.enabled).toBe(false);
    expect(report.production_providers_enabled).toBe(false);
    expect(report.production_infrastructure_enabled).toBe(false);
    expect(report.force_launch_available).toBe(false);
    expect(report.force_deploy_available).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.launch_control_rails).toBe(21);
    expect(report.counts.total).toBe(21);
    expect(report.counts.enabled).toBe(0);
    expect(report.rows.length).toBe(21);
    expect(report.secrets_printed).toBe(false);
    expect(report.fake_credentials_invented).toBe(false);
    expect(report.correlation_id.length).toBeGreaterThan(8);
  });

  it('exposes checklists, dependency graph, markets, and activation sequence', () => {
    const plane = evaluateProviderOnboardingControlPlane();
    expect(plane.dependency_graph.length).toBeGreaterThan(10);
    expect(buildDependencyGraph().some((d) => d.from === 'SECRETS_ENV' && d.to === 'PSP')).toBe(true);
    expect(buildActivationSequence()[0]?.band).toBe('FOUNDATION');
    expect(buildActivationSequence().some((s) => s.rail === 'PACS' && s.band === 'HEALTHCARE')).toBe(
      true,
    );

    const psp = plane.rows.find((r) => r.rail_id === 'PSP');
    expect(psp).toBeTruthy();
    expect(psp?.lifecycle).toBe('EXTERNAL_GATED');
    expect(psp?.checklist.length).toBe(15);
    expect(psp?.markets.map((m) => m.market)).toEqual(['GLOBAL', 'IN', 'AE', 'US']);
    expect(psp?.markets.every((m) => m.production === 'PRODUCTION_EXTERNAL_GATED')).toBe(true);
    expect(psp?.evidence.every((e) => e.value_presence !== undefined)).toBe(true);
    expect(psp?.enabled).toBe(false);

    expect(filterOnboardingRows(plane.rows, 'BLOCKED').length).toBeGreaterThan(10);
    expect(filterOnboardingRows(plane.rows, 'ENABLED').length).toBe(0);
    expect(filterOnboardingRows(plane.rows, 'READY_FOR_ACTIVATION').length).toBe(0);
    expect(plane.semantic_guards.ready_for_activation_neq_enabled).toBe(true);
    expect(plane.two_person_approval.required_for_activation).toBe(true);
  });
});

describe('S100 security + launch integration', () => {
  it('never leaks secrets and does not bypass S87', () => {
    const report = evaluateProductionProviderOnboardingFirstOnboarding();
    expect(assertNoSecretLeak(JSON.stringify(report))).toBe(true);

    const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
    expect(launch.can_production_launch).toBe('NO');
    expect(launch.force_launch_available).toBe(false);
    expect(launch.rails.length).toBe(21);

    const rows = buildProviderOnboardingRows();
    expect(rows.every((r) => r.lifecycle !== 'ENABLED')).toBe(true);
    expect(rows.every((r) => !r.enabled)).toBe(true);
  });

  it('no hardcoded UPI/INR/₹/+91/IST or invented vendor credentials', () => {
    const blob = JSON.stringify(evaluateProductionProviderOnboardingFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@|sk_live_|BEGIN PRIVATE KEY/);
    expect(blob).not.toMatch(/api_key=|client_secret=/i);
  });
});
