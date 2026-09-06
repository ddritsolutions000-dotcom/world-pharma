/**
 * Sprint 137 — eRx production activation path + doctor workflow closure (unit).
 */
import { KycCaseStatus, PartnerStatus } from '@prisma/client';
import { ProblemException } from '../common/problem';
import {
  assertProductionErxTransmissionAllowed,
  buildLiveErxConfigurationSlots,
  deriveProductionErxLifecycle,
  evaluateErxProductionActivationPath,
  evaluateErxTransmissionNegativeCases,
  PRODUCTION_ERX_TRANSMISSION_BLOCKED,
  readConfiguredProductionErxProvider,
  SANDBOX_ERX_BLOCKED_IN_PRODUCTION,
} from './erx-production-activation-path';
import {
  NO_PRODUCTION_DOCTOR_CONSULTATION_ERX_WORKFLOW,
  NO_PRODUCTION_ERX_PROVIDER,
  DOCTOR_ERX_WORKFLOW_PHASES,
  evaluateDoctorClinicalActionEligibility,
  evaluateDoctorConsultationErxProductionWorkflowClosure,
  evaluateDoctorErxWorkflowFailClosedCases,
  DOCUMENT_NEQ_DOCTOR_VERIFIED,
} from './doctor-consultation-erx-production-workflow-closure';
import { evaluateDoctorConsultationErxRealUseClosure } from './doctor-consultation-erx-real-use-closure';
import { assertNoSecretLeak } from '../ops/secret-redaction';

describe('S137 eRx production activation path', () => {
  const prevEnv = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in prevEnv)) delete process.env[key];
    }
    Object.assign(process.env, prevEnv);
  });

  it('software path complete; production transmission BLOCKED', () => {
    delete process.env['ERX_PROVIDER'];
    process.env['HEALTHCARE_ENVIRONMENT'] = 'sandbox';
    const report = evaluateErxProductionActivationPath();
    expect(report.sprint).toBe(137);
    expect(report.software_activation_path).toBe('COMPLETE');
    expect(report.production_erx_enabled).toBe(false);
    expect(report.production_transmission).toBe('BLOCKED');
    expect(report.issued_neq_legally_transmitted).toBe(true);
    expect(report.real_erx_transmitted).toBe(false);
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_ERX_PROVIDER);
    expect(report.secrets_manager_runtime_resolver).toBe('SOFTWARE_COMPLETE');
    assertNoSecretLeak(JSON.stringify(report));
  });

  it('rejects SANDBOX as production eRx selection', () => {
    process.env['ERX_PROVIDER'] = 'sandbox';
    const sel = readConfiguredProductionErxProvider();
    expect(sel.selected).toBe(false);
    expect(sel.mock_rejected).toBe(true);
  });

  it('CONFIGURED when refs present but never auto ENABLED', () => {
    process.env['ERX_PROVIDER'] = 'ACME_ERX';
    process.env['ERX_PROVIDER_SECRET_REF'] = 'vault:prod/erx';
    process.env['ERX_NETWORK_ACCOUNT_REF'] = 'acct:ref';
    process.env['ERX_ENDPOINT_REF'] = 'https://erx.example';
    delete process.env['ERX_VERIFICATION_STATUS'];
    delete process.env['ERX_APPROVAL_STATUS'];
    const life = deriveProductionErxLifecycle();
    expect(life.configured).toBe(true);
    expect(life.enabled).toBe(false);
    expect(life.activation_stage).toBe('CONFIGURED');
  });

  it('live slots never leak secrets', () => {
    process.env['ERX_PROVIDER_SECRET_REF'] = 'vault:prod/erx';
    const slots = buildLiveErxConfigurationSlots();
    for (const slot of slots) expect(slot.value_leaked).toBe(false);
    assertNoSecretLeak(JSON.stringify(slots));
  });

  it('production transmission fail-closed', () => {
    process.env['HEALTHCARE_ENVIRONMENT'] = 'production';
    process.env['HEALTHCARE_LIVE_ENABLED'] = 'true';
    delete process.env['ERX_PROVIDER'];
    try {
      assertProductionErxTransmissionAllowed('unit');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProblemException);
      expect((err as ProblemException).code).toBe(PRODUCTION_ERX_TRANSMISSION_BLOCKED);
    }
  });

  it('sandbox eRx blocked in production', () => {
    process.env['HEALTHCARE_ENVIRONMENT'] = 'production';
    process.env['ERX_PROVIDER'] = 'sandbox';
    try {
      assertProductionErxTransmissionAllowed('unit');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProblemException);
      expect((err as ProblemException).code).toBe(SANDBOX_ERX_BLOCKED_IN_PRODUCTION);
    }
  });

  it('transmission negative cases catalogued', () => {
    const cases = evaluateErxTransmissionNegativeCases();
    expect(cases.map((c) => c.case_id)).toEqual(
      expect.arrayContaining([
        'production_without_provider',
        'duplicate_transmission',
        'draft_prescription_transmit',
        'forged_client_transmission',
      ]),
    );
  });
});

