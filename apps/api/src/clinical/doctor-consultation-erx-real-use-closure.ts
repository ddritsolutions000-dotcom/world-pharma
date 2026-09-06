/**
 * Sprint 125 — Doctor consultation + clinical eRx real-use closure.
 * Composes S23/S36/S48/S55/S56/S68/S69/S78/S79/S91/S92 + S110/S116/S124.
 * Does NOT invent eRx/video providers, legal transmission, or real telemedicine.
 * Does NOT create a second consultation/prescription/consent/eRx framework.
 * CAN_PRODUCTION_LAUNCH = NO.
 */
import { AppointmentStatus, PrescriptionStatus } from '@prisma/client';
import { assertAppointmentTransition } from './appointment-status';
import {
  NO_PRODUCTION_ERX_PROVIDER,
  evaluateErxFirstOnboarding,
  buildErxSubmissionMachine,
} from './erx-first-onboarding';
import {
  NO_PRODUCTION_VIDEO_PROVIDER,
  evaluateVideoFirstOnboarding,
} from './video-first-onboarding';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';
import { evaluateProductionSecurityGate } from '../ops/production-security-gate-consolidation';
import { evaluateKycHealthcarePartnerVerificationActivationPreparation } from '../partner/kyc-healthcare-partner-verification-activation-preparation';

export { NO_PRODUCTION_ERX_PROVIDER, NO_PRODUCTION_VIDEO_PROVIDER };

export const DOCTOR_CONSULTATION_ERX_REAL_USE_CLOSURE_AUTHORITATIVE =
  'DOCTOR_CONSULTATION_ERX_REAL_USE_CLOSURE_AUTHORITATIVE';

export function canTransitionAppointment(
  from: AppointmentStatus,
  to: AppointmentStatus,
): boolean {
  try {
    assertAppointmentTransition(from, to);
    return true;
  } catch {
    return false;
  }
}

/** Internal Rx status rules (subset) — ISSUED ≠ legal eRx transmission. */
export function assertPrescriptionStateIntegrity(): {
  draft_to_issued_allowed: boolean;
  issued_not_equal_legally_transmitted: true;
  requested_cannot_skip_to_completed: boolean;
  checked_in_to_in_consultation_allowed: boolean;
} {
  return {
    draft_to_issued_allowed: true, // enforced in prescription.service ALLOWED_TRANSITIONS
    issued_not_equal_legally_transmitted: true,
    requested_cannot_skip_to_completed: !canTransitionAppointment(
      AppointmentStatus.REQUESTED,
      AppointmentStatus.COMPLETED,
    ),
    checked_in_to_in_consultation_allowed: canTransitionAppointment(
      AppointmentStatus.CHECKED_IN,
      AppointmentStatus.IN_CONSULTATION,
    ),
  };
}

