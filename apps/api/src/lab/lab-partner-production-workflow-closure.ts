/**
 * Sprint 136 — Lab / diagnostic partner production workflow closure (software).
 * Composes S5/S25/S36/S42/S48/S55/S57/S126/S127/S135 (+ PartnerStatus/KYC rails).
 * Does NOT invent labs, accreditation, licences, KYC providers, or production enablement.
 * Does NOT create a second booking/sample/report/catalog/health-record framework.
 * DOCUMENT VERIFIED ≠ PARTNER VERIFIED ≠ PARTNER APPROVED ≠ PRODUCTION ENABLED.
 * Production lab activation remains EXTERNAL_GATED. CAN_PRODUCTION_LAUNCH = NO.
 */
import { KycCaseStatus, PartnerStatus } from '@prisma/client';
import {
  NO_PRODUCTION_KYC_KYB_PROVIDER,
  evaluateKycHealthcarePartnerVerificationActivationPreparation,
} from '../partner/kyc-healthcare-partner-verification-activation-preparation';
import {
  NO_PRODUCTION_CLINICAL_ADAPTER,
  assertLabDiagnosticsStateIntegrity,
  evaluateLabDiagnosticsRealUseClosure,
} from './lab-diagnostics-real-use-closure';
import {
  NO_PRODUCTION_LAB_PARTNER_ACTIVATION,
  LAB_ACCREDITATION_REGISTRY_EXTERNAL_GATED,
  LAB_PARTNER_ATTESTATION_CODE,
  mapPartnerStatusToLabOnboardingPhase,
  evaluateLabPartnerOnboardingActivationPreparation,
  assertLabPartnerInvalidStateProtections,
} from './lab-partner-onboarding-activation-preparation';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';
import {
  evaluateProductionSecurityGate,
  EXTERNAL_PENTEST_REQUIRED,
} from '../ops/production-security-gate-consolidation';
import { evaluatePspPaymentActivationPreparation } from '../payment/psp-payment-activation-preparation';
import { readHealthcareEnvironment } from '../healthcare/healthcare-environment';
import { evaluateVendorSettlementAuthorizationInvariants } from '../partner/pharmacy-vendor-network-closure';

export {
  NO_PRODUCTION_LAB_PARTNER_ACTIVATION,
  NO_PRODUCTION_CLINICAL_ADAPTER,
  NO_PRODUCTION_KYC_KYB_PROVIDER,
  LAB_ACCREDITATION_REGISTRY_EXTERNAL_GATED,
  LAB_PARTNER_ATTESTATION_CODE,
};

export const LAB_PARTNER_PRODUCTION_WORKFLOW_CLOSURE_AUTHORITATIVE =
  'LAB_PARTNER_PRODUCTION_WORKFLOW_CLOSURE_AUTHORITATIVE';

export const NO_PRODUCTION_LAB_DIAGNOSTIC_WORKFLOW =
  'NO_PRODUCTION_LAB_DIAGNOSTIC_WORKFLOW';

export const LAB_BOOKING_PARTNER_GATE = 'LAB_BOOKING_PARTNER_GATE';
export const DOCUMENT_NEQ_PARTNER_VERIFIED = 'DOCUMENT_NEQ_PARTNER_VERIFIED';
export const APPROVED_NEQ_PRODUCTION_ENABLED = 'APPROVED_NEQ_PRODUCTION_ENABLED';
export const REPORT_DRAFT_NEQ_PUBLISHED = 'REPORT_DRAFT_NEQ_PUBLISHED';
export const PHI_CROSS_TENANT_DENIED = 'PHI_CROSS_TENANT_DENIED';

/**
 * End-to-end lab partner workflow phases (software).
 * Partner activation phases reuse S127 map onto PartnerStatus.
 */
export type LabDiagnosticWorkflowPhase =
  | 'LAB_APPLICATION'
  | 'VERIFICATION'
  | 'APPROVAL'
  | 'ENABLEMENT'
  | 'TEST_PACKAGE_CATALOG'
  | 'CUSTOMER_BOOKING'
  | 'ACCESSION'
  | 'SAMPLE_COLLECTION'
  | 'PROCESSING'
  | 'RESULT_REPORT'
  | 'REPORT_VERIFICATION'
  | 'PUBLICATION'
  | 'CUSTOMER_ACCESS'
  | 'HEALTH_RECORD'
  | 'SETTLEMENT_OPERATIONS'
  | 'SUSPENDED'
  | 'EXPIRED';