describe('S137 doctor consultation eRx workflow closure', () => {
  it('software workflow closed; production BLOCKED', () => {
    const report = evaluateDoctorConsultationErxProductionWorkflowClosure();
    expect(report.sprint).toBe(137);
    expect(report.authoritative_source).toBe(
      'doctor-consultation-erx-production-workflow-closure',
    );
    expect(report.parallel_consultation_framework_created).toBe(false);
    expect(report.fake_erx_invented).toBe(false);
    expect(report.real_erx_transmitted).toBe(false);
    expect(report.legal_transmission_claimed).toBe(false);
    expect(report.issued_equals_legally_transmitted).toBe(false);
    expect(report.doctor_workflow.lifecycle).toBe('WORKFLOW_SOFTWARE_CLOSED');
    expect(report.admin_summary.production_doctor_consultation_erx_workflow).toBe('BLOCKED');
    expect(report.erx_path.software_activation_path).toBe('COMPLETE');
    expect(report.workflow_phases).toEqual(DOCTOR_ERX_WORKFLOW_PHASES);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_DOCTOR_CONSULTATION_ERX_WORKFLOW);
    expect(report.global_policy.hardcoded_india_global).toBe(false);
    assertNoSecretLeak(JSON.stringify(report));
  });

  it('fail-closed + clinical eligibility', () => {
    const cases = evaluateDoctorErxWorkflowFailClosedCases();
    expect(cases[0]!.primary_blocker).toBe(DOCUMENT_NEQ_DOCTOR_VERIFIED);
    expect(cases.every((c) => c.production_clinical_blocked)).toBe(true);

    expect(
      evaluateDoctorClinicalActionEligibility({
        partnerStatus: PartnerStatus.ACTIVE,
        environment: 'sandbox',
      }).allowed,
    ).toBe(true);
    expect(
      evaluateDoctorClinicalActionEligibility({
        partnerStatus: PartnerStatus.SUSPENDED,
        environment: 'sandbox',
      }).blocker,
    ).toBe('PARTNER_SUSPENDED');
    expect(
      evaluateDoctorClinicalActionEligibility({
        partnerStatus: PartnerStatus.VERIFIED,
        environment: 'production',
      }).blocker,
    ).toBe('PARTNER_NOT_ACTIVE');
    expect(
      evaluateDoctorClinicalActionEligibility({
        partnerStatus: PartnerStatus.ACTIVE,
        kycStatus: KycCaseStatus.EXPIRED,
        environment: 'sandbox',
      }).blocker,
    ).toBe('KYC_EXPIRED');
  });

  it('composes S125 without enabling live eRx', () => {
    expect(evaluateDoctorConsultationErxRealUseClosure().remaining_blocker).toBe(
      NO_PRODUCTION_ERX_PROVIDER,
    );
    const prep = evaluateDoctorConsultationErxProductionWorkflowClosure();
    expect(prep.composed.s125_remaining_blocker).toBe(NO_PRODUCTION_ERX_PROVIDER);
    expect(prep.real_telemedicine_claimed).toBe(false);
  });
});
