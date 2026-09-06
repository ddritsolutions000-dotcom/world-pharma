/**
 * Sprint 106 — Real KYC/KYB + healthcare partner verification activation readiness.
 * Composes S72/S81/S94. Never invents KYC vendors, registries, licenses, or credentials.
 * Never claims production partner verification.
 */
import {
  NO_PRODUCTION_KYC_KYB_PROVIDER,
  NO_PRODUCTION_KYC_PROVIDER,
  evaluateKycFirstOnboarding,
  type KycActivationLifecycle,
} from './kyc-first-onboarding';
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
  validateProductionKycConfiguration,
} from './production-kyc-requirements';
import { evaluateProductionFoundationFirstOnboarding } from '../ops/production-foundation-first-onboarding';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';

export {
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
};

export type RealKycLifecycle =
  | 'NOT_SELECTED'
  | 'CONFIGURATION_REQUIRED'
  | 'CREDENTIALS_REQUIRED'
  | 'VERIFICATION_REQUIRED'
  | 'APPROVAL_REQUIRED'
  | 'READY_FOR_ACTIVATION'
  | 'ENABLED'
  | 'DISABLED'
  | 'EXTERNAL_GATED';

export type RealKycMarketStatus = {
  market: 'GLOBAL' | 'IN' | 'AE' | 'US';
  lifecycle: RealKycLifecycle;
  sandbox: 'SANDBOX_VERIFIED';
  production: 'PRODUCTION_NOT_CONFIGURED' | 'PRODUCTION_EXTERNAL_GATED' | 'ENABLED';
  blocker: string;
  healthcare_verification: 'POLICY_DRIVEN' | 'LEGAL_GATED' | 'EXTERNAL_GATED';
};

export type RealKycChecklistItem = {
  id: string;
  label: string;
  mandatory: boolean;
  status: 'MISSING' | 'PRESENT' | 'PENDING' | 'N/A';
};

export type RealKycPartnerTypeGate = {
  partner_type: 'VENDOR' | 'DOCTOR' | 'LAB' | 'IMAGING' | 'AFFILIATE';
  sandbox: 'SANDBOX_VERIFIED' | 'SANDBOX_AVAILABLE';
  production_privilege: 'EXTERNAL_GATED';
  healthcare_distinct_from_business_kyc: boolean;
  blocker: string;
};

function mapLifecycle(s94: KycActivationLifecycle): RealKycLifecycle {
  if (s94 === 'ENABLED') return 'ENABLED';
  if (s94 === 'DISABLED') return 'DISABLED';
  if (s94 === 'NOT_SELECTED') return 'NOT_SELECTED';
  if (s94 === 'APPROVED') return 'APPROVAL_REQUIRED';
  if (s94 === 'VERIFIED') return 'VERIFICATION_REQUIRED';
  if (s94 === 'CONFIGURED') return 'CONFIGURATION_REQUIRED';
  return 'EXTERNAL_GATED';
}

export function buildRealKycActivationChecklist(): RealKycChecklistItem[] {
  const v = validateProductionKycConfiguration();
  return [
    {
      id: 'kyc_provider_selected',
      label: 'Real KYC/KYB provider selected?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'commercial_relationship',
      label: 'Commercial/account relationship established?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'production_credentials',
      label: 'Production credentials via approved secret manager?',
      mandatory: true,
      status: v.credential_reference.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'api_endpoint',
      label: 'API endpoint configured?',
      mandatory: true,
      status: v.api_endpoint_reference.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'callback_webhook',
      label: 'Callback/webhook security configured?',
      mandatory: true,
      status: v.callback_configuration.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'market_policy',
      label: 'Market/policy pack configuration complete?',
      mandatory: true,
      status: v.market_policy_configuration.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'partner_types',
      label: 'Partner-type verification matrix configured?',
      mandatory: true,
      status: v.partner_type_configuration.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'healthcare_registry',
      label: 'Healthcare registry/verification dependency configured?',
      mandatory: true,
      status: v.healthcare_registry_configuration.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'document_lifecycle',
      label: 'Document lifecycle (upload→review→verified/rejected/expired) ready?',
      mandatory: true,
      status: 'PRESENT',
    },
    {
      id: 'privilege_gating',
      label: 'Production privilege gating for unverified partners?',
      mandatory: true,
      status: 'PRESENT',
    },
    {
      id: 'private_storage_kms',
      label: 'Private storage + KMS dependency ready?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'malware_scan',
      label: 'Malware scanning dependency ready?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'sandbox_manual_review',
      label: 'Sandbox/manual review verification complete?',
      mandatory: true,
      status: 'PRESENT',
    },
    {
      id: 'production_verification',
      label: 'Production external verification proven?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'monitoring',
      label: 'Monitoring/audit configured?',
      mandatory: true,
      status: 'PENDING',
    },
    {
      id: 'rollback_disable',
      label: 'Disable/rollback procedure available?',
      mandatory: true,
      status: 'PRESENT',
    },
  ];
}

