import { ProblemException } from '../common/problem';
import {
  assertLiveProductionPrerequisites,
  assertPaymentSubmitAllowed,
  assertProductionCountryAuthorized,
  assertProductionCredentialsPresent,
  assertSandboxGatewayCode,
  assertSandboxOnlyRuntime,
  describeGatewaySecretRef,
  isLivePaymentEnabled,
  isMockGatewayCode,
  readPaymentEnvironment,
} from './payment.config';

describe('payment.config', () => {
  const prevEnv = process.env['PAYMENT_ENVIRONMENT'];
  const prevLive = process.env['PAYMENT_LIVE_ENABLED'];

  afterEach(() => {
    if (prevEnv === undefined) {
      delete process.env['PAYMENT_ENVIRONMENT'];
    } else {
      process.env['PAYMENT_ENVIRONMENT'] = prevEnv;
    }
    if (prevLive === undefined) {
      delete process.env['PAYMENT_LIVE_ENABLED'];
    } else {
      process.env['PAYMENT_LIVE_ENABLED'] = prevLive;
    }
  });

  it('defaults to sandbox environment', () => {
    delete process.env['PAYMENT_ENVIRONMENT'];
    expect(readPaymentEnvironment()).toBe('sandbox');
    expect(isLivePaymentEnabled()).toBe(false);
  });

  it('fail-closes production runtime without PAYMENT_LIVE_ENABLED', () => {
    process.env['PAYMENT_ENVIRONMENT'] = 'production';
    delete process.env['PAYMENT_LIVE_ENABLED'];
    expect(() => assertSandboxOnlyRuntime('test')).toThrow(ProblemException);
    try {
      assertSandboxOnlyRuntime('test');
    } catch (err) {
      expect((err as ProblemException).code).toBe('LIVE_PAYMENTS_DISABLED');
    }
  });

  it('describes gateway secret refs without returning secret values', () => {
    process.env['PAYMENT_GATEWAY_MOCK_PRIMARY_SECRET_REF'] = 'vault:prod/payments/mock/ref-only';
    const ref = describeGatewaySecretRef('MOCK_PRIMARY');
    expect(ref).toEqual({ ref: 'vault:prod/payments/mock/ref-only', environment: 'sandbox' });
    delete process.env['PAYMENT_GATEWAY_MOCK_PRIMARY_SECRET_REF'];
  });

  it('identifies mock gateway codes', () => {
    expect(isMockGatewayCode('MOCK_PRIMARY')).toBe(true);
    expect(isMockGatewayCode('STRIPE_LIVE')).toBe(false);
  });

  it('forbids mock gateways in production environment rows', () => {
    expect(() => assertSandboxGatewayCode('MOCK_PRIMARY', 'production')).toThrow(ProblemException);
    try {
      assertSandboxGatewayCode('MOCK_PRIMARY', 'production');
    } catch (err) {
      expect((err as ProblemException).code).toBe('MOCK_GATEWAY_PRODUCTION_FORBIDDEN');
    }
  });

  it('fail-closes production country without authorization list', () => {
    delete process.env['PAYMENT_PRODUCTION_COUNTRIES'];
    expect(() => assertProductionCountryAuthorized('US', 'test')).toThrow(ProblemException);
  });

  it('fail-closes production credentials when secret ref absent', () => {
    delete process.env['PAYMENT_GATEWAY_STRIPE_LIVE_SECRET_REF'];
    expect(() => assertProductionCredentialsPresent('STRIPE_LIVE', 'test')).toThrow(ProblemException);
  });

  it('fail-closes live production prerequisites holistically', () => {
    process.env['PAYMENT_ENVIRONMENT'] = 'production';
    process.env['PAYMENT_LIVE_ENABLED'] = 'true';
    process.env['PAYMENT_PRODUCTION_COUNTRIES'] = 'US';
    process.env['PAYMENT_GATEWAY_STRIPE_LIVE_SECRET_REF'] = 'vault:prod/payments/stripe/ref';
    delete process.env['PAYMENT_RISK_ADAPTER'];
    expect(() =>
      assertLiveProductionPrerequisites('test', { gatewayCode: 'STRIPE_LIVE', countryIso2: 'US' }),
    ).toThrow(ProblemException);
  });

  it('blocks payment submit in production without live enablement', () => {
    process.env['PAYMENT_ENVIRONMENT'] = 'production';
    delete process.env['PAYMENT_LIVE_ENABLED'];
    expect(() => assertPaymentSubmitAllowed('submit')).toThrow(ProblemException);
  });
});
