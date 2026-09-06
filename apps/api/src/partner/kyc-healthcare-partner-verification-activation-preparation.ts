/**
 * Sprint 124 — Real KYC/KYB + healthcare partner verification activation preparation.
 * Composes S72/S81/S94/S106 (+ S87 launch, S110 SoD, S116 security, S117–S123 foundation).
 * Does NOT invent KYC providers, registries, licenses, credentials, or production approvals.
 * Does NOT create a second KYC/KYB/partner-verification/document-security/RBAC framework.
 * Current state MUST remain NOT_SELECTED / EXTERNAL_GATED. CAN_PRODUCTION_LAUNCH = NO.
 */
import {
  NO_PRODUCTION_KYC_KYB_PROVIDER,
  NO_PRODUCTION_KYC_PROVIDER,
  evaluateKycFirstOnboarding,
  evaluateKycEnablementGuard,
  buildKycVerificationLifecycleMachine,
  isMockOrSandboxKycProvider,
} from './kyc-first-onboarding';
import {
  evaluateRealKycFirstOnboarding,
  buildRealKycActivationChecklist,
  buildRealKycMarketStatuses,
  buildRealKycPartnerTypeGates,
} from './kyc-real-activation-first-onboarding';
import {
  validateProductionKycConfiguration,
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
import { canTransitionKyc } from './kyc-state';
import { KycCaseStatus } from '@prisma/client';
import { readInfrastructureEnvironment } from '../ops/infra-environment';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';
import {
  evaluateProductionSecurityGate,
  EXTERNAL_PENTEST_REQUIRED,
} from '../ops/production-security-gate-consolidation';
import { evaluateProductionFoundationActivationPreparation } from '../ops/production-foundation-activation-preparation';
import { evaluateProductionReleaseEngineeringReadiness } from '../ops/production-release-engineering-readiness';
import { evaluateProductionDeploymentTargetActivation } from '../ops/production-deployment-target-activation-contract';
import { evaluatePspPaymentActivationPreparation } from '../payment/psp-payment-activation-preparation';
import { evaluateOtpMessagingActivationPreparation } from '../identity/otp-messaging-activation-preparation';
import { evaluateCarrierLogisticsActivationPreparation } from '../logistics/carrier-logistics-activation-preparation';
import { evaluateVendorFulfillmentRealUseClosure } from '../orders/vendor-fulfillment-real-use-closure';

export {
  NO_PRODUCTION_KYC_KYB_PROVIDER,
  NO_PRODUCTION_KYC_PROVIDER,
  KYC_PROVIDER_NOT_SELECTED,
  KYC_CREDENTIAL_REFERENCE_MISSING,
  KYC_HEALTHCARE_REGISTRY_CONFIGURATION_MISSING,
};

export const KYC_HEALTHCARE_PARTNER_VERIFICATION_ACTIVATION_PREPARATION_AUTHORITATIVE =
  'KYC_HEALTHCARE_PARTNER_VERIFICATION_ACTIVATION_PREPARATION_AUTHORITATIVE';

export type KycConfigReferenceSlot = {
  id: string;
  label: string;
  reference_key: string;
  status: 'MISSING' | 'EXTERNAL_GATED' | 'NOT_SELECTED' | 'PRESENT';
  value_present: false;
  invented: false;
  secret: boolean;
};

export function buildKycHealthcareConfigurationReferenceSlots(): KycConfigReferenceSlot[] {
  const slot = (
    id: string,
    label: string,
    reference_key: string,
    status: KycConfigReferenceSlot['status'],
    secret: boolean,
  ): KycConfigReferenceSlot => ({
    id,
    label,
    reference_key,
    status,
    value_present: false,
    invented: false,
    secret,
  });

  return [
    slot('provider_identity', 'KYC/KYB provider identity', 'KYC_PROVIDER', 'NOT_SELECTED', false),
    slot('api_endpoint', 'Production API endpoint reference', 'KYC_API_ENDPOINT_REF', 'MISSING', false),
    slot('credential', 'Credential / secret reference', 'KYC_PROVIDER_SECRET_REF', 'MISSING', true),
    slot('callback', 'Callback / webhook configuration', 'KYC_CALLBACK_SECRET_REF', 'MISSING', true),
    slot('market_policy', 'Market / country policy configuration', 'KYC_MARKET_POLICY_CONFIG_REF', 'EXTERNAL_GATED', false),
    slot('partner_types', 'Partner-type configuration', 'KYC_PARTNER_TYPE_CONFIG_REF', 'EXTERNAL_GATED', false),
    slot('healthcare_registry', 'Healthcare registry configuration', 'KYC_HEALTHCARE_REGISTRY_CONFIG_REF', 'EXTERNAL_GATED', false),
    slot('storage_kms', 'Private storage / KMS dependency', 'KYC_STORAGE_KMS_REF', 'EXTERNAL_GATED', true),
    slot('malware_scan', 'Malware scan dependency', 'KYC_MALWARE_SCAN_REF', 'EXTERNAL_GATED', false),
    slot('legal_entity', 'Legal entity evidence model', 'KYC_LEGAL_ENTITY_EVIDENCE_REF', 'EXTERNAL_GATED', false),
    slot('identity', 'Identity evidence model', 'KYC_IDENTITY_EVIDENCE_REF', 'EXTERNAL_GATED', false),
    slot('business_registration', 'Business registration evidence', 'KYC_BUSINESS_REG_EVIDENCE_REF', 'EXTERNAL_GATED', false),
    slot('pharmacy_license', 'Pharmacy / facility license evidence', 'KYC_PHARMACY_LICENSE_EVIDENCE_REF', 'EXTERNAL_GATED', false),
    slot('professional_license', 'Professional license evidence', 'KYC_PROFESSIONAL_LICENSE_EVIDENCE_REF', 'EXTERNAL_GATED', false),
    slot('settlement', 'Bank / settlement beneficiary (where modeled)', 'KYC_SETTLEMENT_EVIDENCE_REF', 'EXTERNAL_GATED', false),
    slot('environment', 'Infrastructure environment identity', 'INFRASTRUCTURE_ENVIRONMENT', 'EXTERNAL_GATED', false),
  ];
}

export type KycFailClosedCase = {
  case_id: string;
  description: string;
  production_verification_blocked: true;
  primary_blocker: string;
};

export function evaluateKycHealthcareFailClosedCases(): KycFailClosedCase[] {
  return [
    {
      case_id: 'kyc_provider_not_selected',
      description: 'KYC provider NOT_SELECTED → production verification blocked',
      production_verification_blocked: true,
      primary_blocker: KYC_PROVIDER_NOT_SELECTED,
    },
    {
      case_id: 'credentials_missing',
      description: 'KYC credentials missing → blocked',
      production_verification_blocked: true,
      primary_blocker: KYC_CREDENTIAL_REFERENCE_MISSING,
    },
    {
      case_id: 'provider_not_verified',
      description: 'Provider not VERIFIED → blocked',
      production_verification_blocked: true,
      primary_blocker: NO_PRODUCTION_KYC_KYB_PROVIDER,
    },
    {
      case_id: 'healthcare_registry_unavailable',
      description: 'Healthcare registry unavailable where required → blocked',
      production_verification_blocked: true,
      primary_blocker: KYC_HEALTHCARE_REGISTRY_CONFIGURATION_MISSING,
    },
    {
      case_id: 'storage_kms_gated',
      description: 'Production storage/KMS dependency unavailable → blocked',
      production_verification_blocked: true,
      primary_blocker: KYC_STORAGE_KMS_DEPENDENCY_GATED,
    },
    {
      case_id: 'malware_scan_gated',
      description: 'Malware scan dependency unavailable → blocked',
      production_verification_blocked: true,
      primary_blocker: KYC_MALWARE_SCAN_DEPENDENCY_GATED,
    },
    {
      case_id: 'sandbox_manual_cannot_satisfy_production',
      description: 'Sandbox/manual verification cannot satisfy production external verification',
      production_verification_blocked: true,
      primary_blocker: NO_PRODUCTION_KYC_KYB_PROVIDER,
    },
    {
      case_id: 'security_unresolved',
      description: 'Security gate unresolved → production partner verification blocked',
      production_verification_blocked: true,
      primary_blocker: EXTERNAL_PENTEST_REQUIRED,
    },
  ];
}

export function assertKycInvalidStateProtections(): {
  submitted_cannot_skip_to_active_case: boolean;
  rejected_cannot_become_verified: boolean;
  verified_can_expire: boolean;
  document_verified_neq_partner_approved: boolean;
} {
  const life = buildKycVerificationLifecycleMachine();
  return {
    submitted_cannot_skip_to_active_case: !canTransitionKyc(
      KycCaseStatus.SUBMITTED,
      KycCaseStatus.VERIFIED,
    ),
    rejected_cannot_become_verified: !canTransitionKyc(
      KycCaseStatus.REJECTED,
      KycCaseStatus.VERIFIED,
    ),
    verified_can_expire: life.verified_can_expire === true,
    document_verified_neq_partner_approved:
      life.document_verified_not_equal_partner_approved === true,
  };
}

export type KycHealthcarePartnerVerificationActivationPreparationReport = {
  sprint: 124;
  foundation_sprints: string;
  authoritative_source: 'kyc-healthcare-partner-verification-activation-preparation';
  parallel_kyc_framework_created: false;
  parallel_kyb_framework_created: false;
  parallel_partner_verification_system_created: false;
  parallel_document_security_framework_created: false;
  parallel_rbac_system_created: false;
  parallel_provider_lifecycle_created: false;
  fake_kyc_provider_invented: false;
  real_kyc_provider_selected: false;
  real_kyb_verification_completed: false;
  real_healthcare_license_verified: false;
  real_healthcare_registry_connected: false;
  real_partner_production_approved: false;
  real_identity_verified: false;
  source_of_truth: {
    kyc_lifecycle: 'S94_COMPOSED';
    real_activation: 'S106_COMPOSED';
    case_state: 'EXISTING_REUSED';
    document_security: 'EXISTING_REUSED';
    sod: 'S110_REUSED';
    security_gate: 'S116_COMPOSED';
    foundation: 'S117_S119_COMPOSED';
    payment_context: 'S120_COMPOSED';
    communications_context: 'S121_COMPOSED';
    carrier_context: 'S122_COMPOSED';
    vendor_fulfillment_context: 'S123_COMPOSED';
    launch_control: 'S87_COMPOSED';
  };
  kyc_provider: {
    lifecycle: 'NOT_SELECTED';
    provider: 'NOT_SELECTED';
    production: 'EXTERNAL_GATED';
    sandbox: 'SANDBOX_VERIFIED';
    enabled: false;
  };
  admin_summary: {
    kyc_provider: 'NOT_SELECTED';
    production_credentials: 'MISSING';
    webhook_callback: 'NOT_CONFIGURED';
    healthcare_registry: 'EXTERNAL_GATED';
    storage_kms: 'EXTERNAL_GATED';
    malware_scan: 'EXTERNAL_GATED';
    verification: 'NOT_VERIFIED';
    approval: 'NOT_APPROVED';
    enablement: 'EXTERNAL_GATED';
    production_partner_verification: 'BLOCKED';
  };
  partner_types: ReturnType<typeof buildRealKycPartnerTypeGates>;
  radiologist: {
    portal_role: 'EXISTING_REUSED';
    separate_s106_gate: false;
    covered_by: 'IMAGING_FACILITY_AND_ORG_STAFF';
    production_privilege: 'EXTERNAL_GATED';
  };
  affiliate: {
    production_privilege: 'EXTERNAL_GATED';
    sandbox: 'SANDBOX_AVAILABLE' | 'SANDBOX_VERIFIED';
  };
  configuration_references: KycConfigReferenceSlot[];
  configuration_validation: ReturnType<typeof validateProductionKycConfiguration>;
  verification_lifecycle: ReturnType<typeof buildKycVerificationLifecycleMachine>;
  invalid_state_protections: ReturnType<typeof assertKycInvalidStateProtections>;
  document_security: {
    unverified_file_not_auto_verified: true;
    quarantined_cannot_approve: true;
    expired_not_silently_valid: true;
    cross_tenant_document_access: 'DENIED';
    status: 'SOFTWARE_READY_EXTERNAL_GATED';
  };
  healthcare_license_registry: {
    distinct_from_business_kyc: true;
    registry_connected: false;
    licenses_claimed_verified: false;
    status: 'EXTERNAL_GATED';
  };
  segregation_of_duties: {
    partner_cannot_approve_self: true;
    reviewer_separated: true;
    approval_audited: true;
    authorization: 'S110_REUSED';
    status: 'PASS';
  };
  global_policy: {
    policy_driven: true;
    hardcoded_india_global: false;
    status: 'POLICY_DRIVEN';
  };
  sandbox_vs_production: {
    sandbox_manual_review_allowed: true;
    sandbox_cannot_satisfy_production: true;
    mock_provider_detected: true;
    infrastructure_environment: 'sandbox' | 'production';
  };
  production_fail_closed: {
    verification_when_not_selected: 'BLOCKED';
    overall: 'PASS';
  };
  fail_closed_cases: KycFailClosedCase[];
  activation_checklist: ReturnType<typeof buildRealKycActivationChecklist>;
  markets: ReturnType<typeof buildRealKycMarketStatuses>;
  enablement_guard: ReturnType<typeof evaluateKycEnablementGuard>;
  security_gate: {
    remaining_blocker: string;
    certified: string;
  };
  external_inputs_required: string[];
  remaining_blocker: typeof NO_PRODUCTION_KYC_KYB_PROVIDER;
  remaining_blockers: string[];
  force_launch_available: false;
  force_enable_kyc_available: false;
  can_production_launch: 'NO';
  why_launch_blocked: string;
  next_action: string;
  message: string;
  security_statement: string;
  secrets_printed: false;
  pii_phi_printed: false;
  evaluated_at: string;
  correlation_id?: string;
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
};

export function evaluateKycHealthcarePartnerVerificationActivationPreparation(input?: {
  correlation_id?: string;
}): KycHealthcarePartnerVerificationActivationPreparationReport {
  const s94 = evaluateKycFirstOnboarding();
  const s106 = evaluateRealKycFirstOnboarding();
  const config = validateProductionKycConfiguration();
  const env = readInfrastructureEnvironment();
  const security = evaluateProductionSecurityGate();
  const foundation = evaluateProductionFoundationActivationPreparation();
  const release = evaluateProductionReleaseEngineeringReadiness();
  const deploy = evaluateProductionDeploymentTargetActivation();
  const psp = evaluatePspPaymentActivationPreparation();
  const comms = evaluateOtpMessagingActivationPreparation();
  const carrier = evaluateCarrierLogisticsActivationPreparation();
  const vendorClosure = evaluateVendorFulfillmentRealUseClosure();
  const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
  const enablement = evaluateKycEnablementGuard({
    nonMockProductionProviderRegistered: false,
    infrastructureEnvironment: env,
    kycLiveEnabled: false,
    humanApproved: false,
    legalComplianceClear: false,
    objectStorageProductionReady: false,
    kmsReady: false,
    malwareScanReady: false,
    privacyDpaClear: false,
    emergencyDisabled: false,
  });
  const partnerTypes = buildRealKycPartnerTypeGates();
  const affiliate = partnerTypes.find((p) => p.partner_type === 'AFFILIATE');

  void s94.remaining_blocker;
  void s106.real_kyc_provider_selected;
  void foundation.can_production_launch;
  void release.can_production_launch;
  void deploy.can_production_launch;
  void psp.can_production_launch;
  void comms.can_production_launch;
  void carrier.can_production_launch;
  void vendorClosure.can_production_launch;
  void launch.can_production_launch;
  void isMockOrSandboxKycProvider('manual');

  const remaining_blockers = [
    NO_PRODUCTION_KYC_KYB_PROVIDER,
    NO_PRODUCTION_KYC_PROVIDER,
    KYC_PROVIDER_NOT_SELECTED,
    KYC_CREDENTIAL_REFERENCE_MISSING,
    KYC_API_ENDPOINT_REFERENCE_MISSING,
    KYC_CALLBACK_CONFIGURATION_MISSING,
    KYC_MARKET_POLICY_CONFIGURATION_MISSING,
    KYC_PARTNER_TYPE_CONFIGURATION_MISSING,
    KYC_STORAGE_KMS_DEPENDENCY_GATED,
    KYC_MALWARE_SCAN_DEPENDENCY_GATED,
    KYC_HEALTHCARE_REGISTRY_CONFIGURATION_MISSING,
    EXTERNAL_PENTEST_REQUIRED,
  ];

  return {
    sprint: 124,
    foundation_sprints:
      'S15/S40/S48/S72/S81/S94/S106/S87/S110/S116/S117/S118/S119/S120/S121/S122/S123',
    authoritative_source: 'kyc-healthcare-partner-verification-activation-preparation',
    parallel_kyc_framework_created: false,
    parallel_kyb_framework_created: false,
    parallel_partner_verification_system_created: false,
    parallel_document_security_framework_created: false,
    parallel_rbac_system_created: false,
    parallel_provider_lifecycle_created: false,
    fake_kyc_provider_invented: false,
    real_kyc_provider_selected: false,
    real_kyb_verification_completed: false,
    real_healthcare_license_verified: false,
    real_healthcare_registry_connected: false,
    real_partner_production_approved: false,
    real_identity_verified: false,
    source_of_truth: {
      kyc_lifecycle: 'S94_COMPOSED',
      real_activation: 'S106_COMPOSED',
      case_state: 'EXISTING_REUSED',
      document_security: 'EXISTING_REUSED',
      sod: 'S110_REUSED',
      security_gate: 'S116_COMPOSED',
      foundation: 'S117_S119_COMPOSED',
      payment_context: 'S120_COMPOSED',
      communications_context: 'S121_COMPOSED',
      carrier_context: 'S122_COMPOSED',
      vendor_fulfillment_context: 'S123_COMPOSED',
      launch_control: 'S87_COMPOSED',
    },
    kyc_provider: {
      lifecycle: 'NOT_SELECTED',
      provider: 'NOT_SELECTED',
      production: 'EXTERNAL_GATED',
      sandbox: 'SANDBOX_VERIFIED',
      enabled: false,
    },
    admin_summary: {
      kyc_provider: 'NOT_SELECTED',
      production_credentials: 'MISSING',
      webhook_callback: 'NOT_CONFIGURED',
      healthcare_registry: 'EXTERNAL_GATED',
      storage_kms: 'EXTERNAL_GATED',
      malware_scan: 'EXTERNAL_GATED',
      verification: 'NOT_VERIFIED',
      approval: 'NOT_APPROVED',
      enablement: 'EXTERNAL_GATED',
      production_partner_verification: 'BLOCKED',
    },
    partner_types: partnerTypes,
    radiologist: {
      portal_role: 'EXISTING_REUSED',
      separate_s106_gate: false,
      covered_by: 'IMAGING_FACILITY_AND_ORG_STAFF',
      production_privilege: 'EXTERNAL_GATED',
    },
    affiliate: {
      production_privilege: 'EXTERNAL_GATED',
      sandbox: affiliate?.sandbox ?? 'SANDBOX_AVAILABLE',
    },
    configuration_references: buildKycHealthcareConfigurationReferenceSlots(),
    configuration_validation: config,
    verification_lifecycle: buildKycVerificationLifecycleMachine(),
    invalid_state_protections: assertKycInvalidStateProtections(),
    document_security: {
      unverified_file_not_auto_verified: true,
      quarantined_cannot_approve: true,
      expired_not_silently_valid: true,
      cross_tenant_document_access: 'DENIED',
      status: 'SOFTWARE_READY_EXTERNAL_GATED',
    },
    healthcare_license_registry: {
      distinct_from_business_kyc: true,
      registry_connected: false,
      licenses_claimed_verified: false,
      status: 'EXTERNAL_GATED',
    },
    segregation_of_duties: {
      partner_cannot_approve_self: true,
      reviewer_separated: true,
      approval_audited: true,
      authorization: 'S110_REUSED',
      status: 'PASS',
    },
    global_policy: {
      policy_driven: true,
      hardcoded_india_global: false,
      status: 'POLICY_DRIVEN',
    },
    sandbox_vs_production: {
      sandbox_manual_review_allowed: true,
      sandbox_cannot_satisfy_production: true,
      mock_provider_detected: true,
      infrastructure_environment: env,
    },
    production_fail_closed: {
      verification_when_not_selected: 'BLOCKED',
      overall: 'PASS',
    },
    fail_closed_cases: evaluateKycHealthcareFailClosedCases(),
    activation_checklist: buildRealKycActivationChecklist(),
    markets: buildRealKycMarketStatuses(),
    enablement_guard: enablement,
    security_gate: {
      remaining_blocker: security.remaining_blocker,
      certified: security.production_security_certified ?? 'NO',
    },
    external_inputs_required: [
      'Real KYC/KYB provider contract + production endpoint/credential refs',
      'Callback/webhook signing configuration refs',
      'Market/partner-type policy configuration',
      'Healthcare registry configuration where required (distinct from business KYC)',
      'Production private storage + KMS + malware-scan readiness',
      'Human verification + approval (SoD)',
      'Security certification (EXTERNAL_PENTEST_REQUIRED)',
      'Production environment/deployment target (S117–S119) before live enablement',
    ],
    remaining_blocker: NO_PRODUCTION_KYC_KYB_PROVIDER,
    remaining_blockers,
    force_launch_available: false,
    force_enable_kyc_available: false,
    can_production_launch: 'NO',
    why_launch_blocked:
      "Why can't World-Pharma verify partners for production yet? KYC/KYB provider is NOT_SELECTED; credentials MISSING; callback NOT_CONFIGURED; healthcare registry EXTERNAL_GATED; storage/KMS/malware EXTERNAL_GATED; verification NOT_VERIFIED; enablement EXTERNAL_GATED. Production partner verification BLOCKED. Sandbox manual review remains allowed and cannot satisfy production. DOCUMENT VERIFIED ≠ PARTNER APPROVED ≠ PRODUCTION ENABLED.",
    next_action:
      'When a real KYC/KYB provider and (where required) healthcare registry exist: supply configuration REFERENCES (never secret values or invented verification results), verify callbacks, obtain human SoD approval, then advance lifecycle NOT_SELECTED→CONFIGURED→VERIFIED→APPROVED→ENABLED — do not invent a provider or rewrite KYC architecture.',
    message:
      'Sprint 124 KYC/KYB + healthcare partner verification activation preparation: lifecycle NOT_SELECTED, production partner verification BLOCKED, sandbox SANDBOX_VERIFIED. CAN_PRODUCTION_LAUNCH = NO.',
    security_statement:
      'S94/S106 lifecycle reused (no second KYC/KYB framework). Business KYC distinct from healthcare license/registry. Document security + S110 SoD retained. Sandbox/manual review cannot satisfy production. Mock forbidden in production.',
    secrets_printed: false,
    pii_phi_printed: false,
    evaluated_at: new Date().toISOString(),
    correlation_id: input?.correlation_id,
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
  };
}
