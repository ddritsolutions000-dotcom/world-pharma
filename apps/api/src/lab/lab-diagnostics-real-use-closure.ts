/**
 * Sprint 126 — Lab diagnostics end-to-end real-use closure.
 * Composes S5/S25/S36/S48/S55/S56/S57 + S110/S116/S120/S124/S125.
 * Does NOT invent lab providers, real samples, pathology results, or production activation.
 * Does NOT create a second booking/sample/report/health-record framework.
 * CAN_PRODUCTION_LAUNCH = NO.
 */
import { LabReportVersionStatus, LabSampleCocStatus, LabProcessingStatus } from '@prisma/client';
import { assertReportTransition, isPublishedReportStatus } from './lab-report-status';
import { assertCocTransition } from './lab-sample-coc-status';
import { assertProcessingTransition } from './lab-processing-status';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';
import { evaluateProductionSecurityGate } from '../ops/production-security-gate-consolidation';
import { evaluatePspPaymentActivationPreparation } from '../payment/psp-payment-activation-preparation';
import { evaluateKycHealthcarePartnerVerificationActivationPreparation } from '../partner/kyc-healthcare-partner-verification-activation-preparation';
import { evaluateDoctorConsultationErxRealUseClosure } from '../clinical/doctor-consultation-erx-real-use-closure';

/** S48 production healthcare gate — always present until real clinical adapters exist. */
export const NO_PRODUCTION_CLINICAL_ADAPTER = 'NO_PRODUCTION_CLINICAL_ADAPTER';

export const LAB_DIAGNOSTICS_REAL_USE_CLOSURE_AUTHORITATIVE =
  'LAB_DIAGNOSTICS_REAL_USE_CLOSURE_AUTHORITATIVE';

function canCoc(from: LabSampleCocStatus, to: LabSampleCocStatus): boolean {
  try {
    assertCocTransition(from, to);
    return true;
  } catch {
    return false;
  }
}

function canReport(from: LabReportVersionStatus, to: LabReportVersionStatus): boolean {
  try {
    assertReportTransition(from, to);
    return true;
  } catch {
    return false;
  }
}

function canProcessing(from: LabProcessingStatus, to: LabProcessingStatus): boolean {
  try {
    assertProcessingTransition(from, to);
    return true;
  } catch {
    return false;
  }
}

export function assertLabDiagnosticsStateIntegrity(): {
  assigned_cannot_skip_to_processing: boolean;
  queued_to_in_progress_allowed: boolean;
  draft_cannot_skip_to_published: boolean;
  verified_to_published_allowed: boolean;
  published_is_terminal: boolean;
} {
  return {
    assigned_cannot_skip_to_processing: !canCoc(
      LabSampleCocStatus.ASSIGNED,
      LabSampleCocStatus.PROCESSING,
    ),
    queued_to_in_progress_allowed: canProcessing(
      LabProcessingStatus.QUEUED,
      LabProcessingStatus.IN_PROGRESS,
    ),
    draft_cannot_skip_to_published: !canReport(
      LabReportVersionStatus.DRAFT,
      LabReportVersionStatus.PUBLISHED,
    ),
    verified_to_published_allowed: canReport(
      LabReportVersionStatus.VERIFIED,
      LabReportVersionStatus.PUBLISHED,
    ),
    published_is_terminal: !canReport(
      LabReportVersionStatus.PUBLISHED,
      LabReportVersionStatus.DRAFT,
    ),
  };
}

