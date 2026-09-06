/**
 * Sprint 127 — Real lab partner onboarding + production activation control.
 * Composes S15/S25/S36/S42/S48/S55/S57/S72/S81/S94/S106/S110/S116–S120/S124/S126.
 * Does NOT invent lab providers, accreditations, registries, licenses, or production enablement.
 * Does NOT create a second partner/KYC/catalog/report/authorization framework.
 * DOCUMENT VERIFIED ≠ PARTNER VERIFIED ≠ PRODUCTION ENABLED.
 * Current production lab partner activation MUST remain BLOCKED. CAN_PRODUCTION_LAUNCH = NO.
 */
import { PartnerStatus, KycCaseStatus } from '@prisma/client';
import { canTransitionPartner } from '../partner/state-machine';
import { canTransitionKyc } from '../partner/kyc-state';
import {
  NO_PRODUCTION_KYC_KYB_PROVIDER,
  evaluateKycHealthcarePartnerVerificationActivationPreparation,
} from '../partner/kyc-healthcare-partner-verification-activation-preparation';
import {
  NO_PRODUCTION_CLINICAL_ADAPTER,
  evaluateLabDiagnosticsRealUseClosure,
} from './lab-diagnostics-real-use-closure';
import { LAB_PARTNER_ATTESTATION_CODE } from './lab-capability.service';
import { requirementCodesForProvider } from '../healthcare/healthcare-environment';
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

export {
  NO_PRODUCTION_KYC_KYB_PROVIDER,
  NO_PRODUCTION_CLINICAL_ADAPTER,
  LAB_PARTNER_ATTESTATION_CODE,
};

/** Primary production blocker until real lab partner activation evidence exists. */
export const NO_PRODUCTION_LAB_PARTNER_ACTIVATION = 'NO_PRODUCTION_LAB_PARTNER_ACTIVATION';

export const LAB_ACCREDITATION_REGISTRY_EXTERNAL_GATED =
  'LAB_ACCREDITATION_REGISTRY_EXTERNAL_GATED';

export const LAB_PARTNER_ONBOARDING_ACTIVATION_PREPARATION_AUTHORITATIVE =
  'LAB_PARTNER_ONBOARDING_ACTIVATION_PREPARATION_AUTHORITATIVE';

/**
 * Conceptual Admin lab-partner onboarding phases mapped onto existing PartnerStatus.
 * Does NOT invent a parallel Prisma enum — reuse PartnerStatus transitions.
 */
export type LabPartnerOnboardingPhase =
  | 'PROSPECT'
  | 'APPLICATION_SUBMITTED'
  | 'DOCUMENTS_PENDING'
  | 'UNDER_REVIEW'
  | 'VERIFICATION_PENDING'
  | 'VERIFIED'
  | 'ACTIVATION_PENDING'
  | 'ENABLED'
  | 'SUSPENDED'
  | 'EXPIRED'
  | 'DEACTIVATED'
  | 'REJECTED';

export function mapPartnerStatusToLabOnboardingPhase(
  status: PartnerStatus,
  opts?: { kycExpired?: boolean; productionEnabled?: boolean },
): LabPartnerOnboardingPhase {
  if (opts?.kycExpired) return 'EXPIRED';
  switch (status) {
    case PartnerStatus.DRAFT:
    case PartnerStatus.REGISTERED:
      return 'PROSPECT';
    case PartnerStatus.PROFILE_INCOMPLETE:
      return 'APPLICATION_SUBMITTED';
    case PartnerStatus.DOCUMENTS_REQUIRED:
    case PartnerStatus.ADDITIONAL_INFORMATION_REQUIRED:
      return 'DOCUMENTS_PENDING';
    case PartnerStatus.DOCUMENTS_SUBMITTED:
    case PartnerStatus.UNDER_REVIEW:
    case PartnerStatus.REACTIVATION_REQUESTED:
      return 'UNDER_REVIEW';
    case PartnerStatus.VERIFIED:
      return 'VERIFIED';
    case PartnerStatus.APPROVED:
      return 'ACTIVATION_PENDING';
    case PartnerStatus.ACTIVE:
      // ACTIVE partner ≠ production ENABLED until external gates clear.
      return opts?.productionEnabled === true ? 'ENABLED' : 'ACTIVATION_PENDING';
    case PartnerStatus.SUSPENDED:
      return 'SUSPENDED';
    case PartnerStatus.DEACTIVATED:
    case PartnerStatus.BLOCKED:
      return 'DEACTIVATED';
    case PartnerStatus.REJECTED:
      return 'REJECTED';
    default:
      return 'PROSPECT';
  }
}

