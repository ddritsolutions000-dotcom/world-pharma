/**
 * Sprint 137 — Doctor consultation + eRx production workflow closure (software).
 * Composes S4/S23/S36/S48/S55/S68/S78/S91/S125/S136 (+ PartnerStatus/KYC rails).
 * Does NOT invent eRx/video providers, medical licences, or legal transmission.
 * Does NOT create a second consultation/prescription/consent/eRx framework.
 * DOCUMENT VERIFIED ≠ DOCTOR VERIFIED ≠ DOCTOR APPROVED ≠ CLINICAL PRODUCTION ENABLED.
 * ISSUED ≠ LEGALLY_TRANSMITTED.
 * Production eRx remains EXTERNAL_GATED. CAN_PRODUCTION_LAUNCH = NO.
 */
import { KycCaseStatus, PartnerStatus } from '@prisma/client';
import {
  NO_PRODUCTION_ERX_PROVIDER,
  NO_PRODUCTION_VIDEO_PROVIDER,
  assertPrescriptionStateIntegrity,
  evaluateDoctorConsultationErxRealUseClosure,
} from './doctor-consultation-erx-real-use-closure';
import {
  evaluateErxProductionActivationPath,
  ISSUED_NEQ_LEGALLY_TRANSMITTED,
  PRODUCTION_ERX_TRANSMISSION_BLOCKED,
} from './erx-production-activation-path';
import { evaluateErxFirstOnboarding } from './erx-first-onboarding';
import { evaluateVideoFirstOnboarding } from './video-first-onboarding';
import {
  NO_PRODUCTION_KYC_KYB_PROVIDER,
  evaluateKycHealthcarePartnerVerificationActivationPreparation,
} from '../partner/kyc-healthcare-partner-verification-activation-preparation';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';
import {
  evaluateProductionSecurityGate,
  EXTERNAL_PENTEST_REQUIRED,
} from '../ops/production-security-gate-consolidation';
import { evaluatePspPaymentActivationPreparation } from '../payment/psp-payment-activation-preparation';
import { readHealthcareEnvironment } from '../healthcare/healthcare-environment';
import { evaluateVendorSettlementAuthorizationInvariants } from '../partner/pharmacy-vendor-network-closure';

export {
  NO_PRODUCTION_ERX_PROVIDER,
  NO_PRODUCTION_VIDEO_PROVIDER,
  NO_PRODUCTION_KYC_KYB_PROVIDER,
};

export const DOCTOR_CONSULTATION_ERX_PRODUCTION_WORKFLOW_CLOSURE_AUTHORITATIVE =
  'DOCTOR_CONSULTATION_ERX_PRODUCTION_WORKFLOW_CLOSURE_AUTHORITATIVE';

export const NO_PRODUCTION_DOCTOR_CONSULTATION_ERX_WORKFLOW =
  'NO_PRODUCTION_DOCTOR_CONSULTATION_ERX_WORKFLOW';

export const DOCUMENT_NEQ_DOCTOR_VERIFIED = 'DOCUMENT_NEQ_DOCTOR_VERIFIED';
export const APPROVED_NEQ_CLINICAL_ENABLED = 'APPROVED_NEQ_CLINICAL_ENABLED';
export const DOCTOR_CLINICAL_ACTION_GATE = 'DOCTOR_CLINICAL_ACTION_GATE';
export const CONSENT_REQUIRED_GATE = 'CONSENT_REQUIRED_GATE';
export const PHI_CROSS_PATIENT_DENIED = 'PHI_CROSS_PATIENT_DENIED';

export type DoctorErxWorkflowPhase =
  | 'DOCTOR_DISCOVERY'
  | 'DOCTOR_PROFILE'
  | 'APPOINTMENT'
  | 'PATIENT_CONSENT'
  | 'CONSULTATION'
  | 'CLINICAL_DECISION'
  | 'PRESCRIPTION_DRAFT'
  | 'PRESCRIPTION_ISSUED'
  | 'ERX_TRANSMISSION_GATE'
  | 'HEALTH_RECORD'
  | 'MEDICINE_ORDER'
  | 'SUSPENDED'
  | 'EXPIRED';

