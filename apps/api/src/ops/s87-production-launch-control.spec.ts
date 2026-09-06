/**
 * Sprint 87 — Production launch control aggregation (no fake providers / no force launch).
 */
import {
  SERVICE_RAIL_REQUIREMENTS,
  buildCanonicalLaunchRails,
  evaluateProductionLaunchControl,
} from './production-launch-control';
import { evaluateAllProviderActivations } from './provider-activation';

describe('S87 launch control availability', () => {
  it('aggregates 21 rails and returns CAN_PRODUCTION_LAUNCH=NO', () => {
    const eval_ = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
    expect(eval_.sprint).toBe(87);
    expect(eval_.can_production_launch).toBe('NO');
    expect(eval_.overall_status).toBe('NOT_READY');
    expect(eval_.force_launch_available).toBe(false);
    expect(eval_.rails.length).toBe(21);
    expect(eval_.groups.length).toBe(9);
    expect(eval_.mandatory_unresolved.length).toBeGreaterThan(0);
    expect(eval_.secrets_printed).toBe(false);
    expect(eval_.provider_activation_any_live_enabled).toBe(false);
    expect(eval_.semantic_guards.sandbox_verified_is_not_production_ready).toBe(true);
    expect(eval_.semantic_guards.mock_is_not_production).toBe(true);
  });

  it('exposes expected production blocker codes', () => {
    const codes = new Set(evaluateProductionLaunchControl().mandatory_unresolved);
    for (const expected of [
      'NO_PRODUCTION_PSP',
      'NO_PRODUCTION_OTP_PROVIDER',
      'NO_PRODUCTION_CARRIER_ADAPTER',
      'NO_PRODUCTION_KYC_KYB_PROVIDER',
      'NO_PRODUCTION_PRIVATE_STORAGE',
      'NO_PRODUCTION_KMS',
      'NO_PRODUCTION_MALWARE_SCANNER',
      'NO_PRODUCTION_APM_PROVIDER',
    ]) {
      expect([...codes].some((c) => c === expected || c.includes(expected.replace('NO_PRODUCTION_', '')))).toBe(
        true,
      );
    }
    // Prefer exact matches where possible
    const rails = buildCanonicalLaunchRails();
    expect(rails.find((r) => r.rail_id === 'PSP')?.blocker_codes).toContain('NO_PRODUCTION_PSP');
    expect(rails.find((r) => r.rail_id === 'CARRIER')?.blocker_codes).toContain(
      'NO_PRODUCTION_CARRIER_ADAPTER',
    );
    expect(rails.find((r) => r.rail_id === 'ERX')?.blocker_codes).toContain('NO_PRODUCTION_ERX_PROVIDER');
    expect(rails.find((r) => r.rail_id === 'VIDEO')?.blocker_codes).toContain(
      'NO_PRODUCTION_VIDEO_PROVIDER',
    );
    expect(rails.find((r) => r.rail_id === 'PACS')?.blocker_codes).toContain(
      'NO_PRODUCTION_PACS_PROVIDER',
    );
  });
});

describe('S87 mandatory vs NOT_APPLICABLE', () => {
  it('MEDICINE_COMMERCE marks PACS/ERX/VIDEO as NOT_APPLICABLE and still blocks on PSP', () => {
    const eval_ = evaluateProductionLaunchControl({
      market: 'IN',
      service_scope: 'MEDICINE_COMMERCE',
    });
    expect(eval_.not_applicable_rails).toEqual(
      expect.arrayContaining(['ERX', 'VIDEO', 'PACS']),
    );
    expect(eval_.can_production_launch).toBe('NO');
    expect(eval_.mandatory_unresolved).toContain('NO_PRODUCTION_PSP');
    expect(eval_.active_blockers.every((b) => b.rail_id !== 'PACS')).toBe(true);
  });

  it('IMAGING requires PACS blocker; medicine-only N/A does not invent PACS success', () => {
    const imaging = evaluateProductionLaunchControl({
      market: 'AE',
      service_scope: 'IMAGING',
    });
    expect(imaging.can_production_launch).toBe('NO');
    expect(imaging.mandatory_unresolved.some((c) => /PACS/i.test(c))).toBe(true);

    const medicine = evaluateProductionLaunchControl({
      market: 'AE',
      service_scope: 'MEDICINE_COMMERCE',
    });
    expect(medicine.not_applicable_rails).toContain('PACS');
  });

  it('test-only NOT_APPLICABLE override removes a rail without inventing provider success', () => {
    const withOverride = evaluateProductionLaunchControl({
      service_scope: 'GLOBAL',
      applicability_overrides: { PUSH: 'NOT_APPLICABLE', ERX: 'NOT_APPLICABLE', VIDEO: 'NOT_APPLICABLE', PACS: 'NOT_APPLICABLE' },
    });
    expect(withOverride.not_applicable_rails).toEqual(
      expect.arrayContaining(['PUSH', 'ERX', 'VIDEO', 'PACS']),
    );
    expect(withOverride.can_production_launch).toBe('NO');
    expect(withOverride.force_launch_available).toBe(false);
  });
});

describe('S87 negative matrix — missing rails keep launch NO', () => {
  it('each critical blocker remains visible on GLOBAL evaluation', () => {
    const eval_ = evaluateProductionLaunchControl({ service_scope: 'GLOBAL' });
    const byRail = Object.fromEntries(eval_.rails.map((r) => [r.rail_id, r]));
    expect(byRail.PSP?.enabled).toBe(false);
    expect(byRail.OTP?.enabled).toBe(false);
    expect(byRail.CARRIER?.enabled).toBe(false);
    expect(byRail.ERX?.enabled).toBe(false);
    expect(byRail.KYC_KYB?.enabled).toBe(false);
    expect(byRail.PRIVATE_STORAGE?.enabled).toBe(false);
    expect(byRail.KMS?.enabled).toBe(false);
    expect(byRail.MANAGED_BACKUP?.enabled).toBe(false);
    expect(byRail.PITR?.enabled).toBe(false);
    expect(byRail.MONITORING?.enabled).toBe(false);
    expect(eval_.can_production_launch).toBe('NO');
  });

  it('service requirements map is config-driven (not empty)', () => {
    expect(SERVICE_RAIL_REQUIREMENTS.MEDICINE_COMMERCE.PSP).toBe('MANDATORY');
    expect(SERVICE_RAIL_REQUIREMENTS.MEDICINE_COMMERCE.PACS).toBe('NOT_APPLICABLE');
    expect(SERVICE_RAIL_REQUIREMENTS.IMAGING.PACS).toBe('MANDATORY');
  });
});

describe('S87 provider activation cross-check + globalization', () => {
  it('S64 matrix remains production_launch_ready=false', () => {
    const matrix = evaluateAllProviderActivations();
    expect(matrix.production_launch_ready).toBe(false);
    expect(matrix.overall_any_live_enabled).toBe(false);
  });

  it('evaluation payload has no hardcoded UPI/INR/₹/+91/IST', () => {
    const blob = JSON.stringify(
      evaluateProductionLaunchControl({ market: 'US', service_scope: 'GLOBAL' }),
    );
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
  });
});