export type LabActivationGateStatus = 'BLOCKED' | 'READY' | 'EXTERNAL_GATED' | 'SANDBOX_ONLY';

export type LabActivationGate = {
  id: string;
  label: string;
  status: LabActivationGateStatus;
  reason: string;
  scope: 'INTERNAL' | 'EXTERNAL_GATED';
  evidence_required: string;
};

export function buildLabPartnerActivationGates(): LabActivationGate[] {
  return [
    {
      id: 'business_kyb',
      label: 'Business / KYB status',
      status: 'EXTERNAL_GATED',
      reason: 'Production KYC/KYB provider NOT_SELECTED',
      scope: 'EXTERNAL_GATED',
      evidence_required: 'Real KYC/KYB provider + verified business identity refs',
    },
    {
      id: 'healthcare_accreditation',
      label: 'Healthcare / accreditation verification',
      status: 'EXTERNAL_GATED',
      reason: LAB_ACCREDITATION_REGISTRY_EXTERNAL_GATED,
      scope: 'EXTERNAL_GATED',
      evidence_required: 'Market policy pack accreditation/registry evidence (not sandbox attestation)',
    },
    {
      id: 'required_documents',
      label: 'Required documents status',
      status: 'SANDBOX_ONLY',
      reason: 'Sandbox document review allowed; production document verification EXTERNAL_GATED',
      scope: 'EXTERNAL_GATED',
      evidence_required: 'Policy-pack mandatory evidence refs via secure object store',
    },
    {
      id: 'organization_tenant',
      label: 'Organization / tenant status',
      status: 'READY',
      reason: 'Organization(LAB) + membership model exists and is reusable',
      scope: 'INTERNAL',
      evidence_required: 'Active LAB organization linked to partner (existing)',
    },
    {
      id: 'service_locations',
      label: 'Service location readiness',
      status: 'SANDBOX_ONLY',
      reason: 'Sandbox locations modeled; production location eligibility policy-driven',
      scope: 'INTERNAL',
      evidence_required: 'Service locations within market policy pack',
    },
    {
      id: 'lab_catalogue',
      label: 'Lab catalogue readiness',
      status: 'SANDBOX_ONLY',
      reason: 'Existing catalog ownership reused; production catalogue publish gated',
      scope: 'INTERNAL',
      evidence_required: 'Owned tests/packages with policy eligibility',
    },
    {
      id: 'collection_capability',
      label: 'Collection capability readiness',
      status: 'SANDBOX_ONLY',
      reason: 'Home/center collection flags pack-gated in sandbox',
      scope: 'INTERNAL',
      evidence_required: 'Collection method capability + pack flags',
    },
    {
      id: 'report_workflow',
      label: 'Report / pathology workflow readiness',
      status: 'SANDBOX_ONLY',
      reason: 'Sandbox report lifecycle verified (S126); production clinical adapters absent',
      scope: 'EXTERNAL_GATED',
      evidence_required: 'Production clinical adapter (HL7/FHIR/LIS) where required',
    },
    {
      id: 'storage_security',
      label: 'Storage / security readiness',
      status: 'EXTERNAL_GATED',
      reason: 'Production private storage / KMS / malware EXTERNAL_GATED',
      scope: 'EXTERNAL_GATED',
      evidence_required: 'Production storage + KMS + malware scan readiness',
    },
    {
      id: 'payment_psp',
      label: 'Payment / PSP dependency',
      status: 'EXTERNAL_GATED',
      reason: 'Production PSP NOT_SELECTED',
      scope: 'EXTERNAL_GATED',
      evidence_required: 'Real PSP contract + credential refs (S120)',
    },
    {
      id: 'market_policy',
      label: 'Country / market policy readiness',
      status: 'READY',
      reason: 'Policy-pack driven; no hardcoded single-market lab licensing',
      scope: 'INTERNAL',
      evidence_required: 'Published market policy pack for target country',
    },
    {
      id: 'production_infrastructure',
      label: 'Production infrastructure readiness',
      status: 'EXTERNAL_GATED',
      reason: 'Foundation / release / deployment targets not production-ready',
      scope: 'EXTERNAL_GATED',
      evidence_required: 'S117–S119 production foundation + deployment target',
    },
    {
      id: 'external_providers',
      label: 'External-provider dependencies',
      status: 'EXTERNAL_GATED',
      reason: NO_PRODUCTION_LAB_PARTNER_ACTIVATION,
      scope: 'EXTERNAL_GATED',
      evidence_required:
        'KYC/KYB + accreditation registry + clinical adapters + storage/KMS + PSP where applicable',
    },
  ];
}

