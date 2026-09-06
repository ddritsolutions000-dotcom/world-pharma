/**
 * Sprint 73 — Production private storage + KMS + malware scanning onboarding.
 */
import {
  evaluateProductionStorageEnablementGuard,
  evaluateProductionStorageFirstOnboarding,
  isLiveKmsEnabled,
  isMockOrLocalStorageBackend,
  isMockOrSandboxKmsProvider,
  listProductionStorageLegalPrivacyGateItems,
  validateKmsConfiguration,
  validateMalwareScannerConfiguration,
  validateObjectStorageConfiguration,
} from './production-storage-first-onboarding';
import { evaluateProductionStorageAvailable } from './production-storage-gate';
import { evaluateProductionFileScanningAvailable } from './production-file-scanning-gate';
import { evaluateProviderActivation } from './provider-activation';
import { getProviderActivationContract } from './provider-activation-contracts';
import { isMockScannerProvider, readObjectStorageEnvironment } from './infra-environment';

describe('S73 storage availability', () => {
  it('reports NOT_SELECTED / EXTERNAL_GATED for storage, KMS, and scanner', () => {
    const report = evaluateProductionStorageFirstOnboarding();
    expect(report.object_storage.provider).toBe('NOT_SELECTED');
    expect(report.kms.provider).toBe('NOT_SELECTED');
    expect(report.malware_scanning.provider).toBe('NOT_SELECTED');
    expect(report.real_object_storage_available).toBe(false);
    expect(report.real_kms_available).toBe(false);
    expect(report.real_malware_scanner_available).toBe(false);
    expect(report.object_storage.enabled).toBe(false);
    expect(report.kms.enabled).toBe(false);
    expect(report.malware_scanning.enabled).toBe(false);
    expect(report.object_storage.production).toBe('EXTERNAL_GATED');
    expect(report.kms.production).toBe('EXTERNAL_GATED');
    expect(report.malware_scanning.production).toBe('EXTERNAL_GATED');
    expect(report.object_storage.sandbox).toBe('SANDBOX_VERIFIED');
    expect(report.malware_scanning.sandbox).toBe('SANDBOX_ONLY');
    expect(report.remaining_blocker).toBe('NO_PRODUCTION_PRIVATE_STORAGE');
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        'NO_PRODUCTION_PRIVATE_STORAGE',
        'NO_PRODUCTION_KMS',
        'NO_PRODUCTION_MALWARE_SCANNER',
      ]),
    );
    expect(report.object_storage.never_fallback_to_local_disk).toBe(true);
    expect(report.kms.application_encryption_alone_insufficient).toBe(true);
    expect(report.malware_scanning.never_trust_unscanned).toBe(true);
    expect(report.enablement_guard.can_enable).toBe(false);
    expect(report.secrets_printed).toBe(false);
    expect(report.signed_urls_printed).toBe(false);
    expect(report.kms_material_printed).toBe(false);
    expect(report.phi_printed).toBe(false);
  });
});

describe('S73 configuration validators', () => {
  it('object storage: NOT_SELECTED → NOT_CONFIGURED → VERIFIED → APPROVED (≠ ENABLED)', () => {
    const base = {
      providerSelected: true,
      nonLocalProductionAdapterRegistered: true,
      storageEnvironment: 'production' as const,
      storageLiveEnabled: false,
      humanApproved: false,
      bucketRefPresent: true,
      secretRefPresent: true,
      privateAclConfigured: true,
      encryptionConfigured: true,
      legalPrivacyConfigured: true,
    };
    expect(validateObjectStorageConfiguration({ ...base, providerSelected: false })).toBe(
      'NOT_SELECTED',
    );
    expect(
      validateObjectStorageConfiguration({ ...base, nonLocalProductionAdapterRegistered: false }),
    ).toBe('NOT_CONFIGURED');
    expect(validateObjectStorageConfiguration({ ...base, storageEnvironment: 'sandbox' })).toBe(
      'CONFIGURED_BUT_UNAVAILABLE',
    );
    expect(validateObjectStorageConfiguration(base)).toBe('VERIFIED');
    expect(
      validateObjectStorageConfiguration({ ...base, humanApproved: true, storageLiveEnabled: false }),
    ).toBe('VERIFIED_BUT_DISABLED');
    expect(
      validateObjectStorageConfiguration({ ...base, humanApproved: true, storageLiveEnabled: true }),
    ).toBe('APPROVED');
  });

  it('KMS and malware validators follow same lifecycle', () => {
    expect(
      validateKmsConfiguration({
        providerSelected: false,
        nonMockProductionKmsRegistered: true,
        infrastructureEnvironment: 'production',
        kmsLiveEnabled: true,
        humanApproved: true,
        keyRefPresent: true,
        secretManagerRefPresent: true,
        rotationConfigured: true,
        legalPrivacyConfigured: true,
      }),
    ).toBe('NOT_SELECTED');
    expect(
      validateMalwareScannerConfiguration({
        providerSelected: true,
        nonMockProductionScannerRegistered: false,
        scanningEnvironment: 'production',
        scanningLiveEnabled: true,
        humanApproved: true,
        endpointRefPresent: true,
        quarantineConfigured: true,
        legalPrivacyConfigured: true,
      }),
    ).toBe('NOT_CONFIGURED');
  });
});

