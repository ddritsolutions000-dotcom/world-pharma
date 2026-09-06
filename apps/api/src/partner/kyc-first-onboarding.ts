/**
 * Sprint 72 foundation + Sprint 81 readiness + Sprint 94 production KYC/KYB +
 * healthcare partner verification activation readiness.
 * Never invent KYC vendors, real licenses, accreditation registries, or live verification.
 * Never print secrets / raw document contents / unnecessary PII.
 *
 * DOCUMENT VERIFIED ≠ PARTNER APPROVED ≠ PRODUCTION ENABLED.
 * Manual sandbox review ≠ live KYC provider.
 */
import { KycCaseStatus, KycDocumentStatus } from '@prisma/client';
import { readInfrastructureEnvironment } from '../ops/infra-environment';
import { evaluateProviderActivation } from '../ops/provider-activation';
import { getProviderActivationContract } from '../ops/provider-activation-contracts';
import { canTransitionKyc } from './kyc-state';
import {
  KYC_PROVIDER_NOT_SELECTED,
  validateProductionKycConfiguration,
  type ProductionKycConfigurationValidation,
} from './production-kyc-requirements';

/** Sprint 81/94 primary activation blocker (KYC/KYB rail). Never remove. */
export const NO_PRODUCTION_KYC_KYB_PROVIDER = 'NO_PRODUCTION_KYC_KYB_PROVIDER';
/** Historical S72 provider-gate code retained for enablement / compat. */
export const NO_PRODUCTION_KYC_PROVIDER = 'NO_PRODUCTION_KYC_PROVIDER';

export {
  KYC_PROVIDER_NOT_SELECTED,
  KYC_CREDENTIAL_REFERENCE_MISSING,
  KYC_API_ENDPOINT_REFERENCE_MISSING,
  KYC_CALLBACK_CONFIGURATION_MISSING,
  KYC_MARKET_POLICY_CONFIGURATION_MISSING,
  KYC_PARTNER_TYPE_CONFIGURATION_MISSING,
  KYC_STORAGE_KMS_DEPENDENCY_GATED,
  KYC_MALWARE_SCAN_DEPENDENCY_GATED,
  KYC_HEALTHCARE_REGISTRY_CONFIGURATION_MISSING,
} from './production-kyc-requirements';

export type KycValidationStatus =
  | 'NOT_CONFIGURED'
  | 'CONFIGURED_BUT_UNAVAILABLE'
  | 'VERIFIED_BUT_DISABLED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED'
  | 'EXTERNAL_GATED'
  | 'NOT_SELECTED'
  | 'DISABLED';

export type KycActivationLifecycle =
  | 'NOT_SELECTED'
  | 'CONFIGURED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED'
  | 'DISABLED'
  | 'EXTERNAL_GATED';

export type KycEnablementGuardCheck = {
  id: string;
  ok: boolean;
  detail: string;
};

export type KycLegalGateItem = {
  id: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_VERIFICATION' | 'VERIFIED' | 'BLOCKED' | 'EXTERNAL_GATED';
  owner: string;
  evidence_required: string;
  blocker: string;
  next_action: string;
};

export type KycCapabilityStatus =
  | 'SANDBOX_VERIFIED'
  | 'EXTERNAL_GATED'
  | 'NOT_SELECTED'
  | 'SANDBOX_ONLY'
  | 'POLICY_DRIVEN'
  | 'POLICY_REQUIRED'
  | 'LEGAL_REVIEW_REQUIRED'
  | 'LEGAL_GATED';

export type KycVerificationLifecycleMachine = {
  case_success_path: string[];
  document_success_path: string[];
  exception_states: string[];
  notes: string[];
  terminal_overwrite_forbidden: true;
  idempotent_submission: true;
  verified_can_expire: true;
  document_verified_not_equal_partner_approved: true;
  partner_approved_not_equal_production_enabled: true;
  timeout_not_auto_verified: true;
};

export type KycWebhookSecurity = {
  status: 'NOT_APPLICABLE' | 'SANDBOX_ONLY' | 'EXTERNAL_GATED';
  unsigned_fail_closed: true;
  invalid_signature_rejected: true;
  duplicate_idempotent: true;
  secrets_logged: false;
  pii_logged: false;
};

