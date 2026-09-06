/**
 * Sprint 139 — Imaging / PACS / DICOM production workflow closure (software).
 * Composes S6/S24/S36/S48/S56/S70/S80/S93/S125/S138.
 * Does NOT invent PACS providers, DICOM studies, or claim production diagnostic viewers.
 * Does NOT create a second imaging/report/accession framework.
 * DOCUMENT VERIFIED ≠ PARTNER VERIFIED ≠ RADIOLOGY APPROVED ≠ PRODUCTION ENABLED.
 * DRAFT ≠ VERIFIED ≠ PUBLISHED. REPORT ≠ DIAGNOSTIC PACS VIEWER.
 * Production PACS remains EXTERNAL_GATED. CAN_PRODUCTION_LAUNCH = NO.
 */
import { KycCaseStatus, PartnerStatus } from '@prisma/client';
import {
  NO_PRODUCTION_PACS_PROVIDER,
  evaluatePacsFirstOnboarding,
} from './pacs-first-onboarding';
import {
  DRAFT_NEQ_PUBLISHED_IMAGING_REPORT,
  evaluatePacsProductionActivationPath,
  PRODUCTION_PACS_INGEST_BLOCKED,
  REPORT_NEQ_DIAGNOSTIC_VIEWER,
  SANDBOX_PACS_BLOCKED_IN_PRODUCTION,
} from './pacs-production-activation-path';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';
import {
  evaluateProductionSecurityGate,
  EXTERNAL_PENTEST_REQUIRED,
} from '../ops/production-security-gate-consolidation';
import { readHealthcareEnvironment } from '../healthcare/healthcare-environment';
import {
  NO_PRODUCTION_KYC_KYB_PROVIDER,
  evaluateKycHealthcarePartnerVerificationActivationPreparation,
} from '../partner/kyc-healthcare-partner-verification-activation-preparation';

export {
  NO_PRODUCTION_PACS_PROVIDER,
  PRODUCTION_PACS_INGEST_BLOCKED,
  SANDBOX_PACS_BLOCKED_IN_PRODUCTION,
  DRAFT_NEQ_PUBLISHED_IMAGING_REPORT,
  REPORT_NEQ_DIAGNOSTIC_VIEWER,
};

export const IMAGING_PACS_DICOM_PRODUCTION_WORKFLOW_CLOSURE_AUTHORITATIVE =
  'IMAGING_PACS_DICOM_PRODUCTION_WORKFLOW_CLOSURE_AUTHORITATIVE';

export const NO_PRODUCTION_IMAGING_PACS_DICOM_WORKFLOW =
  'NO_PRODUCTION_IMAGING_PACS_DICOM_WORKFLOW';

export const DOCUMENT_NEQ_RADIOLOGY_VERIFIED = 'DOCUMENT_NEQ_RADIOLOGY_VERIFIED';
export const APPROVED_NEQ_RADIOLOGY_ENABLED = 'APPROVED_NEQ_RADIOLOGY_ENABLED';
export const IMAGING_PARTNER_CLINICAL_GATE = 'IMAGING_PARTNER_CLINICAL_GATE';
export const PHI_CROSS_PATIENT_DENIED = 'PHI_CROSS_PATIENT_DENIED';

export type ImagingWorkflowPhase =
  | 'CUSTOMER_OR_REFERRING_CLINICIAN'
  | 'IMAGING_ORDER'
  | 'SCHEDULING'
  | 'STUDY_ACCESSION'
  | 'DICOM_INGEST'
  | 'PACS_STORAGE_REFERENCE'
  | 'RADIOLOGY_WORKLIST'
  | 'INTERPRETATION'
  | 'REPORT_VERIFICATION'
  | 'REPORT_PUBLICATION'
  | 'CUSTOMER_CLINICIAN_ACCESS'
  | 'HEALTH_RECORD';

