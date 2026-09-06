/**
 * Sprint 108 — Real backup / PITR / DR production activation readiness
 * (no invented managed DB / no RPO/RTO proven from sandbox).
 */
import {
  NO_PRODUCTION_MANAGED_BACKUP_PITR,
  NO_PRODUCTION_MANAGED_BACKUP,
  NO_PRODUCTION_PITR,
  NO_PRODUCTION_DR_ENVIRONMENT,
  NO_PRODUCTION_BACKUP_PROVIDER,
  BACKUP_PROVIDER_NOT_SELECTED,
  BACKUP_CREDENTIAL_REFERENCE_MISSING,
  PITR_CONFIGURATION_MISSING,
  DR_RESTORE_NOT_PROVEN,
  RPO_NOT_PROVEN,
  RTO_NOT_PROVEN,
  RPO_RTO_NOT_YET_PROVEN,
  BACKUP_STORAGE_DEPENDENCY_GATED,
  BACKUP_ENCRYPTION_DEPENDENCY_GATED,
  evaluateRealBackupFirstOnboarding,
  buildRealBackupActivationChecklist,
  buildRealBackupMarketStatuses,
  buildRealBackupRailStatuses,
} from './backup-real-activation-first-onboarding';
import { evaluateProductionBackupFirstOnboarding } from './production-backup-first-onboarding';
import { NO_PRODUCTION_PRIVATE_STORAGE, NO_PRODUCTION_KMS } from './production-storage-first-onboarding';
import { evaluateProductionLaunchControl } from './production-launch-control';
import { assertNoSecretLeak } from './secret-redaction';

describe('S108 real backup activation contract', () => {
  it('reports Sprint 108 / NOT_SELECTED / RPO RTO not proven', () => {
    const report = evaluateRealBackupFirstOnboarding();
    expect(report.sprint).toBe(108);
    expect(report.real_production_backup_provider_selected).toBe(false);
    expect(report.production_backup_enabled).toBe(false);
    expect(report.production_pitr_enabled).toBe(false);
    expect(report.real_production_dr_infrastructure_available).toBe(false);
    expect(report.production_local_disk_backup_fallback_possible).toBe(false);
    expect(report.enabled).toBe(false);
    expect(report.ready_for_activation).toBe(false);
    expect(report.force_launch_available).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.rpo).toEqual({
      target: '15m',
      status: 'TARGET_DEFINED',
      achievement: 'NOT_YET_PROVEN',
    });
    expect(report.rto).toEqual({
      target: '4h',
      status: 'TARGET_DEFINED',
      achievement: 'NOT_YET_PROVEN',
    });
    expect(['PASS', 'PENDING', 'FAIL']).toContain(report.isolated_restore_test);
    expect(report.isolated_restore_scope).toBe('SANDBOX_ISOLATED');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_MANAGED_BACKUP_PITR);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        NO_PRODUCTION_MANAGED_BACKUP_PITR,
        NO_PRODUCTION_MANAGED_BACKUP,
        NO_PRODUCTION_BACKUP_PROVIDER,
        NO_PRODUCTION_PITR,
        NO_PRODUCTION_DR_ENVIRONMENT,
        BACKUP_PROVIDER_NOT_SELECTED,
        BACKUP_CREDENTIAL_REFERENCE_MISSING,
        PITR_CONFIGURATION_MISSING,
        DR_RESTORE_NOT_PROVEN,
        RPO_RTO_NOT_YET_PROVEN,
        RPO_NOT_PROVEN,
        RTO_NOT_PROVEN,
        BACKUP_STORAGE_DEPENDENCY_GATED,
        BACKUP_ENCRYPTION_DEPENDENCY_GATED,
        NO_PRODUCTION_PRIVATE_STORAGE,
        NO_PRODUCTION_KMS,
      ]),
    );
    expect(report.control_plane).toBe('S100_REUSED');
    expect(report.foundation_plane).toBe('S101_REUSED');
    expect(report.s96_plane).toBe('COMPOSED');
    expect(report.s107_plane).toBe('DEPENDENCY');
    expect(report.secrets_printed).toBe(false);
    expect(report.fake_rpo_rto_proven).toBe(false);
    expect(report.security_controls.never_fallback_to_local_pg_dump).toBe(true);
    expect(report.native_android).toBe('DEVICE_NOT_AVAILABLE');
  });

  it('exposes checklist, rails, markets, DR workflow, composes S96', () => {
    const report = evaluateRealBackupFirstOnboarding();
    expect(buildRealBackupActivationChecklist().length).toBeGreaterThanOrEqual(14);
    expect(buildRealBackupRailStatuses().map((r) => r.rail)).toEqual([
      'MANAGED_BACKUP',
      'PITR',
      'DR_ENVIRONMENT',
    ]);
    expect(report.rails.every((r) => r.production_enabled === false)).toBe(true);
    expect(buildRealBackupMarketStatuses().map((m) => m.market)).toEqual([
      'GLOBAL',
      'IN',
      'AE',
      'US',
    ]);
    expect(report.markets.every((m) => m.production === 'PRODUCTION_EXTERNAL_GATED')).toBe(true);
    expect(report.dr_workflow.steps.length).toBe(12);
    expect(report.dr_workflow.production_failover).toBe('EXTERNAL_GATED');
    expect(report.dependencies.storage_sprint).toBe(107);

    const s96 = evaluateProductionBackupFirstOnboarding();
    expect(s96.sprint).toBe(96);
    expect(s96.backup.enabled).toBe(false);
    expect(s96.pitr.enabled).toBe(false);
    expect(s96.dr_environment.enabled).toBe(false);
  });
});

describe('S108 security + launch integration', () => {
  it('never leaks secrets and does not bypass S87', () => {
    expect(assertNoSecretLeak(JSON.stringify(evaluateRealBackupFirstOnboarding()))).toBe(true);
    const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
    expect(launch.can_production_launch).toBe('NO');
    expect(launch.force_launch_available).toBe(false);
    expect(launch.rails.some((r) => r.rail_id === 'MANAGED_BACKUP')).toBe(true);
    expect(launch.rails.find((r) => r.rail_id === 'MANAGED_BACKUP')?.blocker_codes).toEqual(
      expect.arrayContaining([NO_PRODUCTION_MANAGED_BACKUP]),
    );
  });

  it('no hardcoded UPI/INR/₹/+91/IST or invented cloud backup brands', () => {
    const blob = JSON.stringify(evaluateRealBackupFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/\bRDS\b|\bAurora\b|\bCloudSQL\b|\bBarman\b/i);
    expect(blob).not.toMatch(/sk_live_|postgresql:\/\/[^:]+:[^@]+@|BEGIN PRIVATE KEY/);
  });
});
