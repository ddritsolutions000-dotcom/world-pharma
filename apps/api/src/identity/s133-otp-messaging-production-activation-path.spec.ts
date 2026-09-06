/**
 * Sprint 133 — Production OTP + transactional communications activation path (unit).
 */
import { ProblemException } from '../common/problem';
import {
  assertProductionCommsCallbackAllowed,
  assertProductionOtpMessagingInitiationAllowed,
  assertSentNotEqualsDelivered,
  buildLiveOtpMessagingConfigurationSlots,
  deriveOtpMessagingChannelLifecycles,
  evaluateOtpMessagingProductionActivationPath,
  evaluateOtpSecurityInvariants,
  evaluateProductionCommsCallbackNegativeCases,
  MOCK_OTP_PROVIDER_BLOCKED_IN_PRODUCTION,
  PRODUCTION_COMMS_CALLBACK_EXTERNAL_GATED,
  PRODUCTION_OTP_MESSAGING_INITIATION_BLOCKED,
  readConfiguredCommsProvider,
  SENT_NEQ_DELIVERED,
} from './otp-messaging-production-activation-path';
import { NO_PRODUCTION_OTP_MESSAGING_PROVIDER } from './messaging-first-onboarding';
import { evaluateOtpMessagingActivationPreparation } from './otp-messaging-activation-preparation';

function assertNoSecretLeak(blob: string): void {
  expect(blob).not.toMatch(/sk_live_|whsec_|BEGIN PRIVATE KEY|otp[_\s-]?code\s*[:=]\s*\d{4,}/i);
}

describe('S133 OTP messaging production activation path', () => {
  const prevEnv = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in prevEnv)) delete process.env[key];
    }
    Object.assign(process.env, prevEnv);
  });

  it('software path complete; production remains BLOCKED', () => {
    delete process.env['OTP_PROVIDER'];
    delete process.env['SMS_PROVIDER'];
    process.env['COMMUNICATION_ENVIRONMENT'] = 'sandbox';
    process.env['OTP_LIVE_ENABLED'] = 'false';

    const report = evaluateOtpMessagingProductionActivationPath();
    expect(report.sprint).toBe(133);
    expect(report.software_activation_path).toBe('COMPLETE');
    expect(report.parallel_otp_system_created).toBe(false);
    expect(report.fake_provider_invented).toBe(false);
    expect(report.real_otp_sent).toBe(false);
    expect(report.production_otp_enabled).toBe(false);
    expect(report.production_communications).toBe('BLOCKED');
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_OTP_MESSAGING_PROVIDER);
    expect(report.sent_neq_delivered).toBe(true);
    expect(report.secrets_manager_runtime_resolver).toBe('SOFTWARE_COMPLETE');
    expect(report.otp_printed).toBe(false);
    assertNoSecretLeak(JSON.stringify(report));
  });

  it('rejects CONSOLE/MOCK as production OTP selection', () => {
    process.env['OTP_PROVIDER'] = 'CONSOLE';
    const otp = readConfiguredCommsProvider('OTP', 'OTP_PROVIDER');
    expect(otp.selected).toBe(false);
    expect(otp.mock_rejected).toBe(true);
  });

  it('CONFIGURED when refs present but never auto ENABLED', () => {
    process.env['OTP_PROVIDER'] = 'ACME_OTP';
    process.env['OTP_PRODUCTION_SECRET_REF'] = 'vault:prod/otp';
    process.env['OTP_SENDER_REF'] = 'sender:ref';
    delete process.env['COMMS_OTP_VERIFICATION_STATUS'];
    delete process.env['COMMS_OTP_APPROVAL_STATUS'];

    const channels = deriveOtpMessagingChannelLifecycles();
    expect(channels.otp.configured).toBe(true);
    expect(channels.otp.verified).toBe(false);
    expect(channels.otp.enabled).toBe(false);
    expect(channels.otp.activation_stage).toBe('CONFIGURED');
  });

  it('live slots never leak secrets or OTP codes', () => {
    process.env['OTP_PRODUCTION_SECRET_REF'] = 'vault:prod/otp';
    const slots = buildLiveOtpMessagingConfigurationSlots();
    for (const slot of slots) {
      expect(slot.value_leaked).toBe(false);
    }
    assertNoSecretLeak(JSON.stringify(slots));
  });

  it('production initiation fail-closed', () => {
    process.env['COMMUNICATION_ENVIRONMENT'] = 'production';
    process.env['OTP_LIVE_ENABLED'] = 'true';
    delete process.env['OTP_PROVIDER'];
    try {
      assertProductionOtpMessagingInitiationAllowed('unit');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProblemException);
      expect((err as ProblemException).code).toBe(PRODUCTION_OTP_MESSAGING_INITIATION_BLOCKED);
    }
  });

  it('mock OTP blocked in production initiation', () => {
    process.env['COMMUNICATION_ENVIRONMENT'] = 'production';
    process.env['OTP_PROVIDER'] = 'CONSOLE';
    try {
      assertProductionOtpMessagingInitiationAllowed('unit');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProblemException);
      expect((err as ProblemException).code).toBe(MOCK_OTP_PROVIDER_BLOCKED_IN_PRODUCTION);
    }
  });

  it('production callbacks EXTERNAL_GATED', () => {
    process.env['COMMUNICATION_ENVIRONMENT'] = 'production';
    try {
      assertProductionCommsCallbackAllowed('SMS', 'unit');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProblemException);
      expect((err as ProblemException).code).toBe(PRODUCTION_COMMS_CALLBACK_EXTERNAL_GATED);
    }
  });

  it('SENT ≠ DELIVERED invariant', () => {
    const inv = assertSentNotEqualsDelivered();
    expect(inv.equal).toBe(false);
    expect(inv.invariant).toBe(SENT_NEQ_DELIVERED);
    expect(inv.sent).not.toBe(inv.delivered);
  });

  it('OTP security + callback negative cases catalogued', () => {
    const security = evaluateOtpSecurityInvariants();
    expect(security.map((c) => c.case_id)).toEqual(
      expect.arrayContaining(['otp_replay', 'otp_wrong_purpose', 'otp_never_logged']),
    );
    const callbacks = evaluateProductionCommsCallbackNegativeCases();
    expect(callbacks.map((c) => c.case_id)).toEqual(
      expect.arrayContaining(['unsigned_callback', 'duplicate_callback', 'browser_callback_as_truth']),
    );
  });

  it('S121 preparation composes S133 path without enabling live OTP', () => {
    const prep = evaluateOtpMessagingActivationPreparation();
    expect(prep.s133_activation_path.sprint).toBe(133);
    expect(prep.s133_activation_path.software_activation_path).toBe('COMPLETE');
    expect(prep.s133_activation_path.production_otp_enabled).toBe(false);
    expect(prep.real_otp_sent).toBe(false);
    expect(prep.can_production_launch).toBe('NO');
    assertNoSecretLeak(JSON.stringify(prep));
  });
});
