/**
 * Sprint 83 — Backup / PITR / DR activation readiness (no fake managed PITR).
 */
import {
  NO_PRODUCTION_DR_ENVIRONMENT,
  NO_PRODUCTION_MANAGED_BACKUP,
  NO_PRODUCTION_MANAGED_BACKUP_PITR,
  NO_PRODUCTION_PITR,
  buildDrRunbookSummary,
  evaluateBackupEnablementGuard,
  evaluateProductionBackupFirstOnboarding,
  isMockOrSandboxBackupProvider,
  listBackupLegalComplianceGateItems,
  validateBackupConfiguration,
} from './production-backup-first-onboarding';
import { getRecoveryObjectives } from './recovery-targets';
import { evaluateProviderActivation } from './provider-activation';
import { getProviderActivationContract } from './provider-activation-contracts';

describe('S83 backup availability', () => {
  it('reports NOT_SELECTED / EXTERNAL_GATED — granular blockers', () => {
    const report = evaluateProductionBackupFirstOnboarding();
    expect(report.sprint).toBeGreaterThanOrEqual(83);
    expect(report.foundation_sprint).toBeGreaterThanOrEqual(74);
    expect(report.backup.provider).toBe('NOT_SELECTED');
    expect(report.pitr.provider).toBe('NOT_SELECTED');
    expect(report.real_managed_backup_available).toBe(false);
    expect(report.real_pitr_available).toBe(false);
    expect(report.backup.production).toBe('EXTERNAL_GATED');
    expect(report.pitr.production).toBe('EXTERNAL_GATED');
    expect(report.restore.production).toBe('EXTERNAL_GATED');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_MANAGED_BACKUP_PITR);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        NO_PRODUCTION_MANAGED_BACKUP_PITR,
        NO_PRODUCTION_MANAGED_BACKUP,
        NO_PRODUCTION_PITR,
        NO_PRODUCTION_DR_ENVIRONMENT,
      ]),
    );
    expect(report.object_recovery).toBe('PRIVATE_STORAGE_EXTERNAL_GATED');
    expect(report.kms_encryption_dependency).toBe('KMS_EXTERNAL_GATED');
    expect(report.rpo.target).toBe('15m');
    expect(report.rto.target).toBe('4h');
    expect(report.rpo.achievement).toBe('NOT_YET_PROVEN');
    expect(report.rto.achievement).toBe('NOT_YET_PROVEN');
    expect(report.fake_backup_provider_invented).toBe(false);
    expect(report.fake_pitr_checkpoint_invented).toBe(false);
    expect(report.fake_rpo_rto_verified).toBe(false);
    expect(report.enablement_guard.can_enable).toBe(false);
    expect(report.native_android).toBe('DEVICE_NOT_AVAILABLE');
  });
});

describe('S83 DR runbook + permissions', () => {
  it('documents runbook steps and isolated restore safety', () => {
    const book = buildDrRunbookSummary();
    expect(book.source).toBe('S63_DISASTER_RECOVERY_RUNBOOK');
    expect(book.steps).toContain('restore_database_isolated');
    expect(book.steps).toContain('restore_object_storage_dependencies');
    expect(book.production_class_restore).toBe('EXTERNAL_GATED');

    const report = evaluateProductionBackupFirstOnboarding();
    expect(report.permission_model.no_restore_over_active_db).toBe(true);
    expect(report.permission_model.phi_remains_access_controlled).toBe(true);
    expect(report.observability.no_phi_dumps).toBe(true);
    expect(report.backup_vs_migration).toBe('BACKUP_NOT_EQUIVALENT_TO_MIGRATION_HISTORY');
    expect(report.data_residency).toBe('POLICY_DRIVEN');
  });
});

describe('S83 enablement guard', () => {
  it('never enables without managed backup', () => {
    const guard = evaluateBackupEnablementGuard({
      nonSandboxManagedBackupRegistered: false,
      nonSandboxPitrRegistered: true,
      infrastructureEnvironment: 'production',
      pitrLiveEnabled: true,
      humanApproved: true,
      encryptedOffsiteRetention: true,
      restoreDrillProvenOnProductionClass: true,
      objectStorageRecoveryReady: true,
      kmsReady: true,
      legalComplianceClear: true,
      monitoringReady: true,
      emergencyDisabled: false,
      drEnvironmentReady: true,
    });
    expect(guard.can_enable).toBe(false);
  });

  it('blocks when DR environment missing', () => {
    const guard = evaluateBackupEnablementGuard({
      nonSandboxManagedBackupRegistered: true,
      nonSandboxPitrRegistered: true,
      infrastructureEnvironment: 'production',
      pitrLiveEnabled: true,
      humanApproved: true,
      encryptedOffsiteRetention: true,
      restoreDrillProvenOnProductionClass: true,
      objectStorageRecoveryReady: true,
      kmsReady: true,
      legalComplianceClear: true,
      monitoringReady: true,
      emergencyDisabled: false,
      drEnvironmentReady: false,
    });
    expect(guard.can_enable).toBe(false);
  });

  it('requires full checklist', () => {
    const guard = evaluateBackupEnablementGuard({
      nonSandboxManagedBackupRegistered: true,
      nonSandboxPitrRegistered: true,
      infrastructureEnvironment: 'production',
      pitrLiveEnabled: true,
      humanApproved: true,
      encryptedOffsiteRetention: true,
      restoreDrillProvenOnProductionClass: true,
      objectStorageRecoveryReady: true,
      kmsReady: true,
      legalComplianceClear: true,
      monitoringReady: true,
      emergencyDisabled: false,
      drEnvironmentReady: true,
    });
    expect(guard.can_enable).toBe(true);
  });
});

describe('S83 configuration + RPO/RTO', () => {
  it('credentials alone never ENABLED; RPO/RTO stay NOT_YET_PROVEN', () => {
    expect(
      validateBackupConfiguration({
        providerSelected: false,
        nonSandboxManagedBackupRegistered: true,
        infrastructureEnvironment: 'production',
        pitrLiveEnabled: true,
        humanApproved: true,
        managedDbPresent: true,
        encryptedOffsiteRetention: true,
        restoreDrillProvenOnProductionClass: true,
        objectStorageRecoveryReady: true,
        kmsReady: true,
        legalComplianceConfigured: true,
      }),
    ).toBe('NOT_SELECTED');
    const recovery = getRecoveryObjectives();
    expect(recovery.rpo_target).toBe('15m');
    expect(recovery.rto_target).toBe('4h');
    expect(recovery.rpo_achievement).toBe('NOT_YET_PROVEN');
  });
});

describe('S83 sandbox/production fail-closed', () => {
  it('treats LOCAL/PG_DUMP as non-production', () => {
    expect(isMockOrSandboxBackupProvider('LOCAL')).toBe(true);
    expect(isMockOrSandboxBackupProvider('PG_DUMP')).toBe(true);
  });
});

describe('S83 legal gate + globalization', () => {
  it('legal items EXTERNAL_GATED; no INR/UPI/secrets', () => {
    const items = listBackupLegalComplianceGateItems();
    expect(items.every((i) => i.status === 'EXTERNAL_GATED' || i.status === 'BLOCKED')).toBe(true);
    const blob = JSON.stringify(evaluateProductionBackupFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/postgresql:\/\/|password=|BEGIN PRIVATE KEY|eyJ/);
  });

  it('MANAGED_DB_PITR contract remains NOT_SELECTED', () => {
    const row = evaluateProviderActivation(getProviderActivationContract('MANAGED_DB_PITR'));
    expect(row.provider_name).toBe('NOT_SELECTED');
    expect(row.enabled).toBe(false);
  });
});
