/**
 * Sprint 136 — Lab / diagnostic partner production workflow closure (unit).
 */
import { KycCaseStatus, PartnerStatus } from '@prisma/client';
import {
  NO_PRODUCTION_LAB_DIAGNOSTIC_WORKFLOW,
  NO_PRODUCTION_CLINICAL_ADAPTER,
  NO_PRODUCTION_LAB_PARTNER_ACTIVATION,
  evaluateLabPartnerProductionWorkflowClosure,
  evaluateLabPartnerBookingEligibility,
  evaluateLabDiagnosticWorkflowFailClosedCases,
  evaluateLabReportSafetyInvariants,
  buildLabDiagnosticWorkflowGates,
  LAB_DIAGNOSTIC_WORKFLOW_PHASES,
  DOCUMENT_NEQ_PARTNER_VERIFIED,
  REPORT_DRAFT_NEQ_PUBLISHED,
} from './lab-partner-production-workflow-closure';
import { evaluateLabDiagnosticsRealUseClosure } from './lab-diagnostics-real-use-closure';
import { evaluateLabPartnerOnboardingActivationPreparation } from './lab-partner-onboarding-activation-preparation';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';
import { assertNoSecretLeak } from '../ops/secret-redaction';

describe('S136 lab partner production workflow closure', () => {
  it('software workflow closed; production BLOCKED', () => {
    const report = evaluateLabPartnerProductionWorkflowClosure();
    expect(report.sprint).toBe(136);
    expect(report.authoritative_source).toBe('lab-partner-production-workflow-closure');
    expect(report.parallel_lab_framework_created).toBe(false);
    expect(report.parallel_booking_system_created).toBe(false);
    expect(report.fake_lab_invented).toBe(false);
    expect(report.fake_accreditation_claimed).toBe(false);
    expect(report.real_lab_production_enabled).toBe(false);
    expect(report.document_verified_equals_partner_verified).toBe(false);
    expect(report.approved_equals_production_enabled).toBe(false);
    expect(report.lab_workflow.lifecycle).toBe('WORKFLOW_SOFTWARE_CLOSED');
    expect(report.lab_workflow.sandbox).toBe('SANDBOX_VERIFIED');
    expect(report.lab_workflow.production).toBe('EXTERNAL_GATED');
    expect(report.admin_summary.production_lab_diagnostic_workflow).toBe('BLOCKED');
    expect(report.admin_summary.bookings).toBe('SOFTWARE_READY');
    expect(report.admin_summary.reports).toBe('SOFTWARE_READY');
    expect(report.customer_booking.ui_redesign).toBe(false);
    expect(report.health_record.second_system).toBe(false);
    expect(report.global_policy.hardcoded_india_global).toBe(false);
    expect(report.workflow_phases).toEqual(
      expect.arrayContaining([
        'LAB_APPLICATION',
        'CUSTOMER_BOOKING',
        'ACCESSION',
        'PUBLICATION',
        'HEALTH_RECORD',
        'SETTLEMENT_OPERATIONS',
      ]),
    );
    expect(report.workflow_phases).toEqual(LAB_DIAGNOSTIC_WORKFLOW_PHASES);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_LAB_DIAGNOSTIC_WORKFLOW);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        NO_PRODUCTION_LAB_PARTNER_ACTIVATION,
        NO_PRODUCTION_CLINICAL_ADAPTER,
      ]),
    );
    expect(buildLabDiagnosticWorkflowGates().length).toBeGreaterThanOrEqual(12);
    expect(assertNoSecretLeak(JSON.stringify(report))).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(/\bUPI\b|\bINR\b|₹|\+91|\bGST\b/);
  });

  it('fail-closed + report safety + booking eligibility', () => {
    const cases = evaluateLabDiagnosticWorkflowFailClosedCases();
    expect(cases.every((c) => c.production_booking_blocked)).toBe(true);
    expect(cases[0]!.primary_blocker).toBe(DOCUMENT_NEQ_PARTNER_VERIFIED);
    const safety = evaluateLabReportSafetyInvariants();
    expect(safety.map((s) => s.case_id)).toEqual(
      expect.arrayContaining(['draft_cannot_publish', 'published_terminal']),
    );
    expect(safety.find((s) => s.case_id === 'draft_cannot_publish')?.detail).toBe(
      REPORT_DRAFT_NEQ_PUBLISHED,
    );

    expect(
      evaluateLabPartnerBookingEligibility({
        partnerStatus: PartnerStatus.ACTIVE,
        environment: 'sandbox',
      }).allowed,
    ).toBe(true);
    expect(
      evaluateLabPartnerBookingEligibility({
        partnerStatus: PartnerStatus.SUSPENDED,
        environment: 'sandbox',
      }).blocker,
    ).toBe('PARTNER_SUSPENDED');
    expect(
      evaluateLabPartnerBookingEligibility({
        partnerStatus: PartnerStatus.VERIFIED,
        environment: 'sandbox',
      }).allowed,
    ).toBe(true);
    expect(
      evaluateLabPartnerBookingEligibility({
        partnerStatus: PartnerStatus.VERIFIED,
        environment: 'production',
      }).blocker,
    ).toBe('PARTNER_NOT_ACTIVE');
    expect(
      evaluateLabPartnerBookingEligibility({
        partnerStatus: PartnerStatus.ACTIVE,
        kycStatus: KycCaseStatus.EXPIRED,
        environment: 'sandbox',
      }).blocker,
    ).toBe('KYC_EXPIRED');
    expect(
      evaluateLabPartnerBookingEligibility({
        partnerStatus: null,
        environment: 'production',
      }).blocker,
    ).toBe('PARTNER_NOT_FOUND');
  });
});

describe('S136 compose + regression', () => {
  it('composes S126/S127 and does not bypass launch', () => {
    expect(evaluateLabDiagnosticsRealUseClosure().can_production_launch).toBe('NO');
    expect(evaluateLabPartnerOnboardingActivationPreparation().remaining_blocker).toBe(
      NO_PRODUCTION_LAB_PARTNER_ACTIVATION,
    );
    expect(
      evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'LABS' })
        .can_production_launch,
    ).toBe('NO');
  });
});