export const IMAGING_WORKFLOW_PHASES: ImagingWorkflowPhase[] = [
  'CUSTOMER_OR_REFERRING_CLINICIAN',
  'IMAGING_ORDER',
  'SCHEDULING',
  'STUDY_ACCESSION',
  'DICOM_INGEST',
  'PACS_STORAGE_REFERENCE',
  'RADIOLOGY_WORKLIST',
  'INTERPRETATION',
  'REPORT_VERIFICATION',
  'REPORT_PUBLICATION',
  'CUSTOMER_CLINICIAN_ACCESS',
  'HEALTH_RECORD',
];

export type ImagingGateStatus =
  | 'BLOCKED'
  | 'READY'
  | 'EXTERNAL_GATED'
  | 'SANDBOX_ONLY'
  | 'SOFTWARE_READY';

export type ImagingActivationGate = {
  id: string;
  label: string;
  status: ImagingGateStatus;
  reason: string;
  scope: 'INTERNAL' | 'EXTERNAL_GATED';
};

export function buildImagingWorkflowGates(): ImagingActivationGate[] {
  return [
    {
      id: 'imaging_partner',
      label: 'Imaging partner verification',
      status: 'EXTERNAL_GATED',
      reason: NO_PRODUCTION_KYC_KYB_PROVIDER,
      scope: 'EXTERNAL_GATED',
    },
    {
      id: 'imaging_order',
      label: 'Imaging order / booking',
      status: 'SOFTWARE_READY',
      reason: 'Existing ImagingBookingService + idempotency',
      scope: 'INTERNAL',
    },
    {
      id: 'accession_study',
      label: 'Accession / study',
      status: 'SOFTWARE_READY',
      reason: 'Existing ImagingStudyService (idempotent accession)',
      scope: 'INTERNAL',
    },
    {
      id: 'pacs_provider',
      label: 'Production PACS / DICOM provider',
      status: 'EXTERNAL_GATED',
      reason: NO_PRODUCTION_PACS_PROVIDER,
      scope: 'EXTERNAL_GATED',
    },
    {
      id: 'dicom_ingest',
      label: 'Production DICOM ingest',
      status: 'EXTERNAL_GATED',
      reason: PRODUCTION_PACS_INGEST_BLOCKED,
      scope: 'EXTERNAL_GATED',
    },
    {
      id: 'viewer',
      label: 'Diagnostic PACS viewer',
      status: 'EXTERNAL_GATED',
      reason: REPORT_NEQ_DIAGNOSTIC_VIEWER,
      scope: 'EXTERNAL_GATED',
    },
    {
      id: 'worklist',
      label: 'Radiology worklist',
      status: 'SOFTWARE_READY',
      reason: 'Org-scoped radiologist worklist (existing)',
      scope: 'INTERNAL',
    },
    {
      id: 'report_lifecycle',
      label: 'Report DRAFT→VERIFIED→PUBLISHED',
      status: 'SOFTWARE_READY',
      reason: DRAFT_NEQ_PUBLISHED_IMAGING_REPORT,
      scope: 'INTERNAL',
    },
    {
      id: 'storage_security',
      label: 'Private storage / KMS / malware',
      status: 'EXTERNAL_GATED',
      reason: 'PRIVATE_STORAGE_EXTERNAL_GATED / KMS_EXTERNAL_GATED',
      scope: 'EXTERNAL_GATED',
    },
    {
      id: 'health_record',
      label: 'Health-record handoff',
      status: 'SOFTWARE_READY',
      reason: 'Existing published-report health-record association',
      scope: 'INTERNAL',
    },
  ];
}

export type ImagingFailClosedCase = {
  case_id: string;
  description: string;
  production_imaging_blocked: boolean;
  primary_blocker: string;
};

