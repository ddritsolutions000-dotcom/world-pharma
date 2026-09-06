/**
 * Sprint 112 — Real production environment + secrets + deployment activation readiness
 * (no invented cloud/vault/hosting).
 */
import {
  NO_PRODUCTION_DATABASE,
  NO_PRODUCTION_DEPLOYMENT_TARGET,
  NO_PRODUCTION_ENVIRONMENT,
  NO_PRODUCTION_SECRETS_MANAGER,
  PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
  PRODUCTION_SECRET_REFERENCE_MISSING,
  PRODUCTION_ENVIRONMENT_CONFIGURATION_REQUIRED,
  PRODUCTION_DEPLOYMENT_TARGET_CONFIGURATION_REQUIRED,
  PRODUCTION_DATABASE_CONFIGURATION_REQUIRED,
  buildFoundationRealRails,
  buildProviderConfigSlots,
  evaluateFoundationRealActivation,
} from './foundation-real-activation-first-onboarding';
import { evaluateProductionFoundationFirstOnboarding } from './production-foundation-first-onboarding';
import { evaluateProductionSecretsEnvFirstOnboarding } from './production-secrets-env-first-onboarding';
import { evaluateProductionDeploymentFirstOnboarding } from './production-deployment-first-onboarding';
import { evaluateProductionLaunchControl } from './production-launch-control';
import { assertNoSecretLeak } from './secret-redaction';

describe('S112 foundation real activation contract', () => {
  it('reports Sprint 112 / all production rails NO / launch NO', () => {
    const report = evaluateFoundationRealActivation();
    expect(report.sprint).toBe(112);
    expect(report.production_environment_configured).toBe('NO');
    expect(report.production_environment_separation_verified).toBe('YES');
    expect(report.real_secrets_manager_selected).toBe('NO');
    expect(report.production_secrets_manager_enabled).toBe('NO');
    expect(report.real_deployment_target_selected).toBe('NO');
    expect(report.production_deployment_target_enabled).toBe('NO');
    expect(report.production_database_configured).toBe('NO');
    expect(report.client_secret_exposure).toBe('PASS');
    expect(report.sandbox_to_production_fallback).toBe('NO');
    expect(report.production_to_sandbox_fallback).toBe('NO');
    expect(report.migration_safety).toBe('PASS');
    expect(report.rollback).toBe('SANDBOX_PROVEN');
    expect(report.rollback_production).toBe('NOT_PROVEN');
    expect(report.force_launch_available).toBe(false);
    expect(report.force_deploy_available).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.fake_infrastructure_invented).toBe(false);
    expect(report.parallel_deployment_framework_created).toBe(false);
    expect(report.parallel_secrets_framework_created).toBe(false);
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_ENVIRONMENT);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        NO_PRODUCTION_ENVIRONMENT,
        NO_PRODUCTION_SECRETS_MANAGER,
        NO_PRODUCTION_DEPLOYMENT_TARGET,
        NO_PRODUCTION_DATABASE,
        PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
        PRODUCTION_SECRET_REFERENCE_MISSING,
        PRODUCTION_ENVIRONMENT_CONFIGURATION_REQUIRED,
        PRODUCTION_DEPLOYMENT_TARGET_CONFIGURATION_REQUIRED,
        PRODUCTION_DATABASE_CONFIGURATION_REQUIRED,
      ]),
    );
    expect(report.secrets_printed).toBe(false);
    expect(report.native_android).toBe('DEVICE_NOT_AVAILABLE');
  });

  it('exposes rails, env separation, health flow, and provider slots', () => {
    const report = evaluateFoundationRealActivation();
    expect(buildFoundationRealRails().map((r) => r.rail)).toEqual([
      'ENVIRONMENT',
      'SECRETS_MANAGER',
      'DEPLOYMENT_TARGET',
      'DATABASE',
    ]);
    expect(report.rails.every((r) => r.real_selected === false && r.production_enabled === false)).toBe(
      true,
    );
    expect(report.environments.PRODUCTION).toMatch(/EXTERNAL_GATED/);
    expect(report.environments.SANDBOX).toMatch(/ISOLATED|SANDBOX/);
    expect(report.health_flow).toEqual([
      'DEPLOY',
      'START',
      'LIVENESS',
      'READINESS',
      'DEPENDENCY_CHECK',
      'MONITORING',
      'RELEASE_STATUS',
    ]);
    expect(buildProviderConfigSlots().length).toBeGreaterThanOrEqual(12);
    expect(report.environment_separation.no_silent_fallback_to_mock).toBe(true);
    expect(report.client_boundary.browser_bundle_must_not_contain_secrets).toBe(true);
    expect(report.secret_scan.status).toMatch(/PASS/);
  });
});

describe('S112 compose + security + launch', () => {
  it('composes S98/S99/S101 and never leaks secrets or bypasses S87', () => {
    expect(evaluateProductionSecretsEnvFirstOnboarding().enabled).toBe(false);
    expect(evaluateProductionDeploymentFirstOnboarding().deployable).toBe(false);
    expect(evaluateProductionFoundationFirstOnboarding().enabled).toBe(false);
    expect(assertNoSecretLeak(JSON.stringify(evaluateFoundationRealActivation()))).toBe(true);
    const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
    expect(launch.can_production_launch).toBe('NO');
    expect(launch.force_launch_available).toBe(false);
  });

  it('no India hardcoding or invented cloud/vault brands', () => {
    const blob = JSON.stringify(evaluateFoundationRealActivation());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/sk_live_|postgresql:\/\/[^:]+:[^@]+@|BEGIN PRIVATE KEY/);
    expect(blob).not.toMatch(/\bAWS Secrets Manager\b|\bHashiCorp Vault\b|\bAzure Key Vault\b/i);
    expect(blob).not.toMatch(/\bEKS\b|\bGKE\b|\bAKS\b|\bFly\.io\b|\bRender\.com\b/i);
  });
});
