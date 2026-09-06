/**
 * Sprint 99 — Production deployment + release engineering activation readiness
 * (no invented cloud accounts / no fake production deploy).
 */
import {
  NO_PRODUCTION_DEPLOYMENT_TARGET,
  NO_PRODUCTION_RELEASE_PIPELINE,
  PRODUCTION_INFRASTRUCTURE_EXTERNAL_GATED,
  MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
  SMOKE_TEST_PRODUCTION_NOT_AUTHORIZED,
  ROLLBACK_NOT_YET_PROVEN,
  evaluateProductionDeploymentFirstOnboarding,
} from './production-deployment-first-onboarding';
import {
  buildSmokeTestContract,
  evaluateMigrationReleaseSafety,
  evaluateRollbackReadiness,
  releaseLifecycleStages,
  validateProductionDeploymentConfiguration,
} from './production-deployment-requirements';
import { evaluateProductionLaunchControl } from './production-launch-control';
import { assertNoSecretLeak } from './secret-redaction';

describe('S99 deployment/release activation contract', () => {
  it('reports Sprint 99 / EXTERNAL_GATED / no fake deploy', () => {
    const report = evaluateProductionDeploymentFirstOnboarding();
    expect(report.sprint).toBe(99);
    expect(report.activation_lifecycle).toBe('NOT_SELECTED');
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.enabled).toBe(false);
    expect(report.force_launch_available).toBe(false);
    expect(report.force_deploy_available).toBe(false);
    expect(report.production_deployment_enabled).toBe(false);
    expect(report.production_deployment_performed).toBe(false);
    expect(report.deployable).toBe(false);
    expect(report.production_launch_ready).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_DEPLOYMENT_TARGET);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        NO_PRODUCTION_DEPLOYMENT_TARGET,
        NO_PRODUCTION_RELEASE_PIPELINE,
        PRODUCTION_INFRASTRUCTURE_EXTERNAL_GATED,
        MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
        SMOKE_TEST_PRODUCTION_NOT_AUTHORIZED,
        ROLLBACK_NOT_YET_PROVEN,
      ]),
    );
    expect(report.secrets_printed).toBe(false);
    expect(report.fake_infrastructure_invented).toBe(false);
    expect(report.buildable).toBe(true);
    expect(report.lifecycle.length).toBe(10);
  });

  it('separates BUILDABLE / DEPLOYABLE / LAUNCH and defines smoke + migration safety', () => {
    const v = validateProductionDeploymentConfiguration();
    expect(v.buildable).toBe(true);
    expect(v.deployable).toBe(false);
    expect(v.activation_ready).toBe(false);
    expect(v.production_launch_ready).toBe(false);
    expect(v.semantic_guards.buildable_neq_deployable).toBe(true);
    expect(v.semantic_guards.no_force_deploy_bypass).toBe(true);
    expect(v.repository.cloud_deploy_manifests).toBe('ABSENT');
    expect(v.repository.ci_workflow).toBe('VALIDATE_ONLY_NO_DEPLOY_JOB');
    expect(v.secrets_exposed).toBe(false);

    expect(releaseLifecycleStages()).toContain('DEPLOYMENT_GATE');
    expect(buildSmokeTestContract().every((s) => s.money_movement === false)).toBe(true);
    expect(buildSmokeTestContract().every((s) => s.external_provider_calls === false)).toBe(true);

    const migration = evaluateMigrationReleaseSafety();
    expect(migration.destructive_down_migrations).toBe(false);
    expect(migration.production_cutover_authorized).toBe(false);
    expect(migration.distinctions.backup_neq_migration_history).toBe(true);

    const rollback = evaluateRollbackReadiness();
    expect(rollback.sandbox_status).toBe('SANDBOX_VERIFIED');
    expect(rollback.production_status).toBe('NOT_YET_PROVEN');
  });
});

describe('S99 security + launch integration', () => {
  it('redaction + launch control remain fail-closed with DEPLOYMENT rail', () => {
    expect(assertNoSecretLeak(JSON.stringify(evaluateProductionDeploymentFirstOnboarding()))).toBe(
      true,
    );

    const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
    expect(launch.can_production_launch).toBe('NO');
    expect(launch.force_launch_available).toBe(false);
    expect(launch.rails.some((r) => r.rail_id === 'DEPLOYMENT')).toBe(true);
    expect(launch.rails.length).toBe(21);
    expect(launch.groups.length).toBe(9);
    const deployRail = launch.rails.find((r) => r.rail_id === 'DEPLOYMENT');
    expect(deployRail?.production_status).toBe('EXTERNAL_GATED');
    expect(deployRail?.blocker_codes).toEqual(
      expect.arrayContaining([NO_PRODUCTION_DEPLOYMENT_TARGET]),
    );
  });

  it('no hardcoded UPI/INR/₹/+91/IST or invented cloud vendors', () => {
    const blob = JSON.stringify(evaluateProductionDeploymentFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@|sk_live_|BEGIN PRIVATE KEY/);
    expect(blob).not.toMatch(/\bAWS_ACCESS_KEY\b|\bGCP_SERVICE_ACCOUNT_JSON\b/i);
  });
});
