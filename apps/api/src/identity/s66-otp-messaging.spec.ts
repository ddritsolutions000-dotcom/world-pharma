/**
 * Sprint 66 — OTP / messaging onboarding (no fake live provider).
 */
import {
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

describe('S66 messaging availability', () => {
  it('reports NOT_SELECTED / EXTERNAL_GATED for all production channels', () => {
    const report = evaluateMessagingFirstOnboarding();
    expect(report.real_provider_available).toBe(false);
    expect(report.secrets_printed).toBe(false);
    expect(report.otp_codes_logged).toBe(false);
    expect(report.native_device).toBe('DEVICE_NOT_AVAILABLE');
    expect(report.enablement_guard.can_enable).toBe(false);
    const by = Object.fromEntries(report.channels.map((c) => [c.channel, c]));
    expect(by.OTP?.provider).toBe('NOT_SELECTED');
    expect(by.OTP?.production).toBe('EXTERNAL_GATED');
    expect(by.OTP?.status).toBe('SANDBOX_VERIFIED');
    expect(by.SMS?.production).toBe('EXTERNAL_GATED');
    expect(by.EMAIL?.production).toBe('EXTERNAL_GATED');
    expect(by.PUSH?.status).toBe('NOT_VERIFIED');
  });
});

describe('S66 enablement guard', () => {
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

  it('requires full checklist including reveal off', () => {
    const guard = evaluateMessagingEnablementGuard({
      nonMockOtpAdapter: true,
      nonMockMessagingAdapter: true,
      communicationEnvironment: 'production',
      liveEnabled: true,
      humanApproved: true,
      authDevRevealOffInProduction: true,
      emergencyDisabled: false,
    });
    expect(guard.can_enable).toBe(true);
  });
});

describe('S66 sandbox/production separation', () => {
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
    expect(() => assertSandboxOnlyCommunicationRuntime('s66')).toThrow(ProblemException);
  });

  it('treats CONSOLE as mock OTP provider', () => {
    expect(isMockOtpProvider('CONSOLE')).toBe(true);
    expect(isMockOtpProvider('TWILIO_LIVE')).toBe(false);
  });
});

describe('S66 globalization', () => {
  it('onboarding report has no hardcoded UPI/INR/₹/+91/IST', () => {
    const blob = JSON.stringify(evaluateMessagingFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
  });
});
