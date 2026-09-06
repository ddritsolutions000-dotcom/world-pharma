/**
 * Sprint 89 — Production OTP + transactional communications activation readiness.
 */
import {
  NO_PRODUCTION_EMAIL_CREDENTIAL,
  NO_PRODUCTION_EMAIL_DOMAIN,
  NO_PRODUCTION_EMAIL_PROVIDER,
  NO_PRODUCTION_EMAIL_SENDER,
  NO_PRODUCTION_OTP_CREDENTIAL,
  NO_PRODUCTION_OTP_MESSAGING_PROVIDER,
  NO_PRODUCTION_OTP_PROVIDER,
  NO_PRODUCTION_PUSH_PROVIDER,
  NO_PRODUCTION_SMS_CREDENTIAL,
  NO_PRODUCTION_SMS_PROVIDER,
  NO_PRODUCTION_SMS_SENDER,
  buildNotificationStateMachine,
  evaluateMessagingEnablementGuard,
  evaluateMessagingFirstOnboarding,
  validateMessagingConfiguration,
} from './messaging-first-onboarding';
import { validateProductionMessagingConfiguration } from './production-messaging-requirements';

describe('S89 messaging activation contract', () => {
  it('reports Sprint 89 / EXTERNAL_GATED with umbrella + granular blockers', () => {
    const report = evaluateMessagingFirstOnboarding();
    expect(report.sprint).toBe(89);
    expect(report.foundation_sprint).toBe(86);
    expect(report.real_provider_available).toBe(false);
    expect(report.force_launch_available).toBe(false);
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_OTP_MESSAGING_PROVIDER);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        NO_PRODUCTION_OTP_MESSAGING_PROVIDER,
        NO_PRODUCTION_OTP_PROVIDER,
        NO_PRODUCTION_SMS_PROVIDER,
        NO_PRODUCTION_EMAIL_PROVIDER,
        NO_PRODUCTION_PUSH_PROVIDER,
        NO_PRODUCTION_OTP_CREDENTIAL,
        NO_PRODUCTION_SMS_CREDENTIAL,
        NO_PRODUCTION_SMS_SENDER,
        NO_PRODUCTION_EMAIL_CREDENTIAL,
        NO_PRODUCTION_EMAIL_SENDER,
        NO_PRODUCTION_EMAIL_DOMAIN,
      ]),
    );
    expect(report.otp.provider).toBe('NOT_SELECTED');
    expect(report.otp.production).toBe('EXTERNAL_GATED');
    expect(report.sms.production).toBe('EXTERNAL_GATED');
    expect(report.email.production).toBe('EXTERNAL_GATED');
    expect(report.push.production).toBe('EXTERNAL_GATED');
    expect(report.sandbox_authentication).toBe('SANDBOX_VERIFIED');
    expect(report.production_authentication).toBe('EXTERNAL_GATED');
    expect(report.native_device).toBe('DEVICE_NOT_AVAILABLE');
    expect(report.secrets_printed).toBe(false);
    expect(report.otp_codes_logged).toBe(false);
  });

  it('configuration readiness stays MISSING / EXTERNAL_GATED / DEVICE_NOT_AVAILABLE', () => {
    const v = validateProductionMessagingConfiguration();
    expect(v.ready_for_activation).toBe(false);
    expect(v.secrets_exposed).toBe(false);
    expect(v.otp_readiness.provider).toBe('NOT_SELECTED');
    expect(v.otp_readiness.production).toBe('EXTERNAL_GATED');
    expect(v.sms_readiness.credential).toBe('MISSING');
    expect(v.sms_readiness.sender_or_origin).toBe('MISSING');
    expect(v.email_readiness.domain).toBe('MISSING');
    expect(v.push_readiness.device).toBe('DEVICE_NOT_AVAILABLE');
    expect(JSON.stringify(v)).not.toMatch(/sk_live|api_key|password|Bearer /i);

    const report = evaluateMessagingFirstOnboarding();
    expect(report.configuration_validation.otp_readiness.production).toBe('EXTERNAL_GATED');
    expect(report.country_policy.markets_supported_for_evaluation).toEqual([
      'GLOBAL',
      'IN',
      'AE',
      'US',
    ]);
  });
});

describe('S89 notification + enablement + globalization', () => {
  it('SENT ≠ DELIVERED; validator never returns ENABLED', () => {
    const sm = buildNotificationStateMachine();
    expect(sm.accepted_by_provider_state).toBe('SENT');
    expect(sm.delivered_to_user_state).toBe('DELIVERED');
    expect(sm.delivered_requires_provider_receipt).toBe(true);

    expect(
      validateMessagingConfiguration({
        nonMockOtpAdapter: true,
        nonMockMessagingAdapter: true,
        communicationEnvironment: 'production',
        liveEnabled: true,
        humanApproved: true,
        authDevRevealOffInProduction: true,
        emergencyDisabled: false,
      }),
    ).toBe('APPROVED');

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
  });

  it('no hardcoded UPI/INR/₹/+91/IST or invented vendors', () => {
    const blob = JSON.stringify(evaluateMessagingFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/\bTWILIO\b|\bSENDGRID\b|\bMSG91\b/i);
  });
});