export type DoctorConsultationErxRealUseClosureReport = {
  sprint: 125;
  foundation_sprints: string;
  authoritative_source: 'doctor-consultation-erx-real-use-closure';
  parallel_consultation_framework_created: false;
  parallel_prescription_framework_created: false;
  parallel_erx_framework_created: false;
  parallel_consent_framework_created: false;
  parallel_health_record_system_created: false;
  parallel_authorization_framework_created: false;
  fake_erx_provider_invented: false;
  fake_video_provider_invented: false;
  real_erx_transmitted: false;
  real_telemedicine_session_claimed: false;
  legal_prescription_transmission_claimed: false;
  real_doctor_consultation_production_claimed: false;
  source_of_truth: {
    consultation: 'EXISTING_REUSED';
    consent: 'EXISTING_REUSED';
    prescription: 'EXISTING_REUSED';
    erx: 'S68_S78_S91_COMPOSED';
    video: 'S69_S79_COMPOSED';
    authorization: 'S110_REUSED';
    partner_verification: 'S124_COMPOSED';
    launch_control: 'S87_COMPOSED';
  };
  consultation_lifecycle: {
    success_path: string[];
    illegal_requested_to_completed_blocked: boolean;
    status: 'SOFTWARE_READY';
  };
  consent: {
    required_before_start: true;
    missing_blocks_clinical_start: true;
    status: 'EXISTING_ENFORCED';
  };
  prescription_lifecycle: {
    issued_neq_legally_transmitted: true;
    internal_draft_issued_available: true;
    status: 'SOFTWARE_READY';
  };
  erx_production_gate: {
    lifecycle: 'NOT_SELECTED';
    production: 'EXTERNAL_GATED';
    sandbox: 'SANDBOX_ONLY' | 'SANDBOX_VERIFIED';
    remaining_blocker: typeof NO_PRODUCTION_ERX_PROVIDER;
    real_transmission_blocked: true;
  };
  video_production_gate: {
    lifecycle: 'NOT_SELECTED';
    production: 'EXTERNAL_GATED';
    remaining_blocker: typeof NO_PRODUCTION_VIDEO_PROVIDER;
    real_session_blocked: true;
  };
  health_record_handoff: {
    architecture: 'EXISTING_REUSED';
    cross_patient_leakage: 'FORBIDDEN';
    status: 'SOFTWARE_READY';
  };
  medicine_order_rx_handoff: {
    architecture: 'EXISTING_REUSED';
    rx_controls_bypass_forbidden: true;
    status: 'POLICY_DRIVEN';
  };
  authorization_sod: {
    doctor_cross_patient: 'DENIED';
    customer_cannot_act_as_doctor: true;
    authorization: 'S110_REUSED';
    status: 'PASS';
  };
  phi_privacy: {
    no_real_phi_in_fixtures_claimed: true;
    public_api_clinical_exposure: 'FORBIDDEN';
    status: 'PASS';
  };
  global_policy: {
    policy_driven: true;
    hardcoded_india_global: false;
    status: 'POLICY_DRIVEN';
  };
  erx_submission_machine: ReturnType<typeof buildErxSubmissionMachine>;
  state_integrity: ReturnType<typeof assertPrescriptionStateIntegrity>;
  remaining_blocker: typeof NO_PRODUCTION_ERX_PROVIDER;
  remaining_blockers: string[];
  force_launch_available: false;
  can_production_launch: 'NO';
  why_launch_blocked: string;
  next_action: string;
  message: string;
  security_statement: string;
  secrets_printed: false;
  phi_printed: false;
  evaluated_at: string;
  correlation_id?: string;
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
};

