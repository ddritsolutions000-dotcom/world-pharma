/**
 * Sprint 118 — Production release engineering readiness contract.
 */
import {
  NO_PRODUCTION_DEPLOYMENT_TARGET,
  NO_PRODUCTION_RELEASE_PIPELINE,
  MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
  SMOKE_TEST_PRODUCTION_NOT_AUTHORIZED,
  ROLLBACK_NOT_YET_PROVEN,
  mapOperatorPipelineToS99,
  evaluateProductionReleaseEngineeringReadiness,
} from './production-release-engineering-readiness';
import { releaseLifecycleStages } from './production-deployment-requirements';
import { evaluateProductionFoundationActivationPreparation } from './production-foundation-activation-preparation';
import { evaluateProductionSecurityGate } from './production-security-gate-consolidation';
import { evaluateProductionLaunchControl } from './production-launch-control';
import { assertNoSecretLeak } from './secret-redaction';

describe('S118 release engineering readiness', () => {
  it('reuses S99 stages — no second state machine; launch NO', () => {
    const report = evaluateProductionReleaseEngineeringReadiness();
    expect(report.sprint).toBe(118);
    expect(report.authoritative_source).toBe('production-release-engineering-readiness');
    expect(report.parallel_release_framework_created).toBe(false);
    expect(report.parallel_deployment_state_machine_created).toBe(false);
    expect(report.parallel_launch_rail_created).toBe(false);
    expect(report.fake_infrastructure_invented).toBe(false);
    expect(report.release_pipeline.authoritative_stages).toEqual(releaseLifecycleStages());
    expect(report.release_pipeline.overall_status).toBe('NOT_CONFIGURED');
    expect(report.release_pipeline.production_pipeline_live).toBe(false);
    expect(report.deployment_target.lifecycle).toBe('NOT_CONFIGURED');
    expect(report.deployment_target.deployable).toBe(false);
    expect(report.deployment_target.deployed).toBe(false);
    expect(report.distinctions.software_ready).toBe('READY');
    expect(report.distinctions.production_deployable).toBe(false);
    expect(report.distinctions.actually_deployed).toBe(false);
    expect(report.distinctions.buildable_neq_deployable).toBe(true);
    expect(report.migration).toBe('NOT_AUTHORIZED');
    expect(report.migration_gate.production_cutover).toBe('NOT_AUTHORIZED');
    expect(report.rollback.sandbox).toBe('SANDBOX_PROVEN');
    expect(report.rollback.production).toBe('PRODUCTION_NOT_PROVEN');
    expect(report.smoke_test.path).toBe('SANDBOX_ONLY');
    expect(report.smoke_test.production_authorized).toBe(false);
    expect(report.artifact_identity.hashing_signing).toBe('EXTERNAL_GATED');
    expect(report.artifact_identity.signing_keys_invented).toBe(false);
    expect(report.pre_deployment_validation.overall).toBe('BLOCKED');
    expect(report.pre_deployment_validation.production_fallback_protections).toBe('ACTIVE');
    expect(report.production_build.embeds_server_secrets).toBe(false);
    expect(report.force_launch_available).toBe(false);
    expect(report.force_deploy_available).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_DEPLOYMENT_TARGET);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        NO_PRODUCTION_DEPLOYMENT_TARGET,
        NO_PRODUCTION_RELEASE_PIPELINE,
        MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
        SMOKE_TEST_PRODUCTION_NOT_AUTHORIZED,
        ROLLBACK_NOT_YET_PROVEN,
      ]),
    );
  });

  it('maps operator pipeline onto S99 and includes lab/imaging build contracts', () => {
    const stages = mapOperatorPipelineToS99();
    expect(stages.map((s) => s.stage)).toEqual([
      'PRECHECK',
      'BUILD',
      'VALIDATE',
      'MIGRATION_GATE',
      'DEPLOY',
      'READINESS_CHECK',
      'SMOKE_TEST',
      'RELEASE_SUCCESS',
    ]);
    expect(stages.every((s) => s.fail_closed)).toBe(true);
    const report = evaluateProductionReleaseEngineeringReadiness();
    const apps = report.production_build.contracts.map((b) => b.app);
    expect(apps).toEqual(
      expect.arrayContaining([
        'api',
        'web-customer',
        'web-admin',
        'web-vendor',
        'web-doctor',
        'web-lab',
        'web-pathologist',
        'web-radiologist',
        'packages/database',
      ]),
    );
    expect(report.smoke_test.contract.some((c) => c.domain === 'CUSTOMER')).toBe(true);
    expect(report.smoke_test.contract.every((c) => c.money_movement === false)).toBe(true);
  });
});

describe('S118 compose + fail-closed regression', () => {
  it('composes S117/S116 and does not bypass S87', () => {
    expect(evaluateProductionFoundationActivationPreparation().can_production_launch).toBe('NO');
    expect(evaluateProductionSecurityGate().external_pentest_passed).toBe('NO');
    const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
    expect(launch.can_production_launch).toBe('NO');
    expect(assertNoSecretLeak(JSON.stringify(evaluateProductionReleaseEngineeringReadiness()))).toBe(
      true,
    );
  });

  it('no India hardcoding / no invented deploy URLs', () => {
    const blob = JSON.stringify(evaluateProductionReleaseEngineeringReadiness());
    expect(blob).not.toMatch(/\bUPI\b|\bINR\b|₹|\+91|\bIST\b/);
    expect(blob).not.toMatch(/sk_live_|BEGIN PRIVATE KEY/);
    expect(blob).not.toMatch(/amazonaws\.com|googleapis\.com|azure\.com/);
  });
});