export function buildRealKycMarketStatuses(): RealKycMarketStatus[] {
  return (['GLOBAL', 'IN', 'AE', 'US'] as const).map((market) => ({
    market,
    lifecycle: 'NOT_SELECTED' as const,
    sandbox: 'SANDBOX_VERIFIED' as const,
    production: 'PRODUCTION_EXTERNAL_GATED' as const,
    blocker: NO_PRODUCTION_KYC_KYB_PROVIDER,
    healthcare_verification: 'LEGAL_GATED' as const,
  }));
}

export function buildRealKycPartnerTypeGates(): RealKycPartnerTypeGate[] {
  const blocker = NO_PRODUCTION_KYC_KYB_PROVIDER;
  return [
    {
      partner_type: 'VENDOR',
      sandbox: 'SANDBOX_VERIFIED',
      production_privilege: 'EXTERNAL_GATED',
      healthcare_distinct_from_business_kyc: false,
      blocker,
    },
    {
      partner_type: 'DOCTOR',
      sandbox: 'SANDBOX_VERIFIED',
      production_privilege: 'EXTERNAL_GATED',
      healthcare_distinct_from_business_kyc: true,
      blocker,
    },
    {
      partner_type: 'LAB',
      sandbox: 'SANDBOX_VERIFIED',
      production_privilege: 'EXTERNAL_GATED',
      healthcare_distinct_from_business_kyc: true,
      blocker,
    },
    {
      partner_type: 'IMAGING',
      sandbox: 'SANDBOX_VERIFIED',
      production_privilege: 'EXTERNAL_GATED',
      healthcare_distinct_from_business_kyc: true,
      blocker,
    },
    {
      partner_type: 'AFFILIATE',
      sandbox: 'SANDBOX_AVAILABLE',
      production_privilege: 'EXTERNAL_GATED',
      healthcare_distinct_from_business_kyc: false,
      blocker,
    },
  ];
}

export type RealKycFirstOnboardingReport = {
  sprint: 106;
  foundation_sprints: string;
  activation_lifecycle: RealKycLifecycle;
  environment: 'sandbox' | 'production';
  provider: 'NOT_SELECTED';
  real_kyc_provider_selected: false;
  real_healthcare_registry_connected: false;
  real_partner_production_verified: false;
  production_privilege_enabled: false;
  configured: boolean;
  verified: boolean;
  approved: boolean;
  enabled: false;
  sandbox: 'SANDBOX_VERIFIED';
  production: 'EXTERNAL_GATED';
  sandbox_manual_review: 'SANDBOX_VERIFIED';
  production_verification: 'EXTERNAL_GATED';
  ready_for_activation: false;
  production_kyc_enabled: false;
  runtime_adapter: 'manual_sandbox_review';
  configuration_readiness: ReturnType<
    typeof validateProductionKycConfiguration
  >['configuration_readiness'];
  checklist: RealKycChecklistItem[];
  markets: RealKycMarketStatus[];
  partner_type_gates: RealKycPartnerTypeGate[];
  document_lifecycle: {
    statuses: string[];
    document_verified_not_equal_partner_approved: true;
    partner_approved_not_equal_production_enabled: true;
    expired_revoked_lose_privileges: true;
  };
  healthcare_credential_model: {
    policy_driven: true;
    fields: string[];
    never_assert_global_legal_sufficiency: true;
  };
  verification_lifecycle: ReturnType<typeof evaluateKycFirstOnboarding>['verification_lifecycle'];
  webhook_security: ReturnType<typeof evaluateKycFirstOnboarding>['webhook_security'];
  partner_activation_gating: ReturnType<
    typeof evaluateKycFirstOnboarding
  >['partner_activation_gating'];
  permission_model: ReturnType<typeof evaluateKycFirstOnboarding>['permission_model'];
  country_policy: ReturnType<typeof evaluateKycFirstOnboarding>['country_policy'];
  remaining_blocker: typeof NO_PRODUCTION_KYC_KYB_PROVIDER;
  remaining_blockers: string[];
  related_adapter_blocker: typeof NO_PRODUCTION_KYC_PROVIDER;
  next_action: string;
  force_launch_available: false;
  force_deploy_available: false;
  can_production_launch: 'NO';
  launch_control_overall: string;
  control_plane: 'S100_REUSED';
  foundation_plane: 'S101_REUSED';
  s94_plane: 'COMPOSED';
  evaluated_at: string;
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
  secrets_printed: false;
  pii_printed: false;
  fake_provider_invented: false;
  fake_licence_invented: false;
  message: string;
};

