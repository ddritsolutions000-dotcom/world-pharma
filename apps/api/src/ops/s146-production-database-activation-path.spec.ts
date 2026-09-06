/**
 * Sprint 146 — Production database activation + cutover safety (unit).
 * No invented production DB / credentials / migration proof; secrets never printed.
 */
import { ProblemException } from '../common/problem';
import { assertNoSecretLeak } from './secret-redaction';
import { NO_PRODUCTION_DATABASE } from './production-foundation-activation-preparation';
import { evaluateSecretsManagerRuntimeResolver } from './secrets-manager-runtime-resolver';
import { evaluateObservabilityApmMonitoringAlertingProductionActivationPath } from './observability-apm-monitoring-alerting-production-activation-path';
import { evaluateDeploymentReleaseEngineeringProductionActivationPath } from './deployment-release-engineering-production-activation-path';
import { evaluateProductionDeploymentTargetActivationPath } from './production-deployment-target-activation-path';
import { evaluateRealBackupFirstOnboarding } from './backup-real-activation-first-onboarding';
import {
  CLIENT_DATABASE_ACCESS_DENIED,
  FORGED_DATABASE_STATE_REJECTED,
  FORGED_MIGRATION_STATE_REJECTED,
  LOCALHOST_DATABASE_BLOCKED_IN_PRODUCTION,
  MOCK_DATABASE_ADAPTER_BLOCKED,
  NO_PRODUCTION_DATABASE_PROVIDER,
  PRODUCTION_DATABASE_ACTIVATION_BLOCKED,
  PRODUCTION_MIGRATION_EXECUTION_EXTERNAL_GATED,
  PRODUCTION_RESTORE_MUST_NOT_TARGET_LIVE,
  SANDBOX_DATABASE_BLOCKED_IN_PRODUCTION,
  assertProductionDatabaseActivationAllowed,
  assertProductionDatabaseTargetSafe,
  assertProductionMigrationAuthorized,
  assertProductionRestoreAuthorized,
  evaluateDatabaseConnectionSafetyContract,
  evaluateMigrationCutoverPrechecks,
  evaluateProductionDatabaseActivationPath,
  evaluateProductionDatabaseVerificationChecks,
  evaluateProductionMigrationExecutionContract,
  presentProductionDatabaseSecretReferences,
  readConfiguredProductionDatabaseProvider,
  rejectForgedDatabaseState,
  rejectForgedMigrationState,
} from './production-database-activation-path';