describe('S73 enablement guard', () => {
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

  it('requires full checklist including backup and residency', () => {
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
    });
    expect(guard.can_enable).toBe(true);
  });

  it('emergency disable blocks enablement', () => {
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
      emergencyDisabled: true,
    });
    expect(guard.can_enable).toBe(false);
  });
});

describe('S73 sandbox/production fail-closed', () => {
  const prev = {
    storageEnv: process.env['OBJECT_STORAGE_ENVIRONMENT'],
    storageLive: process.env['OBJECT_STORAGE_LIVE_ENABLED'],
    kmsLive: process.env['KMS_LIVE_ENABLED'],
  };

  afterEach(() => {
    const restore = (k: string, v: string | undefined) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    };
    restore('OBJECT_STORAGE_ENVIRONMENT', prev.storageEnv);
    restore('OBJECT_STORAGE_LIVE_ENABLED', prev.storageLive);
    restore('KMS_LIVE_ENABLED', prev.kmsLive);
  });

  it('treats LOCAL/MOCK as non-production', () => {
    expect(isMockOrLocalStorageBackend('LOCAL')).toBe(true);
    expect(isMockOrLocalStorageBackend('S3')).toBe(false);
    expect(isMockScannerProvider('SANDBOX')).toBe(true);
    expect(isMockOrSandboxKmsProvider('ENV')).toBe(true);
  });

  it('live flags alone do not select production providers', () => {
    process.env['OBJECT_STORAGE_ENVIRONMENT'] = 'production';
    process.env['OBJECT_STORAGE_LIVE_ENABLED'] = 'true';
    process.env['KMS_LIVE_ENABLED'] = 'true';
    expect(readObjectStorageEnvironment()).toBe('production');
    expect(isLiveKmsEnabled()).toBe(true);
    const report = evaluateProductionStorageFirstOnboarding();
    expect(report.object_storage.provider).toBe('NOT_SELECTED');
    expect(report.real_object_storage_available).toBe(false);
    expect(report.enablement_guard.can_enable).toBe(false);
  });

  it('production storage gate never falls back to local disk', () => {
    const gate = evaluateProductionStorageAvailable();
    expect(gate.never_fallback_to_local_disk).toBe(true);
    expect(gate.available).toBe(false);
    expect(gate.blockers).toContain('NO_PRODUCTION_STORAGE_ADAPTER');
  });

  it('production scanner gate never trusts unscanned', () => {
    const gate = evaluateProductionFileScanningAvailable();
    expect(gate.never_trust_unscanned).toBe(true);
    expect(gate.available).toBe(false);
    expect(gate.blockers).toContain('NO_PRODUCTION_SCANNER_ADAPTER');
  });

  it('documents scan lifecycle stages and statuses', () => {
    const report = evaluateProductionStorageFirstOnboarding();
    expect(report.scan_lifecycle_stages).toEqual(
      expect.arrayContaining(['UPLOAD', 'QUARANTINE', 'MALWARE_SCAN', 'CLEAN', 'AVAILABLE']),
    );
    expect(report.malware_scanning.statuses_supported).toEqual(
      expect.arrayContaining(['CLEAN', 'INFECTED', 'SCAN_FAILED', 'QUARANTINED']),
    );
    expect(report.retention).toBe('RETENTION_POLICY_REQUIRED');
    expect(report.data_classification).toEqual(
      expect.arrayContaining(['PRIVATE', 'SENSITIVE', 'CLINICAL_PHI']),
    );
  });
});

describe('S73 legal gate + activation + globalization', () => {
  it('legal/privacy gate items remain EXTERNAL_GATED', () => {
    const items = listProductionStorageLegalPrivacyGateItems();
    expect(items.length).toBeGreaterThanOrEqual(5);
    expect(items.every((i) => i.status === 'EXTERNAL_GATED' || i.status === 'BLOCKED')).toBe(true);
  });

  it('S64 OBJECT_STORAGE / KMS / MALWARE_SCANNER remain NOT_SELECTED', () => {
    for (const id of ['OBJECT_STORAGE', 'KMS', 'MALWARE_SCANNER'] as const) {
      const row = evaluateProviderActivation(getProviderActivationContract(id));
      expect(row.provider_name).toBe('NOT_SELECTED');
      expect(row.enabled).toBe(false);
      expect(row.external_blocker).toBeTruthy();
    }
  });

  it('onboarding report has no hardcoded UPI/INR/₹/+91/IST and no secrets', () => {
    const blob = JSON.stringify(evaluateProductionStorageFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/aws_secret|apiSecret|eyJ|AKIA[0-9A-Z]{16}/i);
  });
});