export function evaluateRealKycFirstOnboarding(
  input?: { correlation_id?: string },
): RealKycFirstOnboardingReport {
  const s94 = evaluateKycFirstOnboarding();
  const foundation = evaluateProductionFoundationFirstOnboarding();
  const launch = evaluateProductionLaunchControl({
    market: 'GLOBAL',
    service_scope: 'GLOBAL',
    correlation_id: input?.correlation_id,
  });
  const checklist = buildRealKycActivationChecklist();
  const markets = buildRealKycMarketStatuses();
  const partner_type_gates = buildRealKycPartnerTypeGates();
  const config = validateProductionKycConfiguration();

  const remaining_blockers = [
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
    ...foundation.remaining_blockers.filter((b) =>
      [
        'NO_PRODUCTION_ENVIRONMENT',
        'NO_PRODUCTION_SECRETS_MANAGER',
        'NO_PRODUCTION_DATABASE',
        'NO_PRODUCTION_DEPLOYMENT_TARGET',
      ].includes(b),
    ),
    ...s94.remaining_blockers.slice(0, 8),
  ];

  return {
    sprint: 106,
    foundation_sprints: '72,81,87,94,95,98,100,101,105',
    activation_lifecycle: mapLifecycle(s94.activation_lifecycle),
    environment: s94.environment,
    provider: 'NOT_SELECTED',
    real_kyc_provider_selected: false,
    real_healthcare_registry_connected: false,
    real_partner_production_verified: false,
    production_privilege_enabled: false,
    configured: s94.configured,
    verified: s94.verified,
    approved: s94.approved,
    enabled: false,
    sandbox: 'SANDBOX_VERIFIED',
    production: 'EXTERNAL_GATED',
    sandbox_manual_review: 'SANDBOX_VERIFIED',
    production_verification: 'EXTERNAL_GATED',
    ready_for_activation: false,
    production_kyc_enabled: false,
    runtime_adapter: 'manual_sandbox_review',
    configuration_readiness: config.configuration_readiness,
    checklist,
    markets,
    partner_type_gates,
    document_lifecycle: {
      statuses: s94.kyc_document_statuses_supported,
      document_verified_not_equal_partner_approved: true,
      partner_approved_not_equal_production_enabled: true,
      expired_revoked_lose_privileges: true,
    },
    healthcare_credential_model: {
      policy_driven: true,
      fields: [
        'professional_licence',
        'facility_business_licence',
        'pharmacy_authorization',
        'laboratory_authorization',
        'imaging_facility_authorization',
        'registration_registry_reference',
        'jurisdiction_country',
        'expiry_date',
        'verification_status',
        'reviewer_decision',
        'audit_trail',
      ],
      never_assert_global_legal_sufficiency: true,
    },
    verification_lifecycle: s94.verification_lifecycle,
    webhook_security: s94.webhook_security,
    partner_activation_gating: s94.partner_activation_gating,
    permission_model: s94.permission_model,
    country_policy: s94.country_policy,
    remaining_blocker: NO_PRODUCTION_KYC_KYB_PROVIDER,
    remaining_blockers: [...new Set(remaining_blockers)],
    related_adapter_blocker: NO_PRODUCTION_KYC_PROVIDER,
    next_action:
      'Select a real KYC/KYB provider + vault credentials via S101, configure healthcare registry/policy packs per market, prove private storage/KMS/malware deps, then human approval. Do not invent providers, licences, or claim production partner verification from sandbox review.',
    force_launch_available: false,
    force_deploy_available: false,
    can_production_launch: 'NO',
    launch_control_overall: launch.overall_status,
    control_plane: 'S100_REUSED',
    foundation_plane: 'S101_REUSED',
    s94_plane: 'COMPOSED',
    evaluated_at: new Date().toISOString(),
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    secrets_printed: false,
    pii_printed: false,
    fake_provider_invented: false,
    fake_licence_invented: false,
    message:
      'Sprint 106 real KYC/KYB + healthcare partner verification readiness: provider NOT_SELECTED / EXTERNAL_GATED. Sandbox manual review remains SANDBOX_VERIFIED. DOCUMENT VERIFIED ≠ PARTNER APPROVED ≠ PRODUCTION ENABLED. PRODUCTION KYC ENABLED = NO. REAL PARTNER PRODUCTION VERIFIED = NO. CAN_PRODUCTION_LAUNCH = NO.',
  };
}
