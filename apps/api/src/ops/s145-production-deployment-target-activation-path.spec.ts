/**
 * Sprint 145 — Real production deployment target activation (unit).
 * No invented cloud/CI/DB/deploy success; secrets never printed.
 */
import { ProblemException } from '../common/problem';
import { assertNoSecretLeak } from './secret-redaction';
import { NO_PRODUCTION_DEPLOYMENT_TARGET } from './production-deployment-requirements';
import { NO_PRODUCTION_DATABASE } from './production-foundation-activation-preparation';
import { evaluateSecretsManagerRuntimeResolver } from './secrets-manager-runtime-resolver';
import { evaluateObservabilityApmMonitoringAlertingProductionActivationPath } from './observability-apm-monitoring-alerting-production-activation-path';
import { evaluateDeploymentReleaseEngineeringProductionActivationPath } from './deployment-release-engineering-production-activation-path';
import { evaluateProductionDeploymentTargetActivation } from './production-deployment-target-activation-contract';
import {
  ARTIFACT_IDENTITY_AMBIGUOUS,
  CLIENT_DEPLOYMENT_ACCESS_DENIED,
  FORGED_DEPLOYMENT_STATE_REJECTED,
  LOCALHOST_TARGET_BLOCKED_IN_PRODUCTION,
  MOCK_DEPLOYMENT_ADAPTER_BLOCKED,
  NO_PRODUCTION_CI_CD_DEPLOY_PROVIDER,
  NO_PRODUCTION_DEPLOYMENT_ADAPTER,
  PRODUCTION_TARGET_VALIDATION_BLOCKED,
  SANDBOX_TARGET_BLOCKED_IN_PRODUCTION,
  assertProductionDeploymentTargetActivationAllowed,
  assertProductionTargetHostSafe,
  evaluateArtifactIdentityForDeployment,
  evaluateDeploymentTargetVerificationChecks,
  evaluateProductionDeploymentTargetActivationPath,
  listCicdDeployPipelineStages,
  listPostDeployVerificationSequence,
  presentDeploymentSecretReferences,
  readConfiguredProductionDeploymentProvider,
  registerProductionDeploymentAdapter,
  rejectForgedTargetState,
  selectDeploymentProviderAdapter,
} from './production-deployment-target-activation-path';