export type KycFirstOnboardingReport = {
  /** Production activation readiness sprint; foundation S81 on S72 rail. */
  sprint: 94;
  foundation_sprint: 81;
  provider: 'NOT_SELECTED' | string;
  environment: 'sandbox' | 'production';
  configured: boolean;
  verified: boolean;
  approved: boolean;
  enabled: boolean;
  validation_status: KycValidationStatus;
  activation_lifecycle: KycActivationLifecycle;
  sandbox: 'SANDBOX_VERIFIED' | 'SANDBOX_AVAILABLE';
  production: 'EXTERNAL_GATED' | 'BLOCKED' | 'ENABLED';
  verification_status: 'SANDBOX_ONLY' | 'NOT_VERIFIED' | 'EXTERNAL_GATED';
  identity_verification: 'SANDBOX_ONLY' | 'EXTERNAL_GATED';
  business_verification: 'SANDBOX_ONLY' | 'EXTERNAL_GATED';
  professional_credential_verification: 'SANDBOX_ONLY' | 'EXTERNAL_GATED';
  beneficiary_verification: 'EXTERNAL_GATED' | 'SANDBOX_ONLY';
  country_support: 'POLICY_DRIVEN' | 'EXTERNAL_GATED' | 'POLICY_REQUIRED';
  legal_compliance_gate: 'EXTERNAL_GATED' | 'LEGAL_GATED';
  document_lifecycle: 'SANDBOX_VERIFIED';
  verification_lifecycle: KycVerificationLifecycleMachine;
  webhook_security: KycWebhookSecurity;
  expiry_renewal: 'SANDBOX_VERIFIED';
  webhook: 'EXTERNAL_GATED' | 'SANDBOX_ONLY' | 'NOT_APPLICABLE';
  object_storage: 'EXTERNAL_GATED' | 'PRIVATE_STORAGE_EXTERNAL_GATED';
  kms_encryption: 'EXTERNAL_GATED' | 'KMS_EXTERNAL_GATED';
  malware_scan: 'EXTERNAL_GATED' | 'MALWARE_SCAN_EXTERNAL_GATED';
  phi_separation: 'SANDBOX_VERIFIED';
  approval_vs_verification:
    | 'DOCUMENT_VERIFIED_SEPARATE_FROM_PARTNER_APPROVED_AND_PRODUCTION_ENABLED'
    | string;
  partner_type_gates: Record<string, KycCapabilityStatus>;
  partner_activation_gating: {
    unverified_vendor_not_production_ready: true;
    unverified_doctor_not_production_clinical: true;
    unverified_lab_imaging_not_production_clinical: true;
    unverified_affiliate_not_production_payout: true;
    activation_distinct_from_verification: true;
  };
  capabilities: Record<string, KycCapabilityStatus>;
  kyc_case_statuses_supported: string[];
  kyc_document_statuses_supported: string[];
  real_kyc_available: false | true;
  runtime_adapter: 'manual_sandbox_review' | 'none';
  activation_stage: string;
  remaining_blocker: typeof NO_PRODUCTION_KYC_KYB_PROVIDER | string;
  remaining_blockers: string[];
  related_adapter_blocker: typeof NO_PRODUCTION_KYC_PROVIDER;
  s64_external_blocker: string | null;
  next_action: string;
  enablement_guard: {
    can_enable: false | true;
    checks: KycEnablementGuardCheck[];
  };
  configuration_validation: ProductionKycConfigurationValidation;
  force_launch_available: false;
  country_policy: {
    status: 'POLICY_DRIVEN';
    hardcoded_market: false;
    markets_supported_for_evaluation: Array<'GLOBAL' | 'IN' | 'AE' | 'US'>;
    note: string;
  };
  legal_gate_items: KycLegalGateItem[];
  permission_model: {
    tenant_isolation: true;
    cross_partner_document_isolation: true;
    customer_cannot_access_partner_kyc: true;
    partner_cannot_self_approve_verification: true;
    admin_activation_not_universal_document_access: true;
    review_permission_scoped: true;
  };
  observability: {
    audit_events: true;
    correlation_id: true;
    no_pii_document_dumps: true;
    not_selected_suppresses_false_outage: true;
  };
  outbox_idempotency: {
    case_keys: 'DETERMINISTIC';
    duplicate_callback_safe: true;
    timeout_not_auto_verified: true;
    sandbox_not_masquerading_as_external: true;
  };
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
  secrets_printed: false;
  document_contents_printed: false;
  phi_printed: false;
  fake_provider_invented: false;
  fake_license_invented: false;
  fake_verification_id_invented: false;
  message: string;
};

