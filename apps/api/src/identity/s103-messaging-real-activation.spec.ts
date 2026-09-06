/**
 * Sprint 103 — Real OTP + transactional communications activation readiness
 * (no invented providers / no real messages).
 */
import {
  NO_PRODUCTION_EMAIL_PROVIDER,
  NO_PRODUCTION_OTP_MESSAGING_PROVIDER,
  NO_PRODUCTION_OTP_PROVIDER,
  NO_PRODUCTION_PUSH_PROVIDER,
  NO_PRODUCTION_SMS_PROVIDER,
  evaluateRealMessagingFirstOnboarding,
  buildRealCommsActivationChecklist,
} from './messaging-real-activation-first-onboarding';
import { evaluateMessagingFirstOnboarding } from './messaging-first-onboarding';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';
import { assertNoSecretLeak } from '../ops/secret-redaction';

describe('S103 real messaging activation contract', () => {
  it('reports Sprint 103 / NOT_SELECTED / no real messages', () => {
    const report = evaluateRealMessagingFirstOnboarding();
    expect(report.sprint).toBe(103);
    expect(report.real_otp_provider_selected).toBe(false);
    expect(report.real_sms_provider_selected).toBe(false);
    expect(report.real_email_provider_selected).toBe(false);
    expect(report.real_push_provider_selected).toBe(false);
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.enabled).toBe(false);
    expect(report.production_otp_enabled).toBe(false);
    expect(report.production_sms_enabled).toBe(false);
    expect(report.production_email_enabled).toBe(false);
    expect(report.production_push_enabled).toBe(false);
    expect(report.real_messages_sent).toBe(false);
    expect(report.ready_for_activation).toBe(false);
    expect(report.force_launch_available).toBe(false);
    expect(report.force_deploy_available).toBe(false);
    expect(report.can_production_launch).toBe('NO');
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
    expect(report.control_plane).toBe('S100_REUSED');
    expect(report.foundation_plane).toBe('S101_REUSED');
    expect(report.s89_plane).toBe('COMPOSED');
    expect(report.secrets_printed).toBe(false);
    expect(report.otp_codes_logged).toBe(false);
    expect(report.fake_provider_invented).toBe(false);
    expect(report.native_device).toBe('DEVICE_NOT_AVAILABLE');
  });

  it('exposes four rails, checklist, OTP security, SENT≠DELIVERED, composes S89', () => {
    const report = evaluateRealMessagingFirstOnboarding();
    expect(report.rails.map((r) => r.rail)).toEqual(['OTP', 'SMS', 'EMAIL', 'PUSH']);
    expect(report.rails.every((r) => r.production === 'EXTERNAL_GATED')).toBe(true);
    expect(report.rails.every((r) => r.provider_selected === false)).toBe(true);
    expect(buildRealCommsActivationChecklist().length).toBeGreaterThanOrEqual(12);
    expect(report.otp_security.expiry_enforced).toBe(true);
    expect(report.otp_security.attempt_limits).toBe(true);
    expect(report.otp_security.never_logged_in_production).toBe(true);
    expect(report.notification_state_machine.delivered_requires_provider_receipt).toBe(true);
    expect(report.notification_state_machine.accepted_by_provider_state).toBe('SENT');
    expect(report.notification_state_machine.delivered_to_user_state).toBe('DELIVERED');
    expect(report.sent_vs_delivered.never_fake_delivered_without_receipt).toBe(true);
    expect(report.outbox_idempotency.duplicate_event_safe).toBe(true);
    expect(report.outbox_idempotency.retry_safe).toBe(true);
    expect(report.phi_minimization.templates_avoid_unnecessary_phi).toBe(true);
    expect(report.country_policy.hardcoded_market).toBe(false);
    expect(report.country_policy.markets_supported_for_evaluation).toEqual([
      'GLOBAL',
      'IN',
      'AE',
      'US',
    ]);
    const cats = new Set(report.transactional_notification_coverage.map((c) => c.category));
    expect(cats.has('auth')).toBe(true);
    expect(cats.has('order')).toBe(true);
    expect(cats.has('vendor')).toBe(true);
    expect(cats.has('doctor')).toBe(true);
    expect(cats.has('lab')).toBe(true);

    const s89 = evaluateMessagingFirstOnboarding();
    expect(s89.sprint).toBe(89);
    expect(s89.otp.enabled).toBe(false);
  });
});

describe('S103 security + launch integration', () => {
  it('never leaks secrets/OTP and does not bypass S87', () => {
    expect(assertNoSecretLeak(JSON.stringify(evaluateRealMessagingFirstOnboarding()))).toBe(true);
    const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
    expect(launch.can_production_launch).toBe('NO');
    expect(launch.force_launch_available).toBe(false);
    expect(launch.rails.some((r) => r.rail_id === 'OTP')).toBe(true);
    expect(launch.rails.find((r) => r.rail_id === 'OTP')?.blocker_codes).toEqual(
      expect.arrayContaining([expect.stringMatching(/NO_PRODUCTION_OTP/)]),
    );
  });

  it('no hardcoded UPI/INR/₹/+91/IST or invented provider brands', () => {
    const blob = JSON.stringify(evaluateRealMessagingFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/\bTWILIO\b|\bSENDGRID\b|\bMSG91\b|\bFIREBASE\b/i);
    expect(blob).not.toMatch(/sk_live_|postgresql:\/\/[^:]+:[^@]+@|BEGIN PRIVATE KEY/);
    expect(blob).not.toMatch(/"otp"\s*:\s*"\d{4,8}"/i);
  });
});
