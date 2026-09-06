/**
 * Sprint 144 — Production deployment + release-engineering closure (unit).
 * No invented deploy targets / no fake production evidence / secrets never printed.
 */
import { ProblemException } from '../common/problem';
import { assertNoSecretLeak } from './secret-redaction';
import { NO_PRODUCTION_DEPLOYMENT_TARGET } from './production-deployment-requirements';
import { evaluateSecretsManagerRuntimeResolver } from './secrets-manager-runtime-resolver';
import { evaluateObservabilityApmMonitoringAlertingProductionActivationPath } from './observability-apm-monitoring-alerting-production-activation-path';
import {
  CLIENT_DEPLOYMENT_ACCESS_DENIED,
  FORGED_ARTIFACT_IDENTITY_REJECTED,
  FORGED_DEPLOYMENT_STATE_REJECTED,
  PRODUCTION_DEPLOYMENT_EXECUTION_BLOCKED,
  ROLLBACK_SCHEMA_BACKWARD_FORBIDDEN,
  assertProductionDeploymentExecutionAllowed,
  assertReleaseCallerAuthorized,
  buildSafeReleaseEvent,
  evaluateDeploymentReleaseEngineeringProductionActivationPath,
  evaluateRollbackAuthorization,
  listCicdPipelineStageContracts,
  listProductionConfigurationGates,
  readArtifactIdentityPresence,
  rejectForgedArtifactIdentity,
  rejectForgedDeploymentState,
} from './deployment-release-engineering-production-activation-path';

