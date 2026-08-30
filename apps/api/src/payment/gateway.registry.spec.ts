import { ProblemException } from '../common/problem';
import { MockPaymentGatewayAdapter } from './mock.adapter';
import { PaymentGatewayRegistry } from './gateway.registry';

describe('PaymentGatewayRegistry', () => {
  const mock = new MockPaymentGatewayAdapter();
  const registry = new PaymentGatewayRegistry(mock);

  it('resolves registered mock gateway codes', () => {
    expect(registry.resolve('MOCK_PRIMARY', 'sandbox')).toBe(mock);
    expect(registry.resolve('MOCK_FALLBACK', 'sandbox')).toBe(mock);
    expect(registry.isRegistered('MOCK_PRIMARY')).toBe(true);
  });

  it('fail-closes unknown gateway codes', () => {
    expect(() => registry.resolve('STRIPE_LIVE', 'sandbox')).toThrow(ProblemException);
    try {
      registry.resolve('STRIPE_LIVE', 'sandbox');
    } catch (err) {
      expect((err as ProblemException).code).toBe('UNKNOWN_PAYMENT_GATEWAY');
    }
    expect(registry.isRegistered('STRIPE_LIVE')).toBe(false);
  });

  it('fail-closes production environment without live enablement', () => {
    const prevEnv = process.env['PAYMENT_ENVIRONMENT'];
    const prevLive = process.env['PAYMENT_LIVE_ENABLED'];
    process.env['PAYMENT_ENVIRONMENT'] = 'production';
    delete process.env['PAYMENT_LIVE_ENABLED'];
    try {
      expect(() => registry.resolve('MOCK_PRIMARY', 'production')).toThrow(ProblemException);
      try {
        registry.resolve('MOCK_PRIMARY', 'production');
      } catch (err) {
        expect((err as ProblemException).code).toBe('MOCK_GATEWAY_PRODUCTION_FORBIDDEN');
      }
    } finally {
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
    }
  });
});
