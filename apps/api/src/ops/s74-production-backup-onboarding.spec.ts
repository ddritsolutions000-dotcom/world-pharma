/**
 * Sprint 74 — Production backup / PITR / restore readiness (no fake managed PITR).
 */
import {
  evaluateBackupEnablementGuard,
  evaluateProductionBackupFirstOnboarding,
  isLivePitrEnabled,
  isMockOrSandboxBackupProvider,
  listBackupLegalComplianceGateItems,
  validateBackupConfiguration,
} from './production-backup-first-onboarding';
import { getRecoveryObjectives } from './recovery-targets';
import { evaluateProviderActivation } from './provider-activation';
import { getProviderActivationContract } from './provider-activation-contracts';
import { listBackupCatalog, verifyBackupMetadata } from './backup-catalog';
import { readInfrastructureEnvironment } from './infra-environment';

describe('S74 backup availability', () => {
  it('reports NOT_SELECTED / EXTERNAL_GATED — no managed backup/PITR', () => {
    const report = evaluateProductionBackupFirstOnboarding();
    expect(report.backup.provider).toBe('NOT_SELECTED');
    expect(report.pitr.provider).toBe('NOT_SELECTED');
    expect(report.real_managed_backup_available).toBe(false);
    expect(report.real_pitr_available).toBe(false);
    expect(report.backup.enabled).toBe(false);
    expect(report.pitr.enabled).toBe(false);
    expect(report.backup.production).toBe('EXTERNAL_GATED');
    expect(report.pitr.production).toBe('EXTERNAL_GATED');
    expect(report.restore.production).toBe('EXTERNAL_GATED');
    expect(report.backup.sandbox).toBe('SANDBOX_VERIFIED');
    expect(report.remaining_blocker).toBe('NO_PRODUCTION_MANAGED_BACKUP_PITR');
    expect(report.object_recovery).toMatch(/EXTERNAL_GATED|PRIVATE_STORAGE_EXTERNAL_GATED/);
    expect(report.kms_encryption_dependency).toMatch(/EXTERNAL_GATED|KMS_EXTERNAL_GATED/);
    expect(report.rpo.target).toBe('15m');
    expect(report.rto.target).toBe('4h');
    expect(report.rpo.achievement).toBe('NOT_YET_PROVEN');
    expect(report.rto.achievement).toBe('NOT_YET_PROVEN');
    expect(report.enablement_guard.can_enable).toBe(false);
    expect(report.secrets_printed).toBe(false);
    expect(report.connection_strings_printed).toBe(false);
    expect(report.phi_printed).toBe(false);
  });
});

describe('S74 RPO/RTO targets preserved', () => {
  it('keeps S63 targets and marks achievement NOT_YET_PROVEN', () => {
    const recovery = getRecoveryObjectives();
    expect(recovery.status).toBe('TARGET_DEFINED');
    expect(recovery.rpo_target).toBe('15m');
    expect(recovery.rto_target).toBe('4h');
    expect(recovery.rpo_achievement).toBe('NOT_YET_PROVEN');
    expect(recovery.rto_achievement).toBe('NOT_YET_PROVEN');
    expect(recovery.infrastructure_status).toBe('RECOVERY_INFRASTRUCTURE_EXTERNAL_GATED');
  });
});

describe('S74 configuration validator', () => {
  const base = {
    providerSelected: true,
    nonSandboxManagedBackupRegistered: true,
    infrastructureEnvironment: 'production' as const,
    pitrLiveEnabled: false,
    humanApproved: false,
    managedDbPresent: true,
    encryptedOffsiteRetention: true,
    restoreDrillProvenOnProductionClass: true,
    objectStorageRecoveryReady: true,
    kmsReady: true,
    legalComplianceConfigured: true,
  };

  it('NOT_SELECTED when provider not chosen', () => {
    expect(validateBackupConfiguration({ ...base, providerSelected: false })).toBe('NOT_SELECTED');
  });

  it('NOT_CONFIGURED without managed backup/KMS/object recovery', () => {
    expect(
      validateBackupConfiguration({ ...base, nonSandboxManagedBackupRegistered: false }),
    ).toBe('NOT_CONFIGURED');
    expect(validateBackupConfiguration({ ...base, kmsReady: false })).toBe('NOT_CONFIGURED');
  });

  it('CONFIGURED_BUT_UNAVAILABLE without production-class drill', () => {
    expect(
      validateBackupConfiguration({ ...base, restoreDrillProvenOnProductionClass: false }),
    ).toBe('CONFIGURED_BUT_UNAVAILABLE');
  });

  it('VERIFIED → VERIFIED_BUT_DISABLED → APPROVED (scripts ≠ ENABLED)', () => {
    expect(validateBackupConfiguration(base)).toBe('VERIFIED');
    expect(
      validateBackupConfiguration({ ...base, humanApproved: true, pitrLiveEnabled: false }),
    ).toBe('VERIFIED_BUT_DISABLED');
    expect(
      validateBackupConfiguration({ ...base, humanApproved: true, pitrLiveEnabled: true }),
    ).toBe('APPROVED');
  });
});

