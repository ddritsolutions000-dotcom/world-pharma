/**
 * Sprint 92 — Production telemedicine / live-video activation readiness
 * (no fake live provider / production video).
 */
import {
  NO_PRODUCTION_CLINICAL_ADAPTER,
  NO_PRODUCTION_VIDEO_PROVIDER,
  VIDEO_API_ENDPOINT_REFERENCE_MISSING,
  VIDEO_CALLBACK_CONFIGURATION_MISSING,
  VIDEO_CONSENT_POLICY_CONFIGURATION_MISSING,
  VIDEO_CREDENTIAL_REFERENCE_MISSING,
  VIDEO_MARKET_LEGAL_CONFIGURATION_MISSING,
  VIDEO_PROVIDER_NOT_SELECTED,
  VIDEO_RECORDING_STORAGE_CONFIGURATION_MISSING,
  VIDEO_TOKEN_SIGNING_REFERENCE_MISSING,
  buildVideoSessionLifecycleMachine,
  evaluateVideoEnablementGuard,
  evaluateVideoFirstOnboarding,
  validateVideoConfiguration,
} from './video-first-onboarding';
import { validateProductionVideoConfiguration } from './production-video-requirements';

describe('S92 video activation contract', () => {
  it('reports Sprint 92 / NOT_SELECTED / EXTERNAL_GATED with blockers', () => {
    const report = evaluateVideoFirstOnboarding();
    expect(report.sprint).toBe(92);
    expect(report.foundation_sprint).toBe(79);
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.activation_lifecycle).toBe('NOT_SELECTED');
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.session_creation).toBe('SANDBOX_ONLY');
    expect(report.live_session).toBe('SANDBOX_ONLY');
    expect(report.enabled).toBe(false);
    expect(report.force_launch_available).toBe(false);
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_VIDEO_PROVIDER);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        NO_PRODUCTION_VIDEO_PROVIDER,
        NO_PRODUCTION_CLINICAL_ADAPTER,
        VIDEO_PROVIDER_NOT_SELECTED,
        VIDEO_CREDENTIAL_REFERENCE_MISSING,
        VIDEO_API_ENDPOINT_REFERENCE_MISSING,
        VIDEO_TOKEN_SIGNING_REFERENCE_MISSING,
        VIDEO_CALLBACK_CONFIGURATION_MISSING,
        VIDEO_MARKET_LEGAL_CONFIGURATION_MISSING,
        VIDEO_RECORDING_STORAGE_CONFIGURATION_MISSING,
        VIDEO_CONSENT_POLICY_CONFIGURATION_MISSING,
      ]),
    );
    expect(report.appointment_vs_video).toBe(
      'APPOINTMENT_SEPARATE_FROM_VIDEO_SESSION_AND_CONSULTATION',
    );
    expect(report.recording).toMatch(/EXTERNAL_GATED/);
    expect(report.fake_meeting_url_as_production).toBe(false);
    expect(report.secrets_printed).toBe(false);
    expect(report.phi_printed).toBe(false);
    expect(report.tokens_printed).toBe(false);
  });

  it('configuration readiness + eligibility distinctions stay gated', () => {
    const v = validateProductionVideoConfiguration();
    expect(v.ready_for_activation).toBe(false);
    expect(v.secrets_exposed).toBe(false);
    expect(v.phi_exposed).toBe(false);
    expect(v.configuration_readiness.production_activation).toBe('EXTERNAL_GATED');
    expect(v.configuration_readiness.session_capability).toBe('SANDBOX_ONLY');
    expect(v.configuration_readiness.recording).toBe('EXTERNAL_GATED');
    expect(v.eligibility.appointment_equals_live_video_session).toBe(false);
    expect(v.eligibility.session_created_equals_consultation_completed).toBe(false);
    expect(v.eligibility.livekit_sandbox_refs_equal_production_enabled).toBe(false);
    expect(v.eligibility.recording_equals_live_video).toBe(false);

    const report = evaluateVideoFirstOnboarding();
    expect(report.country_policy.markets_supported_for_evaluation).toEqual([
      'GLOBAL',
      'IN',
      'AE',
      'US',
    ]);
    expect(report.permission_model.customer_cannot_impersonate_doctor).toBe(true);
    expect(report.permission_model.doctor_cannot_bypass_provider_gate).toBe(true);
    expect(report.webhook_security.unsigned_fail_closed).toBe(true);
  });
});

describe('S92 lifecycle + enablement + globalization', () => {
  it('SESSION CREATED ≠ consultation completed; validator never ENABLED', () => {
    const life = buildVideoSessionLifecycleMachine();
    expect(life.session_created_not_equal_consultation_completed).toBe(true);
    expect(life.idempotent_start_end).toBe(true);
    expect(life.terminal_overwrite_forbidden).toBe(true);

    expect(
      validateVideoConfiguration({
        providerSelected: true,
        nonMockProductionAdapterRegistered: true,
        healthcareEnvironment: 'production',
        liveEnabled: true,
        humanApproved: true,
        credentialsPresent: true,
        accountProjectPresent: true,
        endpointConfigured: true,
        allowedOriginsConfigured: true,
        countrySupportConfigured: true,
        callbackConfigured: true,
        legalClinicalConfigured: true,
      }),
    ).toBe('APPROVED');

    expect(
      evaluateVideoEnablementGuard({
        nonMockProductionAdapterRegistered: false,
        healthcareEnvironment: 'production',
        liveEnabled: true,
        humanApproved: true,
        legalGateClear: true,
        recordingPolicyClear: true,
        webhookProductionReady: true,
        emergencyDisabled: false,
      }).can_enable,
    ).toBe(false);
  });

  it('no hardcoded UPI/INR/₹/+91/IST or invented vendors', () => {
    const blob = JSON.stringify(evaluateVideoFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/\bTWILIO\b|\bZOOM\b|\bAGORA\b/i);
  });
});
