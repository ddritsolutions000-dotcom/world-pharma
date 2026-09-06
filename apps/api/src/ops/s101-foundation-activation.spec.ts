/**
 * Sprint 101 — Real production foundation activation readiness
 * (no invented cloud accounts / credentials).
 */
import {
  NO_PRODUCTION_DATABASE,
  NO_PRODUCTION_DEPLOYMENT_TARGET,
  NO_PRODUCTION_ENVIRONMENT,
  NO_PRODUCTION_SECRETS_MANAGER,
  evaluateProductionFoundationFirstOnboarding,
} from './production-foundation-first-onboarding';
import {
  buildFoundationDependencyChain,
  buildSecretReferenceContracts,
  buildWorkloadIdentityModel,
  validateProductionFoundationConfiguration,
} from './production-foundation-requirements';
import { evaluateProductionLaunchControl } from './production-launch-control';
import { evaluateProductionProviderOnboardingFirstOnboarding } from './production-provider-onboarding-first-onboarding';
import { assertNoSecretLeak } from './secret-redaction';

describe('S101 production foundation contract', () => {
  it('reports Sprint 101 / EXTERNAL_GATED / nothing enabled', () => {
    const report = evaluateProductionFoundationFirstOnboarding();
    expect(report.sprint).toBe(101);
    expect(report.control_plane).toBe('S100_REUSED');
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.enabled).toBe(false);
    expect(report.production_environment_enabled).toBe(false);
    expect(report.production_deployment_target_enabled).toBe(false);
    expect(report.production_secrets_manager_enabled).toBe(false);
    expect(report.production_database_enabled).toBe(false);
    expect(report.force_launch_available).toBe(false);
    expect(report.force_deploy_available).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_ENVIRONMENT);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        NO_PRODUCTION_ENVIRONMENT,
        NO_PRODUCTION_SECRETS_MANAGER,
        NO_PRODUCTION_DATABASE,
        NO_PRODUCTION_DEPLOYMENT_TARGET,
      ]),
    );
    expect(report.rails.length).toBe(4);
    expect(report.secrets_printed).toBe(false);
    expect(report.fake_infrastructure_invented).toBe(false);
  });

  it('models secret refs, identities, env separation, and dependency chain', () => {
    const v = validateProductionFoundationConfiguration();
    expect(v.ready_for_activation).toBe(false);
    expect(v.environments.PRODUCTION).toBe('EXTERNAL_GATED');
    expect(v.environments.SANDBOX).toBe('ISOLATED');
    expect(buildSecretReferenceContracts().some((r) => r.key === 'PSP_API_KEY')).toBe(true);
    expect(buildSecretReferenceContracts().every((r) => r.value_in_source === false)).toBe(true);
    expect(buildWorkloadIdentityModel().every((i) => i.universal_admin_forbidden)).toBe(true);
    expect(buildFoundationDependencyChain()[0]?.from).toBe('PRODUCTION_ENVIRONMENT');
    expect(v.deployment_apps.find((a) => a.app === 'mobile')?.status).toBe('NOT_IN_SCOPE_S101');
    expect(v.rails.every((r) => r.lifecycle === 'EXTERNAL_GATED')).toBe(true);
    expect(v.rails.every((r) => r.enabled === false)).toBe(true);
  });
});

describe('S101 security + S100/S87 integration', () => {
  it('never leaks secrets and does not bypass launch control', () => {
    const report = evaluateProductionFoundationFirstOnboarding();
    expect(assertNoSecretLeak(JSON.stringify(report))).toBe(true);

    const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
    expect(launch.can_production_launch).toBe('NO');
    expect(launch.force_launch_available).toBe(false);
    expect(launch.rails.length).toBe(21);

    const s100 = evaluateProductionProviderOnboardingFirstOnboarding();
    expect(s100.can_production_launch).toBe('NO');
    expect(s100.production_providers_enabled).toBe(false);
  });

  it('no hardcoded UPI/INR/₹/+91/IST or invented vault/cloud credentials', () => {
    const blob = JSON.stringify(evaluateProductionFoundationFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@|sk_live_|BEGIN PRIVATE KEY/);
    expect(blob).not.toMatch(/vault\.example|https:\/\/vault\./i);
  });
});