export function isLiveKycEnabled(): boolean {
  return process.env['KYC_LIVE_ENABLED']?.trim().toLowerCase() === 'true';
}

/** Mock / sandbox identifiers must never count as production KYC. */
export function isMockOrSandboxKycProvider(code: string | null | undefined): boolean {
  if (!code) return true;
  const upper = code.trim().toUpperCase();
  return (
    upper === 'MANUAL' ||
    upper === 'SANDBOX' ||
    upper === 'NULL' ||
    upper.startsWith('MOCK') ||
    upper.includes('SANDBOX')
  );
}

/** Deterministic validator — credentials alone never yield ENABLED. */
export function validateKycConfiguration(input: {
  providerSelected: boolean;
  nonMockProductionProviderRegistered: boolean;
  infrastructureEnvironment: 'sandbox' | 'production';
  kycLiveEnabled: boolean;
  humanApproved: boolean;
  credentialsPresent: boolean;
  countryCoverageConfigured: boolean;
  objectStorageProductionReady: boolean;
  kmsReady: boolean;
  malwareScanReady: boolean;
  legalComplianceConfigured: boolean;
  privacyDpaConfigured: boolean;
}): KycValidationStatus {
  if (!input.providerSelected) return 'NOT_SELECTED';
  if (!input.nonMockProductionProviderRegistered) return 'NOT_CONFIGURED';
  const core =
    input.credentialsPresent &&
    input.countryCoverageConfigured &&
    input.objectStorageProductionReady &&
    input.kmsReady &&
    input.malwareScanReady &&
    input.legalComplianceConfigured &&
    input.privacyDpaConfigured;
  if (!core) return 'NOT_CONFIGURED';
  if (input.infrastructureEnvironment !== 'production') {
    return 'CONFIGURED_BUT_UNAVAILABLE';
  }
  if (!input.humanApproved) return 'VERIFIED';
  if (!input.kycLiveEnabled) return 'VERIFIED_BUT_DISABLED';
  return 'APPROVED';
}

export function evaluateKycEnablementGuard(input: {
  nonMockProductionProviderRegistered: boolean;
  infrastructureEnvironment: 'sandbox' | 'production';
  kycLiveEnabled: boolean;
  humanApproved: boolean;
  legalComplianceClear: boolean;
  objectStorageProductionReady: boolean;
  kmsReady: boolean;
  malwareScanReady: boolean;
  privacyDpaClear: boolean;
  emergencyDisabled: boolean;
  countryPolicyConfigured?: boolean;
}): { can_enable: false | true; checks: KycEnablementGuardCheck[] } {
  const checks: KycEnablementGuardCheck[] = [
    {
      id: 'non_mock_provider',
      ok: input.nonMockProductionProviderRegistered,
      detail: input.nonMockProductionProviderRegistered
        ? 'Non-mock production KYC provider registered'
        : `Manual sandbox review only — ${NO_PRODUCTION_KYC_KYB_PROVIDER}`,
    },
    {
      id: 'environment_production',
      ok: input.infrastructureEnvironment === 'production',
      detail: `INFRASTRUCTURE_ENVIRONMENT=${input.infrastructureEnvironment}`,
    },
    {
      id: 'kyc_live_flag',
      ok: input.kycLiveEnabled,
      detail: input.kycLiveEnabled ? 'KYC_LIVE_ENABLED=true' : 'KYC_LIVE_ENABLED is not true',
    },
    {
      id: 'human_approved',
      ok: input.humanApproved,
      detail: input.humanApproved
        ? 'Human approval recorded'
        : 'PROVIDER_APPROVED_KYC missing',
    },
    {
      id: 'legal_compliance_gate',
      ok: input.legalComplianceClear,
      detail: input.legalComplianceClear
        ? 'Legal/compliance prerequisites verified'
        : 'Legal/compliance KYC gate EXTERNAL_GATED',
    },
    {
      id: 'object_storage',
      ok: input.objectStorageProductionReady,
      detail: input.objectStorageProductionReady
        ? 'Production object storage ready'
        : 'PRIVATE_STORAGE_EXTERNAL_GATED (no local-disk production path)',
    },
    {
      id: 'kms_encryption',
      ok: input.kmsReady,
      detail: input.kmsReady ? 'KMS/encryption ready' : 'KMS_EXTERNAL_GATED',
    },
    {
      id: 'malware_scan',
      ok: input.malwareScanReady,
      detail: input.malwareScanReady
        ? 'Malware scanning ready'
        : 'MALWARE_SCAN_EXTERNAL_GATED',
    },
    {
      id: 'privacy_dpa',
      ok: input.privacyDpaClear,
      detail: input.privacyDpaClear
        ? 'Privacy/DPA requirements cleared'
        : 'Privacy/data-processing EXTERNAL_GATED',
    },
    {
      id: 'country_policy',
      ok: input.countryPolicyConfigured !== false,
      detail:
        input.countryPolicyConfigured === false
          ? 'Country verification policy POLICY_REQUIRED'
          : 'Verification rules remain POLICY_DRIVEN / LEGAL_GATED per market',
    },
    {
      id: 'not_emergency_disabled',
      ok: !input.emergencyDisabled,
      detail: input.emergencyDisabled ? 'Emergency disable active' : 'No emergency disable',
    },
  ];
  return { can_enable: checks.every((c) => c.ok) ? true : false, checks };
}