describe('S144 deployment release engineering production activation path', () => {
  afterEach(() => {
    delete process.env.INFRASTRUCTURE_ENVIRONMENT;
    delete process.env.APP_VERSION;
    delete process.env.GIT_SHA;
    delete process.env.BUILD_TIME;
  });

  it('reports SOFTWARE_COMPLETE / NOT_CONFIGURED / not deployed / S142+S143 composed', () => {
    const report = evaluateDeploymentReleaseEngineeringProductionActivationPath();
    expect(report.sprint).toBe(144);
    expect(report.software_activation_path).toBe('COMPLETE');
    expect(report.secrets_manager_runtime_resolver).toBe('SOFTWARE_COMPLETE');
    expect(report.lifecycle).toBe('NOT_CONFIGURED');
    expect(report.actually_deployed).toBe(false);
    expect(report.production_deployable).toBe(false);
    expect(report.production_enabled).toBe(false);
    expect(report.fake_infrastructure_invented).toBe(false);
    expect(report.fake_ci_credentials_invented).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_DEPLOYMENT_TARGET);
    expect(report.composed_foundations.s99).toBe('COMPOSED');
    expect(report.composed_foundations.s119).toBe('COMPOSED');
    expect(report.composed_foundations.s142).toBe('COMPOSED');
    expect(report.composed_foundations.s143).toBe('COMPOSED');
    expect(report.composed_foundations.s131_gap).toBe('CLOSED_BY_S142');
    expect(report.admin_summary.software_state).toBe('SOFTWARE_COMPLETE');
    expect(report.admin_summary.production_deployed).toBe(false);
    expect(report.secrets_printed).toBe(false);
    expect(assertNoSecretLeak(JSON.stringify(report))).toBe(true);
  });

  it('enforces environment isolation + configuration gates', () => {
    const report = evaluateDeploymentReleaseEngineeringProductionActivationPath();
    expect(report.environment_isolation.development_neq_sandbox).toBe(true);
    expect(report.environment_isolation.staging_neq_production).toBe(true);
    expect(
      report.environment_isolation.production_rejects_sandbox_db_mock_providers_local_storage_dotenv,
    ).toBe(true);
    expect(report.distinctions.software_ready_neq_production_deployable).toBe(true);
    expect(report.distinctions.ci_validate_only_neq_production_pipeline).toBe(true);
    const gates = listProductionConfigurationGates();
    expect(gates.map((g) => g.domain)).toEqual(
      expect.arrayContaining([
        'secrets_manager',
        'observability_apm',
        'deployment_target',
        'backup_pitr_dr',
      ]),
    );
  });

  it('artifact identity is presence-only and safe', () => {
    process.env.APP_VERSION = '1.2.3';
    process.env.GIT_SHA = 'abcdef1234567890';
    process.env.BUILD_TIME = '2026-09-05T00:00:00Z';
    const id = readArtifactIdentityPresence();
    expect(id.identity_present).toBe(true);
    expect(id.app_version).toBe('1.2.3');
    expect(id.secrets_printed).toBe(false);
    const event = buildSafeReleaseEvent({
      event_type: 'release_gate',
      deployment_state: 'NOT_CONFIGURED',
      correlation_id: 'corr-s144',
    });
    expect(event.secrets_printed).toBe(false);
    expect(event.phi_printed).toBe(false);
    expect(assertNoSecretLeak(JSON.stringify(event))).toBe(true);
  });

  it('CI/CD stages are validate-only / EXTERNAL_GATED for production deploy', () => {
    const stages = listCicdPipelineStageContracts();
    expect(stages.map((s) => s.id)).toEqual(
      expect.arrayContaining([
        'install',
        'unit_tests',
        'production_build',
        'migration_validation',
        'deployment_readiness_gate',
        'release_evidence',
      ]),
    );
    expect(
      stages.every(
        (s) =>
          s.production_status === 'VALIDATE_ONLY' ||
          s.production_status === 'EXTERNAL_GATED' ||
          s.production_status === 'NOT_CONFIGURED',
      ),
    ).toBe(true);
  });

  it('fail-closed: unauthorized callers + forged state + production execution', () => {
    expect(() =>
      assertReleaseCallerAuthorized({ kind: 'client_browser', service_id: 'browser' }),
    ).toThrow(ProblemException);
    try {
      assertReleaseCallerAuthorized({ kind: 'client_browser', service_id: 'browser' });
    } catch (err) {
      expect((err as ProblemException).code).toBe(CLIENT_DEPLOYMENT_ACCESS_DENIED);
    }

    expect(() =>
      rejectForgedDeploymentState({ lifecycle: 'DEPLOYED', deployed: true }),
    ).toThrow(ProblemException);
    try {
      rejectForgedDeploymentState({ lifecycle: 'DEPLOYED', deployed: true });
    } catch (err) {
      expect((err as ProblemException).code).toBe(FORGED_DEPLOYMENT_STATE_REJECTED);
    }

    expect(() => rejectForgedArtifactIdentity({ git_sha: 'deadbeef' })).toThrow(
      ProblemException,
    );
    try {
      rejectForgedArtifactIdentity({ git_sha: 'deadbeef' });
    } catch (err) {
      expect((err as ProblemException).code).toBe(FORGED_ARTIFACT_IDENTITY_REJECTED);
    }

    process.env.INFRASTRUCTURE_ENVIRONMENT = 'production';
    expect(() =>
      assertProductionDeploymentExecutionAllowed('s144', {
        kind: 'server_service',
        service_id: 'release-controller',
      }),
    ).toThrow(ProblemException);
    try {
      assertProductionDeploymentExecutionAllowed('s144', {
        kind: 'server_service',
        service_id: 'release-controller',
      });
    } catch (err) {
      expect((err as ProblemException).code).toBe(PRODUCTION_DEPLOYMENT_EXECUTION_BLOCKED);
    }
  });

  it('rollback: forward-only schema; production proof EXTERNAL_GATED', () => {
    const auth = evaluateRollbackAuthorization();
    expect(auth.authorized).toBe(false);
    expect(auth.production_rollback_proven).toBe(false);
    expect(auth.schema_backward_rollback).toBe('FORBIDDEN_FORWARD_ONLY');
    expect(auth.sandbox_rollback_may_be_proven).toBe(true);

    expect(() =>
      evaluateRollbackAuthorization({ request_schema_down_migration: true }),
    ).toThrow(ProblemException);
    try {
      evaluateRollbackAuthorization({ request_schema_down_migration: true });
    } catch (err) {
      expect((err as ProblemException).code).toBe(ROLLBACK_SCHEMA_BACKWARD_FORBIDDEN);
    }
  });

  it('migration safety + fail-closed deployment cases composed', () => {
    const report = evaluateDeploymentReleaseEngineeringProductionActivationPath();
    expect(report.migration_safety.status).toBe('SOFTWARE_READY_EXTERNAL_GATED');
    expect(report.fail_closed_cases.length).toBeGreaterThan(0);
    expect(report.backup_dr_acknowledgement.production_backup_enabled).toBe(false);
  });

  it('S142 + S143 regression composition', () => {
    const s142 = evaluateSecretsManagerRuntimeResolver();
    const s143 = evaluateObservabilityApmMonitoringAlertingProductionActivationPath();
    const s144 = evaluateDeploymentReleaseEngineeringProductionActivationPath();
    expect(s142.secrets_manager_runtime_resolver).toBe('SOFTWARE_COMPLETE');
    expect(s143.software_activation_path).toBe('COMPLETE');
    expect(s144.s142_snapshot.secrets_manager_runtime_resolver).toBe('SOFTWARE_COMPLETE');
    expect(s144.s143_snapshot.production_observability_enabled).toBe(false);
    expect(assertNoSecretLeak(JSON.stringify(s142))).toBe(true);
    expect(assertNoSecretLeak(JSON.stringify(s143))).toBe(true);
  });
});