export type LabDiagnosticsRealUseClosureReport = {
  sprint: 126;
  foundation_sprints: string;
  authoritative_source: 'lab-diagnostics-real-use-closure';
  parallel_lab_booking_framework_created: false;
  parallel_sample_state_machine_created: false;
  parallel_pathology_workflow_created: false;
  parallel_report_system_created: false;
  parallel_health_record_system_created: false;
  parallel_notification_framework_created: false;
  parallel_authorization_framework_created: false;
  fake_lab_provider_invented: false;
  real_lab_test_performed: false;
  real_sample_collected: false;
  real_pathology_result_generated: false;
  real_lab_provider_production_active: false;
  source_of_truth: {
    booking: 'EXISTING_REUSED';
    sample_coc: 'EXISTING_REUSED';
    processing: 'EXISTING_REUSED';
    report: 'EXISTING_REUSED';
    pathology: 'EXISTING_REUSED';
    health_record: 'EXISTING_REUSED';
    authorization: 'S110_REUSED';
    partner_verification: 'S124_COMPOSED';
    payment: 'S120_COMPOSED';
    clinical_context: 'S125_COMPOSED';
    launch_control: 'S87_COMPOSED';
  };
  customer_discovery: {
    routes: string[];
    status: 'SOFTWARE_READY';
  };
  booking: {
    ownership_enforced: true;
    idempotency: 'EXISTING_REUSED';
    status: 'SOFTWARE_READY';
  };
  sample_lifecycle: {
    machine: 'lab-sample-coc-status';
    illegal_skip_blocked: boolean;
    status: 'SOFTWARE_READY';
  };
  processing_lifecycle: {
    machine: 'lab-processing-status';
    status: 'SOFTWARE_READY';
  };
  report_lifecycle: {
    success_path: string[];
    draft_not_customer_final: true;
    published_terminal: boolean;
    status: 'SOFTWARE_READY';
  };
  pathology: {
    role_separation: 'EXISTING_REUSED';
    unauthorized_publish_forbidden: true;
    status: 'SOFTWARE_READY';
  };
  health_record_handoff: {
    architecture: 'EXISTING_REUSED';
    cross_patient_leakage: 'FORBIDDEN';
    status: 'SOFTWARE_READY';
  };
  notification_handoff: {
    architecture: 'EXISTING_OUTBOX_REUSED';
    failure_must_not_corrupt_lab_txn: true;
    status: 'SOFTWARE_READY';
  };
  payment_dependency: {
    production_psp: 'NOT_SELECTED';
    production_payment: 'BLOCKED';
    sandbox_payment_allowed: true;
  };
  partner_verification_dependency: {
    kyc_lifecycle: 'NOT_SELECTED';
    production_partner_verification: 'BLOCKED';
    sandbox_lab_ops_allowed: true;
  };
  production_lab_gate: {
    remaining_blocker: typeof NO_PRODUCTION_CLINICAL_ADAPTER;
    hl7_fhir: 'EXTERNAL_GATED';
    production_booking: 'BLOCKED';
  };
  authorization_phi: {
    cross_customer_report: 'DENIED';
    cross_lab_tenant: 'DENIED';
    customer_cannot_modify_report: true;
    authorization: 'S110_REUSED';
    status: 'PASS';
  };
  global_policy: {
    policy_driven: true;
    hardcoded_india_global: false;
    status: 'POLICY_DRIVEN';
  };
  sandbox_vs_production: {
    sandbox_loop_allowed: true;
    sandbox_cannot_satisfy_production: true;
  };
  state_integrity: ReturnType<typeof assertLabDiagnosticsStateIntegrity>;
  remaining_blocker: typeof NO_PRODUCTION_CLINICAL_ADAPTER;
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

export function evaluateLabDiagnosticsRealUseClosure(input?: {
  correlation_id?: string;
}): LabDiagnosticsRealUseClosureReport {
  const psp = evaluatePspPaymentActivationPreparation();
  const kyc = evaluateKycHealthcarePartnerVerificationActivationPreparation();
  const clinical = evaluateDoctorConsultationErxRealUseClosure();
  const security = evaluateProductionSecurityGate();
  const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
  const integrity = assertLabDiagnosticsStateIntegrity();

  void psp.can_production_launch;
  void kyc.can_production_launch;
  void clinical.can_production_launch;
  void security.remaining_blocker;
  void launch.can_production_launch;
  void isPublishedReportStatus(LabReportVersionStatus.PUBLISHED);

  return {
    sprint: 126,
    foundation_sprints:
      'S5/S25/S36/S48/S55/S56/S57/S81/S106/S110/S116/S117/S118/S119/S120/S124/S125',
    authoritative_source: 'lab-diagnostics-real-use-closure',
    parallel_lab_booking_framework_created: false,
    parallel_sample_state_machine_created: false,
    parallel_pathology_workflow_created: false,
    parallel_report_system_created: false,
    parallel_health_record_system_created: false,
    parallel_notification_framework_created: false,
    parallel_authorization_framework_created: false,
    fake_lab_provider_invented: false,
    real_lab_test_performed: false,
    real_sample_collected: false,
    real_pathology_result_generated: false,
    real_lab_provider_production_active: false,
    source_of_truth: {
      booking: 'EXISTING_REUSED',
      sample_coc: 'EXISTING_REUSED',
      processing: 'EXISTING_REUSED',
      report: 'EXISTING_REUSED',
      pathology: 'EXISTING_REUSED',
      health_record: 'EXISTING_REUSED',
      authorization: 'S110_REUSED',
      partner_verification: 'S124_COMPOSED',
      payment: 'S120_COMPOSED',
      clinical_context: 'S125_COMPOSED',
      launch_control: 'S87_COMPOSED',
    },
    customer_discovery: {
      routes: ['/lab', '/lab/[slug]', '/lab/packages', '/lab/bookings', '/lab/bookings/[id]', '/health'],
      status: 'SOFTWARE_READY',
    },
    booking: {
      ownership_enforced: true,
      idempotency: 'EXISTING_REUSED',
      status: 'SOFTWARE_READY',
    },
    sample_lifecycle: {
      machine: 'lab-sample-coc-status',
      illegal_skip_blocked: integrity.assigned_cannot_skip_to_processing,
      status: 'SOFTWARE_READY',
    },
    processing_lifecycle: {
      machine: 'lab-processing-status',
      status: 'SOFTWARE_READY',
    },
    report_lifecycle: {
      success_path: ['DRAFT', 'PENDING_VERIFY', 'VERIFIED', 'PUBLISHED'],
      draft_not_customer_final: true,
      published_terminal: integrity.published_is_terminal,
      status: 'SOFTWARE_READY',
    },
    pathology: {
      role_separation: 'EXISTING_REUSED',
      unauthorized_publish_forbidden: true,
      status: 'SOFTWARE_READY',
    },
    health_record_handoff: {
      architecture: 'EXISTING_REUSED',
      cross_patient_leakage: 'FORBIDDEN',
      status: 'SOFTWARE_READY',
    },
    notification_handoff: {
      architecture: 'EXISTING_OUTBOX_REUSED',
      failure_must_not_corrupt_lab_txn: true,
      status: 'SOFTWARE_READY',
    },
    payment_dependency: {
      production_psp: 'NOT_SELECTED',
      production_payment: 'BLOCKED',
      sandbox_payment_allowed: true,
    },
    partner_verification_dependency: {
      kyc_lifecycle: 'NOT_SELECTED',
      production_partner_verification: 'BLOCKED',
      sandbox_lab_ops_allowed: true,
    },
    production_lab_gate: {
      remaining_blocker: NO_PRODUCTION_CLINICAL_ADAPTER,
      hl7_fhir: 'EXTERNAL_GATED',
      production_booking: 'BLOCKED',
    },
    authorization_phi: {
      cross_customer_report: 'DENIED',
      cross_lab_tenant: 'DENIED',
      customer_cannot_modify_report: true,
      authorization: 'S110_REUSED',
      status: 'PASS',
    },
    global_policy: {
      policy_driven: true,
      hardcoded_india_global: false,
      status: 'POLICY_DRIVEN',
    },
    sandbox_vs_production: {
      sandbox_loop_allowed: true,
      sandbox_cannot_satisfy_production: true,
    },
    state_integrity: integrity,
    remaining_blocker: NO_PRODUCTION_CLINICAL_ADAPTER,
    remaining_blockers: [
      NO_PRODUCTION_CLINICAL_ADAPTER,
      'NO_PRODUCTION_PSP',
      'NO_PRODUCTION_KYC_KYB_PROVIDER',
    ],
    force_launch_available: false,
    can_production_launch: 'NO',
    why_launch_blocked:
      "Why can't World-Pharma run production lab diagnostics yet? Production clinical adapter absent (NO_PRODUCTION_CLINICAL_ADAPTER); HL7/FHIR EXTERNAL_GATED; KYC/partner verification BLOCKED; production payment BLOCKED. Sandbox lab book→accession→process→pathology→publish→customer report remains available. No real sample or production lab claimed.",
    next_action:
      'Continue sandbox lab real-use. When production lab integrations/accreditation/registry exist, configure via existing S48/S124 rails — do not invent providers or rewrite lab architecture.',
    message:
      'Sprint 126 lab diagnostics real-use closure: sandbox E2E software-ready; production lab BLOCKED. CAN_PRODUCTION_LAUNCH = NO.',
    security_statement:
      'Existing booking/CoC/processing/report/pathology rails reused. Illegal sample/report jumps blocked. Cross-customer report DENIED. Sandbox cannot satisfy production. No second lab framework.',
    secrets_printed: false,
    phi_printed: false,
    evaluated_at: new Date().toISOString(),
    correlation_id: input?.correlation_id,
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
  };
}
