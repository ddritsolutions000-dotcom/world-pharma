import { OrderStatus, PaymentIntentStatus, PaymentMethodFamily } from '@prisma/client';
import {
  assessOrderRefundEligibility,
  parsePaymentRefundedEnvelope,
  parseRefundRequestedEnvelope,
  resolveOrderRefundStatusFromIntent,
} from './refund-orchestration';

describe('refund orchestration', () => {
  it('allows refund when payment is captured with remaining balance', () => {
    expect(
      assessOrderRefundEligibility({
        status: PaymentIntentStatus.CAPTURED,
        method: PaymentMethodFamily.CARD,
        capturedMinor: 100n,
        refundedMinor: 0n,
      }).eligible,
    ).toBe(true);
  });

  it('blocks refund when payment is not captured', () => {
    const result = assessOrderRefundEligibility({
      status: PaymentIntentStatus.AUTHORIZED,
      method: PaymentMethodFamily.CARD,
      capturedMinor: 0n,
      refundedMinor: 0n,
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.code).toBe('PAYMENT_NOT_REFUNDABLE');
    }
  });

  it('blocks refund when payment is fully refunded', () => {
    const result = assessOrderRefundEligibility({
      status: PaymentIntentStatus.CAPTURED,
      method: PaymentMethodFamily.CARD,
      capturedMinor: 100n,
      refundedMinor: 100n,
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.code).toBe('PAYMENT_ALREADY_REFUNDED');
    }
  });

  it('allows COD order refund without card capture check', () => {
    expect(
      assessOrderRefundEligibility({
        status: PaymentIntentStatus.CREATED,
        method: PaymentMethodFamily.COD,
        capturedMinor: 0n,
        refundedMinor: 0n,
      }).eligible,
    ).toBe(true);
  });

  it('parses PAYMENT_REFUND_REQUESTED envelope', () => {
    const parsed = parseRefundRequestedEnvelope({
      eventId: 'evt-1',
      eventName: 'PAYMENT_REFUND_REQUESTED',
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      aggregateType: 'PaymentIntent',
      aggregateId: 'pi-1',
      producer: 'order',
      countryId: 'c1',
      correlationId: null,
      causationId: null,
      actorId: 'p1',
      payload: { order_id: 'ord-1', payment_intent_id: 'pi-1' },
      metadata: {},
    });
    expect(parsed.idempotencyKey).toBe('payment-refund-requested:ord-1:pi-1');
  });

  it('rejects aggregate/payment mismatch in envelope', () => {
    expect(() =>
      parseRefundRequestedEnvelope({
        eventId: 'evt-1',
        eventName: 'PAYMENT_REFUND_REQUESTED',
        eventVersion: 1,
        occurredAt: new Date().toISOString(),
        aggregateType: 'PaymentIntent',
        aggregateId: 'pi-1',
        producer: 'order',
        countryId: 'c1',
        correlationId: null,
        causationId: null,
        actorId: 'p1',
        payload: { order_id: 'ord-1', payment_intent_id: 'pi-2' },
        metadata: {},
      }),
    ).toThrow();
  });

  it('resolves REFUNDED when payment is fully refunded', () => {
    expect(
      resolveOrderRefundStatusFromIntent({ capturedMinor: 100n, refundedMinor: 100n }),
    ).toBe(OrderStatus.REFUNDED);
  });

  it('resolves PARTIALLY_REFUNDED when refundable balance remains', () => {
    expect(
      resolveOrderRefundStatusFromIntent({ capturedMinor: 100n, refundedMinor: 40n }),
    ).toBe(OrderStatus.PARTIALLY_REFUNDED);
  });

  it('returns null when no refund has been recorded', () => {
    expect(resolveOrderRefundStatusFromIntent({ capturedMinor: 100n, refundedMinor: 0n })).toBeNull();
  });

  it('parses PAYMENT_REFUNDED envelope', () => {
    const parsed = parsePaymentRefundedEnvelope({
      eventId: 'evt-2',
      eventName: 'PAYMENT_REFUNDED',
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      aggregateType: 'PaymentIntent',
      aggregateId: 'pi-1',
      producer: 'payment',
      countryId: 'c1',
      correlationId: null,
      causationId: null,
      actorId: 'p1',
      payload: { amount_minor: '50', currency: 'XXX', sandbox: true },
      metadata: {},
    });
    expect(parsed.paymentIntentId).toBe('pi-1');
  });
});