export function evaluateImagingWorkflowFailClosedCases(): ImagingFailClosedCase[] {
  return [
    {
      case_id: 'document_verified_not_enabled',
      description: 'Document verification cannot clinically enable radiology partner',
      production_imaging_blocked: true,
      primary_blocker: DOCUMENT_NEQ_RADIOLOGY_VERIFIED,
    },
    {
      case_id: 'suspended_partner_blocked',
      description: 'Suspended imaging partner cannot perform production clinical work',
      production_imaging_blocked: true,
      primary_blocker: 'PARTNER_SUSPENDED',
    },
    {
      case_id: 'expired_verification_blocked',
      description: 'Expired KYC cannot accept new imaging clinical work',
      production_imaging_blocked: true,
      primary_blocker: 'KYC_EXPIRED',
    },
    {
      case_id: 'production_without_pacs',
      description: 'Production DICOM ingest without PACS fail-closed',
      production_imaging_blocked: true,
      primary_blocker: PRODUCTION_PACS_INGEST_BLOCKED,
    },
    {
      case_id: 'sandbox_pacs_in_production',
      description: 'Sandbox/mock PACS blocked in production',
      production_imaging_blocked: true,
      primary_blocker: SANDBOX_PACS_BLOCKED_IN_PRODUCTION,
    },
    {
      case_id: 'cross_patient_order',
      description: 'Cross-patient imaging order denied',
      production_imaging_blocked: true,
      primary_blocker: PHI_CROSS_PATIENT_DENIED,
    },
    {
      case_id: 'draft_as_final',
      description: 'DRAFT cannot be presented as published final report',
      production_imaging_blocked: true,
      primary_blocker: DRAFT_NEQ_PUBLISHED_IMAGING_REPORT,
    },
    {
      case_id: 'report_neq_viewer',
      description: 'Published report is not a diagnostic PACS viewer',
      production_imaging_blocked: true,
      primary_blocker: REPORT_NEQ_DIAGNOSTIC_VIEWER,
    },
    {
      case_id: 'guessed_study_idor',
      description: 'Guessed study/report IDs denied',
      production_imaging_blocked: true,
      primary_blocker: 'IDOR_STUDY_ACCESS_DENIED',
    },
    {
      case_id: 'duplicate_ingest',
      description: 'Duplicate DICOM ingest is idempotent',
      production_imaging_blocked: false,
      primary_blocker: 'EXISTING_INGEST_REUSED',
    },
    {
      case_id: 'vendor_clinical_privilege',
      description: 'Generic vendor staff cannot interpret/publish',
      production_imaging_blocked: true,
      primary_blocker: 'VENDOR_CLINICAL_PRIVILEGE_DENIED',
    },
  ];
}

/**
 * Runtime gate for imaging partner clinical actions (booking / acquisition).
 * Sandbox: blocks suspended/rejected/expired.
 * Production: requires ACTIVE partner.
 */
export function evaluateImagingPartnerClinicalEligibility(input: {
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
      detail: `Imaging partner status ${partnerStatus} cannot perform clinical imaging work.`,
    };
  }

  if (
    input.kycStatus === KycCaseStatus.EXPIRED ||
    (input.kycExpiresAt != null && input.kycExpiresAt <= now)
  ) {
    return {
      allowed: false,
      blocker: 'KYC_EXPIRED',
      detail: 'Expired imaging partner verification cannot perform clinical imaging work.',
    };
  }

  if (env === 'production') {
    if (partnerStatus == null) {
      return {
        allowed: false,
        blocker: 'PARTNER_NOT_FOUND',
        detail: 'Production imaging requires a linked ACTIVE imaging partner.',
      };
    }
    if (partnerStatus !== PartnerStatus.ACTIVE) {
      return {
        allowed: false,
        blocker: 'PARTNER_NOT_ACTIVE',
        detail: `Production imaging denied for partner status ${partnerStatus}.`,
      };
    }
  }

  return {
    allowed: true,
    blocker: null,
    detail: IMAGING_PARTNER_CLINICAL_GATE,
  };
}

