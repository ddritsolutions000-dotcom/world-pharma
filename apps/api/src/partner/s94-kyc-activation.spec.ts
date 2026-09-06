/**
 * Sprint 94 — Production KYC/KYB activation readiness
 * (no fake live KYC / licenses / registry results).
 */
import {
  KYC_API_ENDPOINT_REFERENCE_MISSING,
  KYC_CALLBACK_CONFIGURATION_MISSING,
  KYC_CREDENTIAL_REFERENCE_MISSING,
  KYC_HEALTHCARE_REGISTRY_CONFIGURATION_MISSING,
  KYC_MALWARE_SCAN_DEPENDENCY_GATED,
  KYC_MARKET_POLICY_CONFIGURATION_MISSING,
  KYC_PARTNER_TYPE_CONFIGURATION_MISSING,
  KYC_PROVIDER_NOT_SELECTED,
  KYC_STORAGE_KMS_DEPENDENCY_GATED,
  NO_PRODUCTION_KYC_KYB_PROVIDER,
  NO_PRODUCTION_KYC_PROVIDER,
  buildKycVerificationLifecycleMachine,
  evaluateKycEnablementGuard,
  evaluateKycFirstOnboarding,
  validateKycConfiguration,
} from './kyc-first-onboarding';
import { validateProductionKycConfiguration } from './production-kyc-requirements';

describe('S94 KYC activation contract', () => {
  it('reports Sprint 94 / NOT_SELECTED / EXTERNAL_GATED with blockers', () => {
    const report = evaluateKycFirstOnboarding();
    expect(report.sprint).toBe(94);
    expect(report.foundation_sprint).toBe(81);
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.activation_lifecycle).toBe('NOT_SELECTED');
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.verification_status).toBe('SANDBOX_ONLY');
    expect(report.enabled).toBe(false);
    expect(report.force_launch_available).toBe(false);
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_KYC_KYB_PROVIDER);
    expect(report.related_adapter_blocker).toBe(NO_PRODUCTION_KYC_PROVIDER);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        NO_PRODUCTION_KYC_KYB_PROVIDER,
        NO_PRODUCTION_KYC_PROVIDER,
        KYC_PROVIDER_NOT_SELECTED,
        KYC_CREDENTIAL_REFERENCE_MISSING,
        KYC_API_ENDPOINT_REFERENCE_MISSING,
        KYC_CALLBACK_CONFIGURATION_MISSING,
        KYC_MARKET_POLICY_CONFIGURATION_MISSING,
        KYC_PARTNER_TYPE_CONFIGURATION_MISSING,
        KYC_HEALTHCARE_REGISTRY_CONFIGURATION_MISSING,
        KYC_STORAGE_KMS_DEPENDENCY_GATED,
        KYC_MALWARE_SCAN_DEPENDENCY_GATED,
      ]),
    );
    expect(report.approval_vs_verification).toBe(
      'DOCUMENT_VERIFIED_SEPARATE_FROM_PARTNER_APPROVED_AND_PRODUCTION_ENABLED',
    );
    expect(report.object_storage).toBe('PRIVATE_STORAGE_EXTERNAL_GATED');
    expect(report.fake_license_invented).toBe(false);
    expect(report.secrets_printed).toBe(false);
    expect(report.phi_printed).toBe(false);
  });

  it('configuration readiness + eligibility distinctions stay gated', () => {
    const v = validateProductionKycConfiguration();
    expect(v.ready_for_activation).toBe(false);
    expect(v.secrets_exposed).toBe(false);
    expect(v.pii_exposed).toBe(false);
    expect(v.configuration_readiness.production_activation).toBe('EXTERNAL_GATED');
    expect(v.configuration_readiness.verification_capability).toBe('SANDBOX_ONLY');
    expect(v.eligibility.document_verified_equals_partner_approved).toBe(false);
    expect(v.eligibility.partner_approved_equals_production_enabled).toBe(false);
    expect(v.eligibility.sandbox_manual_review_equals_external_provider_verification).toBe(false);
    expect(v.eligibility.unscanned_document_equals_trusted).toBe(false);

    const report = evaluateKycFirstOnboarding();
    expect(report.country_policy.markets_supported_for_evaluation).toEqual([
      'GLOBAL',
      'IN',
      'AE',
      'US',
    ]);
    expect(report.permission_model.partner_cannot_self_approve_verification).toBe(true);
    expect(report.webhook_security.unsigned_fail_closed).toBe(true);
    expect(report.outbox_idempotency.timeout_not_auto_verified).toBe(true);
  });
});

describe('S94 lifecycle + enablement + globalization', () => {
  it('DOCUMENT VERIFIED ≠ PARTNER APPROVED ≠ PRODUCTION; never ENABLED from manual', () => {
    const life = buildKycVerificationLifecycleMachine();
    expect(life.document_verified_not_equal_partner_approved).toBe(true);
    expect(life.partner_approved_not_equal_production_enabled).toBe(true);
    expect(life.timeout_not_auto_verified).toBe(true);
    expect(life.verified_can_expire).toBe(true);

    expect(
      validateKycConfiguration({
        providerSelected: true,
        nonMockProductionProviderRegistered: true,
        infrastructureEnvironment: 'production',
        kycLiveEnabled: true,
        humanApproved: true,
        credentialsPresent: true,
        countryCoverageConfigured: true,
        objectStorageProductionReady: true,
        kmsReady: true,
        malwareScanReady: true,
        legalComplianceConfigured: true,
        privacyDpaConfigured: true,
      }),
    ).toBe('APPROVED');

    expect(
      evaluateKycEnablementGuard({
        nonMockProductionProviderRegistered: false,
        infrastructureEnvironment: 'production',
        kycLiveEnabled: true,
        humanApproved: true,
        legalComplianceClear: true,
        objectStorageProductionReady: true,
        kmsReady: true,
        malwareScanReady: true,
        privacyDpaClear: true,
        emergencyDisabled: false,
      }).can_enable,
    ).toBe(false);
  });

  it('no hardcoded UPI/INR/₹/+91/IST or invented vendors', () => {
    const blob = JSON.stringify(evaluateKycFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/\bONFIDO\b|\bJUMIO\b|\bSUMSUB\b|\bAADHAAR\b/i);
  });
});
