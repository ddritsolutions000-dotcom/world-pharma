/**
 * Sprint 65 — First PSP onboarding regression (foundation for Sprint 85).
 */
import { MockPaymentGatewayAdapter } from './mock.adapter';
import { PaymentGatewayRegistry } from './gateway.registry';
import {
  NO_PRODUCTION_PSP,
  evaluatePspEnablementGuard,
  evaluatePspFirstOnboarding,
} from './psp-first-onboarding';
import {
  assertSandboxGatewayCode,
  assertSandboxOnlyRuntime,
  isLivePaymentEnabled,
  isMockGatewayCode,
  readPaymentEnvironment,
} from './payment.config';
import { ProblemException } from '../common/problem';

describe('S65 PSP availability', () => {
  it('registry only has mock adapters — real PSP NOT_SELECTED', () => {
    const registry = new PaymentGatewayRegistry(new MockPaymentGatewayAdapter());
    const codes = registry.registeredCodes();
    expect(codes.every((c) => isMockGatewayCode(c))).toBe(true);
    const report = evaluatePspFirstOnboarding(registry);
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.real_psp_available).toBe(false);
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.enabled).toBe(false);
    expect(report.verified).toBe(false);
    expect(report.approved).toBe(false);
    expect(report.secrets_printed).toBe(false);
    expect(report.enablement_guard.can_enable).toBe(false);
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_PSP);
  });
});

describe('S65 enablement guard', () => {
  it('never enables when provider not selected', () => {
    const guard = evaluatePspEnablementGuard({
      providerSelected: false,
      nonMockAdapterRegistered: false,
      paymentEnvironment: 'production',
      liveEnabled: true,
      humanApproved: true,
      r14aComplete: true,
      webhookProductionReady: true,
      emergencyDisabled: false,
    });
    expect(guard.can_enable).toBe(false);
    expect(guard.checks.find((c) => c.id === 'provider_selected')?.ok).toBe(false);
  });

  it('requires all checks including webhook and R14-A', () => {
    const guard = evaluatePspEnablementGuard({
      providerSelected: true,
      nonMockAdapterRegistered: true,
      paymentEnvironment: 'production',
      liveEnabled: true,
      humanApproved: true,
      r14aComplete: true,
      webhookProductionReady: true,
      emergencyDisabled: false,
    });
    expect(guard.can_enable).toBe(true);
  });
});

describe('S65 sandbox/production separation', () => {
  const prev = {
    env: process.env['PAYMENT_ENVIRONMENT'],
    live: process.env['PAYMENT_LIVE_ENABLED'],
  };

  afterEach(() => {
    if (prev.env === undefined) delete process.env['PAYMENT_ENVIRONMENT'];
    else process.env['PAYMENT_ENVIRONMENT'] = prev.env;
    if (prev.live === undefined) delete process.env['PAYMENT_LIVE_ENABLED'];
    else process.env['PAYMENT_LIVE_ENABLED'] = prev.live;
  });

  it('forbids mock gateway in production environment rows', () => {
    expect(() => assertSandboxGatewayCode('MOCK_PRIMARY', 'production')).toThrow(ProblemException);
  });

  it('production without live flag fail-closes', () => {
    process.env['PAYMENT_ENVIRONMENT'] = 'production';
    process.env['PAYMENT_LIVE_ENABLED'] = 'false';
    expect(readPaymentEnvironment()).toBe('production');
    expect(isLivePaymentEnabled()).toBe(false);
    expect(() => assertSandboxOnlyRuntime('s65')).toThrow(ProblemException);
  });

  it('registry refuses mock resolve in production environment', () => {
    const registry = new PaymentGatewayRegistry(new MockPaymentGatewayAdapter());
    process.env['PAYMENT_ENVIRONMENT'] = 'sandbox';
    expect(() => registry.resolve('MOCK_PRIMARY', 'production')).toThrow(ProblemException);
  });
});

describe('S65 settlement separation', () => {
  it('onboarding report keeps payout EXTERNAL_PAYOUT_GATED', () => {
    const report = evaluatePspFirstOnboarding(new PaymentGatewayRegistry(new MockPaymentGatewayAdapter()));
    expect(report.settlement_payout).toBe('EXTERNAL_PAYOUT_GATED');
  });
});

describe('S65 globalization', () => {
  it('onboarding report has no hardcoded UPI/INR/₹/+91/IST', () => {
    const blob = JSON.stringify(evaluatePspFirstOnboarding(null));
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
  });
});
