/**
 * Sprint 95 — Production private storage / KMS / malware activation readiness
 * (no fake cloud infra).
 */
import {
  KMS_KEY_REFERENCE_MISSING,
  KMS_PROVIDER_NOT_SELECTED,
  KMS_SECRET_MANAGER_REFERENCE_MISSING,
  MALWARE_CREDENTIAL_REFERENCE_MISSING,
  MALWARE_ENDPOINT_REFERENCE_MISSING,
  MALWARE_PROVIDER_NOT_SELECTED,
  NO_PRODUCTION_KMS,
  NO_PRODUCTION_MALWARE_SCANNER,
  NO_PRODUCTION_PRIVATE_STORAGE,
  STORAGE_BACKUP_DEPENDENCY_GATED,
  STORAGE_BUCKET_REFERENCE_MISSING,
  STORAGE_CREDENTIAL_REFERENCE_MISSING,
  STORAGE_PROVIDER_NOT_SELECTED,
  STORAGE_REGION_REFERENCE_MISSING,
  STORAGE_RETENTION_POLICY_CONFIGURATION_REQUIRED,
  buildMalwareScanLifecycleMachine,
  evaluateProductionStorageEnablementGuard,
  evaluateProductionStorageFirstOnboarding,
  validateObjectStorageConfiguration,
} from './production-storage-first-onboarding';
import { validateProductionStorageConfiguration } from './production-storage-requirements';

describe('S95 storage triad activation contract', () => {
  it('reports Sprint 95 / three rails NOT_SELECTED / EXTERNAL_GATED with blockers', () => {
    const report = evaluateProductionStorageFirstOnboarding();
    expect(report.sprint).toBe(95);
    expect(report.foundation_sprint).toBe(82);
    expect(report.activation_lifecycle).toBe('NOT_SELECTED');
    expect(report.object_storage.provider).toBe('NOT_SELECTED');
    expect(report.kms.provider).toBe('NOT_SELECTED');
    expect(report.malware_scanning.provider).toBe('NOT_SELECTED');
    expect(report.object_storage.production).toBe('EXTERNAL_GATED');
    expect(report.kms.production).toBe('EXTERNAL_GATED');
    expect(report.malware_scanning.production).toBe('EXTERNAL_GATED');
    expect(report.force_launch_available).toBe(false);
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_PRIVATE_STORAGE);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        NO_PRODUCTION_PRIVATE_STORAGE,
        NO_PRODUCTION_KMS,
        NO_PRODUCTION_MALWARE_SCANNER,
        STORAGE_PROVIDER_NOT_SELECTED,
        STORAGE_CREDENTIAL_REFERENCE_MISSING,
        STORAGE_BUCKET_REFERENCE_MISSING,
        STORAGE_REGION_REFERENCE_MISSING,
        KMS_PROVIDER_NOT_SELECTED,
        KMS_KEY_REFERENCE_MISSING,
        KMS_SECRET_MANAGER_REFERENCE_MISSING,
        MALWARE_PROVIDER_NOT_SELECTED,
        MALWARE_ENDPOINT_REFERENCE_MISSING,
        MALWARE_CREDENTIAL_REFERENCE_MISSING,
        STORAGE_RETENTION_POLICY_CONFIGURATION_REQUIRED,
        STORAGE_BACKUP_DEPENDENCY_GATED,
      ]),
    );
    expect(report.object_storage.never_fallback_to_local_disk).toBe(true);
    expect(report.fake_storage_provider_invented).toBe(false);
    expect(report.secrets_printed).toBe(false);
    expect(report.kms_material_printed).toBe(false);
  });

  it('configuration readiness + eligibility distinctions stay gated', () => {
    const v = validateProductionStorageConfiguration();
    expect(v.ready_for_activation).toBe(false);
    expect(v.secrets_exposed).toBe(false);
    expect(v.phi_exposed).toBe(false);
    expect(v.configuration_readiness.private_storage.production_activation).toBe('EXTERNAL_GATED');
    expect(v.configuration_readiness.kms.production_activation).toBe('EXTERNAL_GATED');
    expect(v.configuration_readiness.malware_scanner.production_activation).toBe('EXTERNAL_GATED');
    expect(v.eligibility.local_disk_equals_production_private_storage).toBe(false);
    expect(v.eligibility.env_refs_equal_production_kms).toBe(false);
    expect(v.eligibility.sandbox_scanner_equals_production_av).toBe(false);
    expect(v.eligibility.unscanned_equals_trusted).toBe(false);
    expect(v.eligibility.database_backup_equals_object_storage_backup).toBe(false);

    const report = evaluateProductionStorageFirstOnboarding();
    expect(report.country_policy.markets_supported_for_evaluation).toEqual([
      'GLOBAL',
      'IN',
      'AE',
      'US',
    ]);
    expect(report.permission_model.expired_ticket_rejected).toBe(true);
    expect(report.failure_modes.scanner_unavailable_not_clean).toBe(true);
    expect(report.retention).toBe('RETENTION_POLICY_REQUIRED');
    expect(report.backup_pitr_dependency).toBe('EXTERNAL_GATED');
  });
});

describe('S95 lifecycle + enablement + globalization', () => {
  it('UNSCANNED ≠ TRUSTED; scanner failure ≠ CLEAN; never ENABLE from local', () => {
    const life = buildMalwareScanLifecycleMachine();
    expect(life.never_trust_unscanned).toBe(true);
    expect(life.scanner_failure_not_clean).toBe(true);
    expect(life.unscanned_not_available).toBe(true);
    expect(life.idempotent_scan_events).toBe(true);

    expect(
      validateObjectStorageConfiguration({
        providerSelected: true,
        nonLocalProductionAdapterRegistered: true,
        storageEnvironment: 'production',
        storageLiveEnabled: true,
        humanApproved: true,
        bucketRefPresent: true,
        secretRefPresent: true,
        privateAclConfigured: true,
        encryptionConfigured: true,
        legalPrivacyConfigured: true,
      }),
    ).toBe('APPROVED');

    expect(
      evaluateProductionStorageEnablementGuard({
        nonLocalProductionStorageRegistered: false,
        nonMockProductionKmsRegistered: true,
        nonMockProductionScannerRegistered: true,
        storageEnvironment: 'production',
        storageLiveEnabled: true,
        kmsLiveEnabled: true,
        scanningLiveEnabled: true,
        humanApprovedStorage: true,
        humanApprovedKms: true,
        humanApprovedScanner: true,
        legalPrivacyClear: true,
        backupPitrReady: true,
        residencyPolicyClear: true,
        emergencyDisabled: false,
      }).can_enable,
    ).toBe(false);
  });

  it('no hardcoded UPI/INR/₹/+91/IST or invented cloud vendors', () => {
    const blob = JSON.stringify(evaluateProductionStorageFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/\bS3\b|\bGCS\b|\bAZURE_BLOB\b|\bCLAMAV\b/i);
  });
});