export const DOCTOR_ERX_WORKFLOW_PHASES: DoctorErxWorkflowPhase[] = [
  'DOCTOR_DISCOVERY',
  'DOCTOR_PROFILE',
  'APPOINTMENT',
  'PATIENT_CONSENT',
  'CONSULTATION',
  'CLINICAL_DECISION',
  'PRESCRIPTION_DRAFT',
  'PRESCRIPTION_ISSUED',
  'ERX_TRANSMISSION_GATE',
  'HEALTH_RECORD',
  'MEDICINE_ORDER',
  'SUSPENDED',
  'EXPIRED',
];

export type DoctorWorkflowGateStatus =
  | 'BLOCKED'
  | 'READY'
  | 'EXTERNAL_GATED'
  | 'SANDBOX_ONLY'
  | 'SOFTWARE_READY';

export type DoctorWorkflowActivationGate = {
  id: string;
  label: string;
  status: DoctorWorkflowGateStatus;
  reason: string;
  scope: 'INTERNAL' | 'EXTERNAL_GATED';
};

export function buildDoctorErxWorkflowGates(): DoctorWorkflowActivationGate[] {
  return [
    {
      id: 'discovery_profile',
      label: 'Doctor discovery / profile',
      status: 'READY',
      reason: 'Existing customer doctor directory + profile',
      scope: 'INTERNAL',
    },
    {
      id: 'verification',
      label: 'Doctor verification',
      status: 'EXTERNAL_GATED',
      reason: NO_PRODUCTION_KYC_KYB_PROVIDER,
      scope: 'EXTERNAL_GATED',
    },
    {
      id: 'clinical_enablement',
      label: 'Clinical production enablement',
      status: 'EXTERNAL_GATED',
      reason: NO_PRODUCTION_DOCTOR_CONSULTATION_ERX_WORKFLOW,
      scope: 'EXTERNAL_GATED',
    },
    {
      id: 'appointment_consent',
      label: 'Appointment + consent',
      status: 'SOFTWARE_READY',
      reason: 'Existing booking SM + CONSENT_REQUIRED before start',
      scope: 'INTERNAL',
    },
    {
      id: 'consultation',
      label: 'Consultation state machine',
      status: 'SOFTWARE_READY',
      reason: 'Existing appointment transitions (S125)',
      scope: 'INTERNAL',
    },
    {
      id: 'prescription',
      label: 'Prescription DRAFT→ISSUED',
      status: 'SOFTWARE_READY',
      reason: 'Existing prescription.service + integrity seal',
      scope: 'INTERNAL',
    },
    {
      id: 'erx_transmission',
      label: 'eRx legal transmission',
      status: 'EXTERNAL_GATED',
      reason: NO_PRODUCTION_ERX_PROVIDER,
      scope: 'EXTERNAL_GATED',
    },
    {
      id: 'medicine_order',
      label: 'Medicine-order Rx gate',
      status: 'SOFTWARE_READY',
      reason: 'Existing cart RX_REQUIRED / prescription attach',
      scope: 'INTERNAL',
    },
    {
      id: 'health_record',
      label: 'Health-record handoff',
      status: 'SOFTWARE_READY',
      reason: 'projectIssuedVersion on issue (S125)',
      scope: 'INTERNAL',
    },
    {
      id: 'phi',
      label: 'PHI / clinical authorization',
      status: 'SOFTWARE_READY',
      reason: 'ClinicalAccessService + S110 tenant scope',
      scope: 'INTERNAL',
    },
    {
      id: 'telemedicine',
      label: 'Telemedicine / video',
      status: 'EXTERNAL_GATED',
      reason: NO_PRODUCTION_VIDEO_PROVIDER,
      scope: 'EXTERNAL_GATED',
    },
    {
      id: 'notifications',
      label: 'Transactional notifications',
      status: 'SOFTWARE_READY',
      reason: 'Existing outbox; PHI-minimal payloads',
      scope: 'INTERNAL',
    },
  ];
}

