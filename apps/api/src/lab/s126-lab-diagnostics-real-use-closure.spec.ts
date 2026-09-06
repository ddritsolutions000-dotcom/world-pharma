/**
 * Sprint 126 — Lab diagnostics real-use closure (unit).
 */
import {
  NO_PRODUCTION_CLINICAL_ADAPTER,
  assertLabDiagnosticsStateIntegrity,
  evaluateLabDiagnosticsRealUseClosure,
} from './lab-diagnostics-real-use-closure';
import { assertCocTransition } from './lab-sample-coc-status';
import { assertReportTransition } from './lab-report-status';
import { LabReportVersionStatus, LabSampleCocStatus } from '@prisma/client';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';
import { assertNoSecretLeak } from '../ops/secret-redaction';

describe('S126 lab diagnostics real-use closure', () => {
  it('sandbox software-ready; production clinical adapter blocked; no invented lab', () => {
    const report = evaluateLabDiagnosticsRealUseClosure();
    expect(report.sprint).toBe(126);
    expect(report.authoritative_source).toBe('lab-diagnostics-real-use-closure');
    expect(report.parallel_lab_booking_framework_created).toBe(false);
    expect(report.parallel_sample_state_machine_created).toBe(false);
    expect(report.parallel_report_system_created).toBe(false);
    expect(report.fake_lab_provider_invented).toBe(false);
    expect(report.real_lab_test_performed).toBe(false);
    expect(report.real_sample_collected).toBe(false);
    expect(report.real_pathology_result_generated).toBe(false);
    expect(report.production_lab_gate.remaining_blocker).toBe(NO_PRODUCTION_CLINICAL_ADAPTER);
    expect(report.production_lab_gate.hl7_fhir).toBe('EXTERNAL_GATED');
    expect(report.payment_dependency.production_payment).toBe('BLOCKED');
    expect(report.partner_verification_dependency.production_partner_verification).toBe(
      'BLOCKED',
    );
    expect(report.report_lifecycle.draft_not_customer_final).toBe(true);
    expect(report.authorization_phi.status).toBe('PASS');
    expect(report.global_policy.hardcoded_india_global).toBe(false);
    expect(report.sandbox_vs_production.sandbox_cannot_satisfy_production).toBe(true);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_CLINICAL_ADAPTER);
    expect(report.secrets_printed).toBe(false);
    expect(report.phi_printed).toBe(false);
  });

  it('sample/report illegal transitions blocked', () => {
    const integrity = assertLabDiagnosticsStateIntegrity();
    expect(integrity.assigned_cannot_skip_to_processing).toBe(true);
    expect(integrity.draft_cannot_skip_to_published).toBe(true);
    expect(integrity.verified_to_published_allowed).toBe(true);
    expect(integrity.published_is_terminal).toBe(true);
    expect(() =>
      assertCocTransition(LabSampleCocStatus.ASSIGNED, LabSampleCocStatus.PROCESSING),
    ).toThrow();
    expect(() =>
      assertReportTransition(LabReportVersionStatus.DRAFT, LabReportVersionStatus.PUBLISHED),
    ).toThrow();
  });
});

describe('S126 compose + regression guards', () => {
  it('does not bypass S87 launch gate', () => {
    expect(
      evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' })
        .can_production_launch,
    ).toBe('NO');
    expect(assertNoSecretLeak(JSON.stringify(evaluateLabDiagnosticsRealUseClosure()))).toBe(
      true,
    );
  });

  it('no India hardcoding / no PHI or secret leaks', () => {
    const blob = JSON.stringify(evaluateLabDiagnosticsRealUseClosure());
    expect(blob).not.toMatch(/\bUPI\b|\bINR\b|₹|\+91|\bIST\b/);
    expect(blob).not.toMatch(/sk_live_|aadhaar|passport|ssn[=:]|patient_name[=:]/i);
  });
});
