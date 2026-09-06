/**
 * Sprint 107 — Real storage / KMS / malware production activation readiness
 * (no invented cloud infra / no local-disk production fallback).
 */
import {
  NO_PRODUCTION_PRIVATE_STORAGE,
  NO_PRODUCTION_KMS,
  NO_PRODUCTION_MALWARE_SCANNER,
  NO_PRODUCTION_OBJECT_STORAGE_PROVIDER,
  STORAGE_PROVIDER_NOT_SELECTED,
  STORAGE_PRIVATE_ACCESS_NOT_VERIFIED,
  STORAGE_CREDENTIAL_REFERENCE_MISSING,
  KMS_KEY_REFERENCE_MISSING,
  MALWARE_SCANNER_CONFIGURATION_MISSING,
  evaluateRealStorageFirstOnboarding,
  buildRealStorageActivationChecklist,
  buildRealStorageMarketStatuses,
  buildRealStorageRailStatuses,
} from './storage-real-activation-first-onboarding';
import { evaluateProductionStorageFirstOnboarding } from './production-storage-first-onboarding';
import { evaluateProductionStorageAvailable } from './production-storage-gate';
import { evaluateProductionLaunchControl } from './production-launch-control';
import { assertNoSecretLeak } from './secret-redaction';

describe('S107 real storage activation contract', () => {
  it('reports Sprint 107 / NOT_SELECTED / no production triad', () => {
    const report = evaluateRealStorageFirstOnboarding();
    expect(report.sprint).toBe(107);
    expect(report.real_object_storage_provider_selected).toBe(false);
    expect(report.production_object_storage_enabled).toBe(false);
    expect(report.real_kms_provider_selected).toBe(false);
    expect(report.production_kms_enabled).toBe(false);
    expect(report.real_malware_scanner_selected).toBe(false);
    expect(report.production_malware_scanning_enabled).toBe(false);
    expect(report.private_storage_verified).toBe('SANDBOX_ONLY');
    expect(report.production_local_disk_fallback_possible).toBe(false);
    expect(report.enabled).toBe(false);
    expect(report.ready_for_activation).toBe(false);
    expect(report.force_launch_available).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_PRIVATE_STORAGE);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        NO_PRODUCTION_PRIVATE_STORAGE,
        NO_PRODUCTION_OBJECT_STORAGE_PROVIDER,
        NO_PRODUCTION_KMS,
        NO_PRODUCTION_MALWARE_SCANNER,
        STORAGE_PROVIDER_NOT_SELECTED,
        STORAGE_PRIVATE_ACCESS_NOT_VERIFIED,
        STORAGE_CREDENTIAL_REFERENCE_MISSING,
        KMS_KEY_REFERENCE_MISSING,
        MALWARE_SCANNER_CONFIGURATION_MISSING,
        'LOCAL_DISK_STORAGE_PRODUCTION_FORBIDDEN',
      ]),
    );
    expect(report.control_plane).toBe('S100_REUSED');
    expect(report.foundation_plane).toBe('S101_REUSED');
    expect(report.s95_plane).toBe('COMPOSED');
    expect(report.secrets_printed).toBe(false);
    expect(report.fake_storage_provider_invented).toBe(false);
    expect(report.fake_kms_key_invented).toBe(false);
    expect(report.fake_malware_scanner_invented).toBe(false);
    expect(report.native_android).toBe('DEVICE_NOT_AVAILABLE');
    expect(report.security_controls.never_fallback_to_local_disk).toBe(true);
  });

  it('exposes checklist, rails, markets, malware lifecycle, composes S95', () => {
    const report = evaluateRealStorageFirstOnboarding();
    expect(buildRealStorageActivationChecklist().length).toBeGreaterThanOrEqual(15);
    expect(buildRealStorageRailStatuses().map((r) => r.rail)).toEqual([
      'OBJECT_STORAGE',
      'KMS',
      'MALWARE_SCANNER',
    ]);
    expect(report.rails.every((r) => r.production_enabled === false)).toBe(true);
    expect(buildRealStorageMarketStatuses().map((m) => m.market)).toEqual([
      'GLOBAL',
      'IN',
      'AE',
      'US',
    ]);
    expect(report.markets.every((m) => m.production === 'PRODUCTION_EXTERNAL_GATED')).toBe(true);
    expect(report.malware_lifecycle.scanner_failure_not_clean).toBe(true);
    expect(report.malware_lifecycle.unscanned_not_available).toBe(true);
    expect(report.malware_lifecycle.success_path).toEqual([
      'UPLOAD',
      'QUARANTINED',
      'SCANNING',
      'CLEAN',
      'AVAILABLE',
    ]);

    const s95 = evaluateProductionStorageFirstOnboarding();
    expect(s95.sprint).toBe(95);
    expect(s95.object_storage.enabled).toBe(false);
    expect(s95.kms.enabled).toBe(false);
    expect(s95.malware_scanning.enabled).toBe(false);
  });
});

describe('S107 security + launch integration', () => {
  it('never leaks secrets, blocks local-disk production, does not bypass S87', () => {
    expect(assertNoSecretLeak(JSON.stringify(evaluateRealStorageFirstOnboarding()))).toBe(true);
    const gate = evaluateProductionStorageAvailable();
    expect(gate.never_fallback_to_local_disk).toBe(true);
    expect(gate.available).toBe(false);
    expect(gate.blockers).toEqual(
      expect.arrayContaining(['LOCAL_DISK_STORAGE_PRODUCTION_FORBIDDEN']),
    );

    const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
    expect(launch.can_production_launch).toBe('NO');
    expect(launch.force_launch_available).toBe(false);
    expect(launch.rails.some((r) => r.rail_id === 'PRIVATE_STORAGE')).toBe(true);
    expect(launch.rails.find((r) => r.rail_id === 'PRIVATE_STORAGE')?.blocker_codes).toEqual(
      expect.arrayContaining([NO_PRODUCTION_PRIVATE_STORAGE]),
    );
  });

  it('no hardcoded UPI/INR/₹/+91/IST or invented cloud brands/key IDs', () => {
    const blob = JSON.stringify(evaluateRealStorageFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/\bS3\b|\bGCS\b|\bAzure Blob\b|\bClamAV\b/i);
    expect(blob).not.toMatch(/sk_live_|postgresql:\/\/[^:]+:[^@]+@|BEGIN PRIVATE KEY|arn:aws:kms:/);
    expect(blob).not.toMatch(/AKIA[0-9A-Z]{16}/);
  });
});