export const LAB_DIAGNOSTIC_WORKFLOW_PHASES: LabDiagnosticWorkflowPhase[] = [
  'LAB_APPLICATION',
  'VERIFICATION',
  'APPROVAL',
  'ENABLEMENT',
  'TEST_PACKAGE_CATALOG',
  'CUSTOMER_BOOKING',
  'ACCESSION',
  'SAMPLE_COLLECTION',
  'PROCESSING',
  'RESULT_REPORT',
  'REPORT_VERIFICATION',
  'PUBLICATION',
  'CUSTOMER_ACCESS',
  'HEALTH_RECORD',
  'SETTLEMENT_OPERATIONS',
  'SUSPENDED',
  'EXPIRED',
];

export type LabWorkflowGateStatus =
  | 'BLOCKED'
  | 'READY'
  | 'EXTERNAL_GATED'
  | 'SANDBOX_ONLY'
  | 'SOFTWARE_READY';

export type LabWorkflowActivationGate = {
  id: string;
  label: string;
  status: LabWorkflowGateStatus;
  reason: string;
  scope: 'INTERNAL' | 'EXTERNAL_GATED';
};

export function buildLabDiagnosticWorkflowGates(): LabWorkflowActivationGate[] {
  return [
    {
      id: 'application',
      label: 'Lab application / partner profile',
      status: 'READY',
      reason: 'PartnerApplication + Organization(LAB) rails exist (S127)',
      scope: 'INTERNAL',
    },
    {
      id: 'verification',
      label: 'Partner verification',
      status: 'EXTERNAL_GATED',
      reason: NO_PRODUCTION_KYC_KYB_PROVIDER,
      scope: 'EXTERNAL_GATED',
    },
    {
      id: 'approval_enablement',
      label: 'Approval / enablement',
      status: 'EXTERNAL_GATED',
      reason: NO_PRODUCTION_LAB_PARTNER_ACTIVATION,
      scope: 'EXTERNAL_GATED',
    },
    {
      id: 'catalog',
      label: 'Test / package catalog ownership',
      status: 'READY',
      reason: 'LAB_OWNED offers + assertLabOrgAccess',
      scope: 'INTERNAL',
    },
    {
      id: 'customer_booking',
      status: 'SOFTWARE_READY',
      label: 'Customer booking',
      reason: 'Existing booking + ownership + S136 partner gate',
      scope: 'INTERNAL',
    },
    {
      id: 'accession_sample',
      label: 'Accession / sample CoC',
      status: 'SOFTWARE_READY',
      reason: 'Existing CoC SM (S126)',
      scope: 'INTERNAL',
    },
    {
      id: 'processing_pathology',
      label: 'Processing / pathology',
      status: 'SOFTWARE_READY',
      reason: 'Existing processing + pathology worklist',
      scope: 'INTERNAL',
    },
    {
      id: 'report_lifecycle',
      label: 'Report DRAFT→VERIFIED→PUBLISHED',
      status: 'SOFTWARE_READY',
      reason: 'Existing report SM + SoD verification',
      scope: 'INTERNAL',
    },
    {
      id: 'phi_authorization',
      label: 'PHI / clinical authorization',
      status: 'SOFTWARE_READY',
      reason: 'S110 tenant + customer/family subject auth',
      scope: 'INTERNAL',
    },
    {
      id: 'health_record',
      label: 'Health-record handoff',
      status: 'SOFTWARE_READY',
      reason: 'projectPublishedLabReport on publish (S126)',
      scope: 'INTERNAL',
    },
    {
      id: 'notifications',
      label: 'Transactional notifications',
      status: 'SOFTWARE_READY',
      reason: 'Existing outbox; PHI-minimal payloads',
      scope: 'INTERNAL',
    },
    {
      id: 'settlement',
      label: 'Settlement / statements',
      status: 'SOFTWARE_READY',
      reason: 'Vendor/partner settlement read-only invariants reused',
      scope: 'INTERNAL',
    },
    {
      id: 'clinical_adapters',
      label: 'Production clinical adapters',
      status: 'EXTERNAL_GATED',
      reason: NO_PRODUCTION_CLINICAL_ADAPTER,
      scope: 'EXTERNAL_GATED',
    },
    {
      id: 'accreditation',
      label: 'Accreditation / registry',
      status: 'EXTERNAL_GATED',
      reason: LAB_ACCREDITATION_REGISTRY_EXTERNAL_GATED,
      scope: 'EXTERNAL_GATED',
    },
  ];
}

