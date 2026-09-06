/**
 * Sprint 147 — Production managed backup + PITR activation control (unit).
 * No invented providers / snapshots / PITR proof; secrets never printed. S141 not rebuilt.
 */
import { ProblemException } from '../common/problem';
import { assertNoSecretLeak } from './secret-redaction';
import { evaluateSecretsManagerRuntimeResolver } from './secrets-manager-runtime-resolver';
import { evaluateObservabilityApmMonitoringAlertingProductionActivationPath } from './observability-apm-monitoring-alerting-production-activation-path';
import { evaluateProductionDeploymentTargetActivationPath } from './production-deployment-target-activation-path';
import { evaluateProductionDatabaseActivationPath } from './production-database-activation-path';
import { evaluateRealBackupFirstOnboarding } from './backup-real-activation-first-onboarding';
import {
  CLIENT_RESTORE_ACCESS_DENIED,
  FORGED_BACKUP_STATE_REJECTED,
  FORGED_DB_BINDING_REJECTED,
  FORGED_RECOVERY_POINT_REJECTED,
  MOCK_BACKUP_ADAPTER_BLOCKED,
  NO_PRODUCTION_BACKUP_ADAPTER,
  NO_PRODUCTION_DR_ENVIRONMENT,
  NO_PRODUCTION_MANAGED_BACKUP_PITR,
  NO_PRODUCTION_PITR,
  PRODUCTION_BACKUP_ACTIVATION_BLOCKED,
  PRODUCTION_RESTORE_EXTERNAL_GATED,
  RPO_RTO_NOT_YET_PROVEN,
  assertProductionBackupActivationAllowed,
  assertProductionRestoreAuthorized,
  evaluateManagedBackupVerificationChecks,
  evaluatePitrVerificationContract,
  evaluateProductionDatabaseBinding,
  evaluateProductionManagedBackupPitrActivationPath,
  evaluateRestoreSafetyContract,
  presentManagedBackupSecretReferences,
  readConfiguredManagedBackupProvider,
  registerProductionBackupAdapter,
  rejectForgedBackupState,
  rejectForgedDbBinding,
  rejectForgedRecoveryPoint,
  selectManagedBackupProviderAdapter,
} from './production-managed-backup-pitr-activation-path';