describe('S74 enablement guard', () => {
  it('never enables without managed backup/PITR', () => {
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
    });
    expect(guard.can_enable).toBe(true);
  });

  it('emergency disable blocks enablement', () => {
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
      emergencyDisabled: true,
    });
    expect(guard.can_enable).toBe(false);
  });
});

describe('S74 sandbox/production + catalog', () => {
  const prev = {
    env: process.env['INFRASTRUCTURE_ENVIRONMENT'],
    pitr: process.env['PITR_LIVE_ENABLED'],
  };

  afterEach(() => {
    const restore = (k: string, v: string | undefined) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    };
    restore('INFRASTRUCTURE_ENVIRONMENT', prev.env);
    restore('PITR_LIVE_ENABLED', prev.pitr);
  });

  it('treats LOCAL/PG_DUMP as non-production backup providers', () => {
    expect(isMockOrSandboxBackupProvider('LOCAL')).toBe(true);
    expect(isMockOrSandboxBackupProvider('PG_DUMP')).toBe(true);
    expect(isMockOrSandboxBackupProvider('AWS_RDS')).toBe(false);
  });

  it('PITR_LIVE alone does not select production provider', () => {
    process.env['INFRASTRUCTURE_ENVIRONMENT'] = 'production';
    process.env['PITR_LIVE_ENABLED'] = 'true';
    expect(readInfrastructureEnvironment()).toBe('production');
    expect(isLivePitrEnabled()).toBe(true);
    const report = evaluateProductionBackupFirstOnboarding();
    expect(report.backup.provider).toBe('NOT_SELECTED');
    expect(report.real_pitr_available).toBe(false);
    expect(report.enablement_guard.can_enable).toBe(false);
  });

  it('backup catalog remains EXTERNAL_GATED for PITR with achievement NOT_YET_PROVEN', () => {
    const catalog = listBackupCatalog(3);
    expect(catalog.pitr).toBe('EXTERNAL_GATED');
    expect(catalog.rpo_target).toBe('15m');
    expect(catalog.rto_target).toBe('4h');
    expect(catalog.rpo_achievement).toBe('NOT_YET_PROVEN');
    expect(catalog.rto_achievement).toBe('NOT_YET_PROVEN');
  });

  it('metadata verifier rejects incomplete backup meta', () => {
    expect(verifyBackupMetadata({}).ok).toBe(false);
    expect(
      verifyBackupMetadata({
        sha256: 'a'.repeat(64),
        byte_size: 100,
        created_at: new Date().toISOString(),
      }).ok,
    ).toBe(true);
  });
});

describe('S74 legal gate + activation + globalization', () => {
  it('legal gate items remain EXTERNAL_GATED', () => {
    const items = listBackupLegalComplianceGateItems();
    expect(items.length).toBeGreaterThanOrEqual(5);
    expect(items.every((i) => i.status === 'EXTERNAL_GATED' || i.status === 'BLOCKED')).toBe(true);
  });

  it('MANAGED_DB_PITR contract remains NOT_SELECTED', () => {
    const row = evaluateProviderActivation(getProviderActivationContract('MANAGED_DB_PITR'));
    expect(row.provider_name).toBe('NOT_SELECTED');
    expect(row.enabled).toBe(false);
    expect(row.external_blocker).toBeTruthy();
  });

  it('onboarding report has no hardcoded UPI/INR/₹/+91/IST and no secrets', () => {
    const blob = JSON.stringify(evaluateProductionBackupFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/postgresql:\/\/|password=|apiSecret|eyJ/i);
  });
});