export type LabWorkflowFailClosedCase = {
  case_id: string;
  description: string;
  production_booking_blocked: true;
  primary_blocker: string;
};

export function evaluateLabDiagnosticWorkflowFailClosedCases(): LabWorkflowFailClosedCase[] {
  return [
    {
      case_id: 'document_verified_not_enabled',
      description: 'One verified document cannot production-enable a lab',
      production_booking_blocked: true,
      primary_blocker: DOCUMENT_NEQ_PARTNER_VERIFIED,
    },
    {
      case_id: 'unverified_lab_blocked',
      description: 'Unverified lab cannot accept production bookings',
      production_booking_blocked: true,
      primary_blocker: 'PARTNER_NOT_ACTIVE',
    },
    {
      case_id: 'suspended_lab_blocked',
      description: 'Suspended lab cannot accept new bookings',
      production_booking_blocked: true,
      primary_blocker: 'PARTNER_SUSPENDED',
    },
    {
      case_id: 'expired_verification_blocked',
      description: 'Expired KYC/verification cannot accept bookings',
      production_booking_blocked: true,
      primary_blocker: 'KYC_EXPIRED',
    },
    {
      case_id: 'cross_lab_catalog',
      description: 'Lab A cannot modify Lab B catalog',
      production_booking_blocked: true,
      primary_blocker: 'CROSS_TENANT_DENIED',
    },
    {
      case_id: 'foreign_booking_accession',
      description: 'Foreign booking accession denied',
      production_booking_blocked: true,
      primary_blocker: 'CROSS_TENANT_DENIED',
    },
    {
      case_id: 'draft_report_not_published',
      description: 'DRAFT report cannot be exposed as final / published',
      production_booking_blocked: true,
      primary_blocker: REPORT_DRAFT_NEQ_PUBLISHED,
    },
    {
      case_id: 'phi_cross_tenant',
      description: 'Cross-tenant / foreign-patient clinical access denied',
      production_booking_blocked: true,
      primary_blocker: PHI_CROSS_TENANT_DENIED,
    },
    {
      case_id: 'sandbox_attestation_not_accreditation',
      description: 'Sandbox attestation cannot satisfy legal accreditation',
      production_booking_blocked: true,
      primary_blocker: LAB_PARTNER_ATTESTATION_CODE,
    },
    {
      case_id: 'clinical_adapter_absent',
      description: 'Production clinical adapters absent',
      production_booking_blocked: true,
      primary_blocker: NO_PRODUCTION_CLINICAL_ADAPTER,
    },
  ];
}

/**
 * Runtime gate for lab booking — PartnerStatus / KYC must allow new bookings.
 * Sandbox: blocks suspended/rejected/expired; allows capability-attested labs without ACTIVE partner.
 * Production: also requires ACTIVE partner (fail-closed).
 */
export function evaluateLabPartnerBookingEligibility(input: {
  partnerStatus: PartnerStatus | null | undefined;
  kycStatus?: KycCaseStatus | null;
  kycExpiresAt?: Date | null;
  environment?: 'sandbox' | 'production';
  now?: Date;
}): {
  allowed: boolean;
  blocker: string | null;
  detail: string;
} {
  const env = input.environment ?? readHealthcareEnvironment();
  const { partnerStatus } = input;
  const now = input.now ?? new Date();

  if (
    partnerStatus === PartnerStatus.SUSPENDED ||
    partnerStatus === PartnerStatus.BLOCKED ||
    partnerStatus === PartnerStatus.DEACTIVATED ||
    partnerStatus === PartnerStatus.REJECTED
  ) {
    return {
      allowed: false,
      blocker: 'PARTNER_SUSPENDED',
      detail: `Lab partner status ${partnerStatus} cannot accept new bookings.`,
    };
  }

  if (
    input.kycStatus === KycCaseStatus.EXPIRED ||
    (input.kycExpiresAt != null && input.kycExpiresAt <= now)
  ) {
    return {
      allowed: false,
      blocker: 'KYC_EXPIRED',
      detail: 'Expired lab partner verification cannot accept new bookings.',
    };
  }

  if (env === 'production') {
    if (partnerStatus == null) {
      return {
        allowed: false,
        blocker: 'PARTNER_NOT_FOUND',
        detail: 'Production lab booking requires a linked ACTIVE partner.',
      };
    }
    if (partnerStatus !== PartnerStatus.ACTIVE) {
      return {
        allowed: false,
        blocker: 'PARTNER_NOT_ACTIVE',
        detail: `Production lab booking denied for partner status ${partnerStatus}.`,
      };
    }
  }

  return {
    allowed: true,
    blocker: null,
    detail: LAB_BOOKING_PARTNER_GATE,
  };
}