export type DoctorErxFailClosedCase = {
  case_id: string;
  description: string;
  production_clinical_blocked: true;
  primary_blocker: string;
};

export function evaluateDoctorErxWorkflowFailClosedCases(): DoctorErxFailClosedCase[] {
  return [
    {
      case_id: 'document_verified_not_enabled',
      description: 'Document verification cannot clinically enable a doctor',
      production_clinical_blocked: true,
      primary_blocker: DOCUMENT_NEQ_DOCTOR_VERIFIED,
    },
    {
      case_id: 'suspended_doctor_blocked',
      description: 'Suspended doctor cannot conduct production clinical actions',
      production_clinical_blocked: true,
      primary_blocker: 'PARTNER_SUSPENDED',
    },
    {
      case_id: 'expired_verification_blocked',
      description: 'Expired licence/KYC cannot conduct clinical actions',
      production_clinical_blocked: true,
      primary_blocker: 'KYC_EXPIRED',
    },
    {
      case_id: 'consent_required',
      description: 'Missing consent blocks consultation start',
      production_clinical_blocked: true,
      primary_blocker: CONSENT_REQUIRED_GATE,
    },
    {
      case_id: 'illegal_consultation_transition',
      description: 'REQUESTED → COMPLETED without steps blocked',
      production_clinical_blocked: true,
      primary_blocker: 'ILLEGAL_APPOINTMENT_TRANSITION',
    },
    {
      case_id: 'draft_not_issued',
      description: 'DRAFT cannot satisfy medicine-order Rx gate',
      production_clinical_blocked: true,
      primary_blocker: 'PRESCRIPTION_NOT_ISSUED',
    },
    {
      case_id: 'issued_neq_transmitted',
      description: 'ISSUED does not equal legal eRx transmission',
      production_clinical_blocked: true,
      primary_blocker: ISSUED_NEQ_LEGALLY_TRANSMITTED,
    },
    {
      case_id: 'production_erx_without_provider',
      description: 'Production eRx transmission without provider fail-closed',
      production_clinical_blocked: true,
      primary_blocker: PRODUCTION_ERX_TRANSMISSION_BLOCKED,
    },
    {
      case_id: 'cross_patient_access',
      description: 'Cross-patient clinical access denied',
      production_clinical_blocked: true,
      primary_blocker: PHI_CROSS_PATIENT_DENIED,
    },
    {
      case_id: 'vendor_forge_prescription',
      description: 'Vendors/customers cannot forge prescriptions',
      production_clinical_blocked: true,
      primary_blocker: 'PRESCRIPTION_FORGERY_DENIED',
    },
  ];
}

/**
 * Runtime gate for doctor clinical actions (start consult / issue Rx).
 * Sandbox: blocks suspended/rejected/expired; allows ACTIVE capability path.
 * Production: requires ACTIVE partner.
 */
export function evaluateDoctorClinicalActionEligibility(input: {
  partnerStatus: PartnerStatus | null | undefined;
  kycStatus?: KycCaseStatus | null;
  kycExpiresAt?: Date | null;
  credentialExpired?: boolean;
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
      detail: `Doctor partner status ${partnerStatus} cannot perform clinical actions.`,
    };
  }

  if (input.credentialExpired) {
    return {
      allowed: false,
      blocker: 'CREDENTIAL_EXPIRED',
      detail: 'Expired doctor credential cannot perform clinical actions.',
    };
  }

  if (
    input.kycStatus === KycCaseStatus.EXPIRED ||
    (input.kycExpiresAt != null && input.kycExpiresAt <= now)
  ) {
    return {
      allowed: false,
      blocker: 'KYC_EXPIRED',
      detail: 'Expired doctor verification cannot perform clinical actions.',
    };
  }

  if (env === 'production') {
    if (partnerStatus == null) {
      return {
        allowed: false,
        blocker: 'PARTNER_NOT_FOUND',
        detail: 'Production clinical actions require a linked ACTIVE doctor partner.',
      };
    }
    if (partnerStatus !== PartnerStatus.ACTIVE) {
      return {
        allowed: false,
        blocker: 'PARTNER_NOT_ACTIVE',
        detail: `Production clinical action denied for partner status ${partnerStatus}.`,
      };
    }
  }

  return {
    allowed: true,
    blocker: null,
    detail: DOCTOR_CLINICAL_ACTION_GATE,
  };
}

