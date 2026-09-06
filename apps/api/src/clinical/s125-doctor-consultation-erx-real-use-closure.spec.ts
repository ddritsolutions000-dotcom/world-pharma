/**
 * Sprint 125 — Doctor consultation + eRx real-use closure (unit).
 */
import {
  NO_PRODUCTION_ERX_PROVIDER,
  NO_PRODUCTION_VIDEO_PROVIDER,
  canTransitionAppointment,
  assertPrescriptionStateIntegrity,
  evaluateDoctorConsultationErxRealUseClosure,
} from './doctor-consultation-erx-real-use-closure';
import { AppointmentStatus } from '@prisma/client';
import { evaluateErxFirstOnboarding } from './erx-first-onboarding';
import { evaluateVideoFirstOnboarding } from './video-first-onboarding';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';
import { assertNoSecretLeak } from '../ops/secret-redaction';

describe('S125 doctor consultation + eRx real-use closure', () => {
  it('eRx/video NOT_SELECTED; no invented transmission; no parallel frameworks', () => {
    const report = evaluateDoctorConsultationErxRealUseClosure();
    expect(report.sprint).toBe(125);
    expect(report.authoritative_source).toBe('doctor-consultation-erx-real-use-closure');
    expect(report.parallel_consultation_framework_created).toBe(false);
    expect(report.parallel_erx_framework_created).toBe(false);
    expect(report.parallel_consent_framework_created).toBe(false);
    expect(report.fake_erx_provider_invented).toBe(false);
    expect(report.real_erx_transmitted).toBe(false);
    expect(report.real_telemedicine_session_claimed).toBe(false);
    expect(report.legal_prescription_transmission_claimed).toBe(false);
    expect(report.erx_production_gate.lifecycle).toBe('NOT_SELECTED');
    expect(report.erx_production_gate.real_transmission_blocked).toBe(true);
    expect(report.video_production_gate.lifecycle).toBe('NOT_SELECTED');
    expect(report.prescription_lifecycle.issued_neq_legally_transmitted).toBe(true);
    expect(report.consent.missing_blocks_clinical_start).toBe(true);
    expect(report.authorization_sod.status).toBe('PASS');
    expect(report.global_policy.hardcoded_india_global).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_ERX_PROVIDER);
    expect(report.remaining_blockers).toContain(NO_PRODUCTION_VIDEO_PROVIDER);
    expect(report.secrets_printed).toBe(false);
    expect(report.phi_printed).toBe(false);
  });

  it('consultation/prescription state integrity', () => {
    const integrity = assertPrescriptionStateIntegrity();
    expect(integrity.requested_cannot_skip_to_completed).toBe(true);
    expect(integrity.checked_in_to_in_consultation_allowed).toBe(true);
    expect(integrity.issued_not_equal_legally_transmitted).toBe(true);
    expect(
      canTransitionAppointment(AppointmentStatus.REQUESTED, AppointmentStatus.CONFIRMED),
    ).toBe(true);
    expect(
      canTransitionAppointment(AppointmentStatus.IN_CONSULTATION, AppointmentStatus.COMPLETED),
    ).toBe(true);
    expect(
      canTransitionAppointment(AppointmentStatus.COMPLETED, AppointmentStatus.REQUESTED),
    ).toBe(false);
  });
});

describe('S125 compose + regression guards', () => {
  it('does not bypass S68/S69/S87 gates', () => {
    expect(evaluateErxFirstOnboarding().remaining_blocker).toBe(NO_PRODUCTION_ERX_PROVIDER);
    expect(evaluateVideoFirstOnboarding().remaining_blocker).toBe(NO_PRODUCTION_VIDEO_PROVIDER);
    expect(
      evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' })
        .can_production_launch,
    ).toBe('NO');
    expect(
      assertNoSecretLeak(JSON.stringify(evaluateDoctorConsultationErxRealUseClosure())),
    ).toBe(true);
  });

  it('no India hardcoding / no PHI or secret leaks', () => {
    const blob = JSON.stringify(evaluateDoctorConsultationErxRealUseClosure());
    expect(blob).not.toMatch(/\bUPI\b|\bINR\b|₹|\+91|\bIST\b/);
    expect(blob).not.toMatch(/sk_live_|aadhaar|passport|ssn[=:]|diagnosis[=:]/i);
  });
});
