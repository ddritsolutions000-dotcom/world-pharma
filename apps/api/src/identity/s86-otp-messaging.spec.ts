/**
 * Sprint 86 — Final OTP / transactional communications activation readiness (no fake provider).
 */
import {
  NO_PRODUCTION_EMAIL_PROVIDER,
  NO_PRODUCTION_OTP_MESSAGING_PROVIDER,
  NO_PRODUCTION_OTP_PROVIDER,
  NO_PRODUCTION_PUSH_PROVIDER,
  NO_PRODUCTION_SMS_PROVIDER,
  buildNotificationStateMachine,
  evaluateMessagingEnablementGuard,
  evaluateMessagingFirstOnboarding,
  listTransactionalNotificationCoverage,
  validateMessagingConfiguration,
} from './messaging-first-onboarding';
import {
  assertSandboxOnlyCommunicationRuntime,
  isLiveOtpEnabled,
  isMockOtpProvider,
  readCommunicationEnvironment,
} from './communication.config';
import { ProblemException } from '../common/problem';

describe('S86 messaging availability', () => {
  it('reports NOT_SELECTED / EXTERNAL_GATED with granular blockers', () => {
    const report = evaluateMessagingFirstOnboarding();
    expect(report.sprint).toBeGreaterThanOrEqual(86);
    expect([76, 86]).toContain(report.foundation_sprint);
    expect(report.real_provider_available).toBe(false);
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_OTP_MESSAGING_PROVIDER);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        NO_PRODUCTION_OTP_MESSAGING_PROVIDER,
        NO_PRODUCTION_OTP_PROVIDER,
        NO_PRODUCTION_SMS_PROVIDER,
        NO_PRODUCTION_EMAIL_PROVIDER,
        NO_PRODUCTION_PUSH_PROVIDER,
      ]),
    );
    expect(report.sandbox_authentication).toBe('SANDBOX_VERIFIED');
    expect(report.production_authentication).toBe('EXTERNAL_GATED');
    expect(report.sandbox_cannot_silently_become_production).toBe(true);
    expect(report.fake_provider_invented).toBe(false);
    expect(report.fake_production_delivery_claimed).toBe(false);
    expect(report.fake_sender_identity).toBe(false);
    expect(report.otp.remaining_blocker).toBe(NO_PRODUCTION_OTP_PROVIDER);
    expect(report.sms.remaining_blocker).toBe(NO_PRODUCTION_SMS_PROVIDER);
    expect(report.email.remaining_blocker).toBe(NO_PRODUCTION_EMAIL_PROVIDER);
    expect(report.push.remaining_blocker).toBe(NO_PRODUCTION_PUSH_PROVIDER);
    expect(report.otp.status).toBe('SANDBOX_VERIFIED');
    expect(report.otp.production).toBe('EXTERNAL_GATED');
    expect(report.enablement_guard.can_enable).toBe(false);
    expect(report.secrets_printed).toBe(false);
    expect(report.otp_codes_logged).toBe(false);
  });
});

describe('S86 SENT vs DELIVERED + coverage', () => {
  it('never equates SENT with DELIVERED; coverage marks external channels gated', () => {
    const sm = buildNotificationStateMachine();
    expect(sm.accepted_by_provider_state).toBe('SENT');
    expect(sm.delivered_to_user_state).toBe('DELIVERED');
    expect(sm.delivered_requires_provider_receipt).toBe(true);

    const report = evaluateMessagingFirstOnboarding();
    expect(report.sent_vs_delivered.never_fake_delivered_without_receipt).toBe(true);
    expect(report.sent_vs_delivered.production_sms_email_push_without_provider).toBe(
      'EXTERNAL_GATED',
    );

    const coverage = listTransactionalNotificationCoverage();
    expect(coverage.some((c) => c.event === 'ORDER_CONFIRMED')).toBe(true);
    expect(coverage.some((c) => c.event === 'PAYMENT_CAPTURED')).toBe(true);
    expect(coverage.find((c) => c.event === 'SMS_EMAIL_PUSH_PRODUCTION')?.status).toBe(
      'EXTERNAL_GATED',
    );
    expect(coverage.some((c) => c.status === 'LEGAL_GATED' || c.status === 'POLICY_REQUIRED')).toBe(
      true,
    );
  });
});

describe('S86 OTP security + enablement', () => {
  it('documents replacement/session binding and never enables without adapters', () => {
    const report = evaluateMessagingFirstOnboarding();
    expect(report.otp_security.replacement_invalidates_prior).toBe(true);
    expect(report.otp_security.session_binding).toBe(true);
    expect(report.otp_security.auth_dev_reveal_otp_production).toBe('MUST_BE_FALSE');

    expect(
      evaluateMessagingEnablementGuard({
        nonMockOtpAdapter: false,
        nonMockMessagingAdapter: false,
        communicationEnvironment: 'production',
        liveEnabled: true,
        humanApproved: true,
        authDevRevealOffInProduction: true,
        emergencyDisabled: false,
      }).can_enable,
    ).toBe(false);

    expect(
      evaluateMessagingEnablementGuard({
        nonMockOtpAdapter: true,
        nonMockMessagingAdapter: true,
        communicationEnvironment: 'production',
        liveEnabled: true,
        humanApproved: true,
        authDevRevealOffInProduction: true,
        emergencyDisabled: false,
        countryPolicyConfigured: true,
        legalPrivacyClear: true,
      }).can_enable,
    ).toBe(true);
  });

  it('validator: NOT_SELECTED without provider; credentials ≠ ENABLED', () => {
    expect(
      validateMessagingConfiguration({
        nonMockOtpAdapter: false,
        nonMockMessagingAdapter: false,
        communicationEnvironment: 'production',
        liveEnabled: true,
        humanApproved: true,
        authDevRevealOffInProduction: true,
        emergencyDisabled: false,
      }),
    ).toBe('NOT_SELECTED');

    expect(
      validateMessagingConfiguration({
        nonMockOtpAdapter: true,
        nonMockMessagingAdapter: true,
        communicationEnvironment: 'production',
        liveEnabled: true,
        humanApproved: true,
        authDevRevealOffInProduction: true,
        emergencyDisabled: false,
        countryPolicyConfigured: true,
        legalPrivacyClear: true,
      }),
    ).toBe('APPROVED');
  });
});

describe('S86 fail-closed + globalization', () => {
  const prev = {
    env: process.env['COMMUNICATION_ENVIRONMENT'],
    live: process.env['OTP_LIVE_ENABLED'],
  };

  afterEach(() => {
    if (prev.env === undefined) delete process.env['COMMUNICATION_ENVIRONMENT'];
    else process.env['COMMUNICATION_ENVIRONMENT'] = prev.env;
    if (prev.live === undefined) delete process.env['OTP_LIVE_ENABLED'];
    else process.env['OTP_LIVE_ENABLED'] = prev.live;
  });

  it('production without live flag fail-closes; CONSOLE is mock', () => {
    process.env['COMMUNICATION_ENVIRONMENT'] = 'production';
    process.env['OTP_LIVE_ENABLED'] = 'false';
    expect(readCommunicationEnvironment()).toBe('production');
    expect(isLiveOtpEnabled()).toBe(false);
    expect(() => assertSandboxOnlyCommunicationRuntime('s86')).toThrow(ProblemException);
    expect(isMockOtpProvider('CONSOLE')).toBe(true);
  });

  it('onboarding payload has no hardcoded UPI/INR/₹/+91/IST', () => {
    const blob = JSON.stringify(evaluateMessagingFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
  });
});