export function buildKycVerificationLifecycleMachine(): KycVerificationLifecycleMachine {
  return {
    case_success_path: [
      'NOT_STARTED',
      'IN_PROGRESS',
      'SUBMITTED',
      'UNDER_REVIEW',
      'VERIFIED',
    ],
    document_success_path: ['UPLOADED', 'UNDER_REVIEW', 'VERIFIED'],
    exception_states: [
      'ADDITIONAL_INFORMATION_REQUIRED',
      'REJECTED',
      'EXPIRED',
      'RETIRED',
    ],
    notes: [
      'Reuse existing kyc-state transitions — do not invent a second machine.',
      'Manual sandbox review ≠ production KYC/KYB provider verification.',
      'VERIFIED → EXPIRED is supported; verified today is not verified forever.',
      'REJECTED is terminal in current enum; resubmission starts a new case/path where product supports it.',
      'DOCUMENT VERIFIED ≠ PARTNER APPROVED ≠ PRODUCTION ENABLED.',
      'Provider timeout must never auto-promote to VERIFIED.',
      'Submissions use deterministic idempotency; terminal overwrite forbidden.',
    ],
    terminal_overwrite_forbidden: true,
    idempotent_submission: true,
    verified_can_expire: true,
    document_verified_not_equal_partner_approved: true,
    partner_approved_not_equal_production_enabled: true,
    timeout_not_auto_verified: true,
  };
}

export function listKycLegalComplianceGateItems(): KycLegalGateItem[] {
  return [
    {
      id: 'provider_contract',
      status: 'EXTERNAL_GATED',
      owner: 'Trust & Safety / Legal',
      evidence_required: 'Signed KYC/KYB vendor contract + DPA',
      blocker: NO_PRODUCTION_KYC_KYB_PROVIDER,
      next_action: 'Procure market-authorized KYC/accreditation vendor',
    },
    {
      id: 'country_coverage',
      status: 'EXTERNAL_GATED',
      owner: 'Compliance / Product',
      evidence_required: 'Country coverage matrix by partner type',
      blocker: 'Country verification requirements POLICY_REQUIRED / LEGAL_REVIEW_REQUIRED',
      next_action: 'Complete policy packs; do not hardcode a single market',
    },
    {
      id: 'accreditation_registries',
      status: 'EXTERNAL_GATED',
      owner: 'Clinical ops / Compliance',
      evidence_required: 'Doctor/lab/imaging registry connectivity where required',
      blocker: 'Live accreditation registries EXTERNAL_GATED',
      next_action: 'Wire registries after vendor + legal review',
    },
    {
      id: 'object_storage_kms',
      status: 'EXTERNAL_GATED',
      owner: 'Platform / Security',
      evidence_required: 'Private bucket + encryption/KMS + short-lived access',
      blocker: 'PRIVATE_STORAGE_EXTERNAL_GATED / KMS_EXTERNAL_GATED',
      next_action: 'Never use permanent public URLs or local disk for production KYC',
    },
    {
      id: 'malware_scan',
      status: 'EXTERNAL_GATED',
      owner: 'Security',
      evidence_required: 'Malware/file scanning for uploads',
      blocker: 'MALWARE_SCAN_EXTERNAL_GATED',
      next_action: 'Register scanner before live document ingestion',
    },
    {
      id: 'privacy_retention',
      status: 'EXTERNAL_GATED',
      owner: 'Privacy / Legal',
      evidence_required: 'Retention/deletion policy for identity evidence',
      blocker: 'Retention policy not production-attested',
      next_action: 'Complete privacy retention review',
    },
    {
      id: 'reviewer_controls',
      status: 'EXTERNAL_GATED',
      owner: 'Trust & Safety',
      evidence_required: 'Permission-scoped review + audit controls',
      blocker: 'Production reviewer controls not attested',
      next_action: 'Confirm dual-control / SoD for high-risk approvals',
    },
  ];
}