describe('S145 production deployment target activation path', () => {
  afterEach(() => {
    delete process.env.INFRASTRUCTURE_ENVIRONMENT;
    delete process.env.DEPLOYMENT_PROVIDER;
    delete process.env.CICD_DEPLOY_PROVIDER;
    delete process.env.DEPLOYMENT_TARGET_REF;
    delete process.env.APP_VERSION;
    delete process.env.GIT_SHA;
    delete process.env.BUILD_TIME;
    delete process.env.DEPLOY_CREDENTIAL_SECRET_REF;
    delete process.env.SECRETS_MANAGER_REF;
    registerProductionDeploymentAdapter(null);
  });

  it('reports SOFTWARE_COMPLETE / NOT_CONFIGURED / not deployed / S119+S144+S142+S143 composed', () => {
    const report = evaluateProductionDeploymentTargetActivationPath();
    expect(report.sprint).toBe(145);
    expect(report.software_activation_path).toBe('COMPLETE');
    expect(report.secrets_manager_runtime_resolver).toBe('SOFTWARE_COMPLETE');
    expect(report.lifecycle).toBe('NOT_CONFIGURED');
    expect(report.deployed).toBe(false);
    expect(report.deployable).toBe(false);
    expect(report.production_enabled).toBe(false);
    expect(report.fake_infrastructure_invented).toBe(false);
    expect(report.fake_ci_credentials_invented).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_DEPLOYMENT_TARGET);
    expect(report.composed_foundations.s119).toBe('COMPOSED');
    expect(report.composed_foundations.s144).toBe('COMPOSED');
    expect(report.composed_foundations.s142).toBe('COMPOSED');
    expect(report.composed_foundations.s143).toBe('COMPOSED');
    expect(report.admin_summary.software_state).toBe('SOFTWARE_COMPLETE');
    expect(report.admin_summary.production_deployed).toBe(false);
    expect(report.admin_summary.current_release).toBeNull();
    expect(report.admin_summary.previous_known_good_release).toBeNull();
    expect(report.secrets_printed).toBe(false);
    expect(assertNoSecretLeak(JSON.stringify(report))).toBe(true);
  });

  it('enforces production environment isolation + host safety', () => {
    const report = evaluateProductionDeploymentTargetActivationPath();
    expect(report.environment_isolation.development_neq_sandbox).toBe(true);
    expect(report.environment_isolation.staging_neq_production).toBe(true);
    expect(report.environment_isolation.localhost_rejected_in_production).toBe(true);

    expect(() => assertProductionTargetHostSafe('localhost')).toThrow(ProblemException);
    try {
      assertProductionTargetHostSafe('http://127.0.0.1:4000');
    } catch (err) {
      expect((err as ProblemException).code).toBe(LOCALHOST_TARGET_BLOCKED_IN_PRODUCTION);
    }
    try {
      assertProductionTargetHostSafe('sandbox-deploy.example.local');
    } catch (err) {
      expect((err as ProblemException).code).toBe(SANDBOX_TARGET_BLOCKED_IN_PRODUCTION);
    }
  });

  it('provider validation rejects mock/sandbox and stays EXTERNAL_GATED', () => {
    process.env.DEPLOYMENT_PROVIDER = 'MOCK';
    const rejected = readConfiguredProductionDeploymentProvider();
    expect(rejected.selected).toBe(false);
    expect(rejected.mock_rejected).toBe(true);

    process.env.INFRASTRUCTURE_ENVIRONMENT = 'production';
    const adapter = selectDeploymentProviderAdapter();
    expect(adapter.name).toBe('fail_closed_production');
    expect(adapter.name).not.toBe('sandbox_noop');

    expect(() =>
      assertProductionDeploymentTargetActivationAllowed('s145', {
        kind: 'server_service',
        service_id: 'deploy-controller',
      }),
    ).toThrow(ProblemException);
    try {
      assertProductionDeploymentTargetActivationAllowed('s145', {
        kind: 'server_service',
        service_id: 'deploy-controller',
      });
    } catch (err) {
      expect([MOCK_DEPLOYMENT_ADAPTER_BLOCKED, PRODUCTION_TARGET_VALIDATION_BLOCKED]).toContain(
        (err as ProblemException).code,
      );
    }
  });

  it('credential references are presence-only; never plaintext', () => {
    process.env.DEPLOY_CREDENTIAL_SECRET_REF = 'sm://deploy/prod/token';
    process.env.SECRETS_MANAGER_REF = 'sm://vault/prod';
    const refs = presentDeploymentSecretReferences();
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.every((r) => r.value_leaked === false)).toBe(true);
    expect(assertNoSecretLeak(JSON.stringify(refs))).toBe(true);
  });

  it('CI/CD deploy stages remain validate-only / EXTERNAL_GATED; no fake pipeline', () => {
    const stages = listCicdDeployPipelineStages();
    expect(stages.map((s) => s.id)).toEqual([
      'SOURCE',
      'BUILD',
      'TEST',
      'ARTIFACT',
      'CONFIG_VALIDATION',
      'MIGRATION_GATE',
      'DEPLOY',
      'HEALTH_CHECK',
      'READINESS_CHECK',
      'RELEASE_EVIDENCE',
    ]);
    const report = evaluateProductionDeploymentTargetActivationPath();
    expect(report.cicd_provider.configured).toBe(false);
    expect(report.cicd_provider.remaining_blocker).toBe(NO_PRODUCTION_CI_CD_DEPLOY_PROVIDER);
    expect(report.cicd_provider.validate_only_ci_remains_valid).toBe(true);
    expect(report.deployed).toBe(false);
  });

  it('artifact identity rejects ambiguous / missing identity', () => {
    const missing = evaluateArtifactIdentityForDeployment();
    expect(missing.acceptable).toBe(false);
    expect(missing.blocker).toBe(ARTIFACT_IDENTITY_AMBIGUOUS);

    process.env.APP_VERSION = '1.2.3';
    process.env.GIT_SHA = 'abcdef1234567890';
    process.env.BUILD_TIME = '2026-09-05T00:00:00Z';
    const ok = evaluateArtifactIdentityForDeployment();
    expect(ok.acceptable).toBe(true);
    expect(ok.identity.app_version).toBe('1.2.3');
    expect(ok.identity.secrets_printed).toBe(false);
  });

  it('database target + migration gate stay fail-closed for production', () => {
    const report = evaluateProductionDeploymentTargetActivationPath();
    expect(report.admin_summary.database_state).toBe(NO_PRODUCTION_DATABASE);
    expect(report.migration_gate.status).toMatch(/EXTERNAL_GATED|SOFTWARE_READY/);
    expect(report.blockers).toEqual(expect.arrayContaining([NO_PRODUCTION_DATABASE]));
  });

  it('S142 + S143 integration + safe release event', () => {
    const report = evaluateProductionDeploymentTargetActivationPath({
      correlation_id: 'corr-s145',
    });
    expect(report.s142_snapshot.secrets_manager_runtime_resolver).toBe('SOFTWARE_COMPLETE');
    expect(report.s143_snapshot.production_observability_enabled).toBe(false);
    expect(report.release_event_sample.secrets_printed).toBe(false);
    expect(report.release_event_sample.phi_printed).toBe(false);
    expect(report.release_event_sample.correlation_id).toBe('corr-s145');
    expect(assertNoSecretLeak(JSON.stringify(report.release_event_sample))).toBe(true);
  });

  it('rollback authorization remains EXTERNAL_GATED / not proven', () => {
    const report = evaluateProductionDeploymentTargetActivationPath();
    expect(report.rollback.authorized).toBe(false);
    expect(report.rollback.production_rollback_proven).toBe(false);
  });

  it('forged target state + unauthorized callers rejected', () => {
    expect(() => rejectForgedTargetState({ lifecycle: 'DEPLOYED', deployed: true })).toThrow(
      ProblemException,
    );
    try {
      rejectForgedTargetState({ lifecycle: 'DEPLOYED', deployed: true });
    } catch (err) {
      expect((err as ProblemException).code).toBe(FORGED_DEPLOYMENT_STATE_REJECTED);
    }

    expect(() =>
      assertProductionDeploymentTargetActivationAllowed('s145', {
        kind: 'client_browser',
        service_id: 'browser',
      }),
    ).toThrow(ProblemException);
    try {
      assertProductionDeploymentTargetActivationAllowed('s145', {
        kind: 'client_browser',
        service_id: 'browser',
      });
    } catch (err) {
      expect((err as ProblemException).code).toBe(CLIENT_DEPLOYMENT_ACCESS_DENIED);
    }
  });

  it('verification checks emit explicit blockers; no silent sandbox downgrade', () => {
    const checks = evaluateDeploymentTargetVerificationChecks();
    expect(checks.all_required_present).toBe(false);
    expect(checks.blockers.length).toBeGreaterThan(0);
    expect(checks.blockers).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/MISSING_|NO_PRODUCTION_|MOCK_/),
      ]),
    );
    expect(checks.blockers).toEqual(
      expect.arrayContaining([NO_PRODUCTION_DEPLOYMENT_ADAPTER]),
    );
  });

  it('S119 + S144 + S142 + S143 regression composition', () => {
    const s119 = evaluateProductionDeploymentTargetActivation();
    const s144 = evaluateDeploymentReleaseEngineeringProductionActivationPath();
    const s142 = evaluateSecretsManagerRuntimeResolver();
    const s143 = evaluateObservabilityApmMonitoringAlertingProductionActivationPath();
    const s145 = evaluateProductionDeploymentTargetActivationPath();
    expect(s119.remaining_blocker).toBe(NO_PRODUCTION_DEPLOYMENT_TARGET);
    expect(s144.actually_deployed).toBe(false);
    expect(s142.secrets_manager_runtime_resolver).toBe('SOFTWARE_COMPLETE');
    expect(s143.software_activation_path).toBe('COMPLETE');
    expect(s145.s119_snapshot.remaining_blocker).toBe(NO_PRODUCTION_DEPLOYMENT_TARGET);
    expect(s145.s144_snapshot.actually_deployed).toBe(false);
    expect(assertNoSecretLeak(JSON.stringify(s145))).toBe(true);
  });
});
