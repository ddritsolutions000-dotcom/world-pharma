/**
 * Sprint 72 — KYC/KYB first onboarding (no fake live KYC provider).
 */
import { KycCaseStatus } from '@prisma/client';
import {
  assertVerifiedCanExpire,
  evaluateKycEnablementGuard,
  evaluateKycFirstOnboarding,
  isLiveKycEnabled,
  isMockOrSandboxKycProvider,
  listKycLegalComplianceGateItems,
  validateKycConfiguration,
} from './kyc-first-onboarding';
import { canTransitionKyc } from './kyc-state';
import { evaluateProviderActivation } from '../ops/provider-activation';
import { getProviderActivationContract } from '../ops/provider-activation-contracts';
import { readInfrastructureEnvironment } from '../ops/infra-environment';

describe('S72 KYC availability', () => {
  it('reports NOT_SELECTED / EXTERNAL_GATED — no production KYC provider', () => {
    const report = evaluateKycFirstOnboarding();
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.real_kyc_available).toBe(false);
    expect(report.configured).toBe(false);
    expect(report.enabled).toBe(false);
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.sandbox).toBe('SANDBOX_VERIFIED');
    expect(report.verification_status).toBe('SANDBOX_ONLY');
    expect(report.legal_compliance_gate).toBe('EXTERNAL_GATED');
    expect(report.remaining_blocker).toMatch(/NO_PRODUCTION_KYC_KYB_PROVIDER|NO_PRODUCTION_KYC_PROVIDER/);
    expect(report.beneficiary_verification).toBe('EXTERNAL_GATED');
    expect(report.phi_separation).toBe('SANDBOX_VERIFIED');
    expect(report.object_storage).toMatch(/EXTERNAL_GATED|PRIVATE_STORAGE_EXTERNAL_GATED/);
    expect(report.malware_scan).toMatch(/EXTERNAL_GATED|MALWARE_SCAN_EXTERNAL_GATED/);
    expect(report.secrets_printed).toBe(false);
    expect(report.document_contents_printed).toBe(false);
    expect(report.phi_printed).toBe(false);
    expect(report.enablement_guard.can_enable).toBe(false);
    expect(report.capabilities.live_identity_vendor).toBe('EXTERNAL_GATED');
    expect(report.capabilities.admin_manual_review).toBe('SANDBOX_VERIFIED');
  });
});

describe('S72 KYC configuration validator', () => {
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

  it('NOT_CONFIGURED without production provider or storage/legal prerequisites', () => {
    expect(
      validateKycConfiguration({ ...base, nonMockProductionProviderRegistered: false }),
    ).toBe('NOT_CONFIGURED');
    expect(validateKycConfiguration({ ...base, objectStorageProductionReady: false })).toBe(
      'NOT_CONFIGURED',
    );
    expect(validateKycConfiguration({ ...base, legalComplianceConfigured: false })).toBe(
      'NOT_CONFIGURED',
    );
  });

  it('CONFIGURED_BUT_UNAVAILABLE when environment is sandbox', () => {
    expect(
      validateKycConfiguration({ ...base, infrastructureEnvironment: 'sandbox' }),
    ).toBe('CONFIGURED_BUT_UNAVAILABLE');
  });

  it('VERIFIED → VERIFIED_BUT_DISABLED → APPROVED (credentials ≠ ENABLED)', () => {
    expect(validateKycConfiguration(base)).toBe('VERIFIED');
    expect(
      validateKycConfiguration({ ...base, humanApproved: true, kycLiveEnabled: false }),
    ).toBe('VERIFIED_BUT_DISABLED');
    expect(
      validateKycConfiguration({ ...base, humanApproved: true, kycLiveEnabled: true }),
    ).toBe('APPROVED');
  });
});

describe('S72 enablement guard', () => {
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

  it('requires full checklist', () => {
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
    });
    expect(guard.can_enable).toBe(true);
  });

  it('emergency disable blocks enablement', () => {
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
      emergencyDisabled: true,
    });
    expect(guard.can_enable).toBe(false);
  });
});

