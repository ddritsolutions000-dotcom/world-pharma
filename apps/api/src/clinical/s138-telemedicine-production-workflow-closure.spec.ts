/**
 * Sprint 138 — video production activation path + telemedicine workflow closure (unit).
 */
import { ProblemException } from '../common/problem';
import {
  assertProductionVideoSessionAllowed,
  buildLiveVideoConfigurationSlots,
  deriveProductionVideoLifecycle,
  evaluateVideoProductionActivationPath,
  evaluateVideoSessionNegativeCases,
  PRODUCTION_VIDEO_SESSION_BLOCKED,
  readConfiguredProductionVideoProvider,
  SANDBOX_VIDEO_BLOCKED_IN_PRODUCTION,
  VIDEO_ENDED_NEQ_CONSULTATION_COMPLETED,
} from './video-production-activation-path';
import {
  NO_PRODUCTION_TELEMEDICINE_WORKFLOW,
  NO_PRODUCTION_VIDEO_PROVIDER,
  TELEMEDICINE_WORKFLOW_PHASES,
  evaluateTelemedicineLiveConsultationProductionWorkflowClosure,
  evaluateTelemedicineWorkflowFailClosedCases,
  evaluateVideoParticipantAuthorizationCatalog,
  JOIN_IS_NOT_CONSENT,
} from './telemedicine-live-consultation-production-workflow-closure';
import { evaluateDoctorConsultationErxProductionWorkflowClosure } from './doctor-consultation-erx-production-workflow-closure';
import {
  evaluateDoctorConsultationErxRealUseClosure,
  NO_PRODUCTION_ERX_PROVIDER,
} from './doctor-consultation-erx-real-use-closure';
import { assertNoSecretLeak } from '../ops/secret-redaction';

describe('S138 video production activation path', () => {
  const prevEnv = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in prevEnv)) delete process.env[key];
    }
    Object.assign(process.env, prevEnv);
  });

  it('software path complete; production session creation BLOCKED', () => {
    delete process.env['VIDEO_PROVIDER'];
    process.env['HEALTHCARE_ENVIRONMENT'] = 'sandbox';
    const report = evaluateVideoProductionActivationPath();
    expect(report.sprint).toBe(138);
    expect(report.software_activation_path).toBe('COMPLETE');
    expect(report.production_video_enabled).toBe(false);
    expect(report.production_session_creation).toBe('BLOCKED');
    expect(report.video_ended_neq_consultation_completed).toBe(true);
    expect(report.real_live_video_claimed).toBe(false);
    expect(report.fake_provider_invented).toBe(false);
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_VIDEO_PROVIDER);
    expect(report.secrets_manager_runtime_resolver).toBe('SOFTWARE_COMPLETE');
    assertNoSecretLeak(JSON.stringify(report));
  });

  it('rejects MOCK / LIVEKIT as production video selection', () => {
    process.env['VIDEO_PROVIDER'] = 'mock';
    expect(readConfiguredProductionVideoProvider().mock_rejected).toBe(true);
    process.env['VIDEO_PROVIDER'] = 'livekit';
    expect(readConfiguredProductionVideoProvider().selected).toBe(false);
    expect(readConfiguredProductionVideoProvider().mock_rejected).toBe(true);
  });

  it('CONFIGURED when refs present but never auto ENABLED', () => {
    process.env['VIDEO_PROVIDER'] = 'ACME_VIDEO';
    process.env['VIDEO_PROVIDER_SECRET_REF'] = 'vault:prod/video';
    process.env['VIDEO_API_ENDPOINT_REF'] = 'https://video.example';
    process.env['VIDEO_TOKEN_SIGNING_SECRET_REF'] = 'vault:prod/video-sign';
    delete process.env['VIDEO_VERIFICATION_STATUS'];
    delete process.env['VIDEO_APPROVAL_STATUS'];
    const life = deriveProductionVideoLifecycle();
    expect(life.configured).toBe(true);
    expect(life.enabled).toBe(false);
    expect(life.activation_stage).toBe('CONFIGURED');
    expect(life.production).toBe('EXTERNAL_GATED');
  });

  it('live slots never leak secrets', () => {
    process.env['VIDEO_PROVIDER_SECRET_REF'] = 'vault:prod/video';
    const slots = buildLiveVideoConfigurationSlots();
    for (const slot of slots) expect(slot.value_leaked).toBe(false);
    assertNoSecretLeak(JSON.stringify(slots));
  });

  it('production session creation fail-closed', () => {
    process.env['HEALTHCARE_ENVIRONMENT'] = 'production';
    process.env['HEALTHCARE_LIVE_ENABLED'] = 'true';
    delete process.env['VIDEO_PROVIDER'];
    try {
      assertProductionVideoSessionAllowed('unit');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProblemException);
      expect((err as ProblemException).code).toBe(PRODUCTION_VIDEO_SESSION_BLOCKED);
    }
  });

  it('sandbox / mock video blocked in production', () => {
    process.env['HEALTHCARE_ENVIRONMENT'] = 'production';
    process.env['VIDEO_PROVIDER'] = 'mock';
    try {
      assertProductionVideoSessionAllowed('unit');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProblemException);
      expect((err as ProblemException).code).toBe(SANDBOX_VIDEO_BLOCKED_IN_PRODUCTION);
    }
  });

  it('sandbox environment still allows path evaluation without throw', () => {
    process.env['HEALTHCARE_ENVIRONMENT'] = 'sandbox';
    expect(() => assertProductionVideoSessionAllowed('unit')).not.toThrow();
  });

  it('session negative cases catalogue covers consent, isolation, callbacks', () => {
    const cases = evaluateVideoSessionNegativeCases();
    expect(cases.map((c) => c.case_id)).toEqual(
      expect.arrayContaining([
        'production_without_provider',
        'sandbox_mock_in_production',
        'missing_consent',
        'cancelled_appointment',
        'expired_session',
        'ended_session_reuse',
        'cross_patient_join',
        'duplicate_session_create',
        'provider_timeout',
        'invalid_signature_callback',
        'replayed_callback',
        'duplicate_callback',
        'video_ended_neq_consultation_completed',
      ]),
    );
    expect(
      cases.find((c) => c.case_id === 'video_ended_neq_consultation_completed')?.reason,
    ).toBe(VIDEO_ENDED_NEQ_CONSULTATION_COMPLETED);
  });
});

