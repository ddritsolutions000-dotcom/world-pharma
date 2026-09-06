/**
 * Sprint 139 — PACS production activation path + imaging workflow closure (unit).
 */
import { KycCaseStatus, PartnerStatus } from '@prisma/client';
import { ProblemException } from '../common/problem';
import {
  assertProductionPacsIngestAllowed,
  buildLivePacsConfigurationSlots,
  deriveProductionPacsLifecycle,
  evaluatePacsIngestNegativeCases,
  evaluatePacsProductionActivationPath,
  PRODUCTION_PACS_INGEST_BLOCKED,
  readConfiguredProductionPacsProvider,
  REPORT_NEQ_DIAGNOSTIC_VIEWER,
  SANDBOX_PACS_BLOCKED_IN_PRODUCTION,
} from './pacs-production-activation-path';
import {
  DOCUMENT_NEQ_RADIOLOGY_VERIFIED,
  IMAGING_WORKFLOW_PHASES,
  NO_PRODUCTION_IMAGING_PACS_DICOM_WORKFLOW,
  NO_PRODUCTION_PACS_PROVIDER,
  evaluateImagingAccessAuthorizationCatalog,
  evaluateImagingPacsDicomProductionWorkflowClosure,
  evaluateImagingPartnerClinicalEligibility,
  evaluateImagingWorkflowFailClosedCases,
} from './imaging-pacs-dicom-production-workflow-closure';
import { evaluatePacsFirstOnboarding } from './pacs-first-onboarding';
import { assertNoSecretLeak } from '../ops/secret-redaction';

describe('S139 PACS production activation path', () => {
  const prevEnv = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in prevEnv)) delete process.env[key];
    }
    Object.assign(process.env, prevEnv);
  });

  it('software path complete; production DICOM ingest BLOCKED', () => {
    delete process.env['PACS_PROVIDER'];
    process.env['HEALTHCARE_ENVIRONMENT'] = 'sandbox';
    const report = evaluatePacsProductionActivationPath();
    expect(report.sprint).toBe(139);
    expect(report.software_activation_path).toBe('COMPLETE');
    expect(report.production_pacs_enabled).toBe(false);
    expect(report.production_dicom_ingest).toBe('BLOCKED');
    expect(report.production_viewer).toBe('BLOCKED');
    expect(report.report_neq_diagnostic_viewer).toBe(true);
    expect(report.real_pacs_claimed).toBe(false);
    expect(report.fake_provider_invented).toBe(false);
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_PACS_PROVIDER);
    expect(report.secrets_manager_runtime_resolver).toBe('SOFTWARE_COMPLETE');
    assertNoSecretLeak(JSON.stringify(report));
  });

  it('rejects SANDBOX / MOCK as production PACS selection', () => {
    process.env['PACS_PROVIDER'] = 'sandbox';
    expect(readConfiguredProductionPacsProvider().mock_rejected).toBe(true);
    process.env['PACS_PROVIDER'] = 'mock';
    expect(readConfiguredProductionPacsProvider().selected).toBe(false);
  });

  it('CONFIGURED when refs present but never auto ENABLED', () => {
    process.env['PACS_PROVIDER'] = 'ACME_PACS';
    process.env['PACS_PROVIDER_SECRET_REF'] = 'vault:prod/pacs';
    process.env['PACS_DICOM_ENDPOINT_REF'] = 'dicom://pacs.example';
    process.env['PACS_AE_TITLE_REF'] = 'AE:WORLDPHARMA';
    delete process.env['PACS_VERIFICATION_STATUS'];
    delete process.env['PACS_APPROVAL_STATUS'];
    const life = deriveProductionPacsLifecycle();
    expect(life.configured).toBe(true);
    expect(life.enabled).toBe(false);
    expect(life.activation_stage).toBe('CONFIGURED');
    expect(life.production).toBe('EXTERNAL_GATED');
  });

  it('live slots never leak secrets', () => {
    process.env['PACS_PROVIDER_SECRET_REF'] = 'vault:prod/pacs';
    const slots = buildLivePacsConfigurationSlots();
    for (const slot of slots) expect(slot.value_leaked).toBe(false);
    assertNoSecretLeak(JSON.stringify(slots));
  });

  it('production ingest fail-closed', () => {
    process.env['HEALTHCARE_ENVIRONMENT'] = 'production';
    process.env['HEALTHCARE_LIVE_ENABLED'] = 'true';
    delete process.env['PACS_PROVIDER'];
    try {
      assertProductionPacsIngestAllowed('unit');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProblemException);
      expect((err as ProblemException).code).toBe(PRODUCTION_PACS_INGEST_BLOCKED);
    }
  });

  it('sandbox PACS blocked in production', () => {
    process.env['HEALTHCARE_ENVIRONMENT'] = 'production';
    process.env['PACS_PROVIDER'] = 'sandbox';
    try {
      assertProductionPacsIngestAllowed('unit');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProblemException);
      expect((err as ProblemException).code).toBe(SANDBOX_PACS_BLOCKED_IN_PRODUCTION);
    }
  });

  it('sandbox environment allows ingest gate without throw', () => {
    process.env['HEALTHCARE_ENVIRONMENT'] = 'sandbox';
    expect(() => assertProductionPacsIngestAllowed('unit')).not.toThrow();
  });

  it('ingest negative cases catalogue covers PHI, IDOR, callbacks', () => {
    const cases = evaluatePacsIngestNegativeCases();
    expect(cases.map((c) => c.case_id)).toEqual(
      expect.arrayContaining([
        'production_without_pacs',
        'sandbox_mock_in_production',
        'duplicate_ingest',
        'duplicate_accession',
        'cross_patient_study',
        'guessed_study_id',
        'invalid_signature_callback',
        'replayed_callback',
        'report_neq_viewer',
        'draft_presented_as_final',
      ]),
    );
    expect(cases.find((c) => c.case_id === 'report_neq_viewer')?.reason).toBe(
      REPORT_NEQ_DIAGNOSTIC_VIEWER,
    );
  });
});