describe('S72 document lifecycle + expiry', () => {
  it('documents VERIFIED can expire (not forever)', () => {
    expect(assertVerifiedCanExpire()).toBe(true);
    expect(canTransitionKyc(KycCaseStatus.VERIFIED, KycCaseStatus.EXPIRED)).toBe(true);
  });

  it('supports SUBMITTED → UNDER_REVIEW → VERIFIED / REJECTED', () => {
    expect(canTransitionKyc(KycCaseStatus.SUBMITTED, KycCaseStatus.UNDER_REVIEW)).toBe(true);
    expect(canTransitionKyc(KycCaseStatus.UNDER_REVIEW, KycCaseStatus.VERIFIED)).toBe(true);
    expect(canTransitionKyc(KycCaseStatus.UNDER_REVIEW, KycCaseStatus.REJECTED)).toBe(true);
    expect(
      canTransitionKyc(KycCaseStatus.ADDITIONAL_INFORMATION_REQUIRED, KycCaseStatus.SUBMITTED),
    ).toBe(true);
  });

  it('report lists case + document statuses without inventing production verification', () => {
    const report = evaluateKycFirstOnboarding();
    expect(report.kyc_case_statuses_supported).toEqual(
      expect.arrayContaining(['SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED']),
    );
    expect(report.kyc_document_statuses_supported).toEqual(
      expect.arrayContaining(['UPLOADED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED']),
    );
    expect(report.verification_status).not.toBe('ENABLED');
  });
});

describe('S72 sandbox/production + partner gates', () => {
  const prev = {
    env: process.env['INFRASTRUCTURE_ENVIRONMENT'],
    kyc: process.env['KYC_LIVE_ENABLED'],
  };

  afterEach(() => {
    const restore = (k: string, v: string | undefined) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    };
    restore('INFRASTRUCTURE_ENVIRONMENT', prev.env);
    restore('KYC_LIVE_ENABLED', prev.kyc);
  });

  it('treats MANUAL/SANDBOX/MOCK as non-production KYC providers', () => {
    expect(isMockOrSandboxKycProvider('MANUAL')).toBe(true);
    expect(isMockOrSandboxKycProvider('SANDBOX_KYC')).toBe(true);
    expect(isMockOrSandboxKycProvider('MOCK_VENDOR')).toBe(true);
    expect(isMockOrSandboxKycProvider('ACME_KYC_PROD')).toBe(false);
  });

  it('KYC_LIVE alone does not select production provider', () => {
    process.env['INFRASTRUCTURE_ENVIRONMENT'] = 'production';
    process.env['KYC_LIVE_ENABLED'] = 'true';
    expect(readInfrastructureEnvironment()).toBe('production');
    expect(isLiveKycEnabled()).toBe(true);
    const report = evaluateKycFirstOnboarding();
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.real_kyc_available).toBe(false);
    expect(report.enablement_guard.can_enable).toBe(false);
  });

  it('separates partner-type gates and approval vs verification', () => {
    const report = evaluateKycFirstOnboarding();
    expect(report.partner_type_gates.vendor_pharmacy_kyb).toBe('SANDBOX_ONLY');
    expect(report.partner_type_gates.doctor_credentials).toBe('SANDBOX_ONLY');
    expect(report.partner_type_gates.lab_accreditation).toBe('SANDBOX_ONLY');
    expect(report.partner_type_gates.imaging_facility).toBe('SANDBOX_ONLY');
    expect(report.partner_type_gates.affiliate_beneficiary).toBe('EXTERNAL_GATED');
    expect(report.partner_type_gates.country_specific_rules).toBe('LEGAL_REVIEW_REQUIRED');
    expect(report.approval_vs_verification).toContain('DOCUMENT_VERIFIED_SEPARATE');
  });
});

describe('S72 legal gate + activation + globalization', () => {
  it('legal/compliance gate items remain EXTERNAL_GATED', () => {
    const items = listKycLegalComplianceGateItems();
    expect(items.length).toBeGreaterThanOrEqual(5);
    expect(items.every((i) => i.status === 'EXTERNAL_GATED' || i.status === 'BLOCKED')).toBe(true);
    expect(items.find((i) => i.id === 'object_storage_kms')?.status).toBe('EXTERNAL_GATED');
  });

  it('KYC contract remains NOT_SELECTED with external blocker', () => {
    const row = evaluateProviderActivation(getProviderActivationContract('KYC'));
    expect(row.provider_name).toBe('NOT_SELECTED');
    expect(row.enabled).toBe(false);
    expect(row.external_blocker).toBeTruthy();
  });

  it('onboarding report has no hardcoded UPI/INR/₹/+91/IST and no secrets/PHI', () => {
    const blob = JSON.stringify(evaluateKycFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/passport|ssn|aadhaar|apiSecret|eyJ/i);
  });
});
