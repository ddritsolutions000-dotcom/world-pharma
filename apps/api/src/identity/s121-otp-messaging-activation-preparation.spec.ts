/**
 * Sprint 121 — OTP + transactional communications activation preparation.
 */
import {
  NO_PRODUCTION_OTP_MESSAGING_PROVIDER,
  NO_PRODUCTION_OTP_PROVIDER,
  buildOtpMessagingConfigurationReferenceSlots,
  evaluateOtpMessagingFailClosedCases,
  evaluateOtpMessagingActivationPreparation,
} from './otp-messaging-activation-preparation';
import { evaluateRealMessagingFirstOnboarding } from './messaging-real-activation-first-onboarding';
import { buildNotificationStateMachine } from './messaging-first-onboarding';
import { isMockOtpProvider } from './communication.config';
import { evaluateProductionSecurityGate } from '../ops/production-security-gate-consolidation';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';
import { assertNoSecretLeak } from '../ops/secret-redaction';

describe('S121 OTP messaging activation preparation', () => {
  it('OTP NOT_SELECTED / channels EXTERNAL_GATED / no invented providers', () => {
    const report = evaluateOtpMessagingActivationPreparation();
    expect(report.sprint).toBe(121);
    expect(report.authoritative_source).toBe('otp-messaging-activation-preparation');
    expect(report.parallel_otp_system_created).toBe(false);
    expect(report.parallel_notification_system_created).toBe(false);
    expect(report.fake_provider_invented).toBe(false);
    expect(report.real_otp_sent).toBe(false);
    expect(report.real_messages_sent).toBe(false);
    expect(report.otp_provider.lifecycle).toBe('NOT_SELECTED');
    expect(report.otp_provider.sandbox).toBe('SANDBOX_VERIFIED');
    expect(report.channels.sms).toBe('EXTERNAL_GATED');
    expect(report.channels.email).toBe('EXTERNAL_GATED');
    expect(report.channels.push).toBe('EXTERNAL_GATED');
    expect(report.admin_summary.production_communications).toBe('BLOCKED');
    expect(report.admin_summary.credentials).toBe('MISSING');
    expect(report.checkout_fail_closed.overall).toBe('PASS');
    expect(report.otp_security.expiry_enforced).toBe(true);
    expect(report.otp_security.attempt_limits).toBe(true);
    expect(report.enumeration_protection.status).toBe('PASS');
    expect(report.delivery_failure_handling.sent_neq_delivered).toBe(true);
    expect(report.privacy_phi.no_otp_in_logs).toBe(true);
    expect(report.currency_market.hardcoded_india_global).toBe(false);
    expect(report.sandbox_vs_production.production_console_forbidden).toBe(true);
    expect(report.force_launch_available).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_OTP_MESSAGING_PROVIDER);
    expect(report.otp_printed).toBe(false);
    expect(report.configuration_references.every((s) => s.value_present === false)).toBe(true);
    expect(buildOtpMessagingConfigurationReferenceSlots().length).toBeGreaterThanOrEqual(10);
  });

  it('fail-closed cases block production communications', () => {
    const cases = evaluateOtpMessagingFailClosedCases();
    expect(cases).toHaveLength(7);
    expect(cases.every((c) => c.production_comms_blocked)).toBe(true);
    expect(cases[0]!.primary_blocker).toBe(NO_PRODUCTION_OTP_PROVIDER);
    expect(isMockOtpProvider('CONSOLE')).toBe(true);
    const sm = buildNotificationStateMachine();
    expect(sm.delivered_requires_provider_receipt).toBe(true);
  });
});

describe('S121 compose + regression', () => {
  it('composes S103/S116 and does not bypass S87', () => {
    expect(evaluateRealMessagingFirstOnboarding().real_messages_sent).toBe(false);
    expect(evaluateProductionSecurityGate().external_pentest_passed).toBe('NO');
    expect(
      evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' })
        .can_production_launch,
    ).toBe('NO');
    expect(assertNoSecretLeak(JSON.stringify(evaluateOtpMessagingActivationPreparation()))).toBe(
      true,
    );
  });

  it('no India hardcoding / no OTP or secret leaks', () => {
    const blob = JSON.stringify(evaluateOtpMessagingActivationPreparation());
    expect(blob).not.toMatch(/\bUPI\b|\bINR\b|₹|\+91|\bIST\b/);
    expect(blob).not.toMatch(/otp=\d{4,}|sk_live_|BEGIN PRIVATE KEY/);
  });
});
