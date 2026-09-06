/**
 * Sprint 105 — Real carrier / logistics production activation readiness
 * (no invented carrier / no real shipment).
 */
import {
  NO_PRODUCTION_CARRIER_ADAPTER,
  CARRIER_PROVIDER_NOT_SELECTED,
  evaluateRealCarrierFirstOnboarding,
  buildRealCarrierActivationChecklist,
  buildRealCarrierMarketStatuses,
} from './carrier-real-activation-first-onboarding';
import { evaluateCarrierFirstOnboarding } from './carrier-first-onboarding';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';
import { assertNoSecretLeak } from '../ops/secret-redaction';

describe('S105 real carrier activation contract', () => {
  it('reports Sprint 105 / NOT_SELECTED / no real shipment', () => {
    const report = evaluateRealCarrierFirstOnboarding();
    expect(report.sprint).toBe(105);
    expect(report.real_carrier_selected).toBe(false);
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.enabled).toBe(false);
    expect(report.production_carrier_enabled).toBe(false);
    expect(report.real_shipment_created).toBe(false);
    expect(report.ready_for_activation).toBe(false);
    expect(report.force_launch_available).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_CARRIER_ADAPTER);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([NO_PRODUCTION_CARRIER_ADAPTER, CARRIER_PROVIDER_NOT_SELECTED]),
    );
    expect(report.control_plane).toBe('S100_REUSED');
    expect(report.foundation_plane).toBe('S101_REUSED');
    expect(report.s90_plane).toBe('COMPOSED');
    expect(report.secrets_printed).toBe(false);
    expect(report.fake_carrier_invented).toBe(false);
    expect(report.pod).toBe('DEVICE_NOT_AVAILABLE');
    expect(report.native_rider).toBe('DEVICE_NOT_AVAILABLE');
    expect(report.cross_border.medicine_import).toBe('LEGAL_GATED');
  });

  it('exposes checklist, markets, shipment/webhook safety, composes S90', () => {
    const report = evaluateRealCarrierFirstOnboarding();
    expect(buildRealCarrierActivationChecklist().length).toBeGreaterThanOrEqual(15);
    expect(report.checklist.every((c) => c.status !== undefined)).toBe(true);
    expect(buildRealCarrierMarketStatuses().map((m) => m.market)).toEqual([
      'GLOBAL',
      'IN',
      'AE',
      'US',
    ]);
    expect(report.markets.every((m) => m.production === 'PRODUCTION_EXTERNAL_GATED')).toBe(true);
    expect(report.webhook_security.unsigned_fail_closed).toBe(true);
    expect(report.outbox_idempotency.duplicate_shipment_prevented).toBe(true);
    expect(report.tracking_events.terminal_overwrite_forbidden).toBe(true);
    expect(report.country_policy.hardcoded_market).toBe(false);
    expect(report.shipment_lifecycle.shipment_creation).not.toBe('ENABLED');

    const s90 = evaluateCarrierFirstOnboarding();
    expect(s90.sprint).toBe(90);
    expect(s90.enabled).toBe(false);
  });
});

describe('S105 security + launch integration', () => {
  it('never leaks secrets and does not bypass S87', () => {
    expect(assertNoSecretLeak(JSON.stringify(evaluateRealCarrierFirstOnboarding()))).toBe(true);
    const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
    expect(launch.can_production_launch).toBe('NO');
    expect(launch.force_launch_available).toBe(false);
    expect(launch.rails.some((r) => r.rail_id === 'CARRIER')).toBe(true);
    expect(launch.rails.find((r) => r.rail_id === 'CARRIER')?.blocker_codes).toEqual(
      expect.arrayContaining([NO_PRODUCTION_CARRIER_ADAPTER]),
    );
  });

  it('no hardcoded UPI/INR/₹/+91/IST or invented carrier brands', () => {
    const blob = JSON.stringify(evaluateRealCarrierFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/\bDHL\b|\bFEDEX\b|\bUPS\b|\bSHIPROCKET\b/i);
    expect(blob).not.toMatch(/sk_live_|postgresql:\/\/[^:]+:[^@]+@|BEGIN PRIVATE KEY/);
  });
});