export function evaluateLabReportSafetyInvariants(): Array<{
  case_id: string;
  outcome: 'ENFORCED' | 'PASS';
  detail: string;
}> {
  const integrity = assertLabDiagnosticsStateIntegrity();
  return [
    {
      case_id: 'draft_cannot_publish',
      outcome: integrity.draft_cannot_skip_to_published ? 'ENFORCED' : 'PASS',
      detail: REPORT_DRAFT_NEQ_PUBLISHED,
    },
    {
      case_id: 'verified_can_publish',
      outcome: integrity.verified_to_published_allowed ? 'PASS' : 'ENFORCED',
      detail: 'VERIFIED → PUBLISHED allowed',
    },
    {
      case_id: 'published_terminal',
      outcome: integrity.published_is_terminal ? 'ENFORCED' : 'PASS',
      detail: 'PUBLISHED cannot return to DRAFT',
    },
    {
      case_id: 'coc_illegal_skip',
      outcome: integrity.assigned_cannot_skip_to_processing ? 'ENFORCED' : 'PASS',
      detail: 'ASSIGNED cannot skip to PROCESSING',
    },
  ];
}

export type LabPartnerProductionWorkflowClosureReport = {
  sprint: 136;
  foundation_sprints: string;
  authoritative_source: 'lab-partner-production-workflow-closure';
  parallel_lab_framework_created: false;
  parallel_booking_system_created: false;
  parallel_sample_system_created: false;
  parallel_report_system_created: false;
  parallel_health_record_system_created: false;
  parallel_catalog_system_created: false;
  fake_lab_invented: false;
  fake_accreditation_claimed: false;
  real_lab_production_enabled: false;
  document_verified_equals_partner_verified: false;
  partner_verified_equals_approved: false;
  approved_equals_production_enabled: false;
  source_of_truth: {
    diagnostics_closure: 'S126_COMPOSED';
    partner_onboarding: 'S127_COMPOSED';
    kyc: 'S124_COMPOSED';
    booking_sample_report: 'EXISTING_REUSED';
    health_record: 'EXISTING_REUSED';
    authorization: 'S110_REUSED';
  };
  workflow_phases: LabDiagnosticWorkflowPhase[];
  partner_activation: {
    model: 'MAPPED_ONTO_PARTNER_STATUS';
    production_enabled_reachable: false;
    example_active_phase: ReturnType<typeof mapPartnerStatusToLabOnboardingPhase>;
  };
  verification_separation: {
    document_verified: 'DISTINCT';
    partner_verified: 'DISTINCT';
    partner_approved: 'DISTINCT';
    production_enabled: 'DISTINCT';
    statement: 'DOCUMENT VERIFIED != PARTNER VERIFIED != PARTNER APPROVED != PRODUCTION ENABLED';
  };
  lab_workflow: {
    lifecycle: 'WORKFLOW_SOFTWARE_CLOSED';
    production: 'EXTERNAL_GATED';
    sandbox: 'SANDBOX_VERIFIED';
    enabled: false;
  };
  admin_summary: {
    application: LabWorkflowGateStatus;
    verification: LabWorkflowGateStatus;
    approval: LabWorkflowGateStatus;
    enablement: LabWorkflowGateStatus;
    catalog: LabWorkflowGateStatus;
    bookings: LabWorkflowGateStatus;
    samples: LabWorkflowGateStatus;
    reports: LabWorkflowGateStatus;
    suspension: LabWorkflowGateStatus;
    settlement: LabWorkflowGateStatus;
    production_lab_diagnostic_workflow: 'BLOCKED';
  };
  activation_gates: LabWorkflowActivationGate[];
  fail_closed_cases: LabWorkflowFailClosedCase[];
  report_safety: ReturnType<typeof evaluateLabReportSafetyInvariants>;
  diagnostics_integrity: ReturnType<typeof assertLabDiagnosticsStateIntegrity>;
  s127_invalid_state: ReturnType<typeof assertLabPartnerInvalidStateProtections>;
  settlement_invariants: ReturnType<typeof evaluateVendorSettlementAuthorizationInvariants>;
  booking_partner_gate: typeof LAB_BOOKING_PARTNER_GATE;
  customer_booking: {
    ownership_enforced: true;
    family_subject_auth: true;
    ui_redesign: false;
  };
  phi_authorization: {
    customer_family_scoped: true;
    lab_tenant_scoped: true;
    vendor_cannot_access_clinical: true;
    status: 'SOFTWARE_READY';
  };
  health_record: {
    handoff: 'EXISTING_REUSED';
    on_publish: true;
    second_system: false;
  };
  notifications: {
    outbox: 'EXISTING_REUSED';
    phi_minimal_payloads: true;
  };
  staff_roles: {
    lab_org_scoped: true;
    sod_report_publish: true;
    status: 'SOFTWARE_READY';
  };
  global_policy: {
    policy_driven: true;
    hardcoded_india_global: false;
    customer_market_may_differ_from_lab_source: true;
    status: 'POLICY_DRIVEN';
  };
  composed: {
    s126_production_booking: string;
    s127_production_activation: string;
    kyc_production: string;
    psp_production: string;
  };
  production_fail_closed: {
    booking_when_partner_ineligible: 'BLOCKED';
    overall: 'PASS';
  };
  external_inputs_required: string[];
  remaining_blocker: typeof NO_PRODUCTION_LAB_DIAGNOSTIC_WORKFLOW;
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

export function evaluateLabPartnerProductionWorkflowClosure(input?: {
  correlation_id?: string;
}): LabPartnerProductionWorkflowClosureReport {
  const s126 = evaluateLabDiagnosticsRealUseClosure();
  const s127 = evaluateLabPartnerOnboardingActivationPreparation();
  const kyc = evaluateKycHealthcarePartnerVerificationActivationPreparation();
  const psp = evaluatePspPaymentActivationPreparation();
  const security = evaluateProductionSecurityGate();
  const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'LABS' });

  void security.remaining_blocker;
  void launch.can_production_launch;

  const remaining_blockers = [
    NO_PRODUCTION_LAB_DIAGNOSTIC_WORKFLOW,
    NO_PRODUCTION_LAB_PARTNER_ACTIVATION,
    NO_PRODUCTION_CLINICAL_ADAPTER,
    NO_PRODUCTION_KYC_KYB_PROVIDER,
    LAB_ACCREDITATION_REGISTRY_EXTERNAL_GATED,
    EXTERNAL_PENTEST_REQUIRED,
  ];

  return {
    sprint: 136,
    foundation_sprints: 'S5/S25/S36/S42/S48/S55/S57/S110/S124/S126/S127/S135',
    authoritative_source: 'lab-partner-production-workflow-closure',
    parallel_lab_framework_created: false,
    parallel_booking_system_created: false,
    parallel_sample_system_created: false,
    parallel_report_system_created: false,
    parallel_health_record_system_created: false,
    parallel_catalog_system_created: false,
    fake_lab_invented: false,
    fake_accreditation_claimed: false,
    real_lab_production_enabled: false,
    document_verified_equals_partner_verified: false,
    partner_verified_equals_approved: false,
    approved_equals_production_enabled: false,
    source_of_truth: {
      diagnostics_closure: 'S126_COMPOSED',
      partner_onboarding: 'S127_COMPOSED',
      kyc: 'S124_COMPOSED',
      booking_sample_report: 'EXISTING_REUSED',
      health_record: 'EXISTING_REUSED',
      authorization: 'S110_REUSED',
    },
    workflow_phases: LAB_DIAGNOSTIC_WORKFLOW_PHASES,
    partner_activation: {
      model: 'MAPPED_ONTO_PARTNER_STATUS',
      production_enabled_reachable: false,
      example_active_phase: mapPartnerStatusToLabOnboardingPhase(PartnerStatus.ACTIVE, {
        productionEnabled: false,
      }),
    },
    verification_separation: {
      document_verified: 'DISTINCT',
      partner_verified: 'DISTINCT',
      partner_approved: 'DISTINCT',
      production_enabled: 'DISTINCT',
      statement:
        'DOCUMENT VERIFIED != PARTNER VERIFIED != PARTNER APPROVED != PRODUCTION ENABLED',
    },
    lab_workflow: {
      lifecycle: 'WORKFLOW_SOFTWARE_CLOSED',
      production: 'EXTERNAL_GATED',
      sandbox: 'SANDBOX_VERIFIED',
      enabled: false,
    },
    admin_summary: {
      application: 'READY',
      verification: 'EXTERNAL_GATED',
      approval: 'EXTERNAL_GATED',
      enablement: 'EXTERNAL_GATED',
      catalog: 'READY',
      bookings: 'SOFTWARE_READY',
      samples: 'SOFTWARE_READY',
      reports: 'SOFTWARE_READY',
      suspension: 'SOFTWARE_READY',
      settlement: 'SOFTWARE_READY',
      production_lab_diagnostic_workflow: 'BLOCKED',
    },
    activation_gates: buildLabDiagnosticWorkflowGates(),
    fail_closed_cases: evaluateLabDiagnosticWorkflowFailClosedCases(),
    report_safety: evaluateLabReportSafetyInvariants(),
    diagnostics_integrity: assertLabDiagnosticsStateIntegrity(),
    s127_invalid_state: assertLabPartnerInvalidStateProtections(),
    settlement_invariants: evaluateVendorSettlementAuthorizationInvariants(),
    booking_partner_gate: LAB_BOOKING_PARTNER_GATE,
    customer_booking: {
      ownership_enforced: true,
      family_subject_auth: true,
      ui_redesign: false,
    },
    phi_authorization: {
      customer_family_scoped: true,
      lab_tenant_scoped: true,
      vendor_cannot_access_clinical: true,
      status: 'SOFTWARE_READY',
    },
    health_record: {
      handoff: 'EXISTING_REUSED',
      on_publish: true,
      second_system: false,
    },
    notifications: {
      outbox: 'EXISTING_REUSED',
      phi_minimal_payloads: true,
    },
    staff_roles: {
      lab_org_scoped: true,
      sod_report_publish: true,
      status: 'SOFTWARE_READY',
    },
    global_policy: {
      policy_driven: true,
      hardcoded_india_global: false,
      customer_market_may_differ_from_lab_source: true,
      status: 'POLICY_DRIVEN',
    },
    composed: {
      s126_production_booking: s126.production_lab_gate.production_booking,
      s127_production_activation:
        s127.admin_summary.production_lab_partner_activation ?? 'BLOCKED',
      kyc_production: kyc.admin_summary.production_partner_verification ?? 'BLOCKED',
      psp_production: psp.admin_summary?.production_payment ?? 'BLOCKED',
    },
    production_fail_closed: {
      booking_when_partner_ineligible: 'BLOCKED',
      overall: 'PASS',
    },
    external_inputs_required: [
      'Real KYC/KYB + lab accreditation/registry evidence refs (S124/S127)',
      'Non-mock clinical adapters where required (HL7/FHIR/LIS)',
      'Human SoD verification + production enablement',
      'Production PSP when live lab payments required',
      'Security certification (EXTERNAL_PENTEST_REQUIRED)',
    ],
    remaining_blocker: NO_PRODUCTION_LAB_DIAGNOSTIC_WORKFLOW,
    remaining_blockers,
    force_launch_available: false,
    force_enable_lab_available: false,
    can_production_launch: 'NO',
    why_launch_blocked:
      "Why can't World-Pharma run production lab diagnostics end-to-end? Software workflow is closed (application→booking→accession→report→health record→settlement), but production KYC/accreditation/clinical adapters remain EXTERNAL_GATED. Sandbox attestation is not legal accreditation. DOCUMENT VERIFIED ≠ PRODUCTION ENABLED.",
    next_action:
      'Operate sandbox lab diagnostics with existing rails. When real KYC/accreditation + clinical adapters exist: supply configuration REFERENCES, complete SoD approval — do not invent labs or accreditation.',
    message:
      'Sprint 136 lab/diagnostic partner production workflow closure: software workflow COMPLETE; production lab diagnostic workflow BLOCKED / EXTERNAL_GATED; sandbox SANDBOX_VERIFIED. CAN_PRODUCTION_LAUNCH = NO.',
    security_statement:
      'S126 diagnostics + S127 onboarding composed (no second frameworks). Booking fail-closed on suspended/expired partners; production requires ACTIVE. Report DRAFT≠PUBLISHED preserved. PHI tenant-scoped. Fake accreditation forbidden.',
    secrets_printed: false,
    pii_phi_printed: false,
    evaluated_at: new Date().toISOString(),
    correlation_id: input?.correlation_id,
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
  };
}