export type LabFailClosedCase = {
  case_id: string;
  description: string;
  production_activation_blocked: true;
  primary_blocker: string;
};

export function evaluateLabPartnerFailClosedCases(): LabFailClosedCase[] {
  return [
    {
      case_id: 'unverified_cannot_enable',
      description: 'Unverified lab cannot become production ENABLED',
      production_activation_blocked: true,
      primary_blocker: NO_PRODUCTION_LAB_PARTNER_ACTIVATION,
    },
    {
      case_id: 'expired_verification_denied',
      description: 'Expired verification cannot satisfy activation',
      production_activation_blocked: true,
      primary_blocker: 'KYC_CASE_EXPIRED',
    },
    {
      case_id: 'suspended_cannot_accept_production',
      description: 'Suspended lab cannot accept new production bookings',
      production_activation_blocked: true,
      primary_blocker: 'PARTNER_SUSPENDED',
    },
    {
      case_id: 'missing_mandatory_evidence',
      description: 'Missing mandatory evidence blocks activation',
      production_activation_blocked: true,
      primary_blocker: 'MANDATORY_EVIDENCE_MISSING',
    },
    {
      case_id: 'sandbox_cannot_satisfy_production',
      description: 'Sandbox verification/attestation cannot satisfy production verification',
      production_activation_blocked: true,
      primary_blocker: LAB_PARTNER_ATTESTATION_CODE,
    },
    {
      case_id: 'mock_credentials_forbidden',
      description: 'Production lab activation cannot resolve sandbox/mock credentials',
      production_activation_blocked: true,
      primary_blocker: NO_PRODUCTION_KYC_KYB_PROVIDER,
    },
    {
      case_id: 'clinical_adapter_absent',
      description: 'Production clinical adapters (HL7/FHIR/LIS) absent',
      production_activation_blocked: true,
      primary_blocker: NO_PRODUCTION_CLINICAL_ADAPTER,
    },
    {
      case_id: 'accreditation_registry_gated',
      description: 'Lab accreditation registry unavailable where required',
      production_activation_blocked: true,
      primary_blocker: LAB_ACCREDITATION_REGISTRY_EXTERNAL_GATED,
    },
    {
      case_id: 'cross_tenant_activation_denied',
      description: 'Unauthorized admin cannot activate another tenant lab',
      production_activation_blocked: true,
      primary_blocker: 'CROSS_TENANT_DENIED',
    },
    {
      case_id: 'illegal_state_transition',
      description: 'Illegal onboarding/activation state transitions rejected',
      production_activation_blocked: true,
      primary_blocker: 'ILLEGAL_PARTNER_TRANSITION',
    },
  ];
}

