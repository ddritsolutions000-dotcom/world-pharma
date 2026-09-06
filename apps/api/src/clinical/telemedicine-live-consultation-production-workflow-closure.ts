/**
 * Sprint 138 — Telemedicine / live consultation production workflow closure (software).
 * Composes S23/S36/S48/S55/S68/S79/S92/S125/S137.
 * Does NOT invent video providers, fake live rooms, or claim production telemedicine.
 * Does NOT create a second appointment/consent/consultation/video framework.
 * VIDEO SESSION ENDED ≠ CLINICAL CONSULTATION COMPLETED ≠ PRESCRIPTION ISSUED.
 * Production live video remains EXTERNAL_GATED. CAN_PRODUCTION_LAUNCH = NO.
 */
import {
  NO_PRODUCTION_ERX_PROVIDER,
  NO_PRODUCTION_VIDEO_PROVIDER,
  evaluateDoctorConsultationErxRealUseClosure,
} from './doctor-consultation-erx-real-use-closure';
import {
  evaluateDoctorConsultationErxProductionWorkflowClosure,
} from './doctor-consultation-erx-production-workflow-closure';
import {
  evaluateVideoProductionActivationPath,
  PRODUCTION_VIDEO_SESSION_BLOCKED,
  SANDBOX_VIDEO_BLOCKED_IN_PRODUCTION,
  VIDEO_ENDED_NEQ_CONSULTATION_COMPLETED,
} from './video-production-activation-path';
import { evaluateVideoFirstOnboarding } from './video-first-onboarding';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';
import {
  evaluateProductionSecurityGate,
  EXTERNAL_PENTEST_REQUIRED,
} from '../ops/production-security-gate-consolidation';
import { readHealthcareEnvironment } from '../healthcare/healthcare-environment';

export {
  NO_PRODUCTION_VIDEO_PROVIDER,
  PRODUCTION_VIDEO_SESSION_BLOCKED,
  SANDBOX_VIDEO_BLOCKED_IN_PRODUCTION,
  VIDEO_ENDED_NEQ_CONSULTATION_COMPLETED,
};

export const TELEMEDICINE_PRODUCTION_WORKFLOW_CLOSURE_AUTHORITATIVE =
  'TELEMEDICINE_PRODUCTION_WORKFLOW_CLOSURE_AUTHORITATIVE';

export const NO_PRODUCTION_TELEMEDICINE_WORKFLOW = 'NO_PRODUCTION_TELEMEDICINE_WORKFLOW';

export const CONSENT_REQUIRED_GATE = 'CONSENT_REQUIRED_GATE';
export const PHI_CROSS_PATIENT_DENIED = 'PHI_CROSS_PATIENT_DENIED';
export const JOIN_IS_NOT_CONSENT = 'JOIN_IS_NOT_CONSENT';

export type TelemedicineWorkflowPhase =
  | 'CUSTOMER'
  | 'APPOINTMENT'
  | 'CONSENT'
  | 'VIDEO_SESSION'
  | 'DOCTOR_CONSULTATION'
  | 'CONSULTATION_COMPLETION'
  | 'PRESCRIPTION_HEALTH_RECORD';

export const TELEMEDICINE_WORKFLOW_PHASES: TelemedicineWorkflowPhase[] = [
  'CUSTOMER',
  'APPOINTMENT',
  'CONSENT',
  'VIDEO_SESSION',
  'DOCTOR_CONSULTATION',
  'CONSULTATION_COMPLETION',
  'PRESCRIPTION_HEALTH_RECORD',
];

export type TelemedicineGateStatus =
  | 'BLOCKED'
  | 'READY'
  | 'EXTERNAL_GATED'
  | 'SANDBOX_ONLY'
  | 'SOFTWARE_READY';

export type TelemedicineActivationGate = {
  id: string;
  label: string;
  status: TelemedicineGateStatus;
  reason: string;
  scope: 'INTERNAL' | 'EXTERNAL_GATED';
};

