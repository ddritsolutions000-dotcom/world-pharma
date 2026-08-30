import { PaymentIntentStatus } from '@prisma/client';
import {
  mapGatewayStatus,
  mapWebhookType,
  paymentEventName,
  shouldApplyGatewayStatus,
} from './webhook-orchestration';

describe('webhook orchestration', () => {
  it('maps webhook types to gateway status tokens', () => {
    expect(mapWebhookType('payment.captured')).toBe('captured');
    expect(mapWebhookType('payment.failed')).toBe('failed');
    expect(mapWebhookType('payment.authorized')).toBe('authorized');
    expect(mapWebhookType('unknown')).toBeNull();
  });

  it('allows forward transitions and blocks stale regressions', () => {
    expect(shouldApplyGatewayStatus(PaymentIntentStatus.UNKNOWN, 'captured')).toBe(true);
    expect(shouldApplyGatewayStatus(PaymentIntentStatus.CAPTURED, 'captured')).toBe(false);
    expect(shouldApplyGatewayStatus(PaymentIntentStatus.CAPTURED, 'authorized')).toBe(false);
    expect(shouldApplyGatewayStatus(PaymentIntentStatus.FAILED, 'captured')).toBe(false);
  });

  it('maps gateway tokens to intent statuses', () => {
    expect(mapGatewayStatus(PaymentIntentStatus.CREATED, 'captured')).toBe(PaymentIntentStatus.CAPTURED);
    expect(mapGatewayStatus(PaymentIntentStatus.AUTHORIZED, 'voided')).toBe(PaymentIntentStatus.CANCELLED);
  });

  it('maps intent statuses to payment outbox event names', () => {
    expect(paymentEventName(PaymentIntentStatus.CAPTURED)).toBe('PAYMENT_CAPTURED');
    expect(paymentEventName(PaymentIntentStatus.FAILED)).toBe('PAYMENT_FAILED');
  });
});