describe('S147 production managed backup + PITR activation control', () => {
  afterEach(() => {
    delete process.env.INFRASTRUCTURE_ENVIRONMENT;
    delete process.env.MANAGED_BACKUP_PROVIDER;
    delete process.env.BACKUP_PROVIDER;
    delete process.env.BACKUP_CREDENTIAL_SECRET_REF;
    delete process.env.PRODUCTION_DATABASE_IDENTITY_REF;
    delete process.env.PRODUCTION_DATABASE_TARGET_REF;
    registerProductionBackupAdapter(null);
  });

  it('reports SOFTWARE_COMPLETE / NOT_SELECTED / not enabled / S141 not rebuilt', () => {
    const report = evaluateProductionManagedBackupPitrActivationPath();
    expect(report.sprint).toBe(147);
    expect(report.software_activation_path).toBe('COMPLETE');
    expect(report.s141_rebuilt).toBe(false);
    expect(report.parallel_backup_system_created).toBe(false);
    expect(report.lifecycle).toBe('NOT_SELECTED');
    expect(report.enabled).toBe(false);
    expect(report.verified).toBe(false);
    expect(report.fake_infrastructure_invented).toBe(false);
    expect(report.fake_snapshots_invented).toBe(false);
    expect(report.fake_pitr_claimed).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_MANAGED_BACKUP_PITR);
    expect(report.composed_foundations.s141).toBe('REUSED_NOT_REBUILT');
    expect(report.composed_foundations.s146).toBe('COMPOSED');
    expect(report.admin_summary.external_gated).toBe(true);
    expect(report.secrets_printed).toBe(false);
    expect(assertNoSecretLeak(JSON.stringify(report))).toBe(true);
  });

  it('binds to S146 production DB and rejects local/sandbox as production readiness', () => {
    const binding = evaluateProductionDatabaseBinding();
    expect(binding.bound).toBe(false);
    expect(binding.acceptable).toBe(false);
    expect(binding.s146_enabled).toBe(false);

    const report = evaluateProductionManagedBackupPitrActivationPath();
    expect(report.environment_isolation.local_backup_neq_production).toBe(true);
    expect(report.environment_isolation.sandbox_restore_neq_production).toBe(true);
    expect(report.database_binding.blocker).toMatch(/NO_PRODUCTION_DATABASE|BINDING_REJECTED/);
  });

  it('provider gating: mock rejected; adapter fail-closed EXTERNAL_GATED', () => {
    process.env.MANAGED_BACKUP_PROVIDER = 'PG_DUMP';
    const rejected = readConfiguredManagedBackupProvider();
    expect(rejected.selected).toBe(false);
    expect(rejected.mock_rejected).toBe(true);

    const adapter = selectManagedBackupProviderAdapter();
    expect(adapter.name).toBe('fail_closed_production_backup');
    registerProductionBackupAdapter(null);
    const report = evaluateProductionManagedBackupPitrActivationPath();
    expect(report.provider.state).toBe('NOT_SELECTED');
    expect(report.adapter.selected).toBe('fail_closed_production_backup');
  });

  it('secrets integration: presence-only refs via S142', () => {
    process.env.BACKUP_CREDENTIAL_SECRET_REF = 'sm://backup/prod/token';
    const refs = presentManagedBackupSecretReferences();
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.every((r) => r.value_leaked === false)).toBe(true);
    expect(assertNoSecretLeak(JSON.stringify(refs))).toBe(true);
  });

  it('RPO/RTO remain TARGET_DEFINED / NOT_YET_PROVEN (never achieved)', () => {
    const report = evaluateProductionManagedBackupPitrActivationPath();
    expect(report.rpo_rto.rpo_target).toBe('15m');
    expect(report.rpo_rto.rto_target).toBe('4h');
    expect(report.rpo_rto.status).toBe('TARGET_DEFINED');
    expect(report.rpo_rto.rpo_achievement).toBe('NOT_YET_PROVEN');
    expect(report.rpo_rto.rto_achievement).toBe('NOT_YET_PROVEN');
    expect(report.rpo_rto.blocker).toBe(RPO_RTO_NOT_YET_PROVEN);
  });

  it('backup + PITR verification + DR remain EXTERNAL_GATED', () => {
    const checks = evaluateManagedBackupVerificationChecks();
    expect(checks.blockers.length).toBeGreaterThan(0);
    expect(checks.blockers).toEqual(
      expect.arrayContaining([NO_PRODUCTION_BACKUP_ADAPTER]),
    );

    const pitr = evaluatePitrVerificationContract();
    expect(pitr.pitr_capability_configured).toBe(false);
    expect(pitr.blocker).toBe(NO_PRODUCTION_PITR);

    const report = evaluateProductionManagedBackupPitrActivationPath();
    expect(report.dr_environment.remaining_blocker).toBe(NO_PRODUCTION_DR_ENVIRONMENT);
    expect(report.dr_environment.enabled).toBe(false);
  });

  it('restore safety: authorization required; client restore denied', () => {
    const restore = evaluateRestoreSafetyContract();
    expect(restore.production_restore_proven).toBe(false);
    expect(restore.client_browser_restore_forbidden).toBe(true);
    expect(restore.s141_rebuilt).toBe(false);

    expect(() =>
      assertProductionRestoreAuthorized('s147', {
        kind: 'client_browser',
        service_id: 'browser',
      }),
    ).toThrow(ProblemException);
    try {
      assertProductionRestoreAuthorized('s147', {
        kind: 'client_browser',
        service_id: 'browser',
      });
    } catch (err) {
      expect([CLIENT_RESTORE_ACCESS_DENIED, 'CLIENT_DEPLOYMENT_ACCESS_DENIED']).toContain(
        (err as ProblemException).code,
      );
    }

    try {
      assertProductionRestoreAuthorized('s147', {
        kind: 'server_service',
        service_id: 'restore-controller',
      });
    } catch (err) {
      expect((err as ProblemException).code).toBe(PRODUCTION_RESTORE_EXTERNAL_GATED);
    }
  });

  it('deployment dependency not loosened; S145 deployable stays false', () => {
    const report = evaluateProductionManagedBackupPitrActivationPath();
    expect(report.deployment_gate.production_deployable).toBe(false);
    expect(report.deployment_gate.loosened_for_green_status).toBe(false);
    expect(report.deployment_gate.backup_blocker).toBe(NO_PRODUCTION_MANAGED_BACKUP_PITR);
    expect(report.s145_snapshot.deployable).toBe(false);
  });

  it('fail-closed: forged state + unauthorized activation', () => {
    try {
      rejectForgedBackupState({ lifecycle: 'ENABLED', enabled: true });
    } catch (err) {
      expect((err as ProblemException).code).toBe(FORGED_BACKUP_STATE_REJECTED);
    }
    try {
      rejectForgedRecoveryPoint({ recovery_point_id: 'rp-fake', verified: true });
    } catch (err) {
      expect((err as ProblemException).code).toBe(FORGED_RECOVERY_POINT_REJECTED);
    }
    try {
      rejectForgedDbBinding({ identity_ref: 'db-fake', bound: true });
    } catch (err) {
      expect((err as ProblemException).code).toBe(FORGED_DB_BINDING_REJECTED);
    }

    process.env.INFRASTRUCTURE_ENVIRONMENT = 'production';
    process.env.MANAGED_BACKUP_PROVIDER = 'MOCK';
    try {
      assertProductionBackupActivationAllowed('s147', {
        kind: 'server_service',
        service_id: 'backup-controller',
      });
    } catch (err) {
      expect([
        MOCK_BACKUP_ADAPTER_BLOCKED,
        PRODUCTION_BACKUP_ACTIVATION_BLOCKED,
      ]).toContain((err as ProblemException).code);
    }
  });

  it('S108/S142/S143/S145/S146 regression composition', () => {
    const s108 = evaluateRealBackupFirstOnboarding();
    const s142 = evaluateSecretsManagerRuntimeResolver();
    const s143 = evaluateObservabilityApmMonitoringAlertingProductionActivationPath();
    const s145 = evaluateProductionDeploymentTargetActivationPath();
    const s146 = evaluateProductionDatabaseActivationPath();
    const s147 = evaluateProductionManagedBackupPitrActivationPath({
      correlation_id: 'corr-s147',
    });
    expect(s108.production_backup_enabled).toBe(false);
    expect(s142.secrets_manager_runtime_resolver).toBe('SOFTWARE_COMPLETE');
    expect(s143.software_activation_path).toBe('COMPLETE');
    expect(s145.deployable).toBe(false);
    expect(s146.enabled).toBe(false);
    expect(s147.release_event_sample.secrets_printed).toBe(false);
    expect(s147.release_event_sample.correlation_id).toBe('corr-s147');
    expect(assertNoSecretLeak(JSON.stringify(s147))).toBe(true);
  });
});
