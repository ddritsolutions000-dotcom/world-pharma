/**
 * Sprint 119 — Real production deployment target activation contract.
 */
import {
  NO_PRODUCTION_DEPLOYMENT_TARGET,
  NO_PRODUCTION_SECRETS_MANAGER,
  NO_PRODUCTION_DATABASE,
  PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
  buildDeploymentTargetReferenceSlots,
  evaluateFailClosedDeploymentCases,
  validateDeploymentTargetActivation,
  validateDeploymentTargetActivationForFixture,
  evaluateProductionDeploymentTargetActivation,
} from './production-deployment-target-activation-contract';
import { EXTERNAL_PENTEST_REQUIRED } from './production-security-gate-consolidation';
import { evaluateProductionFoundationActivationPreparation } from './production-foundation-activation-preparation';
import { evaluateProductionReleaseEngineeringReadiness } from './production-release-engineering-readiness';
import { evaluateProductionSecurityGate } from './production-security-gate-consolidation';
import { evaluateProductionLaunchControl } from './production-launch-control';
import { assertNoSecretLeak } from './secret-redaction';

describe('S119 deployment target activation', () => {
  it('lifecycle NOT_CONFIGURED / deployable false / no invented infra', () => {
    const report = evaluateProductionDeploymentTargetActivation();
    expect(report.sprint).toBe(119);
    expect(report.authoritative_source).toBe('production-deployment-target-activation-contract');
    expect(report.parallel_deployment_state_machine_created).toBe(false);
    expect(report.parallel_readiness_framework_created).toBe(false);
    expect(report.fake_infrastructure_invented).toBe(false);
    expect(report.deployment_target.lifecycle).toBe('NOT_CONFIGURED');
    expect(report.deployment_target.deployable).toBe(false);
    expect(report.deployment_target.deployed).toBe(false);
    expect(report.activation_validation.deployable).toBe(false);
    expect(report.activation_validation.lifecycle).toBe('NOT_CONFIGURED');
    expect(report.admin_summary.production_environment).toBe('NOT_CONFIGURED');
    expect(report.admin_summary.deployment_target).toBe('NOT_CONFIGURED');
    expect(report.admin_summary.release_pipeline).toBe('NOT_CONFIGURED');
    expect(report.admin_summary.production_database).toBe('NOT_CONFIGURED');
    expect(report.admin_summary.secrets_manager).toBe('NOT_CONFIGURED');
    expect(report.admin_summary.rollback_proven).toBe('NOT_PROVEN');
    expect(report.admin_summary.security_certification).toBe('PENDING');
    expect(report.admin_summary.security_blocker).toBe(EXTERNAL_PENTEST_REQUIRED);
    expect(report.production_configuration.sandbox_production_separation).toBe('PASS');
    expect(report.production_configuration.cannot_resolve_to).toEqual(
      expect.arrayContaining(['sandbox', 'mock_psp', 'console_otp']),
    );
    expect(report.force_launch_available).toBe(false);
    expect(report.force_deploy_available).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_DEPLOYMENT_TARGET);
    expect(report.reference_slots.every((s) => s.value_present === false && s.invented === false)).toBe(
      true,
    );
    expect(buildDeploymentTargetReferenceSlots().length).toBeGreaterThanOrEqual(10);
  });

  it('fail-closed cases 1–7 all block deploy', () => {
    const cases = evaluateFailClosedDeploymentCases();
    expect(cases).toHaveLength(7);
    expect(cases.every((c) => c.blocked === true && c.deployable === false)).toBe(true);
    expect(cases[0]!.primary_blocker).toBe(NO_PRODUCTION_DEPLOYMENT_TARGET);
    expect(cases[1]!.primary_blocker).toBe(NO_PRODUCTION_SECRETS_MANAGER);
    expect(cases[2]!.primary_blocker).toBe(NO_PRODUCTION_DATABASE);
    expect(cases[3]!.primary_blocker).toBe(EXTERNAL_PENTEST_REQUIRED);
    expect(cases[4]!.primary_blocker).toBe('NO_PRODUCTION_PROVIDER_RAILS');
    expect(cases[5]!.primary_blocker).toBe(PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN);
    expect(cases[6]!.primary_blocker).toBe(PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN);

    const live = validateDeploymentTargetActivation({});
    expect(live.deployable).toBe(false);
    expect(live.lifecycle).toBe('NOT_CONFIGURED');
  });

  it('sandbox adapter / points-to-sandbox fixtures are INVALID', () => {
    const sandbox = validateDeploymentTargetActivationForFixture({
      production_environment: true,
      environment_isolated_from_sandbox: true,
      deployment_target: true,
      deployment_mechanism: true,
      artifact_source: true,
      secrets_manager: true,
      production_db_reference: true,
      health_endpoint: true,
      readiness_endpoint: true,
      rollback_target: true,
      security_edge_controls: true,
      provider_rails_satisfied: true,
      release_security_gates_pass: true,
      sandbox_adapter_selected_for_production: true,
    });
    expect(sandbox.deployable).toBe(false);
    expect(sandbox.primary_blocker).toBe(PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN);
  });
});

describe('S119 compose + regression', () => {
  it('composes S117/S118/S116 and does not bypass S87', () => {
    expect(evaluateProductionFoundationActivationPreparation().can_production_launch).toBe('NO');
    expect(evaluateProductionReleaseEngineeringReadiness().can_production_launch).toBe('NO');
    expect(evaluateProductionSecurityGate().external_pentest_passed).toBe('NO');
    expect(
      evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' })
        .can_production_launch,
    ).toBe('NO');
    expect(
      assertNoSecretLeak(JSON.stringify(evaluateProductionDeploymentTargetActivation())),
    ).toBe(true);
  });

  it('no India hardcoding / no invented cloud URLs', () => {
    const blob = JSON.stringify(evaluateProductionDeploymentTargetActivation());
    expect(blob).not.toMatch(/\bUPI\b|\bINR\b|₹|\+91|\bIST\b/);
    expect(blob).not.toMatch(/sk_live_|BEGIN PRIVATE KEY/);
    expect(blob).not.toMatch(/amazonaws\.com|googleapis\.com|azurecr\.io/);
  });
});
