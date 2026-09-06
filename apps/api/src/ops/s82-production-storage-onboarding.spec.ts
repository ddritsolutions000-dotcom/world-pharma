/**
 * Sprint 82 — Private storage / KMS / malware scanning activation readiness (no fake infra).
 */
import {
  NO_PRODUCTION_KMS,
  NO_PRODUCTION_MALWARE_SCANNER,
  NO_PRODUCTION_PRIVATE_STORAGE,
  buildMalwareScanLifecycleMachine,
  evaluateProductionStorageEnablementGuard,
  evaluateProductionStorageFirstOnboarding,
  isMockOrLocalStorageBackend,
  isMockOrSandboxKmsProvider,
  listProductionStorageLegalPrivacyGateItems,
  validateKmsConfiguration,
  validateMalwareScannerConfiguration,
  validateObjectStorageConfiguration,
} from './production-storage-first-onboarding';
import { evaluateProviderActivation } from './provider-activation';
import { getProviderActivationContract } from './provider-activation-contracts';

describe('S82 storage availability', () => {
  it('reports three independent NOT_SELECTED / EXTERNAL_GATED rails', () => {
    const report = evaluateProductionStorageFirstOnboarding();
    expect(report.sprint).toBeGreaterThanOrEqual(82);
    expect([73, 82]).toContain(report.foundation_sprint);
    expect(report.object_storage.provider).toBe('NOT_SELECTED');
    expect(report.kms.provider).toBe('NOT_SELECTED');
    expect(report.malware_scanning.provider).toBe('NOT_SELECTED');
    expect(report.real_object_storage_available).toBe(false);
    expect(report.real_kms_available).toBe(false);
    expect(report.real_malware_scanner_available).toBe(false);
    expect(report.object_storage.production).toBe('EXTERNAL_GATED');
    expect(report.kms.production).toBe('EXTERNAL_GATED');
    expect(report.malware_scanning.production).toBe('EXTERNAL_GATED');
    expect(report.object_storage.sandbox).toBe('SANDBOX_VERIFIED');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_PRIVATE_STORAGE);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        NO_PRODUCTION_PRIVATE_STORAGE,
        NO_PRODUCTION_KMS,
        NO_PRODUCTION_MALWARE_SCANNER,
      ]),
    );
    expect(report.fake_storage_provider_invented).toBe(false);
    expect(report.fake_kms_key_invented).toBe(false);
    expect(report.fake_malware_scanner_invented).toBe(false);
    expect(report.enablement_guard.can_enable).toBe(false);
    expect(report.object_storage.never_fallback_to_local_disk).toBe(true);
    expect(report.native_android).toBe('DEVICE_NOT_AVAILABLE');
  });
});

describe('S82 malware lifecycle + permissions', () => {
  it('documents scan machine and private access model', () => {
    const life = buildMalwareScanLifecycleMachine();
    expect(life.success_path).toContain('QUARANTINE');
    expect(life.success_path).toContain('AVAILABLE');
    expect(life.never_trust_unscanned).toBe(true);
    expect(life.idempotent_scan_events).toBe(true);

    const report = evaluateProductionStorageFirstOnboarding();
    expect(report.permission_model.no_anonymous_private_access).toBe(true);
    expect(report.permission_model.admin_activation_not_universal_document_access).toBe(true);
    expect(report.signed_url_model).toBe('OPAQUE_TICKET_SHORT_LIVED_SANDBOX_VERIFIED');
    expect(report.observability.no_secrets_or_tickets_in_logs).toBe(true);
    expect(report.data_residency).toBe('POLICY_DRIVEN');
    expect(report.backup_pitr_dependency).toBe('EXTERNAL_GATED');
  });
});

describe('S82 enablement guard', () => {
  it('never enables without all three production rails', () => {
    const guard = evaluateProductionStorageEnablementGuard({
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
    });
    expect(guard.can_enable).toBe(false);
  });

  it('requires full checklist including country policy', () => {
    const guard = evaluateProductionStorageEnablementGuard({
      nonLocalProductionStorageRegistered: true,
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
      countryPolicyConfigured: true,
    });
    expect(guard.can_enable).toBe(true);
  });
});

describe('S82 configuration validators', () => {
  it('NOT_SELECTED when providers not chosen; credentials ≠ ENABLED', () => {
    expect(
      validateObjectStorageConfiguration({
        providerSelected: false,
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
    ).toBe('NOT_SELECTED');
    expect(
      validateKmsConfiguration({
        providerSelected: true,
        nonMockProductionKmsRegistered: true,
        infrastructureEnvironment: 'production',
        kmsLiveEnabled: true,
        humanApproved: true,
        keyRefPresent: true,
        secretManagerRefPresent: true,
        rotationConfigured: true,
        legalPrivacyConfigured: true,
      }),
    ).toBe('APPROVED');
    expect(
      validateMalwareScannerConfiguration({
        providerSelected: true,
        nonMockProductionScannerRegistered: true,
        scanningEnvironment: 'production',
        scanningLiveEnabled: true,
        humanApproved: true,
        endpointRefPresent: true,
        quarantineConfigured: true,
        legalPrivacyConfigured: true,
      }),
    ).toBe('APPROVED');
  });
});

describe('S82 sandbox/production fail-closed', () => {
  it('treats local/sandbox backends as non-production', () => {
    expect(isMockOrLocalStorageBackend('LOCAL')).toBe(true);
    expect(isMockOrSandboxKmsProvider('ENV')).toBe(true);
  });
});

describe('S82 legal gate + globalization', () => {
  it('legal items EXTERNAL_GATED; no INR/UPI/secrets', () => {
    const items = listProductionStorageLegalPrivacyGateItems();
    expect(items.every((i) => i.status === 'EXTERNAL_GATED' || i.status === 'BLOCKED')).toBe(true);
    const blob = JSON.stringify(evaluateProductionStorageFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/aws_secret|AKIA|BEGIN PRIVATE KEY|eyJ/);
  });

  it('OBJECT_STORAGE / KMS / MALWARE_SCANNER contracts remain NOT_SELECTED', () => {
    for (const id of ['OBJECT_STORAGE', 'KMS', 'MALWARE_SCANNER'] as const) {
      const row = evaluateProviderActivation(getProviderActivationContract(id));
      expect(row.provider_name).toBe('NOT_SELECTED');
      expect(row.enabled).toBe(false);
    }
  });
});