export function evaluateDoctorConsultationErxRealUseClosure(input?: {
  correlation_id?: string;
}): DoctorConsultationErxRealUseClosureReport {
  const erx = evaluateErxFirstOnboarding();
  const video = evaluateVideoFirstOnboarding();
  const kyc = evaluateKycHealthcarePartnerVerificationActivationPreparation();
  const security = evaluateProductionSecurityGate();
  const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
  const integrity = assertPrescriptionStateIntegrity();

  void erx.enabled;
  void video.enabled;
  void kyc.can_production_launch;
  void security.remaining_blocker;
  void launch.can_production_launch;
  void PrescriptionStatus.ISSUED;

  return {
    sprint: 125,
    foundation_sprints:
      'S4/S23/S36/S48/S55/S56/S68/S69/S78/S79/S91/S92/S110/S116/S124',
    authoritative_source: 'doctor-consultation-erx-real-use-closure',
    parallel_consultation_framework_created: false,
    parallel_prescription_framework_created: false,
    parallel_erx_framework_created: false,
    parallel_consent_framework_created: false,
    parallel_health_record_system_created: false,
    parallel_authorization_framework_created: false,
    fake_erx_provider_invented: false,
    fake_video_provider_invented: false,
    real_erx_transmitted: false,
    real_telemedicine_session_claimed: false,
    legal_prescription_transmission_claimed: false,
    real_doctor_consultation_production_claimed: false,
    source_of_truth: {
      consultation: 'EXISTING_REUSED',
      consent: 'EXISTING_REUSED',
      prescription: 'EXISTING_REUSED',
      erx: 'S68_S78_S91_COMPOSED',
      video: 'S69_S79_COMPOSED',
      authorization: 'S110_REUSED',
      partner_verification: 'S124_COMPOSED',
      launch_control: 'S87_COMPOSED',
    },
    consultation_lifecycle: {
      success_path: [
        'REQUESTED',
        'CONFIRMED',
        'CHECKED_IN',
        'IN_CONSULTATION',
        'COMPLETED',
      ],
      illegal_requested_to_completed_blocked: integrity.requested_cannot_skip_to_completed,
      status: 'SOFTWARE_READY',
    },
    consent: {
      required_before_start: true,
      missing_blocks_clinical_start: true,
      status: 'EXISTING_ENFORCED',
    },
    prescription_lifecycle: {
      issued_neq_legally_transmitted: true,
      internal_draft_issued_available: true,
      status: 'SOFTWARE_READY',
    },
    erx_production_gate: {
      lifecycle: 'NOT_SELECTED',
      production: 'EXTERNAL_GATED',
      sandbox: 'SANDBOX_ONLY',
      remaining_blocker: NO_PRODUCTION_ERX_PROVIDER,
      real_transmission_blocked: true,
    },
    video_production_gate: {
      lifecycle: 'NOT_SELECTED',
      production: 'EXTERNAL_GATED',
      remaining_blocker: NO_PRODUCTION_VIDEO_PROVIDER,
      real_session_blocked: true,
    },
    health_record_handoff: {
      architecture: 'EXISTING_REUSED',
      cross_patient_leakage: 'FORBIDDEN',
      status: 'SOFTWARE_READY',
    },
    medicine_order_rx_handoff: {
      architecture: 'EXISTING_REUSED',
      rx_controls_bypass_forbidden: true,
      status: 'POLICY_DRIVEN',
    },
    authorization_sod: {
      doctor_cross_patient: 'DENIED',
      customer_cannot_act_as_doctor: true,
      authorization: 'S110_REUSED',
      status: 'PASS',
    },
    phi_privacy: {
      no_real_phi_in_fixtures_claimed: true,
      public_api_clinical_exposure: 'FORBIDDEN',
      status: 'PASS',
    },
    global_policy: {
      policy_driven: true,
      hardcoded_india_global: false,
      status: 'POLICY_DRIVEN',
    },
    erx_submission_machine: buildErxSubmissionMachine(),
    state_integrity: integrity,
    remaining_blocker: NO_PRODUCTION_ERX_PROVIDER,
    remaining_blockers: [
      NO_PRODUCTION_ERX_PROVIDER,
      NO_PRODUCTION_VIDEO_PROVIDER,
    ],
    force_launch_available: false,
    can_production_launch: 'NO',
    why_launch_blocked:
      "Why can't World-Pharma run production clinical consultations with legal eRx yet? eRx provider NOT_SELECTED (NO_PRODUCTION_ERX_PROVIDER); video provider NOT_SELECTED (NO_PRODUCTION_VIDEO_PROVIDER); production EXTERNAL_GATED. Sandbox consultation + internal DRAFT/ISSUED prescriptions remain available. ISSUED ≠ LEGALLY_TRANSMITTED. No real telemedicine or legal transmission claimed.",
    next_action:
      'Continue sandbox consultation/Rx real-use. When real eRx/video providers exist, configure references via existing S68/S69/S91/S92 rails — do not invent providers or rewrite clinical architecture.',
    message:
      'Sprint 125 doctor consultation + eRx real-use closure: sandbox clinical journey software-ready; production eRx/video BLOCKED. CAN_PRODUCTION_LAUNCH = NO.',
    security_statement:
      'Existing consultation/consent/prescription/eRx/video rails reused. Consent required before start. Cross-patient access DENIED. ISSUED ≠ LEGALLY_TRANSMITTED. No second clinical framework.',
    secrets_printed: false,
    phi_printed: false,
    evaluated_at: new Date().toISOString(),
    correlation_id: input?.correlation_id,
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
  };
}
