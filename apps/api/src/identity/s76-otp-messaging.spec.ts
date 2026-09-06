/**
 * Sprint 76 — OTP / messaging activation readiness (no fake live provider).
 */
import {
  NO_PRODUCTION_OTP_MESSAGING_PROVIDER,
  buildNotificationStateMachine,
  evaluateMessagingEnablementGuard,
  evaluateMessagingFirstOnboarding,
} from './messaging-first-onboarding';
import {
  assertSandboxOnlyCommunicationRuntime,
  isLiveOtpEnabled,
  isMockOtpProvider,
  readCommunicationEnvironment,
} from './communication.config';
import { ProblemException } from '../common/problem';

describe('S76 messaging availability', () => {
  it('reports NOT_SELECTED / EXTERNAL_GATED — NO_PRODUCTION_OTP_MESSAGING_PROVIDER', () => {
    const report = evaluateMessagingFirstOnboarding();
    expect([76, 86, 89]).toContain(report.sprint);
    expect([66, 76, 86]).toContain(report.foundation_sprint);
    expect(report.real_provider_available).toBe(false);
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_OTP_MESSAGING_PROVIDER);
    expect(report.secrets_printed).toBe(false);
    expect(report.otp_codes_logged).toBe(false);
    expect(report.native_device).toBe('DEVICE_NOT_AVAILABLE');
    expect(report.android).toBe('DEVICE_NOT_AVAILABLE');
    expect(report.ios).toBe('DEVICE_NOT_AVAILABLE');
    expect(report.enablement_guard.can_enable).toBe(false);
    const by = Object.fromEntries(report.channels.map((c) => [c.channel, c]));
    expect(by.OTP?.provider).toBe('NOT_SELECTED');
    expect(by.OTP?.production).toBe('EXTERNAL_GATED');
    expect(by.OTP?.configured).toBe(false);
    expect(by.OTP?.enabled).toBe(false);
    expect(by.OTP?.status).toBe('SANDBOX_VERIFIED');
    expect(by.OTP?.remaining_blocker).toMatch(/NO_PRODUCTION_OTP/);
    expect(by.SMS?.production).toBe('EXTERNAL_GATED');
    expect(by.EMAIL?.production).toBe('EXTERNAL_GATED');
    expect(by.PUSH?.status).toBe('NOT_VERIFIED');
    expect(by.PUSH?.production).toBe('EXTERNAL_GATED');
  });
});

describe('S76 OTP security checklist', () => {
  it('asserts production fail-closed reveal and security controls', () => {
    const report = evaluateMessagingFirstOnboarding();
    expect(report.otp_security.never_logged_in_production).toBe(true);
    expect(report.otp_security.never_returned_in_production_responses).toBe(true);
    expect(report.otp_security.expiry_enforced).toBe(true);
    expect(report.otp_security.attempt_limits).toBe(true);
    expect(report.otp_security.resend_throttling).toBe(true);
    expect(report.otp_security.purpose_binding).toBe(true);
    expect(report.otp_security.replay_prevention).toBe(true);
    expect(report.otp_security.rate_limits_server_side).toBe(true);
    expect(report.otp_security.auth_dev_reveal_otp_production).toBe('MUST_BE_FALSE');
  });
});

describe('S76 notification state machine', () => {
  it('distinguishes SENT from DELIVERED and keeps EXTERNAL_GATED failure path', () => {
    const sm = buildNotificationStateMachine();
    expect(sm.accepted_by_provider_state).toBe('SENT');
    expect(sm.delivered_to_user_state).toBe('DELIVERED');
    expect(sm.delivered_requires_provider_receipt).toBe(true);
    expect(sm.success_path).toContain('QUEUED');
    expect(sm.success_path).toContain('PROCESSING');
    expect(sm.failure_states).toContain('EXTERNAL_GATED');
    expect(sm.failure_states).toContain('RETRYING');
    expect(sm.failure_states).toContain('CANCELLED');
  });
});

