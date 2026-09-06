/**
 * Sprint 124 — KYC/KYB + healthcare partner verification activation preparation.
 */
import {
  NO_PRODUCTION_KYC_KYB_PROVIDER,
  KYC_PROVIDER_NOT_SELECTED,
  buildKycHealthcareConfigurationReferenceSlots,
  evaluateKycHealthcareFailClosedCases,
  assertKycInvalidStateProtections,
  evaluateKycHealthcarePartnerVerificationActivationPreparation,
} from './kyc-healthcare-partner-verification-activation-preparation';
import { evaluateRealKycFirstOnboarding } from './kyc-real-activation-first-onboarding';
import { isMockOrSandboxKycProvider } from './kyc-first-onboarding';
import { evaluateProductionSecurityGate } from '../ops/production-security-gate-consolidation';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';
import { assertNoSecretLeak } from '../ops/secret-redaction';

describe('S124 KYC healthcare partner verification activation preparation', () => {
  it('KYC NOT_SELECTED / EXTERNAL_GATED / no invented provider or verification', () => {
    const report = evaluateKycHealthcarePartnerVerificationActivationPreparation();
    expect(report.sprint).toBe(124);
    expect(report.authoritative_source).toBe(
      'kyc-healthcare-partner-verification-activation-preparation',
    );
    expect(report.parallel_kyc_framework_created).toBe(false);
    expect(report.parallel_kyb_framework_created).toBe(false);
    expect(report.parallel_partner_verification_system_created).toBe(false);
    expect(report.parallel_document_security_framework_created).toBe(false);
    expect(report.parallel_rbac_system_created).toBe(false);
    expect(report.fake_kyc_provider_invented).toBe(false);
    expect(report.real_kyc_provider_selected).toBe(false);
    expect(report.real_kyb_verification_completed).toBe(false);
    expect(report.real_healthcare_license_verified).toBe(false);
    expect(report.real_healthcare_registry_connected).toBe(false);
    expect(report.real_partner_production_approved).toBe(false);
    expect(report.kyc_provider.lifecycle).toBe('NOT_SELECTED');
    expect(report.kyc_provider.sandbox).toBe('SANDBOX_VERIFIED');
    expect(report.kyc_provider.production).toBe('EXTERNAL_GATED');
    expect(report.admin_summary.production_partner_verification).toBe('BLOCKED');
    expect(report.admin_summary.healthcare_registry).toBe('EXTERNAL_GATED');
    expect(report.healthcare_license_registry.distinct_from_business_kyc).toBe(true);
    expect(report.segregation_of_duties.status).toBe('PASS');
    expect(report.global_policy.hardcoded_india_global).toBe(false);
    expect(report.sandbox_vs_production.sandbox_cannot_satisfy_production).toBe(true);
    expect(report.production_fail_closed.overall).toBe('PASS');
    expect(report.force_launch_available).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_KYC_KYB_PROVIDER);
    expect(report.secrets_printed).toBe(false);
    expect(report.pii_phi_printed).toBe(false);
    expect(report.partner_types.map((p) => p.partner_type)).toEqual(
      expect.arrayContaining(['VENDOR', 'DOCTOR', 'LAB', 'IMAGING', 'AFFILIATE']),
    );
    expect(report.radiologist.production_privilege).toBe('EXTERNAL_GATED');
    expect(report.configuration_references.every((s) => s.value_present === false)).toBe(true);
    expect(buildKycHealthcareConfigurationReferenceSlots().length).toBeGreaterThanOrEqual(12);
  });

  it('fail-closed + invalid-state protections', () => {
    const cases = evaluateKycHealthcareFailClosedCases();
    expect(cases).toHaveLength(8);
    expect(cases.every((c) => c.production_verification_blocked)).toBe(true);
    expect(cases[0]!.primary_blocker).toBe(KYC_PROVIDER_NOT_SELECTED);
    const integrity = assertKycInvalidStateProtections();
    expect(integrity.submitted_cannot_skip_to_active_case).toBe(true);
    expect(integrity.rejected_cannot_become_verified).toBe(true);
    expect(integrity.verified_can_expire).toBe(true);
    expect(integrity.document_verified_neq_partner_approved).toBe(true);
    expect(isMockOrSandboxKycProvider('manual')).toBe(true);
  });
});

describe('S124 compose + regression', () => {
  it('composes S106/S116 and does not bypass S87', () => {
    expect(evaluateRealKycFirstOnboarding().real_kyc_provider_selected).toBe(false);
    expect(evaluateProductionSecurityGate().external_pentest_passed).toBe('NO');
    expect(
      evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' })
        .can_production_launch,
    ).toBe('NO');
    expect(
      assertNoSecretLeak(
        JSON.stringify(evaluateKycHealthcarePartnerVerificationActivationPreparation()),
      ),
    ).toBe(true);
  });

  it('no India hardcoding / no secret or PII leaks', () => {
    const blob = JSON.stringify(evaluateKycHealthcarePartnerVerificationActivationPreparation());
    expect(blob).not.toMatch(/\bUPI\b|\bINR\b|₹|\+91|\bIST\b|\bGST\b|\bPAN\b/);
    expect(blob).not.toMatch(/sk_live_|BEGIN PRIVATE KEY|apiSecret=|aadhaar|passport/i);
    expect(blob).not.toMatch(/Provider:\s*Onfido|Provider:\s*Jumio|Provider:\s*Sumsub/i);
  });
});