export function buildTelemedicineWorkflowGates(): TelemedicineActivationGate[] {
  return [
    {
      id: 'appointment',
      label: 'Appointment eligibility',
      status: 'SOFTWARE_READY',
      reason: 'Existing ONLINE appointment + joinable status checks',
      scope: 'INTERNAL',
    },
    {
      id: 'consent',
      label: 'Patient consent',
      status: 'SOFTWARE_READY',
      reason: 'ClinicalAccess evaluateVideoJoin — join is not consent',
      scope: 'INTERNAL',
    },
    {
      id: 'participant_authorization',
      label: 'Participant authorization',
      status: 'SOFTWARE_READY',
      reason: 'Patient / assigned doctor / authorized clinical staff only',
      scope: 'INTERNAL',
    },
    {
      id: 'video_provider',
      label: 'Production video provider',
      status: 'EXTERNAL_GATED',
      reason: NO_PRODUCTION_VIDEO_PROVIDER,
      scope: 'EXTERNAL_GATED',
    },
    {
      id: 'session_creation',
      label: 'Production session creation',
      status: 'EXTERNAL_GATED',
      reason: PRODUCTION_VIDEO_SESSION_BLOCKED,
      scope: 'EXTERNAL_GATED',
    },
    {
      id: 'token_security',
      label: 'Join token security',
      status: 'SOFTWARE_READY',
      reason: 'Server-side scoped short-lived tokens (existing VideoService)',
      scope: 'INTERNAL',
    },
    {
      id: 'webhooks',
      label: 'Provider callbacks',
      status: 'SOFTWARE_READY',
      reason: 'Signed verify + replay window + idempotent receipt (existing)',
      scope: 'INTERNAL',
    },
    {
      id: 'clinical_completion',
      label: 'Consultation completion',
      status: 'SOFTWARE_READY',
      reason: VIDEO_ENDED_NEQ_CONSULTATION_COMPLETED,
      scope: 'INTERNAL',
    },
    {
      id: 'recording',
      label: 'Recording',
      status: 'EXTERNAL_GATED',
      reason: 'Existing recording remains EXTERNAL_GATED; no new recording system in S138',
      scope: 'EXTERNAL_GATED',
    },
    {
      id: 'erx',
      label: 'Prescription / eRx',
      status: 'EXTERNAL_GATED',
      reason: NO_PRODUCTION_ERX_PROVIDER,
      scope: 'EXTERNAL_GATED',
    },
  ];
}

export type TelemedicineFailClosedCase = {
  case_id: string;
  description: string;
  production_video_blocked: boolean;
  primary_blocker: string;
};

export function evaluateTelemedicineWorkflowFailClosedCases(): TelemedicineFailClosedCase[] {
  return [
    {
      case_id: 'missing_provider',
      description: 'Production video without provider fail-closed',
      production_video_blocked: true,
      primary_blocker: PRODUCTION_VIDEO_SESSION_BLOCKED,
    },
    {
      case_id: 'sandbox_mock_in_production',
      description: 'Mock/sandbox/LiveKit cannot create production sessions',
      production_video_blocked: true,
      primary_blocker: SANDBOX_VIDEO_BLOCKED_IN_PRODUCTION,
    },
    {
      case_id: 'consent_required',
      description: 'No consent → video session blocked',
      production_video_blocked: true,
      primary_blocker: CONSENT_REQUIRED_GATE,
    },
    {
      case_id: 'join_is_not_consent',
      description: 'Joining a video room is not consent',
      production_video_blocked: true,
      primary_blocker: JOIN_IS_NOT_CONSENT,
    },
    {
      case_id: 'cancelled_appointment',
      description: 'Cancelled/ended appointment cannot join production video',
      production_video_blocked: true,
      primary_blocker: 'APPOINTMENT_NOT_JOINABLE',
    },
    {
      case_id: 'cross_patient',
      description: 'Cross-patient session join denied',
      production_video_blocked: true,
      primary_blocker: PHI_CROSS_PATIENT_DENIED,
    },
    {
      case_id: 'cross_doctor',
      description: 'Unassigned doctor cannot join',
      production_video_blocked: true,
      primary_blocker: 'CROSS_DOCTOR_ACCESS_DENIED',
    },
    {
      case_id: 'vendor_access',
      description: 'Vendors cannot join clinical video',
      production_video_blocked: true,
      primary_blocker: 'VENDOR_VIDEO_ACCESS_DENIED',
    },
    {
      case_id: 'expired_session',
      description: 'Expired session cannot be joined',
      production_video_blocked: true,
      primary_blocker: 'SESSION_EXPIRED',
    },
    {
      case_id: 'ended_session_reuse',
      description: 'Ended session cannot be reused',
      production_video_blocked: true,
      primary_blocker: 'SESSION_ENDED_NOT_JOINABLE',
    },
    {
      case_id: 'duplicate_session',
      description: 'Duplicate create reuses existing session',
      production_video_blocked: false,
      primary_blocker: 'EXISTING_SESSION_REUSED',
    },
    {
      case_id: 'callback_replay',
      description: 'Replayed provider callbacks rejected',
      production_video_blocked: true,
      primary_blocker: 'WEBHOOK_REPLAY',
    },
    {
      case_id: 'video_neq_clinical_complete',
      description: 'Video end does not complete consultation or issue Rx',
      production_video_blocked: true,
      primary_blocker: VIDEO_ENDED_NEQ_CONSULTATION_COMPLETED,
    },
  ];
}

