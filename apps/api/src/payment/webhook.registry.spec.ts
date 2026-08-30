import { ProblemException } from '../common/problem';
import { SandboxWebhookAdapter } from './sandbox.webhook.adapter';
import { PaymentWebhookRegistry } from './webhook.registry';
import { signSandboxPayload } from './hmac';

describe('PaymentWebhookRegistry', () => {
  const sandbox = new SandboxWebhookAdapter();
  const registry = new PaymentWebhookRegistry(sandbox);

  it('resolves sandbox handler for mock gateways', () => {
    expect(registry.resolve('MOCK_PRIMARY', 'sandbox')).toBe(sandbox);
  });

  it('fail-closes unknown webhook handlers', () => {
    expect(() => registry.resolve('STRIPE_LIVE', 'sandbox')).toThrow(ProblemException);
    try {
      registry.resolve('STRIPE_LIVE', 'sandbox');
    } catch (err) {
      expect((err as ProblemException).code).toBe('UNKNOWN_PAYMENT_WEBHOOK');
    }
  });

  it('forbids production MOCK webhook handlers', () => {
    expect(() => registry.resolve('MOCK_PRIMARY', 'production')).toThrow(ProblemException);
    try {
      registry.resolve('MOCK_PRIMARY', 'production');
    } catch (err) {
      expect((err as ProblemException).code).toBe('MOCK_GATEWAY_PRODUCTION_FORBIDDEN');
    }
  });

  it('preserves sandbox HMAC verification', () => {
    const raw = JSON.stringify({ event_id: 'evt-1', type: 'payment.captured', provider_ref: 'mock_x' });
    const handler = registry.resolve('MOCK_PRIMARY', 'sandbox');
    expect(handler.verify(raw, signSandboxPayload(raw), {})).toBe(true);
    expect(handler.verify(raw, 'bad-signature', {})).toBe(false);
  });
});
