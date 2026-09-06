/**
 * Sprint 96 — Production managed backup / PITR / DR activation readiness
 * (no fake managed PITR / DR infra).
 */
import {
  BACKUP_CREDENTIAL_REFERENCE_MISSING,
  BACKUP_DESTINATION_REFERENCE_MISSING,
  BACKUP_PROVIDER_NOT_SELECTED,
  BACKUP_RETENTION_POLICY_CONFIGURATION_REQUIRED,
  BACKUP_SCHEDULE_CONFIGURATION_REQUIRED,
  DR_ENVIRONMENT_NOT_SELECTED,
  DR_KMS_DEPENDENCY_GATED,
  DR_MONITORING_DEPENDENCY_GATED,
  DR_OBJECT_STORAGE_DEPENDENCY_GATED,
  DR_REGION_REFERENCE_MISSING,
  NO_PRODUCTION_DR_ENVIRONMENT,
  NO_PRODUCTION_MANAGED_BACKUP,
  NO_PRODUCTION_MANAGED_BACKUP_PITR,
  NO_PRODUCTION_PITR,
  PITR_PROVIDER_NOT_SELECTED,
  PITR_RESTORE_ENVIRONMENT_REFERENCE_MISSING,
  PITR_WAL_RETENTION_CONFIGURATION_REQUIRED,
  RPO_RTO_NOT_YET_PROVEN,
  evaluateBackupEnablementGuard,
  evaluateProductionBackupFirstOnboarding,
  validateBackupConfiguration,
} from './production-backup-first-onboarding';
import { validateProductionBackupConfiguration } from './production-backup-requirements';

describe('S96 backup triad activation contract', () => {
  it('reports Sprint 96 / three rails NOT_SELECTED / EXTERNAL_GATED with blockers', () => {
    const report = evaluateProductionBackupFirstOnboarding();
    expect(report.sprint).toBe(96);
    expect(report.foundation_sprint).toBe(83);
    expect(report.activation_lifecycle).toBe('NOT_SELECTED');
    expect(report.backup.provider).toBe('NOT_SELECTED');
    expect(report.pitr.provider).toBe('NOT_SELECTED');
    expect(report.dr_environment.provider).toBe('NOT_SELECTED');
    expect(report.backup.production).toBe('EXTERNAL_GATED');
    expect(report.pitr.production).toBe('EXTERNAL_GATED');
    expect(report.dr_environment.production).toBe('EXTERNAL_GATED');
    expect(report.force_launch_available).toBe(false);
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_MANAGED_BACKUP_PITR);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        NO_PRODUCTION_MANAGED_BACKUP_PITR,
        NO_PRODUCTION_MANAGED_BACKUP,
        NO_PRODUCTION_PITR,
        NO_PRODUCTION_DR_ENVIRONMENT,
        BACKUP_PROVIDER_NOT_SELECTED,
        BACKUP_CREDENTIAL_REFERENCE_MISSING,
        BACKUP_DESTINATION_REFERENCE_MISSING,
        BACKUP_SCHEDULE_CONFIGURATION_REQUIRED,
        BACKUP_RETENTION_POLICY_CONFIGURATION_REQUIRED,
        PITR_PROVIDER_NOT_SELECTED,
        PITR_WAL_RETENTION_CONFIGURATION_REQUIRED,
        PITR_RESTORE_ENVIRONMENT_REFERENCE_MISSING,
        DR_ENVIRONMENT_NOT_SELECTED,
        DR_REGION_REFERENCE_MISSING,
        DR_OBJECT_STORAGE_DEPENDENCY_GATED,
        DR_KMS_DEPENDENCY_GATED,
        DR_MONITORING_DEPENDENCY_GATED,
        RPO_RTO_NOT_YET_PROVEN,
      ]),
    );
    expect(report.pitr.database_backup_not_pitr).toBe(true);
    expect(report.fake_backup_provider_invented).toBe(false);
    expect(report.fake_rpo_rto_verified).toBe(false);
    expect(report.storage_dependency_sprint).toBe(95);
  });

  it('configuration readiness + eligibility distinctions stay gated', () => {
    const v = validateProductionBackupConfiguration();
    expect(v.ready_for_activation).toBe(false);
    expect(v.secrets_exposed).toBe(false);
    expect(v.connection_strings_exposed).toBe(false);
    expect(v.configuration_readiness.managed_backup.production_activation).toBe('EXTERNAL_GATED');
    expect(v.configuration_readiness.pitr.production_activation).toBe('EXTERNAL_GATED');
    expect(v.configuration_readiness.dr_environment.production_activation).toBe('EXTERNAL_GATED');
    expect(v.eligibility.pg_dump_equals_managed_backup).toBe(false);
    expect(v.eligibility.pg_dump_equals_pitr).toBe(false);
    expect(v.eligibility.sandbox_drill_equals_production_rto).toBe(false);
    expect(v.eligibility.database_recovery_equals_object_storage_recovery).toBe(false);
    expect(v.eligibility.migration_history_equals_backup).toBe(false);

    const report = evaluateProductionBackupFirstOnboarding();
    expect(report.country_policy.markets_supported_for_evaluation).toEqual([
      'GLOBAL',
      'IN',
      'AE',
      'US',
    ]);
    expect(report.rpo.target).toBe('15m');
    expect(report.rto.target).toBe('4h');
    expect(report.rpo.achievement).toBe('NOT_YET_PROVEN');
    expect(report.rto.achievement).toBe('NOT_YET_PROVEN');
    expect(report.rpo.evidence_class).toBe('NOT_YET_PROVEN');
    expect(report.rto.evidence_class).toBe('NOT_YET_PROVEN');
    expect(report.object_recovery).toBe('PRIVATE_STORAGE_EXTERNAL_GATED');
    expect(report.kms_encryption_dependency).toBe('KMS_EXTERNAL_GATED');
    expect(report.malware_scan_dependency).toBe('MALWARE_EXTERNAL_GATED');
    expect(report.restore.sandbox_restore_does_not_prove_production_rto).toBe(true);
  });
});

describe('S96 lifecycle + enablement + globalization', () => {
  it('never ENABLE from sandbox pg_dump; sandbox drill does not green production', () => {
    expect(
      validateBackupConfiguration({
        providerSelected: true,
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
    ).toBe('APPROVED');

    expect(
      evaluateBackupEnablementGuard({
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
      }).can_enable,
    ).toBe(false);

    const report = evaluateProductionBackupFirstOnboarding();
    expect(report.failure_modes.sandbox_drill_not_production_green).toBe(true);
    expect(report.enablement_guard.can_enable).toBe(false);
    expect(report.real_dr_environment_available).toBe(false);
  });

  it('no hardcoded UPI/INR/₹/+91/IST or invented cloud vendors', () => {
    const blob = JSON.stringify(evaluateProductionBackupFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/\bRDS\b|\bCloudSQL\b|\bAurora\b/i);
    expect(blob).not.toMatch(/postgresql:\/\/|password=|BEGIN PRIVATE KEY/);
  });
});