describe('S146 production database activation + cutover safety', () => {
  afterEach(() => {
    delete process.env.INFRASTRUCTURE_ENVIRONMENT;
    delete process.env.PRODUCTION_DATABASE_PROVIDER;
    delete process.env.DATABASE_PROVIDER;
    delete process.env.PRODUCTION_DATABASE_TARGET_REF;
    delete process.env.PRODUCTION_DATABASE_SECRET_REF;
    delete process.env.PRODUCTION_DATABASE_CONNECTION_REF;
    delete process.env.APP_VERSION;
    delete process.env.GIT_SHA;
    delete process.env.BUILD_TIME;
  });

  it('reports SOFTWARE_COMPLETE / NOT_CONFIGURED / not enabled / composed foundations', () => {
    const report = evaluateProductionDatabaseActivationPath();
    expect(report.sprint).toBe(146);
    expect(report.software_activation_path).toBe('COMPLETE');
    expect(report.secrets_manager_runtime_resolver).toBe('SOFTWARE_COMPLETE');
    expect(report.lifecycle).toBe('NOT_CONFIGURED');
    expect(report.enabled).toBe(false);
    expect(report.verified).toBe(false);
    expect(report.approved).toBe(false);
    expect(report.fake_infrastructure_invented).toBe(false);
    expect(report.fake_credentials_invented).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_DATABASE);
    expect(report.composed_foundations.s142).toBe('COMPOSED');
    expect(report.composed_foundations.s145).toBe('COMPOSED');
    expect(report.parallel_database_abstraction_created).toBe(false);
    expect(report.admin_summary.software_state).toBe('SOFTWARE_COMPLETE');
    expect(report.admin_summary.production_enabled).toBe(false);
    expect(report.admin_summary.external_gated).toBe(true);
    expect(report.secrets_printed).toBe(false);
    expect(report.connection_strings_printed).toBe(false);
    expect(assertNoSecretLeak(JSON.stringify(report))).toBe(true);
  });

  it('enforces environment isolation + production target validation', () => {
    const report = evaluateProductionDatabaseActivationPath();
    expect(report.environment_isolation.development_neq_sandbox).toBe(true);
    expect(report.environment_isolation.staging_neq_production).toBe(true);
    expect(report.environment_isolation.localhost_rejected_in_production).toBe(true);

    expect(() => assertProductionDatabaseTargetSafe('localhost')).toThrow(ProblemException);
    try {
      assertProductionDatabaseTargetSafe('postgresql://u:p@127.0.0.1:5432/worldpharma');
    } catch (err) {
      expect((err as ProblemException).code).toBe(LOCALHOST_DATABASE_BLOCKED_IN_PRODUCTION);
    }
    try {
      assertProductionDatabaseTargetSafe('sandbox-db.example.local');
    } catch (err) {
      expect((err as ProblemException).code).toBe(SANDBOX_DATABASE_BLOCKED_IN_PRODUCTION);
    }
    try {
      assertProductionDatabaseTargetSafe('postgresql://user:secretpass@db.internal/worldpharma');
    } catch (err) {
      expect((err as ProblemException).code).toBe(CLIENT_DATABASE_ACCESS_DENIED);
    }
  });

  it('rejects mock providers; secret refs are presence-only', () => {
    process.env.PRODUCTION_DATABASE_PROVIDER = 'MOCK';
    const rejected = readConfiguredProductionDatabaseProvider();
    expect(rejected.selected).toBe(false);
    expect(rejected.mock_rejected).toBe(true);

    process.env.PRODUCTION_DATABASE_SECRET_REF = 'sm://db/prod/password';
    const refs = presentProductionDatabaseSecretReferences();
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.every((r) => r.value_leaked === false)).toBe(true);
    expect(assertNoSecretLeak(JSON.stringify(refs))).toBe(true);
  });

  it('connection safety reuses Prisma; no second abstraction', () => {
    const safety = evaluateDatabaseConnectionSafetyContract();
    expect(safety.second_database_abstraction_created).toBe(false);
    expect(safety.infrastructure).toBe('EXISTING_PRISMA_CLIENT');
    expect(safety.retry_policy).toBe('FAIL_CLOSED_NO_INFINITE_RETRY');
    expect(safety.credential_leakage_in_errors).toBe(false);
    expect(safety.production_connection_server_side_only).toBe(true);
    expect(safety.pooling.infinite_retry).toBe(false);
  });

  it('migration prechecks + execution remain EXTERNAL_GATED / not authorized', () => {
    const pre = evaluateMigrationCutoverPrechecks();
    expect(pre.lifecycle).toBe('NOT_AUTHORIZED');
    expect(pre.authorized).toBe(false);
    expect(pre.executable).toBe(false);
    expect(pre.checks.map((c) => c.id)).toEqual(
      expect.arrayContaining([
        'target_identity',
        'backup_pitr_readiness',
        'authorization',
        'forward_only_ordering',
      ]),
    );

    const exec = evaluateProductionMigrationExecutionContract();
    expect(exec.external_gated).toBe(true);
    expect(exec.executes_against_sandbox).toBe(false);
    expect(exec.production_migration_proven).toBe(false);
    expect(exec.down_migrations_created).toBe(false);
    expect(exec.blocker).toBe(PRODUCTION_MIGRATION_EXECUTION_EXTERNAL_GATED);
  });

  it('backup/PITR + deployment gates stay fail-closed (not loosened)', () => {
    const report = evaluateProductionDatabaseActivationPath();
    expect(report.restore_dr.s141_rebuilt).toBe(false);
    expect(report.restore_dr.production_restore_authorized).toBe(false);
    expect(report.deployment_gate.production_deployable).toBe(false);
    expect(report.deployment_gate.loosened_for_green_status).toBe(false);
    expect(report.deployment_gate.database_blocker).toBe(NO_PRODUCTION_DATABASE);
    expect(report.deployment_gate.s145_deployable).toBe(false);
  });

  it('S142 + S143 observability integration (safe events)', () => {
    const report = evaluateProductionDatabaseActivationPath({
      correlation_id: 'corr-s146',
    });
    expect(report.s142_snapshot.secrets_manager_runtime_resolver).toBe('SOFTWARE_COMPLETE');
    expect(report.s143_snapshot.production_observability_enabled).toBe(false);
    expect(report.release_event_sample.secrets_printed).toBe(false);
    expect(report.release_event_sample.correlation_id).toBe('corr-s146');
    expect(assertNoSecretLeak(JSON.stringify(report.release_event_sample))).toBe(true);
  });

  it('fail-closed: unauthorized activation/migration/restore + forged state', () => {
    expect(() =>
      assertProductionDatabaseActivationAllowed('s146', {
        kind: 'client_browser',
        service_id: 'browser',
      }),
    ).toThrow(ProblemException);
    try {
      assertProductionDatabaseActivationAllowed('s146', {
        kind: 'client_browser',
        service_id: 'browser',
      });
    } catch (err) {
      expect([CLIENT_DATABASE_ACCESS_DENIED, 'CLIENT_DEPLOYMENT_ACCESS_DENIED']).toContain(
        (err as ProblemException).code,
      );
    }

    expect(() =>
      assertProductionMigrationAuthorized('s146', {
        kind: 'server_service',
        service_id: 'migrator',
      }),
    ).toThrow(ProblemException);
    try {
      assertProductionMigrationAuthorized('s146', {
        kind: 'server_service',
        service_id: 'migrator',
      });
    } catch (err) {
      expect((err as ProblemException).code).toBe(PRODUCTION_MIGRATION_EXECUTION_EXTERNAL_GATED);
    }

    try {
      assertProductionRestoreAuthorized('s146', {
        kind: 'server_service',
        service_id: 'restore',
      }, 'live-primary-prod');
    } catch (err) {
      expect((err as ProblemException).code).toBe(PRODUCTION_RESTORE_MUST_NOT_TARGET_LIVE);
    }

    try {
      rejectForgedDatabaseState({ lifecycle: 'ENABLED', enabled: true });
    } catch (err) {
      expect((err as ProblemException).code).toBe(FORGED_DATABASE_STATE_REJECTED);
    }
    try {
      rejectForgedMigrationState({ lifecycle: 'VERIFIED', executed: true });
    } catch (err) {
      expect((err as ProblemException).code).toBe(FORGED_MIGRATION_STATE_REJECTED);
    }

    process.env.INFRASTRUCTURE_ENVIRONMENT = 'production';
    process.env.PRODUCTION_DATABASE_PROVIDER = 'SANDBOX';
    try {
      assertProductionDatabaseActivationAllowed('s146', {
        kind: 'server_service',
        service_id: 'db-controller',
      });
    } catch (err) {
      expect([
        MOCK_DATABASE_ADAPTER_BLOCKED,
        PRODUCTION_DATABASE_ACTIVATION_BLOCKED,
      ]).toContain((err as ProblemException).code);
    }
  });

  it('verification checks emit explicit blockers; no silent sandbox downgrade', () => {
    const checks = evaluateProductionDatabaseVerificationChecks();
    expect(checks.all_required_present).toBe(false);
    expect(checks.blockers).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /MISSING_|NO_PRODUCTION_|PRODUCTION_DATABASE_|MOCK_/,
        ),
      ]),
    );
    expect(checks.blockers).toEqual(
      expect.arrayContaining([NO_PRODUCTION_DATABASE_PROVIDER]),
    );
  });

  it('S108/S142/S143/S144/S145 regression composition', () => {
    const s108 = evaluateRealBackupFirstOnboarding();
    const s142 = evaluateSecretsManagerRuntimeResolver();
    const s143 = evaluateObservabilityApmMonitoringAlertingProductionActivationPath();
    const s144 = evaluateDeploymentReleaseEngineeringProductionActivationPath();
    const s145 = evaluateProductionDeploymentTargetActivationPath();
    const s146 = evaluateProductionDatabaseActivationPath();
    expect(s108.remaining_blocker).toMatch(/NO_PRODUCTION/);
    expect(s142.secrets_manager_runtime_resolver).toBe('SOFTWARE_COMPLETE');
    expect(s143.software_activation_path).toBe('COMPLETE');
    expect(s144.actually_deployed).toBe(false);
    expect(s145.deployable).toBe(false);
    expect(s146.remaining_blocker).toBe(NO_PRODUCTION_DATABASE);
    expect(assertNoSecretLeak(JSON.stringify(s146))).toBe(true);
  });
});