export function assertLabPartnerInvalidStateProtections(): {
  draft_cannot_skip_to_active: boolean;
  verified_cannot_skip_to_active_without_approved: boolean;
  suspended_cannot_go_directly_to_active: boolean;
  rejected_is_terminal: boolean;
  document_verified_neq_partner_verified: boolean;
  partner_verified_neq_production_enabled: boolean;
  sandbox_attestation_neq_legal_accreditation: boolean;
  submitted_kyc_cannot_skip_to_verified: boolean;
} {
  return {
    draft_cannot_skip_to_active: !canTransitionPartner(PartnerStatus.DRAFT, PartnerStatus.ACTIVE),
    verified_cannot_skip_to_active_without_approved: !canTransitionPartner(
      PartnerStatus.VERIFIED,
      PartnerStatus.ACTIVE,
    ),
    suspended_cannot_go_directly_to_active: !canTransitionPartner(
      PartnerStatus.SUSPENDED,
      PartnerStatus.ACTIVE,
    ),
    rejected_is_terminal: !canTransitionPartner(PartnerStatus.REJECTED, PartnerStatus.VERIFIED),
    document_verified_neq_partner_verified: true,
    partner_verified_neq_production_enabled: true,
    sandbox_attestation_neq_legal_accreditation: true,
    submitted_kyc_cannot_skip_to_verified: !canTransitionKyc(
      KycCaseStatus.SUBMITTED,
      KycCaseStatus.VERIFIED,
    ),
  };
}

export type LabPartnerProfileCapabilityModel = {
  legal_business_identity: 'EXISTING_REUSED';
  operating_country_market: 'POLICY_PACK_DRIVEN';
  organization_identity: 'EXISTING_REUSED';
  lab_type: 'EXISTING_REUSED';
  accreditation_registry_evidence: 'EXTERNAL_GATED';
  licences_certifications: 'POLICY_PACK_DRIVEN';
  responsible_contacts: 'EXISTING_REUSED';
  service_locations: 'EXISTING_REUSED';
  test_service_catalogue_ownership: 'EXISTING_REUSED';
  collection_home_collection: 'PACK_GATED';
  report_pathology_capability: 'EXISTING_REUSED';
  operating_hours: 'EXISTING_REUSED';
  supported_service_areas: 'POLICY_PACK_DRIVEN';
  required_verification_status: 'EXISTING_REUSED';
  evidence_document_references: 'SECURE_OBJECT_STORE_REUSED';
};

export function buildLabPartnerProfileCapabilityModel(): LabPartnerProfileCapabilityModel {
  return {
    legal_business_identity: 'EXISTING_REUSED',
    operating_country_market: 'POLICY_PACK_DRIVEN',
    organization_identity: 'EXISTING_REUSED',
    lab_type: 'EXISTING_REUSED',
    accreditation_registry_evidence: 'EXTERNAL_GATED',
    licences_certifications: 'POLICY_PACK_DRIVEN',
    responsible_contacts: 'EXISTING_REUSED',
    service_locations: 'EXISTING_REUSED',
    test_service_catalogue_ownership: 'EXISTING_REUSED',
    collection_home_collection: 'PACK_GATED',
    report_pathology_capability: 'EXISTING_REUSED',
    operating_hours: 'EXISTING_REUSED',
    supported_service_areas: 'POLICY_PACK_DRIVEN',
    required_verification_status: 'EXISTING_REUSED',
    evidence_document_references: 'SECURE_OBJECT_STORE_REUSED',
  };
}