describe('S138 telemedicine live consultation workflow closure', () => {
  it('software workflow closed; production BLOCKED', () => {
    const report = evaluateTelemedicineLiveConsultationProductionWorkflowClosure();
    expect(report.sprint).toBe(138);
    expect(report.authoritative_source).toBe(
      'telemedicine-live-consultation-production-workflow-closure',
    );
    expect(report.parallel_video_framework_created).toBe(false);
    expect(report.fake_live_video_invented).toBe(false);
    expect(report.real_telemedicine_claimed).toBe(false);
    expect(report.recording_system_built_in_sprint).toBe(false);
    expect(report.video_ended_equals_consultation_completed).toBe(false);
    expect(report.video_ended_equals_prescription_issued).toBe(false);
    expect(report.telemedicine_workflow.lifecycle).toBe('WORKFLOW_SOFTWARE_CLOSED');
    expect(report.admin_summary.production_telemedicine_workflow).toBe('BLOCKED');
    expect(report.video_path.software_activation_path).toBe('COMPLETE');
    expect(report.workflow_phases).toEqual(TELEMEDICINE_WORKFLOW_PHASES);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_TELEMEDICINE_WORKFLOW);
    expect(report.global_policy.hardcoded_india_global).toBe(false);
    expect(report.phi_privacy.credentials_references_only).toBe(true);
    expect(report.notifications.redo_s133).toBe(false);
    assertNoSecretLeak(JSON.stringify(report));
  });

  it('fail-closed cases + participant isolation catalog', () => {
    const cases = evaluateTelemedicineWorkflowFailClosedCases();
    expect(cases.find((c) => c.case_id === 'join_is_not_consent')?.primary_blocker).toBe(
      JOIN_IS_NOT_CONSENT,
    );
    expect(
      cases.filter((c) => c.case_id !== 'duplicate_session').every((c) => c.production_video_blocked),
    ).toBe(true);

    const auth = evaluateVideoParticipantAuthorizationCatalog();
    expect(auth.find((a) => a.actor === 'intended_patient')?.allowed).toBe(true);
    expect(auth.find((a) => a.actor === 'cross_patient')?.allowed).toBe(false);
    expect(auth.find((a) => a.actor === 'vendor')?.allowed).toBe(false);
    expect(auth.find((a) => a.actor === 'unrelated_admin')?.allowed).toBe(false);
  });

  it('composes S125/S137 without enabling live video', () => {
    expect(evaluateDoctorConsultationErxRealUseClosure().remaining_blocker).toBe(
      NO_PRODUCTION_ERX_PROVIDER,
    );
    const prep = evaluateTelemedicineLiveConsultationProductionWorkflowClosure();
    expect(prep.composed.s137_remaining_blocker).toBe(
      evaluateDoctorConsultationErxProductionWorkflowClosure().remaining_blocker,
    );
    expect(prep.composed.video_production).toBe('BLOCKED');
    expect(prep.real_telemedicine_claimed).toBe(false);
  });
});