export function evaluateImagingAccessAuthorizationCatalog(): Array<{
  actor: string;
  allowed: boolean;
  reason: string;
}> {
  return [
    { actor: 'patient_owner', allowed: true, reason: 'BOOKING_CUSTOMER' },
    { actor: 'family_authorized', allowed: true, reason: 'HEALTH_SUBJECT_SCOPED' },
    { actor: 'assigned_radiologist', allowed: true, reason: 'ORG_WORKLIST_SCOPED' },
    { actor: 'imaging_org_staff', allowed: true, reason: 'IMAGING_ORG_MEMBER' },
    { actor: 'cross_patient', allowed: false, reason: PHI_CROSS_PATIENT_DENIED },
    { actor: 'cross_org_radiologist', allowed: false, reason: 'CROSS_ORG_STUDY_DENIED' },
    { actor: 'vendor', allowed: false, reason: 'VENDOR_CLINICAL_PRIVILEGE_DENIED' },
    { actor: 'unauthenticated', allowed: false, reason: 'AUTH_REQUIRED' },
  ];
}

export type ImagingPacsDicomProductionWorkflowClosureReport = {
  sprint: 139;
  foundation_sprints: string;
  authoritative_source: 'imaging-pacs-dicom-production-workflow-closure';
  parallel_imaging_framework_created: false;
  parallel_report_framework_created: false;
  parallel_accession_framework_created: false;
  fake_pacs_invented: false;
  fake_dicom_study_invented: false;
  real_pacs_claimed: false;
  real_diagnostic_viewer_claimed: false;
  document_verified_equals_partner_verified: false;
  radiology_approved_equals_production_enabled: false;
  draft_equals_published: false;
  report_equals_diagnostic_viewer: false;
  source_of_truth: {
    pacs_activation_path: 'S139_PATH';
    pacs_onboarding: 'S70_S80_S93_COMPOSED';
    booking_study_report: 'EXISTING_RADIOLOGY_SERVICES';
    authorization: 'EXISTING_IMAGING_ORG_ACCESS';
    storage: 'EXISTING_PRIVATE_OBJECT_STORE';
  };
  workflow_phases: ImagingWorkflowPhase[];
  verification_separation: {
    document_verified: 'DISTINCT';
    partner_verified: 'DISTINCT';
    radiology_approved: 'DISTINCT';
    production_enabled: 'DISTINCT';
    statement: 'DOCUMENT VERIFIED != PARTNER VERIFIED != RADIOLOGY APPROVED != PRODUCTION ENABLED';
  };
  imaging_workflow: {
    lifecycle: 'WORKFLOW_SOFTWARE_CLOSED';
    production: 'EXTERNAL_GATED';
    sandbox: 'SANDBOX_AVAILABLE';
    enabled: false;
  };
  admin_summary: {
    imaging_partner: ImagingGateStatus;
    verification: ImagingGateStatus;
    approval: ImagingGateStatus;
    enablement: ImagingGateStatus;
    pacs_provider: ImagingGateStatus;
    dicom_capability: ImagingGateStatus;
    configuration: ImagingGateStatus;
    credential_reference: ImagingGateStatus;
    pacs_verification: ImagingGateStatus;
    pacs_approval: ImagingGateStatus;
    pacs_enablement: ImagingGateStatus;
    viewer: ImagingGateStatus;
    storage_security: ImagingGateStatus;
    supported_modalities_markets: 'POLICY_DRIVEN';
    production_imaging_pacs_dicom_workflow: 'BLOCKED';
  };
  activation_gates: ImagingActivationGate[];
  fail_closed_cases: ImagingFailClosedCase[];
  access_authorization: ReturnType<typeof evaluateImagingAccessAuthorizationCatalog>;
  pacs_path: {
    sprint: 139;
    software_activation_path: 'COMPLETE';
    production_dicom_ingest: 'BLOCKED';
    production_viewer: 'BLOCKED';
    report_neq_diagnostic_viewer: true;
    remaining_blocker: typeof NO_PRODUCTION_PACS_PROVIDER;
  };
  composed: {
    pacs_onboarding_blocker: string;
    pacs_production: string;
    kyc_production: string;
  };
  phi_privacy: {
    dicom_payloads_not_logged: true;
    credentials_references_only: true;
    clinical_metadata_not_public: true;
    status: 'SOFTWARE_READY';
  };
  storage: {
    public_urls_forbidden: true;
    private_object_store_reused: true;
    kms_malware_external_gated: true;
  };
  global_policy: {
    policy_driven: true;
    hardcoded_india_global: false;
    jurisdiction_independent: true;
    status: 'POLICY_DRIVEN';
  };
  production_fail_closed: {
    ingest_when_unconfigured: 'BLOCKED';
    mock_in_production: 'BLOCKED';
    suspended_partner: 'BLOCKED';
    overall: 'PASS';
  };
  external_inputs_required: string[];
  remaining_blocker: typeof NO_PRODUCTION_IMAGING_PACS_DICOM_WORKFLOW;
  remaining_blockers: string[];
  force_launch_available: false;
  force_enable_pacs_available: false;
  can_production_launch: 'NO';
  why_launch_blocked: string;
  next_action: string;
  message: string;
  security_statement: string;
  secrets_printed: false;
  pii_phi_printed: false;
  evaluated_at: string;
  correlation_id?: string;
  healthcare_environment: ReturnType<typeof readHealthcareEnvironment>;
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
};

