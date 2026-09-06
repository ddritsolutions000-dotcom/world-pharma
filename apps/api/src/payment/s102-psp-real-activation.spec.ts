/**
 * Sprint 102 — Real PSP / payment production activation preparation
 * (no invented PSP / no real money).
 */
import {
  NO_PRODUCTION_PSP,
  PSP_PROVIDER_NOT_SELECTED,
  evaluateRealPspFirstOnboarding,
  buildRealPspActivationChecklist,
  buildReconciliationMismatchCatalog,
} from './psp-real-activation-first-onboarding';
import { evaluatePspFirstOnboarding } from './psp-first-onboarding';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';
import { assertNoSecretLeak } from '../ops/secret-redaction';

describe('S102 real PSP activation contract', () => {
  it('reports Sprint 102 / NOT_SELECTED / no real money', () => {
    const report = evaluateRealPspFirstOnboarding();
    expect(report.sprint).toBe(102);
    expect(report.real_psp_selected).toBe(false);
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.enabled).toBe(false);
    expect(report.production_psp_enabled).toBe(false);
    expect(report.real_money_processed).toBe(false);
    expect(report.ready_for_activation).toBe(false);
    expect(report.force_launch_available).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_PSP);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([NO_PRODUCTION_PSP, PSP_PROVIDER_NOT_SELECTED]),
    );
    expect(report.control_plane).toBe('S100_REUSED');
    expect(report.foundation_plane).toBe('S101_REUSED');
    expect(report.s88_plane).toBe('COMPOSED');
    expect(report.secrets_printed).toBe(false);
    expect(report.fake_credentials_invented).toBe(false);
    expect(report.settlement_payout).toBe('EXTERNAL_PAYOUT_GATED');
    expect(report.reconciliation).toBe('PRODUCTION_NOT_YET_PROVEN');
  });

  it('exposes checklist, markets, mismatch catalog, and composes S88 safety', () => {
    const report = evaluateRealPspFirstOnboarding();
    expect(buildRealPspActivationChecklist().length).toBeGreaterThanOrEqual(10);
    expect(report.checklist.every((c) => c.status !== undefined)).toBe(true);
    expect(report.markets.map((m) => m.market)).toEqual(['GLOBAL', 'IN', 'AE', 'US']);
    expect(report.markets.every((m) => m.production === 'PRODUCTION_EXTERNAL_GATED')).toBe(true);
    expect(buildReconciliationMismatchCatalog().some((m) => m.code === 'AMOUNT_MISMATCH')).toBe(
      true,
    );
    expect(report.webhook_security.unsigned_rejected).toBe(true);
    expect(report.payment_state_machine.forbidden).toContain(
      'PAYMENT_FAILED→ORDER_PAID_WITHOUT_VERIFIED_RESULT',
    );
    expect(report.order_payment_consistency.payment_success_not_equal_vendor_payout).toBe(true);

    const s88 = evaluatePspFirstOnboarding();
    expect(s88.sprint).toBe(88);
    expect(s88.enabled).toBe(false);
  });
});

describe('S102 security + launch integration', () => {
  it('never leaks secrets and does not bypass S87', () => {
    expect(assertNoSecretLeak(JSON.stringify(evaluateRealPspFirstOnboarding()))).toBe(true);
    const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
    expect(launch.can_production_launch).toBe('NO');
    expect(launch.force_launch_available).toBe(false);
    expect(launch.rails.some((r) => r.rail_id === 'PSP')).toBe(true);
    expect(launch.rails.find((r) => r.rail_id === 'PSP')?.blocker_codes).toEqual(
      expect.arrayContaining([NO_PRODUCTION_PSP]),
    );
  });

  it('no hardcoded UPI/INR/₹/+91/IST or invented PSP brands', () => {
    const blob = JSON.stringify(evaluateRealPspFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/\bSTRIPE\b|\bRAZORPAY\b|\bADYEN\b/i);
    expect(blob).not.toMatch(/sk_live_|postgresql:\/\/[^:]+:[^@]+@|BEGIN PRIVATE KEY/);
  });
});
