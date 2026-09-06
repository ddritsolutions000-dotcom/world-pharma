/**
 * Sprint 81 — KYC/KYB + partner verification activation readiness (no fake live KYC).
 */
import { KycCaseStatus } from '@prisma/client';
import {
  NO_PRODUCTION_KYC_KYB_PROVIDER,
  NO_PRODUCTION_KYC_PROVIDER,
  assertVerifiedCanExpire,
  buildKycVerificationLifecycleMachine,
  evaluateKycEnablementGuard,
  evaluateKycFirstOnboarding,
  isMockOrSandboxKycProvider,
  listKycLegalComplianceGateItems,
  validateKycConfiguration,
} from './kyc-first-onboarding';
import { canTransitionKyc } from './kyc-state';
import { evaluateProviderActivation } from '../ops/provider-activation';
import { getProviderActivationContract } from '../ops/provider-activation-contracts';

describe('S81 KYC availability', () => {
  it('reports NOT_SELECTED / EXTERNAL_GATED — NO_PRODUCTION_KYC_KYB_PROVIDER', () => {
    const report = evaluateKycFirstOnboarding();
    expect(report.sprint).toBeGreaterThanOrEqual(81);
    expect([72, 81]).toContain(report.foundation_sprint);
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.real_kyc_available).toBe(false);
    expect(report.configured).toBe(false);
    expect(report.enabled).toBe(false);
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.sandbox).toBe('SANDBOX_VERIFIED');
    expect(report.verification_status).toBe('SANDBOX_ONLY');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_KYC_KYB_PROVIDER);
    expect(report.related_adapter_blocker).toBe(NO_PRODUCTION_KYC_PROVIDER);
    expect(report.object_storage).toBe('PRIVATE_STORAGE_EXTERNAL_GATED');
    expect(report.kms_encryption).toBe('KMS_EXTERNAL_GATED');
    expect(report.malware_scan).toBe('MALWARE_SCAN_EXTERNAL_GATED');
    expect(report.webhook).toBe('EXTERNAL_GATED');
    expect(report.fake_provider_invented).toBe(false);
    expect(report.fake_license_invented).toBe(false);
    expect(report.fake_verification_id_invented).toBe(false);
    expect(report.enablement_guard.can_enable).toBe(false);
    expect(report.native_android).toBe('DEVICE_NOT_AVAILABLE');
    expect(report.native_ios).toBe('DEVICE_NOT_AVAILABLE');
  });
});

describe('S81 verification lifecycle + permissions', () => {
  it('documents case/document machines and scoped access', () => {
    const life = buildKycVerificationLifecycleMachine();
    expect(life.case_success_path).toContain('SUBMITTED');
    expect(life.case_success_path).toContain('VERIFIED');
    expect(life.document_success_path).toContain('UPLOADED');
    expect(life.idempotent_submission).toBe(true);
    expect(life.terminal_overwrite_forbidden).toBe(true);
    expect(life.verified_can_expire).toBe(true);
    expect(assertVerifiedCanExpire()).toBe(true);
    expect(canTransitionKyc(KycCaseStatus.VERIFIED, KycCaseStatus.EXPIRED)).toBe(true);
    expect(canTransitionKyc(KycCaseStatus.REJECTED, KycCaseStatus.VERIFIED)).toBe(false);

    const report = evaluateKycFirstOnboarding();
    expect(report.permission_model.tenant_isolation).toBe(true);
    expect(report.permission_model.admin_activation_not_universal_document_access).toBe(true);
    expect(report.partner_activation_gating.activation_distinct_from_verification).toBe(true);
    expect(report.observability.no_pii_document_dumps).toBe(true);
    expect(report.country_support).toBe('POLICY_DRIVEN');
  });
});

describe('S81 enablement guard', () => {
  it('never enables without production KYC provider', () => {
    const guard = evaluateKycEnablementGuard({
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
    });
    expect(guard.can_enable).toBe(false);
  });

  it('requires full checklist including country policy', () => {
    const guard = evaluateKycEnablementGuard({
      nonMockProductionProviderRegistered: true,
      infrastructureEnvironment: 'production',
      kycLiveEnabled: true,
      humanApproved: true,
      legalComplianceClear: true,
      objectStorageProductionReady: true,
      kmsReady: true,
      malwareScanReady: true,
      privacyDpaClear: true,
      emergencyDisabled: false,
      countryPolicyConfigured: true,
    });
    expect(guard.can_enable).toBe(true);
  });

  it('blocks when malware scan missing', () => {
    const guard = evaluateKycEnablementGuard({
      nonMockProductionProviderRegistered: true,
      infrastructureEnvironment: 'production',
      kycLiveEnabled: true,
      humanApproved: true,
      legalComplianceClear: true,
      objectStorageProductionReady: true,
      kmsReady: true,
      malwareScanReady: false,
      privacyDpaClear: true,
      emergencyDisabled: false,
    });
    expect(guard.can_enable).toBe(false);
  });
});

describe('S81 configuration validator', () => {
  const base = {
    providerSelected: true,
    nonMockProductionProviderRegistered: true,
    infrastructureEnvironment: 'production' as const,
    kycLiveEnabled: false,
    humanApproved: false,
    credentialsPresent: true,
    countryCoverageConfigured: true,
    objectStorageProductionReady: true,
    kmsReady: true,
    malwareScanReady: true,
    legalComplianceConfigured: true,
    privacyDpaConfigured: true,
  };

  it('NOT_SELECTED when provider not chosen', () => {
    expect(validateKycConfiguration({ ...base, providerSelected: false })).toBe('NOT_SELECTED');
  });

  it('credentials alone never ENABLED', () => {
    expect(validateKycConfiguration({ ...base, humanApproved: true, kycLiveEnabled: true })).toBe(
      'APPROVED',
    );
  });
});

describe('S81 sandbox/production fail-closed', () => {
  it('treats manual/sandbox as non-production', () => {
    expect(isMockOrSandboxKycProvider('manual')).toBe(true);
    expect(isMockOrSandboxKycProvider('sandbox')).toBe(true);
    expect(isMockOrSandboxKycProvider('VENDOR_KYC_PROD')).toBe(false);
  });
});

describe('S81 legal gate + globalization', () => {
  it('legal items EXTERNAL_GATED; no INR/UPI/PII dumps', () => {
    const items = listKycLegalComplianceGateItems();
    expect(items.every((i) => i.status === 'EXTERNAL_GATED' || i.status === 'BLOCKED')).toBe(true);
    const blob = JSON.stringify(evaluateKycFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/passport_number|aadhaar|ssn|license_number/i);
    expect(blob).not.toMatch(/BEGIN PRIVATE KEY|apiSecret|eyJ/);
  });

  it('KYC contract remains NOT_SELECTED', () => {
    const row = evaluateProviderActivation(getProviderActivationContract('KYC'));
    expect(row.provider_name).toBe('NOT_SELECTED');
    expect(row.enabled).toBe(false);
  });
});