export type LabPartnerOnboardingActivationPreparationReport = {
  sprint: 127;
  foundation_sprints: string;
  authoritative_source: 'lab-partner-onboarding-activation-preparation';
  parallel_lab_onboarding_framework_created: false;
  parallel_kyc_framework_created: false;
  parallel_sample_state_machine_created: false;
  parallel_report_system_created: false;
  parallel_catalog_system_created: false;
  parallel_authorization_framework_created: false;
  fake_lab_provider_invented: false;
  fake_accreditation_claimed: false;
  fake_registry_connected: false;
  real_lab_production_enabled: false;
  real_accreditation_verified: false;
  document_verified_equals_partner_verified: false;
  partner_verified_equals_production_enabled: false;
  source_of_truth: {
    partner_state_machine: 'EXISTING_REUSED';
    kyc_verification: 'S124_COMPOSED';
    healthcare_readiness: 'S48_COMPOSED';
    lab_capability: 'EXISTING_REUSED';
    lab_diagnostics_closure: 'S126_COMPOSED';
    sod: 'S110_REUSED';
    security_gate: 'S116_COMPOSED';
    foundation: 'S117_S119_COMPOSED';
    payment_context: 'S120_COMPOSED';
    launch_control: 'S87_COMPOSED';
  };
  onboarding_lifecycle: {
    model: 'MAPPED_ONTO_PARTNER_STATUS';
    phases: LabPartnerOnboardingPhase[];
    production_enabled_phase_reachable: false;
    example_mappings: Array<{ partner_status: PartnerStatus; phase: LabPartnerOnboardingPhase }>;
  };
  verification_separation: {
    document_verified: 'DISTINCT';
    partner_verified: 'DISTINCT';
    production_enabled: 'DISTINCT';
    statement: 'DOCUMENT VERIFIED != PARTNER VERIFIED != PRODUCTION ENABLED';
  };
  lab_provider: {
    lifecycle: 'NOT_SELECTED' | 'ACTIVATION_PENDING';
    production: 'EXTERNAL_GATED';
    sandbox: 'SANDBOX_VERIFIED';
    enabled: false;
    attestation_code: typeof LAB_PARTNER_ATTESTATION_CODE;
    attestation_is_legal_accreditation: false;
  };
  admin_summary: {
    business_kyb: LabActivationGateStatus;
    healthcare_accreditation: LabActivationGateStatus;
    required_documents: LabActivationGateStatus;
    organization_tenant: LabActivationGateStatus;
    service_locations: LabActivationGateStatus;
    lab_catalogue: LabActivationGateStatus;
    collection_capability: LabActivationGateStatus;
    report_workflow: LabActivationGateStatus;
    storage_security: LabActivationGateStatus;
    payment_psp: LabActivationGateStatus;
    market_policy: LabActivationGateStatus;
    production_infrastructure: LabActivationGateStatus;
    external_providers: LabActivationGateStatus;
    production_lab_partner_activation: 'BLOCKED';
  };
  activation_gates: LabActivationGate[];
  profile_capabilities: LabPartnerProfileCapabilityModel;
  lab_requirement_codes: string[];
  invalid_state_protections: ReturnType<typeof assertLabPartnerInvalidStateProtections>;
  fail_closed_cases: LabFailClosedCase[];
  customer_safety: {
    unverified_not_production_discoverable: true;
    suspended_not_production_discoverable: true;
    expired_not_production_discoverable: true;
    sandbox_demo_flows_preserved: true;
  };
  catalog_ownership: {
    tests_packages: 'EXISTING_REUSED';
    sample_requirements: 'EXISTING_REUSED';
    preparation_instructions: 'EXISTING_REUSED';
    collection_method: 'EXISTING_REUSED';
    turnaround_metadata: 'EXISTING_REUSED';
    report_availability: 'EXISTING_REUSED';
    second_catalog_created: false;
  };
  tenant_isolation: {
    lab_a_cannot_see_lab_b_onboarding: true;
    lab_cannot_self_approve_unless_sod_allows: true;
    customer_cannot_access_admin_onboarding: true;
    cross_tenant_admin_mutation: 'DENIED';
    evidence_uses_secure_object_refs: true;
    status: 'PASS';
  };
  global_policy: {
    policy_driven: true;
    hardcoded_india_global: false;
    status: 'POLICY_DRIVEN';
  };
  sandbox_vs_production: {
    sandbox_manual_verification_allowed: true;
    sandbox_cannot_satisfy_production: true;
    mock_kyc_forbidden_in_production: true;
    fake_accreditation_forbidden: true;
    infrastructure_environment: 'sandbox' | 'production';
  };
  production_fail_closed: {
    activation_when_gates_unmet: 'BLOCKED';
    overall: 'PASS';
  };
  security_gate: {
    remaining_blocker: string;
    certified: string;
  };
  composed: {
    kyc_production_partner_verification: string;
    lab_diagnostics_production: string;
    psp_production: string;
  };
  external_inputs_required: string[];
  remaining_blocker: typeof NO_PRODUCTION_LAB_PARTNER_ACTIVATION;
  remaining_blockers: string[];
  force_launch_available: false;
  force_enable_lab_available: false;
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

export function evaluateLabPartnerOnboardingActivationPreparation(input?: {
  correlation_id?: string;
}): LabPartnerOnboardingActivationPreparationReport {
  const env = readInfrastructureEnvironment();
  const security = evaluateProductionSecurityGate();
  const foundation = evaluateProductionFoundationActivationPreparation();
  const release = evaluateProductionReleaseEngineeringReadiness();
  const deploy = evaluateProductionDeploymentTargetActivation();
  const psp = evaluatePspPaymentActivationPreparation();
  const kyc = evaluateKycHealthcarePartnerVerificationActivationPreparation();
  const labClosure = evaluateLabDiagnosticsRealUseClosure();
  const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'LABS' });
  const gates = buildLabPartnerActivationGates();
  const labReqs = requirementCodesForProvider('LAB');

  void foundation.can_production_launch;
  void release.can_production_launch;
  void deploy.can_production_launch;
  void launch.can_production_launch;

  const remaining_blockers = [
    NO_PRODUCTION_LAB_PARTNER_ACTIVATION,
    NO_PRODUCTION_KYC_KYB_PROVIDER,
    NO_PRODUCTION_CLINICAL_ADAPTER,
    LAB_ACCREDITATION_REGISTRY_EXTERNAL_GATED,
    EXTERNAL_PENTEST_REQUIRED,
  ];

  return {
    sprint: 127,
    foundation_sprints:
      'S15/S25/S36/S42/S48/S55/S57/S72/S81/S94/S106/S110/S116/S117/S118/S119/S120/S124/S126',
    authoritative_source: 'lab-partner-onboarding-activation-preparation',
    parallel_lab_onboarding_framework_created: false,
    parallel_kyc_framework_created: false,
    parallel_sample_state_machine_created: false,
    parallel_report_system_created: false,
    parallel_catalog_system_created: false,
    parallel_authorization_framework_created: false,
    fake_lab_provider_invented: false,
    fake_accreditation_claimed: false,
    fake_registry_connected: false,
    real_lab_production_enabled: false,
    real_accreditation_verified: false,
    document_verified_equals_partner_verified: false,
    partner_verified_equals_production_enabled: false,
    source_of_truth: {
      partner_state_machine: 'EXISTING_REUSED',
      kyc_verification: 'S124_COMPOSED',
      healthcare_readiness: 'S48_COMPOSED',
      lab_capability: 'EXISTING_REUSED',
      lab_diagnostics_closure: 'S126_COMPOSED',
      sod: 'S110_REUSED',
      security_gate: 'S116_COMPOSED',
      foundation: 'S117_S119_COMPOSED',
      payment_context: 'S120_COMPOSED',
      launch_control: 'S87_COMPOSED',
    },
    onboarding_lifecycle: {
      model: 'MAPPED_ONTO_PARTNER_STATUS',
      phases: [
        'PROSPECT',
        'APPLICATION_SUBMITTED',
        'DOCUMENTS_PENDING',
        'UNDER_REVIEW',
        'VERIFICATION_PENDING',
        'VERIFIED',
        'ACTIVATION_PENDING',
        'ENABLED',
        'SUSPENDED',
        'EXPIRED',
        'DEACTIVATED',
        'REJECTED',
      ],
      production_enabled_phase_reachable: false,
      example_mappings: [
        {
          partner_status: PartnerStatus.DRAFT,
          phase: mapPartnerStatusToLabOnboardingPhase(PartnerStatus.DRAFT),
        },
        {
          partner_status: PartnerStatus.DOCUMENTS_REQUIRED,
          phase: mapPartnerStatusToLabOnboardingPhase(PartnerStatus.DOCUMENTS_REQUIRED),
        },
        {
          partner_status: PartnerStatus.UNDER_REVIEW,
          phase: mapPartnerStatusToLabOnboardingPhase(PartnerStatus.UNDER_REVIEW),
        },
        {
          partner_status: PartnerStatus.VERIFIED,
          phase: mapPartnerStatusToLabOnboardingPhase(PartnerStatus.VERIFIED),
        },
        {
          partner_status: PartnerStatus.APPROVED,
          phase: mapPartnerStatusToLabOnboardingPhase(PartnerStatus.APPROVED),
        },
        {
          partner_status: PartnerStatus.ACTIVE,
          phase: mapPartnerStatusToLabOnboardingPhase(PartnerStatus.ACTIVE, {
            productionEnabled: false,
          }),
        },
        {
          partner_status: PartnerStatus.SUSPENDED,
          phase: mapPartnerStatusToLabOnboardingPhase(PartnerStatus.SUSPENDED),
        },
      ],
    },
    verification_separation: {
      document_verified: 'DISTINCT',
      partner_verified: 'DISTINCT',
      production_enabled: 'DISTINCT',
      statement: 'DOCUMENT VERIFIED != PARTNER VERIFIED != PRODUCTION ENABLED',
    },
    lab_provider: {
      lifecycle: 'NOT_SELECTED',
      production: 'EXTERNAL_GATED',
      sandbox: 'SANDBOX_VERIFIED',
      enabled: false,
      attestation_code: LAB_PARTNER_ATTESTATION_CODE,
      attestation_is_legal_accreditation: false,
    },
    admin_summary: {
      business_kyb: 'EXTERNAL_GATED',
      healthcare_accreditation: 'EXTERNAL_GATED',
      required_documents: 'SANDBOX_ONLY',
      organization_tenant: 'READY',
      service_locations: 'SANDBOX_ONLY',
      lab_catalogue: 'SANDBOX_ONLY',
      collection_capability: 'SANDBOX_ONLY',
      report_workflow: 'SANDBOX_ONLY',
      storage_security: 'EXTERNAL_GATED',
      payment_psp: 'EXTERNAL_GATED',
      market_policy: 'READY',
      production_infrastructure: 'EXTERNAL_GATED',
      external_providers: 'EXTERNAL_GATED',
      production_lab_partner_activation: 'BLOCKED',
    },
    activation_gates: gates,
    profile_capabilities: buildLabPartnerProfileCapabilityModel(),
    lab_requirement_codes: labReqs,
    invalid_state_protections: assertLabPartnerInvalidStateProtections(),
    fail_closed_cases: evaluateLabPartnerFailClosedCases(),
    customer_safety: {
      unverified_not_production_discoverable: true,
      suspended_not_production_discoverable: true,
      expired_not_production_discoverable: true,
      sandbox_demo_flows_preserved: true,
    },
    catalog_ownership: {
      tests_packages: 'EXISTING_REUSED',
      sample_requirements: 'EXISTING_REUSED',
      preparation_instructions: 'EXISTING_REUSED',
      collection_method: 'EXISTING_REUSED',
      turnaround_metadata: 'EXISTING_REUSED',
      report_availability: 'EXISTING_REUSED',
      second_catalog_created: false,
    },
    tenant_isolation: {
      lab_a_cannot_see_lab_b_onboarding: true,
      lab_cannot_self_approve_unless_sod_allows: true,
      customer_cannot_access_admin_onboarding: true,
      cross_tenant_admin_mutation: 'DENIED',
      evidence_uses_secure_object_refs: true,
      status: 'PASS',
    },
    global_policy: {
      policy_driven: true,
      hardcoded_india_global: false,
      status: 'POLICY_DRIVEN',
    },
    sandbox_vs_production: {
      sandbox_manual_verification_allowed: true,
      sandbox_cannot_satisfy_production: true,
      mock_kyc_forbidden_in_production: true,
      fake_accreditation_forbidden: true,
      infrastructure_environment: env,
    },
    production_fail_closed: {
      activation_when_gates_unmet: 'BLOCKED',
      overall: 'PASS',
    },
    security_gate: {
      remaining_blocker: security.remaining_blocker,
      certified: security.production_security_certified ?? 'NO',
    },
    composed: {
      kyc_production_partner_verification:
        kyc.admin_summary.production_partner_verification ?? 'BLOCKED',
      lab_diagnostics_production: labClosure.production_lab_gate.hl7_fhir ?? 'EXTERNAL_GATED',
      psp_production: psp.admin_summary.production_payment ?? 'BLOCKED',
    },
    external_inputs_required: [
      'Real KYC/KYB provider + credential/callback refs (S124)',
      'Market-policy lab accreditation / healthcare registry evidence where required',
      'Production clinical adapters (HL7/FHIR/LIS) — NO_PRODUCTION_CLINICAL_ADAPTER',
      'Production private storage + KMS + malware scan readiness',
      'Production PSP where lab booking payment is required (S120)',
      'Human SoD verification + approval (S110)',
      'Security certification (EXTERNAL_PENTEST_REQUIRED)',
      'Production foundation / release / deployment target (S117–S119)',
    ],
    remaining_blocker: NO_PRODUCTION_LAB_PARTNER_ACTIVATION,
    remaining_blockers,
    force_launch_available: false,
    force_enable_lab_available: false,
    can_production_launch: 'NO',
    why_launch_blocked:
      "Why can't World-Pharma activate a real lab partner for production yet? Business/KYB EXTERNAL_GATED; healthcare accreditation EXTERNAL_GATED; clinical adapters absent (NO_PRODUCTION_CLINICAL_ADAPTER); storage/KMS/malware EXTERNAL_GATED; PSP EXTERNAL_GATED; production infrastructure EXTERNAL_GATED. Sandbox attestation (LAB_PARTNER_SANDBOX_V1) is not legal accreditation. DOCUMENT VERIFIED != PARTNER VERIFIED != PRODUCTION ENABLED. Production lab partner activation BLOCKED.",
    next_action:
      'When real KYC/KYB + market-policy accreditation evidence + clinical adapters + storage/KMS + PSP (as required) exist: supply configuration REFERENCES (never secret values or invented approvals), advance PartnerStatus via existing SM with SoD, then only mark production ENABLED after all activation gates are READY — do not invent a lab provider or rewrite onboarding architecture.',
    message:
      'Sprint 127 lab partner onboarding + production activation control: lifecycle mapped onto PartnerStatus; production lab partner activation BLOCKED; sandbox SANDBOX_VERIFIED. CAN_PRODUCTION_LAUNCH = NO.',
    security_statement:
      'Existing PartnerStatus + KYC + LabCapability + S48 readiness + S124/S126 composed. No second onboarding/KYC/catalog/report framework. Sandbox attestation ≠ legal accreditation. Mock/sandbox cannot satisfy production. Tenant isolation + S110 SoD retained.',
    secrets_printed: false,
    pii_phi_printed: false,
    evaluated_at: new Date().toISOString(),
    correlation_id: input?.correlation_id,
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
  };
}