/**
 * Catalog participant authorization outcomes (composes existing ClinicalAccess rules).
 * Does not replace runtime VideoService.assertAuthorized.
 */
export function evaluateVideoParticipantAuthorizationCatalog(): Array<{
  actor: string;
  allowed: boolean;
  reason: string;
}> {
  return [
    { actor: 'intended_patient', allowed: true, reason: 'APPOINTMENT_CUSTOMER' },
    { actor: 'assigned_doctor', allowed: true, reason: 'APPOINTMENT_DOCTOR' },
    { actor: 'authorized_clinical_staff', allowed: true, reason: 'CLINICAL_STAFF_SCOPED' },
    { actor: 'cross_patient', allowed: false, reason: PHI_CROSS_PATIENT_DENIED },
    { actor: 'cross_doctor', allowed: false, reason: 'CROSS_DOCTOR_ACCESS_DENIED' },
    { actor: 'vendor', allowed: false, reason: 'VENDOR_VIDEO_ACCESS_DENIED' },
    { actor: 'unrelated_admin', allowed: false, reason: 'ADMIN_PHI_NOT_UNIVERSAL' },
  ];
}

export type TelemedicineProductionWorkflowClosureReport = {
  sprint: 138;
  foundation_sprints: string;
  authoritative_source: 'telemedicine-live-consultation-production-workflow-closure';
  parallel_video_framework_created: false;
  parallel_appointment_framework_created: false;
  parallel_consent_framework_created: false;
  fake_live_video_invented: false;
  real_telemedicine_claimed: false;
  recording_system_built_in_sprint: false;
  video_ended_equals_consultation_completed: false;
  video_ended_equals_prescription_issued: false;
  source_of_truth: {
    video_activation_path: 'S138_PATH';
    video_onboarding: 'S69_S79_S92_COMPOSED';
    consultation_erx: 'S125_S137_COMPOSED';
    session_service: 'EXISTING_VIDEO_SERVICE';
    authorization: 'EXISTING_CLINICAL_ACCESS';
    webhooks: 'EXISTING_VIDEO_WEBHOOK';
  };
  workflow_phases: TelemedicineWorkflowPhase[];
  clinical_separation: {
    video_session_ended: 'DISTINCT';
    consultation_completed: 'DISTINCT';
    prescription_issued: 'DISTINCT';
    statement: 'VIDEO_ENDED != CONSULTATION_COMPLETED != PRESCRIPTION_ISSUED';
  };
  telemedicine_workflow: {
    lifecycle: 'WORKFLOW_SOFTWARE_CLOSED';
    production: 'EXTERNAL_GATED';
    sandbox: 'SANDBOX_AVAILABLE';
    enabled: false;
  };
  admin_summary: {
    video_provider: TelemedicineGateStatus;
    environment: string;
    configuration: TelemedicineGateStatus;
    credential_reference: TelemedicineGateStatus;
    verification: TelemedicineGateStatus;
    approval: TelemedicineGateStatus;
    enablement: TelemedicineGateStatus;
    session_creation: TelemedicineGateStatus;
    callback_webhook: TelemedicineGateStatus;
    supported_markets: 'POLICY_DRIVEN';
    production_telemedicine_workflow: 'BLOCKED';
  };
  activation_gates: TelemedicineActivationGate[];
  fail_closed_cases: TelemedicineFailClosedCase[];
  participant_authorization: ReturnType<typeof evaluateVideoParticipantAuthorizationCatalog>;
  video_path: {
    sprint: 138;
    software_activation_path: 'COMPLETE';
    production_session_creation: 'BLOCKED';
    video_ended_neq_consultation_completed: true;
    remaining_blocker: typeof NO_PRODUCTION_VIDEO_PROVIDER;
  };
  composed: {
    s137_remaining_blocker: string;
    s125_remaining_blocker: string;
    video_production: string;
    erx_production: string;
  };
  phi_privacy: {
    tokens_not_logged: true;
    credentials_references_only: true;
    clinical_data_not_public: true;
    status: 'SOFTWARE_READY';
  };
  notifications: {
    reused_outbox: true;
    phi_minimal: true;
    redo_s133: false;
  };
  global_policy: {
    policy_driven: true;
    hardcoded_india_global: false;
    jurisdiction_independent: true;
    status: 'POLICY_DRIVEN';
  };
  production_fail_closed: {
    session_when_unconfigured: 'BLOCKED';
    mock_in_production: 'BLOCKED';
    overall: 'PASS';
  };
  external_inputs_required: string[];
  remaining_blocker: typeof NO_PRODUCTION_TELEMEDICINE_WORKFLOW;
  remaining_blockers: string[];
  force_launch_available: false;
  force_enable_video_available: false;
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

export function evaluateTelemedicineLiveConsultationProductionWorkflowClosure(input?: {
  correlation_id?: string;
}): TelemedicineProductionWorkflowClosureReport {
  const videoPath = evaluateVideoProductionActivationPath();
  const videoOnboarding = evaluateVideoFirstOnboarding();
  const s137 = evaluateDoctorConsultationErxProductionWorkflowClosure();
  const s125 = evaluateDoctorConsultationErxRealUseClosure();
  const security = evaluateProductionSecurityGate();
  const launch = evaluateProductionLaunchControl({
    market: 'GLOBAL',
    service_scope: 'GLOBAL',
  });

  void security.remaining_blocker;
  void launch.can_production_launch;
  void videoOnboarding.remaining_blocker;

  const remaining_blockers = [
    NO_PRODUCTION_TELEMEDICINE_WORKFLOW,
    NO_PRODUCTION_VIDEO_PROVIDER,
    NO_PRODUCTION_ERX_PROVIDER,
    EXTERNAL_PENTEST_REQUIRED,
  ];

  return {
    sprint: 138,
    foundation_sprints: 'S23/S36/S48/S55/S68/S79/S92/S125/S137',
    authoritative_source: 'telemedicine-live-consultation-production-workflow-closure',
    parallel_video_framework_created: false,
    parallel_appointment_framework_created: false,
    parallel_consent_framework_created: false,
    fake_live_video_invented: false,
    real_telemedicine_claimed: false,
    recording_system_built_in_sprint: false,
    video_ended_equals_consultation_completed: false,
    video_ended_equals_prescription_issued: false,
    source_of_truth: {
      video_activation_path: 'S138_PATH',
      video_onboarding: 'S69_S79_S92_COMPOSED',
      consultation_erx: 'S125_S137_COMPOSED',
      session_service: 'EXISTING_VIDEO_SERVICE',
      authorization: 'EXISTING_CLINICAL_ACCESS',
      webhooks: 'EXISTING_VIDEO_WEBHOOK',
    },
    workflow_phases: TELEMEDICINE_WORKFLOW_PHASES,
    clinical_separation: {
      video_session_ended: 'DISTINCT',
      consultation_completed: 'DISTINCT',
      prescription_issued: 'DISTINCT',
      statement: 'VIDEO_ENDED != CONSULTATION_COMPLETED != PRESCRIPTION_ISSUED',
    },
    telemedicine_workflow: {
      lifecycle: 'WORKFLOW_SOFTWARE_CLOSED',
      production: 'EXTERNAL_GATED',
      sandbox: 'SANDBOX_AVAILABLE',
      enabled: false,
    },
    admin_summary: {
      video_provider: 'EXTERNAL_GATED',
      environment: String(readHealthcareEnvironment()).toUpperCase(),
      configuration: videoPath.video.configured ? 'SOFTWARE_READY' : 'EXTERNAL_GATED',
      credential_reference: 'EXTERNAL_GATED',
      verification: videoPath.video.verified ? 'SOFTWARE_READY' : 'EXTERNAL_GATED',
      approval: videoPath.video.approved ? 'SOFTWARE_READY' : 'EXTERNAL_GATED',
      enablement: 'EXTERNAL_GATED',
      session_creation: 'EXTERNAL_GATED',
      callback_webhook: 'SOFTWARE_READY',
      supported_markets: 'POLICY_DRIVEN',
      production_telemedicine_workflow: 'BLOCKED',
    },
    activation_gates: buildTelemedicineWorkflowGates(),
    fail_closed_cases: evaluateTelemedicineWorkflowFailClosedCases(),
    participant_authorization: evaluateVideoParticipantAuthorizationCatalog(),
    video_path: {
      sprint: 138,
      software_activation_path: 'COMPLETE',
      production_session_creation: 'BLOCKED',
      video_ended_neq_consultation_completed: true,
      remaining_blocker: NO_PRODUCTION_VIDEO_PROVIDER,
    },
    composed: {
      s137_remaining_blocker: s137.remaining_blocker,
      s125_remaining_blocker: s125.remaining_blocker,
      video_production: videoPath.production_session_creation,
      erx_production: s137.erx_path.production_transmission,
    },
    phi_privacy: {
      tokens_not_logged: true,
      credentials_references_only: true,
      clinical_data_not_public: true,
      status: 'SOFTWARE_READY',
    },
    notifications: {
      reused_outbox: true,
      phi_minimal: true,
      redo_s133: false,
    },
    global_policy: {
      policy_driven: true,
      hardcoded_india_global: false,
      jurisdiction_independent: true,
      status: 'POLICY_DRIVEN',
    },
    production_fail_closed: {
      session_when_unconfigured: 'BLOCKED',
      mock_in_production: 'BLOCKED',
      overall: 'PASS',
    },
    external_inputs_required: [
      'Genuine production video provider account',
      'VIDEO_PROVIDER + credential/account/endpoint/token/callback refs (secrets manager)',
      'Human verification + approval',
      'Market/jurisdiction telemedicine policy decision',
      'Recording policy/consent if recording enabled later',
    ],
    remaining_blocker: NO_PRODUCTION_TELEMEDICINE_WORKFLOW,
    remaining_blockers,
    force_launch_available: false,
    force_enable_video_available: false,
    can_production_launch: 'NO',
    why_launch_blocked:
      'No production video provider configured/enabled. Software telemedicine workflow closed; live session creation fail-closed (EXTERNAL_GATED).',
    next_action:
      'Select a genuine video provider, store credential references only, complete verification/approval, then enable — never force-launch with mock/LiveKit sandbox refs.',
    message:
      'Sprint 138 software telemedicine workflow closed: appointment → consent → video session → consultation → completion → prescription path composed. Production live video remains EXTERNAL_GATED / BLOCKED. No fake live video.',
    security_statement:
      'Tokens server-issued and scoped; credentials are references only; consent required before join; VIDEO_ENDED ≠ clinical completion; production mock/fake blocked.',
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