describe('S76 consent + country policy', () => {
  it('keeps security/transactional independent of marketing; no hardcoded market', () => {
    const report = evaluateMessagingFirstOnboarding();
    expect(report.consent.security_auth_independent_of_marketing).toBe(true);
    expect(report.consent.transactional_independent_of_marketing).toBe(true);
    expect(report.country_policy.hardcoded_market).toBe(false);
    expect(report.country_policy.status).toMatch(/POLICY/);
    expect(report.delivery_receipts.status).toBe('EXTERNAL_GATED');
    expect(report.outbox_idempotency.occurrence_keys).toBe('DETERMINISTIC');
  });
});

describe('S76 enablement guard', () => {
  it('never enables without non-mock adapters', () => {
    const guard = evaluateMessagingEnablementGuard({
      nonMockOtpAdapter: false,
      nonMockMessagingAdapter: false,
      communicationEnvironment: 'production',
      liveEnabled: true,
      humanApproved: true,
      authDevRevealOffInProduction: true,
      emergencyDisabled: false,
    });
    expect(guard.can_enable).toBe(false);
  });

  it('requires full checklist including reveal off and policy gates', () => {
    const guard = evaluateMessagingEnablementGuard({
      nonMockOtpAdapter: true,
      nonMockMessagingAdapter: true,
      communicationEnvironment: 'production',
      liveEnabled: true,
      humanApproved: true,
      authDevRevealOffInProduction: true,
      emergencyDisabled: false,
      countryPolicyConfigured: true,
      legalPrivacyClear: true,
    });
    expect(guard.can_enable).toBe(true);
  });

  it('blocks when country policy missing', () => {
    const guard = evaluateMessagingEnablementGuard({
      nonMockOtpAdapter: true,
      nonMockMessagingAdapter: true,
      communicationEnvironment: 'production',
      liveEnabled: true,
      humanApproved: true,
      authDevRevealOffInProduction: true,
      emergencyDisabled: false,
      countryPolicyConfigured: false,
      legalPrivacyClear: true,
    });
    expect(guard.can_enable).toBe(false);
    expect(guard.checks.find((c) => c.id === 'country_policy')?.ok).toBe(false);
  });
});

describe('S76 sandbox/production separation', () => {
  const prev = {
    env: process.env['COMMUNICATION_ENVIRONMENT'],
    live: process.env['OTP_LIVE_ENABLED'],
    reveal: process.env['AUTH_DEV_REVEAL_OTP'],
  };

  afterEach(() => {
    const restore = (k: string, v: string | undefined) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    };
    restore('COMMUNICATION_ENVIRONMENT', prev.env);
    restore('OTP_LIVE_ENABLED', prev.live);
    restore('AUTH_DEV_REVEAL_OTP', prev.reveal);
  });

  it('production without live flag fail-closes', () => {
    process.env['COMMUNICATION_ENVIRONMENT'] = 'production';
    process.env['OTP_LIVE_ENABLED'] = 'false';
    expect(readCommunicationEnvironment()).toBe('production');
    expect(isLiveOtpEnabled()).toBe(false);
    expect(() => assertSandboxOnlyCommunicationRuntime('s76')).toThrow(ProblemException);
  });

  it('treats CONSOLE as mock OTP provider', () => {
    expect(isMockOtpProvider('CONSOLE')).toBe(true);
    expect(isMockOtpProvider('TWILIO_LIVE')).toBe(false);
  });

  it('AUTH_DEV_REVEAL_OTP in production marks reveal unsafe', () => {
    process.env['COMMUNICATION_ENVIRONMENT'] = 'production';
    process.env['AUTH_DEV_REVEAL_OTP'] = 'true';
    const report = evaluateMessagingFirstOnboarding();
    expect(report.otp_security.auth_dev_reveal_otp_current_safe).toBe(false);
  });
});

describe('S76 globalization', () => {
  it('onboarding report has no hardcoded UPI/INR/₹/+91/IST', () => {
    const blob = JSON.stringify(evaluateMessagingFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
  });
});