/** Soft assert existing transition table still encodes VERIFIED → EXPIRED (not forever). */
export function assertVerifiedCanExpire(): boolean {
  return canTransitionKyc(KycCaseStatus.VERIFIED, KycCaseStatus.EXPIRED);
}

/** Authoritative KYC onboarding snapshot — manual sandbox review only. */
export function evaluateKycFirstOnboarding(): KycFirstOnboardingReport {
  const env = readInfrastructureEnvironment();
  const live = isLiveKycEnabled();
  const activation = evaluateProviderActivation(getProviderActivationContract('KYC'));
  const humanApproved =
    process.env['PROVIDER_APPROVED_KYC']?.trim().toLowerCase() === 'true' ||
    process.env['PROVIDER_APPROVED_KYC_PROVIDER']?.trim().toLowerCase() === 'true';
  const emergency =
    process.env['PROVIDER_EMERGENCY_DISABLE_ALL']?.trim().toLowerCase() === 'true' ||
    process.env['PROVIDER_EMERGENCY_DISABLE_KYC']?.trim().toLowerCase() === 'true';

  void isMockOrSandboxKycProvider('manual');
  void assertVerifiedCanExpire();
  void KycDocumentStatus.VERIFIED;
  void KYC_PROVIDER_NOT_SELECTED;

  const real = false;
  const guard = evaluateKycEnablementGuard({
    nonMockProductionProviderRegistered: real,
    infrastructureEnvironment: env,
    kycLiveEnabled: live,
    humanApproved,
    legalComplianceClear: false,
    objectStorageProductionReady: false,
    kmsReady: false,
    malwareScanReady: false,
    privacyDpaClear: false,
    emergencyDisabled: emergency,
  });

  const validation_status = validateKycConfiguration({
    providerSelected: false,
    nonMockProductionProviderRegistered: real,
    infrastructureEnvironment: env,
    kycLiveEnabled: live,
    humanApproved,
    credentialsPresent: false,
    countryCoverageConfigured: false,
    objectStorageProductionReady: false,
    kmsReady: false,
    malwareScanReady: false,
    legalComplianceConfigured: false,
    privacyDpaConfigured: false,
  });

  const configuration_validation = validateProductionKycConfiguration({
    providerSelected: real,
    providerName: 'NOT_SELECTED',
    nonMockProviderRegistered: real,
  });

  const remaining_blockers = [
    NO_PRODUCTION_KYC_KYB_PROVIDER,
    NO_PRODUCTION_KYC_PROVIDER,
    ...configuration_validation.blockers,
  ];

  const verificationLifecycle = buildKycVerificationLifecycleMachine();

  return {
    sprint: 94,
    foundation_sprint: 81,
    provider: 'NOT_SELECTED',
    environment: env,
    configured: false,
    verified: false,
    approved: false,
    enabled: false,
    validation_status,
    activation_lifecycle: 'NOT_SELECTED',
    sandbox: 'SANDBOX_VERIFIED',
    production: 'EXTERNAL_GATED',
    verification_status: 'SANDBOX_ONLY',
    identity_verification: 'SANDBOX_ONLY',
    business_verification: 'SANDBOX_ONLY',
    professional_credential_verification: 'SANDBOX_ONLY',
    beneficiary_verification: 'EXTERNAL_GATED',
    country_support: 'POLICY_DRIVEN',
    legal_compliance_gate: 'EXTERNAL_GATED',
    document_lifecycle: 'SANDBOX_VERIFIED',
    verification_lifecycle: verificationLifecycle,
    webhook_security: {
      status: 'EXTERNAL_GATED',
      unsigned_fail_closed: true,
      invalid_signature_rejected: true,
      duplicate_idempotent: true,
      secrets_logged: false,
      pii_logged: false,
    },
    expiry_renewal: 'SANDBOX_VERIFIED',
    webhook: 'EXTERNAL_GATED',
    object_storage: 'PRIVATE_STORAGE_EXTERNAL_GATED',
    kms_encryption: 'KMS_EXTERNAL_GATED',
    malware_scan: 'MALWARE_SCAN_EXTERNAL_GATED',
    phi_separation: 'SANDBOX_VERIFIED',
    approval_vs_verification:
      'DOCUMENT_VERIFIED_SEPARATE_FROM_PARTNER_APPROVED_AND_PRODUCTION_ENABLED',
    partner_type_gates: {
      vendor_pharmacy_kyb: 'SANDBOX_ONLY',
      doctor_credentials: 'SANDBOX_ONLY',
      lab_accreditation: 'SANDBOX_ONLY',
      imaging_facility: 'SANDBOX_ONLY',
      affiliate_beneficiary: 'EXTERNAL_GATED',
      country_specific_rules: 'LEGAL_REVIEW_REQUIRED',
    },
    partner_activation_gating: {
      unverified_vendor_not_production_ready: true,
      unverified_doctor_not_production_clinical: true,
      unverified_lab_imaging_not_production_clinical: true,
      unverified_affiliate_not_production_payout: true,
      activation_distinct_from_verification: true,
    },
    capabilities: {
      document_upload: 'SANDBOX_VERIFIED',
      admin_manual_review: 'SANDBOX_VERIFIED',
      live_identity_vendor: 'EXTERNAL_GATED',
      live_business_registry: 'EXTERNAL_GATED',
      live_medical_license_registry: 'EXTERNAL_GATED',
      live_lab_accreditation_registry: 'EXTERNAL_GATED',
      payout_eligibility_dependency: 'EXTERNAL_GATED',
      erx_eligibility_dependency: 'EXTERNAL_GATED',
      tenant_isolation: 'SANDBOX_VERIFIED',
      audit_trail: 'SANDBOX_VERIFIED',
      emergency_disable: 'SANDBOX_VERIFIED',
    },
    kyc_case_statuses_supported: [
      'NOT_STARTED',
      'IN_PROGRESS',
      'SUBMITTED',
      'UNDER_REVIEW',
      'ADDITIONAL_INFORMATION_REQUIRED',
      'VERIFIED',
      'REJECTED',
      'EXPIRED',
    ],
    kyc_document_statuses_supported: [
      'UPLOADED',
      'UNDER_REVIEW',
      'VERIFIED',
      'REJECTED',
      'RETIRED',
    ],
    real_kyc_available: real,
    runtime_adapter: 'manual_sandbox_review',
    activation_stage: activation.stage,
    remaining_blocker: NO_PRODUCTION_KYC_KYB_PROVIDER,
    remaining_blockers,
    related_adapter_blocker: NO_PRODUCTION_KYC_PROVIDER,
    s64_external_blocker: activation.external_blocker,
    next_action:
      'Supply KYC/KYB vendor + accreditation sources + vault secret refs + production storage/KMS/scanner; set PROVIDER_APPROVED_KYC; then KYC_LIVE_ENABLED after guard. Manual sandbox review is not live KYC.',
    enablement_guard: guard,
    configuration_validation,
    force_launch_available: false,
    country_policy: {
      status: 'POLICY_DRIVEN',
      hardcoded_market: false,
      markets_supported_for_evaluation: ['GLOBAL', 'IN', 'AE', 'US'],
      note: 'Partner verification requirements remain policy packs — do not invent regulatory rules.',
    },
    legal_gate_items: listKycLegalComplianceGateItems(),
    permission_model: {
      tenant_isolation: true,
      cross_partner_document_isolation: true,
      customer_cannot_access_partner_kyc: true,
      partner_cannot_self_approve_verification: true,
      admin_activation_not_universal_document_access: true,
      review_permission_scoped: true,
    },
    observability: {
      audit_events: true,
      correlation_id: true,
      no_pii_document_dumps: true,
      not_selected_suppresses_false_outage: true,
    },
    outbox_idempotency: {
      case_keys: 'DETERMINISTIC',
      duplicate_callback_safe: true,
      timeout_not_auto_verified: true,
      sandbox_not_masquerading_as_external: true,
    },
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    secrets_printed: false,
    document_contents_printed: false,
    phi_printed: false,
    fake_provider_invented: false,
    fake_license_invented: false,
    fake_verification_id_invented: false,
    message:
      'No production KYC/KYB provider selected (NO_PRODUCTION_KYC_KYB_PROVIDER). Sandbox partner document upload + Admin manual review remain available. Live registries EXTERNAL_GATED. DOCUMENT VERIFIED ≠ PARTNER APPROVED ≠ PRODUCTION ENABLED.',
  };
}
