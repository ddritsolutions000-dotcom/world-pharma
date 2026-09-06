/**
 * Sprint 106 — Real KYC/KYB + healthcare partner verification activation readiness
 * (no invented provider / registry / licence / production verification).
 */
import {
  NO_PRODUCTION_KYC_KYB_PROVIDER,
  NO_PRODUCTION_KYC_PROVIDER,
  KYC_PROVIDER_NOT_SELECTED,
  KYC_HEALTHCARE_REGISTRY_CONFIGURATION_MISSING,
  evaluateRealKycFirstOnboarding,
  buildRealKycActivationChecklist,
  buildRealKycMarketStatuses,
  buildRealKycPartnerTypeGates,
} from './kyc-real-activation-first-onboarding';
import { evaluateKycFirstOnboarding } from './kyc-first-onboarding';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';
import { assertNoSecretLeak } from '../ops/secret-redaction';

describe('S106 real KYC activation contract', () => {
  it('reports Sprint 106 / NOT_SELECTED / no production partner verification', () => {
    const report = evaluateRealKycFirstOnboarding();
    expect(report.sprint).toBe(106);
    expect(report.real_kyc_provider_selected).toBe(false);
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.enabled).toBe(false);
    expect(report.production_kyc_enabled).toBe(false);
    expect(report.real_healthcare_registry_connected).toBe(false);
    expect(report.real_partner_production_verified).toBe(false);
    expect(report.production_privilege_enabled).toBe(false);
    expect(report.ready_for_activation).toBe(false);
    expect(report.force_launch_available).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_KYC_KYB_PROVIDER);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        NO_PRODUCTION_KYC_KYB_PROVIDER,
        NO_PRODUCTION_KYC_PROVIDER,
        KYC_PROVIDER_NOT_SELECTED,
        KYC_HEALTHCARE_REGISTRY_CONFIGURATION_MISSING,
      ]),
    );
    expect(report.control_plane).toBe('S100_REUSED');
    expect(report.foundation_plane).toBe('S101_REUSED');
    expect(report.s94_plane).toBe('COMPOSED');
    expect(report.secrets_printed).toBe(false);
    expect(report.fake_provider_invented).toBe(false);
    expect(report.fake_licence_invented).toBe(false);
    expect(report.native_android).toBe('DEVICE_NOT_AVAILABLE');
    expect(report.native_ios).toBe('DEVICE_NOT_AVAILABLE');
    expect(report.runtime_adapter).toBe('manual_sandbox_review');
    expect(report.sandbox_manual_review).toBe('SANDBOX_VERIFIED');
    expect(report.production_verification).toBe('EXTERNAL_GATED');
  });

  it('exposes checklist, markets, partner gates, document lifecycle, composes S94', () => {
    const report = evaluateRealKycFirstOnboarding();
    expect(buildRealKycActivationChecklist().length).toBeGreaterThanOrEqual(14);
    expect(report.checklist.every((c) => c.status !== undefined)).toBe(true);
    expect(buildRealKycMarketStatuses().map((m) => m.market)).toEqual([
      'GLOBAL',
      'IN',
      'AE',
      'US',
    ]);
    expect(report.markets.every((m) => m.production === 'PRODUCTION_EXTERNAL_GATED')).toBe(true);
    expect(report.markets.every((m) => m.healthcare_verification === 'LEGAL_GATED')).toBe(true);

    const gates = buildRealKycPartnerTypeGates();
    expect(gates.map((g) => g.partner_type)).toEqual([
      'VENDOR',
      'DOCTOR',
      'LAB',
      'IMAGING',
      'AFFILIATE',
    ]);
    expect(gates.every((g) => g.production_privilege === 'EXTERNAL_GATED')).toBe(true);
    expect(gates.find((g) => g.partner_type === 'DOCTOR')?.healthcare_distinct_from_business_kyc).toBe(
      true,
    );

    expect(report.document_lifecycle.document_verified_not_equal_partner_approved).toBe(true);
    expect(report.document_lifecycle.partner_approved_not_equal_production_enabled).toBe(true);
    expect(report.document_lifecycle.expired_revoked_lose_privileges).toBe(true);
    expect(report.document_lifecycle.statuses.length).toBeGreaterThanOrEqual(5);
    expect(report.healthcare_credential_model.policy_driven).toBe(true);
    expect(report.healthcare_credential_model.never_assert_global_legal_sufficiency).toBe(true);
    expect(report.webhook_security.unsigned_fail_closed).toBe(true);
    expect(report.country_policy.hardcoded_market).toBe(false);

    const s94 = evaluateKycFirstOnboarding();
    expect(s94.sprint).toBe(94);
    expect(s94.enabled).toBe(false);
  });
});

describe('S106 security + launch integration', () => {
  it('never leaks secrets and does not bypass S87', () => {
    expect(assertNoSecretLeak(JSON.stringify(evaluateRealKycFirstOnboarding()))).toBe(true);
    const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
    expect(launch.can_production_launch).toBe('NO');
    expect(launch.force_launch_available).toBe(false);
    expect(launch.rails.some((r) => r.rail_id === 'KYC_KYB')).toBe(true);
    expect(launch.rails.find((r) => r.rail_id === 'KYC_KYB')?.blocker_codes).toEqual(
      expect.arrayContaining([NO_PRODUCTION_KYC_KYB_PROVIDER]),
    );
  });

  it('no hardcoded UPI/INR/₹/+91/IST or invented KYC brands/licences', () => {
    const blob = JSON.stringify(evaluateRealKycFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/\bOnfido\b|\bJumio\b|\bSumsub\b|\bPersona\b/i);
    expect(blob).not.toMatch(/sk_live_|postgresql:\/\/[^:]+:[^@]+@|BEGIN PRIVATE KEY/);
    expect(blob).not.toMatch(/aadhaar|passport_number/i);
  });
});