describe('S139 imaging PACS DICOM workflow closure', () => {
  it('software workflow closed; production BLOCKED', () => {
    const report = evaluateImagingPacsDicomProductionWorkflowClosure();
    expect(report.sprint).toBe(139);
    expect(report.authoritative_source).toBe(
      'imaging-pacs-dicom-production-workflow-closure',
    );
    expect(report.parallel_imaging_framework_created).toBe(false);
    expect(report.fake_pacs_invented).toBe(false);
    expect(report.real_pacs_claimed).toBe(false);
    expect(report.real_diagnostic_viewer_claimed).toBe(false);
    expect(report.draft_equals_published).toBe(false);
    expect(report.report_equals_diagnostic_viewer).toBe(false);
    expect(report.imaging_workflow.lifecycle).toBe('WORKFLOW_SOFTWARE_CLOSED');
    expect(report.admin_summary.production_imaging_pacs_dicom_workflow).toBe('BLOCKED');
    expect(report.pacs_path.software_activation_path).toBe('COMPLETE');
    expect(report.workflow_phases).toEqual(IMAGING_WORKFLOW_PHASES);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_IMAGING_PACS_DICOM_WORKFLOW);
    expect(report.global_policy.hardcoded_india_global).toBe(false);
    expect(report.storage.public_urls_forbidden).toBe(true);
    assertNoSecretLeak(JSON.stringify(report));
  });

  it('fail-closed + partner eligibility + access catalog', () => {
    const cases = evaluateImagingWorkflowFailClosedCases();
    expect(cases[0]!.primary_blocker).toBe(DOCUMENT_NEQ_RADIOLOGY_VERIFIED);
    expect(
      cases.filter((c) => c.case_id !== 'duplicate_ingest').every((c) => c.production_imaging_blocked),
    ).toBe(true);

    expect(
      evaluateImagingPartnerClinicalEligibility({
        partnerStatus: PartnerStatus.ACTIVE,
        environment: 'sandbox',
      }).allowed,
    ).toBe(true);
    expect(
      evaluateImagingPartnerClinicalEligibility({
        partnerStatus: PartnerStatus.SUSPENDED,
        environment: 'sandbox',
      }).blocker,
    ).toBe('PARTNER_SUSPENDED');
    expect(
      evaluateImagingPartnerClinicalEligibility({
        partnerStatus: PartnerStatus.VERIFIED,
        environment: 'production',
      }).blocker,
    ).toBe('PARTNER_NOT_ACTIVE');
    expect(
      evaluateImagingPartnerClinicalEligibility({
        partnerStatus: PartnerStatus.ACTIVE,
        kycStatus: KycCaseStatus.EXPIRED,
        environment: 'sandbox',
      }).blocker,
    ).toBe('KYC_EXPIRED');

    const auth = evaluateImagingAccessAuthorizationCatalog();
    expect(auth.find((a) => a.actor === 'patient_owner')?.allowed).toBe(true);
    expect(auth.find((a) => a.actor === 'cross_patient')?.allowed).toBe(false);
    expect(auth.find((a) => a.actor === 'vendor')?.allowed).toBe(false);
  });

  it('composes S93 without enabling live PACS', () => {
    expect(evaluatePacsFirstOnboarding().remaining_blocker).toBe(NO_PRODUCTION_PACS_PROVIDER);
    const prep = evaluateImagingPacsDicomProductionWorkflowClosure();
    expect(prep.composed.pacs_onboarding_blocker).toBe(NO_PRODUCTION_PACS_PROVIDER);
    expect(prep.composed.pacs_production).toBe('BLOCKED');
  });
});