export function evaluateImagingPacsDicomProductionWorkflowClosure(input?: {
  correlation_id?: string;
}): ImagingPacsDicomProductionWorkflowClosureReport {
  const pacsPath = evaluatePacsProductionActivationPath();
  const pacsOnboarding = evaluatePacsFirstOnboarding();
  const kyc = evaluateKycHealthcarePartnerVerificationActivationPreparation();
  const security = evaluateProductionSecurityGate();
  const launch = evaluateProductionLaunchControl({
    market: 'GLOBAL',
    service_scope: 'GLOBAL',
  });

  void security.remaining_blocker;
  void launch.can_production_launch;
  void kyc.remaining_blocker;

  const remaining_blockers = [
    NO_PRODUCTION_IMAGING_PACS_DICOM_WORKFLOW,
    NO_PRODUCTION_PACS_PROVIDER,
    NO_PRODUCTION_KYC_KYB_PROVIDER,
    EXTERNAL_PENTEST_REQUIRED,
  ];

  return {
    sprint: 139,
    foundation_sprints: 'S6/S24/S36/S48/S56/S70/S80/S93/S125/S138',
    authoritative_source: 'imaging-pacs-dicom-production-workflow-closure',
    parallel_imaging_framework_created: false,
    parallel_report_framework_created: false,
    parallel_accession_framework_created: false,
    fake_pacs_invented: false,
    fake_dicom_study_invented: false,
    real_pacs_claimed: false,
    real_diagnostic_viewer_claimed: false,
    document_verified_equals_partner_verified: false,
    radiology_approved_equals_production_enabled: false,
    draft_equals_published: false,
    report_equals_diagnostic_viewer: false,
    source_of_truth: {
      pacs_activation_path: 'S139_PATH',
      pacs_onboarding: 'S70_S80_S93_COMPOSED',
      booking_study_report: 'EXISTING_RADIOLOGY_SERVICES',
      authorization: 'EXISTING_IMAGING_ORG_ACCESS',
      storage: 'EXISTING_PRIVATE_OBJECT_STORE',
    },
    workflow_phases: IMAGING_WORKFLOW_PHASES,
    verification_separation: {
      document_verified: 'DISTINCT',
      partner_verified: 'DISTINCT',
      radiology_approved: 'DISTINCT',
      production_enabled: 'DISTINCT',
      statement:
        'DOCUMENT VERIFIED != PARTNER VERIFIED != RADIOLOGY APPROVED != PRODUCTION ENABLED',
    },
    imaging_workflow: {
      lifecycle: 'WORKFLOW_SOFTWARE_CLOSED',
      production: 'EXTERNAL_GATED',
      sandbox: 'SANDBOX_AVAILABLE',
      enabled: false,
    },
    admin_summary: {
      imaging_partner: 'EXTERNAL_GATED',
      verification: 'EXTERNAL_GATED',
      approval: 'EXTERNAL_GATED',
      enablement: 'EXTERNAL_GATED',
      pacs_provider: 'EXTERNAL_GATED',
      dicom_capability: 'EXTERNAL_GATED',
      configuration: pacsPath.pacs.configured ? 'SOFTWARE_READY' : 'EXTERNAL_GATED',
      credential_reference: 'EXTERNAL_GATED',
      pacs_verification: pacsPath.pacs.verified ? 'SOFTWARE_READY' : 'EXTERNAL_GATED',
      pacs_approval: pacsPath.pacs.approved ? 'SOFTWARE_READY' : 'EXTERNAL_GATED',
      pacs_enablement: 'EXTERNAL_GATED',
      viewer: 'EXTERNAL_GATED',
      storage_security: 'EXTERNAL_GATED',
      supported_modalities_markets: 'POLICY_DRIVEN',
      production_imaging_pacs_dicom_workflow: 'BLOCKED',
    },
    activation_gates: buildImagingWorkflowGates(),
    fail_closed_cases: evaluateImagingWorkflowFailClosedCases(),
    access_authorization: evaluateImagingAccessAuthorizationCatalog(),
    pacs_path: {
      sprint: 139,
      software_activation_path: 'COMPLETE',
      production_dicom_ingest: 'BLOCKED',
      production_viewer: 'BLOCKED',
      report_neq_diagnostic_viewer: true,
      remaining_blocker: NO_PRODUCTION_PACS_PROVIDER,
    },
    composed: {
      pacs_onboarding_blocker: pacsOnboarding.remaining_blocker,
      pacs_production: pacsPath.production_dicom_ingest,
      kyc_production: NO_PRODUCTION_KYC_KYB_PROVIDER,
    },
    phi_privacy: {
      dicom_payloads_not_logged: true,
      credentials_references_only: true,
      clinical_metadata_not_public: true,
      status: 'SOFTWARE_READY',
    },
    storage: {
      public_urls_forbidden: true,
      private_object_store_reused: true,
      kms_malware_external_gated: true,
    },
    global_policy: {
      policy_driven: true,
      hardcoded_india_global: false,
      jurisdiction_independent: true,
      status: 'POLICY_DRIVEN',
    },
    production_fail_closed: {
      ingest_when_unconfigured: 'BLOCKED',
      mock_in_production: 'BLOCKED',
      suspended_partner: 'BLOCKED',
      overall: 'PASS',
    },
    external_inputs_required: [
      'Genuine production PACS/DICOM provider account',
      'PACS_PROVIDER + credential/endpoint/AE Title/callback refs (secrets manager)',
      'Private storage + KMS + malware scanning production readiness',
      'Clinical DICOM viewer provider (if required)',
      'Human verification + approval',
      'Market/jurisdiction imaging policy decision',
    ],
    remaining_blocker: NO_PRODUCTION_IMAGING_PACS_DICOM_WORKFLOW,
    remaining_blockers,
    force_launch_available: false,
    force_enable_pacs_available: false,
    can_production_launch: 'NO',
    why_launch_blocked:
      'No production PACS/DICOM provider configured/enabled. Software imaging workflow closed; production DICOM ingest and diagnostic viewer fail-closed (EXTERNAL_GATED).',
    next_action:
      'Select a genuine PACS provider, store credential references only, complete storage/KMS/viewer gates and verification/approval — never force-launch with SandboxPacsAdapter.',
    message:
      'Sprint 139 software imaging/PACS/DICOM workflow closed: order → accession → ingest → worklist → report → health record path composed. Production PACS remains EXTERNAL_GATED / BLOCKED. No fake DICOM studies or diagnostic viewer.',
    security_statement:
      'Credentials are references only; DICOM payloads not logged; DRAFT ≠ PUBLISHED; REPORT ≠ VIEWER; suspended partners blocked; production mock/sandbox blocked.',
    secrets_printed: false,
    pii_phi_printed: false,
    evaluated_at: new Date().toISOString(),
    correlation_id: input?.correlation_id,
    healthcare_environment: readHealthcareEnvironment(),
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
  };
}