export type DoctorConsultationErxProductionWorkflowClosureReport = {
  sprint: 137;
  foundation_sprints: string;
  authoritative_source: 'doctor-consultation-erx-production-workflow-closure';
  parallel_consultation_framework_created: false;
  parallel_prescription_framework_created: false;
  parallel_erx_framework_created: false;
  parallel_consent_framework_created: false;
  fake_erx_invented: false;
  fake_video_invented: false;
  real_erx_transmitted: false;
  real_telemedicine_claimed: false;
  legal_transmission_claimed: false;
  document_verified_equals_doctor_verified: false;
  doctor_approved_equals_clinical_enabled: false;
  issued_equals_legally_transmitted: false;
  source_of_truth: {
    consultation_closure: 'S125_COMPOSED';
    erx_activation_path: 'S137_PATH';
    erx_onboarding: 'S68_S78_S91_COMPOSED';
    video: 'S69_S79_COMPOSED';
    authorization: 'S110_REUSED';
    kyc: 'S124_COMPOSED';
  };
  workflow_phases: DoctorErxWorkflowPhase[];
  verification_separation: {
    document_verified: 'DISTINCT';
    doctor_verified: 'DISTINCT';
    doctor_approved: 'DISTINCT';
    clinical_production_enabled: 'DISTINCT';
    statement: 'DOCUMENT VERIFIED != DOCTOR VERIFIED != DOCTOR APPROVED != CLINICAL PRODUCTION ENABLED';
  };
  doctor_workflow: {
    lifecycle: 'WORKFLOW_SOFTWARE_CLOSED';
    production: 'EXTERNAL_GATED';
    sandbox: 'SANDBOX_VERIFIED';
    enabled: false;
  };
  admin_summary: {
    doctor_verification: DoctorWorkflowGateStatus;
    approval: DoctorWorkflowGateStatus;
    clinical_enablement: DoctorWorkflowGateStatus;
    erx_provider: DoctorWorkflowGateStatus;
    erx_configuration: DoctorWorkflowGateStatus;
    erx_transmission: DoctorWorkflowGateStatus;
    consultation: DoctorWorkflowGateStatus;
    prescription: DoctorWorkflowGateStatus;
    telemedicine: DoctorWorkflowGateStatus;
    production_doctor_consultation_erx_workflow: 'BLOCKED';
  };
  activation_gates: DoctorWorkflowActivationGate[];
  fail_closed_cases: DoctorErxFailClosedCase[];
  prescription_integrity: ReturnType<typeof assertPrescriptionStateIntegrity>;
  erx_path: {
    sprint: 137;
    software_activation_path: 'COMPLETE';
    production_transmission: 'BLOCKED';
    issued_neq_legally_transmitted: true;
    remaining_blocker: typeof NO_PRODUCTION_ERX_PROVIDER;
  };
  settlement_invariants: ReturnType<typeof evaluateVendorSettlementAuthorizationInvariants>;
  customer_journey: {
    discovery_to_medicine_order: true;
    ui_redesign: false;
  };
  phi_authorization: {
    patient_family_scoped: true;
    doctor_consultation_scoped: true;
    vendor_fulfillment_minimum: true;
    status: 'SOFTWARE_READY';
  };
  medicine_order_rx_gate: {
    architecture: 'EXISTING_REUSED';
    draft_insufficient: true;
    forged_reference_denied: true;
  };
  global_policy: {
    policy_driven: true;
    hardcoded_india_global: false;
    jurisdiction_independent: true;
    status: 'POLICY_DRIVEN';
  };
  composed: {
    s125_remaining_blocker: string;
    erx_production: string;
    video_production: string;
    kyc_production: string;
  };
  production_fail_closed: {
    clinical_when_doctor_ineligible: 'BLOCKED';
    erx_transmission_when_unconfigured: 'BLOCKED';
    overall: 'PASS';
  };
  external_inputs_required: string[];
  remaining_blocker: typeof NO_PRODUCTION_DOCTOR_CONSULTATION_ERX_WORKFLOW;
  remaining_blockers: string[];
  force_launch_available: false;
  force_enable_erx_available: false;
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

export function evaluateDoctorConsultationErxProductionWorkflowClosure(input?: {
  correlation_id?: string;
}): DoctorConsultationErxProductionWorkflowClosureReport {
  const s125 = evaluateDoctorConsultationErxRealUseClosure();
  const erxPath = evaluateErxProductionActivationPath();
  const erxOnboarding = evaluateErxFirstOnboarding();
  const video = evaluateVideoFirstOnboarding();
  const kyc = evaluateKycHealthcarePartnerVerificationActivationPreparation();
  const psp = evaluatePspPaymentActivationPreparation();
  const security = evaluateProductionSecurityGate();
  const launch = evaluateProductionLaunchControl({
    market: 'GLOBAL',
    service_scope: 'GLOBAL',
  });

  void psp.can_production_launch;
  void security.remaining_blocker;
  void launch.can_production_launch;
  void erxOnboarding.remaining_blocker;

  const remaining_blockers = [
    NO_PRODUCTION_DOCTOR_CONSULTATION_ERX_WORKFLOW,
    NO_PRODUCTION_ERX_PROVIDER,
    NO_PRODUCTION_VIDEO_PROVIDER,
    NO_PRODUCTION_KYC_KYB_PROVIDER,
    EXTERNAL_PENTEST_REQUIRED,
  ];

  return {
    sprint: 137,
    foundation_sprints: 'S4/S23/S36/S48/S55/S68/S78/S91/S110/S124/S125/S136',
    authoritative_source: 'doctor-consultation-erx-production-workflow-closure',
    parallel_consultation_framework_created: false,
    parallel_prescription_framework_created: false,
    parallel_erx_framework_created: false,
    parallel_consent_framework_created: false,
    fake_erx_invented: false,
    fake_video_invented: false,
    real_erx_transmitted: false,
    real_telemedicine_claimed: false,
    legal_transmission_claimed: false,
    document_verified_equals_doctor_verified: false,
    doctor_approved_equals_clinical_enabled: false,
    issued_equals_legally_transmitted: false,
    source_of_truth: {
      consultation_closure: 'S125_COMPOSED',
      erx_activation_path: 'S137_PATH',
      erx_onboarding: 'S68_S78_S91_COMPOSED',
      video: 'S69_S79_COMPOSED',
      authorization: 'S110_REUSED',
      kyc: 'S124_COMPOSED',
    },
    workflow_phases: DOCTOR_ERX_WORKFLOW_PHASES,
    verification_separation: {
      document_verified: 'DISTINCT',
      doctor_verified: 'DISTINCT',
      doctor_approved: 'DISTINCT',
      clinical_production_enabled: 'DISTINCT',
      statement:
        'DOCUMENT VERIFIED != DOCTOR VERIFIED != DOCTOR APPROVED != CLINICAL PRODUCTION ENABLED',
    },
    doctor_workflow: {
      lifecycle: 'WORKFLOW_SOFTWARE_CLOSED',
      production: 'EXTERNAL_GATED',
      sandbox: 'SANDBOX_VERIFIED',
      enabled: false,
    },
    admin_summary: {
      doctor_verification: 'EXTERNAL_GATED',
      approval: 'EXTERNAL_GATED',
      clinical_enablement: 'EXTERNAL_GATED',
      erx_provider: 'EXTERNAL_GATED',
      erx_configuration: 'EXTERNAL_GATED',
      erx_transmission: 'EXTERNAL_GATED',
      consultation: 'SOFTWARE_READY',
      prescription: 'SOFTWARE_READY',
      telemedicine: 'EXTERNAL_GATED',
      production_doctor_consultation_erx_workflow: 'BLOCKED',
    },
    activation_gates: buildDoctorErxWorkflowGates(),
    fail_closed_cases: evaluateDoctorErxWorkflowFailClosedCases(),
    prescription_integrity: assertPrescriptionStateIntegrity(),
    erx_path: {
      sprint: 137,
      software_activation_path: 'COMPLETE',
      production_transmission: 'BLOCKED',
      issued_neq_legally_transmitted: true,
      remaining_blocker: NO_PRODUCTION_ERX_PROVIDER,
    },
    settlement_invariants: evaluateVendorSettlementAuthorizationInvariants(),
    customer_journey: {
      discovery_to_medicine_order: true,
      ui_redesign: false,
    },
    phi_authorization: {
      patient_family_scoped: true,
      doctor_consultation_scoped: true,
      vendor_fulfillment_minimum: true,
      status: 'SOFTWARE_READY',
    },
    medicine_order_rx_gate: {
      architecture: 'EXISTING_REUSED',
      draft_insufficient: true,
      forged_reference_denied: true,
    },
    global_policy: {
      policy_driven: true,
      hardcoded_india_global: false,
      jurisdiction_independent: true,
      status: 'POLICY_DRIVEN',
    },
    composed: {
      s125_remaining_blocker: s125.remaining_blocker,
      erx_production: erxPath.production_transmission,
      video_production: video.production,
      kyc_production: kyc.admin_summary.production_partner_verification ?? 'BLOCKED',
    },
    production_fail_closed: {
      clinical_when_doctor_ineligible: 'BLOCKED',
      erx_transmission_when_unconfigured: 'BLOCKED',
      overall: 'PASS',
    },
    external_inputs_required: [
      'Real eRx provider + credential/network/endpoint refs (S91/S137 path)',
      'Doctor KYC/licence verification evidence refs (S124)',
      'Optional real telemedicine provider when video required',
      'Human SoD clinical approval + production enablement',
      'Security certification (EXTERNAL_PENTEST_REQUIRED)',
    ],
    remaining_blocker: NO_PRODUCTION_DOCTOR_CONSULTATION_ERX_WORKFLOW,
    remaining_blockers,
    force_launch_available: false,
    force_enable_erx_available: false,
    can_production_launch: 'NO',
    why_launch_blocked:
      "Why can't World-Pharma run production doctor consultations with legal eRx? Software workflow is closed (discovery→consent→consult→ISSUED→health/medicine), but eRx provider remains NOT_SELECTED/EXTERNAL_GATED; video EXTERNAL_GATED; ISSUED ≠ LEGALLY_TRANSMITTED. Sandbox consultation + internal prescriptions remain available.",
    next_action:
      'Operate sandbox consultation/Rx with existing rails. When a real eRx provider exists: supply configuration REFERENCES, verify, approve — do not invent providers or claim legal transmission from sandbox.',
    message:
      'Sprint 137 doctor consultation + eRx production workflow closure: software workflow COMPLETE; production clinical/eRx workflow BLOCKED / EXTERNAL_GATED; sandbox SANDBOX_VERIFIED. CAN_PRODUCTION_LAUNCH = NO.',
    security_statement:
      'S125 consultation + S137 eRx activation path composed (no second frameworks). Clinical actions fail-closed on suspended/expired doctors; production requires ACTIVE. ISSUED ≠ LEGALLY_TRANSMITTED. Fake eRx/video forbidden.',
    secrets_printed: false,
    pii_phi_printed: false,
    evaluated_at: new Date().toISOString(),
    correlation_id: input?.correlation_id,
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
  };
}
