import { OrderStatus, PaymentIntentStatus, PaymentMethodFamily } from '@prisma/client';
import type { EventEnvelope } from '../events/envelope';

export type RefundEligibility =
  | { eligible: true }
  | { eligible: false; code: string; title: string; detail: string };

/**
 * Provider-neutral order↔payment refund alignment.
 * Prevents order REFUND_PENDING when the linked payment is not refundable.
 */
export function assessOrderRefundEligibility(
  intent: {
    status: PaymentIntentStatus;
    method: PaymentMethodFamily;
    capturedMinor: bigint;
    refundedMinor: bigint;
  } | null,
): RefundEligibility {
  if (!intent) {
    return { eligible: true };
  }
  if (intent.method === PaymentMethodFamily.COD) {
    return { eligible: true };
  }
  if (intent.status !== PaymentIntentStatus.CAPTURED) {
    return {
      eligible: false,
      code: 'PAYMENT_NOT_REFUNDABLE',
      title: 'Payment not refundable',
      detail: `Order refund requires payment status CAPTURED; current payment status is ${intent.status}.`,
    };
  }
  if (intent.capturedMinor - intent.refundedMinor <= 0n) {
    return {
      eligible: false,
      code: 'PAYMENT_ALREADY_REFUNDED',
      title: 'Payment already refunded',
      detail: 'No refundable balance remains on the linked payment intent.',
    };
  }
  return { eligible: true };
}

export type ParsedRefundRequestedEvent = {
  orderId: string;
  paymentIntentId: string;
  idempotencyKey: string;
};

/** Validates PAYMENT_REFUND_REQUESTED envelope fields before payment lookup. */
export function parseRefundRequestedEnvelope(envelope: EventEnvelope): ParsedRefundRequestedEvent {
  const paymentIntentId =
    typeof envelope.payload['payment_intent_id'] === 'string'
      ? envelope.payload['payment_intent_id']
      : envelope.aggregateId;
  const orderId = typeof envelope.payload['order_id'] === 'string' ? envelope.payload['order_id'] : '';
  if (!orderId || !paymentIntentId) {
    throw new Error('PAYMENT_REFUND_REQUESTED requires order_id and payment_intent_id.');
  }
  if (paymentIntentId !== envelope.aggregateId) {
    throw new Error('PAYMENT_REFUND_REQUESTED aggregateId must match payment_intent_id.');
  }
  return {
    orderId,
    paymentIntentId,
    idempotencyKey: `payment-refund-requested:${orderId}:${paymentIntentId}`,
  };
}

/** Maps post-refund payment balances to the corresponding order status. */
export function resolveOrderRefundStatusFromIntent(intent: {
  capturedMinor: bigint;
  refundedMinor: bigint;
}): OrderStatus | null {
  if (intent.refundedMinor <= 0n) {
    return null;
  }
  const remaining = intent.capturedMinor - intent.refundedMinor;
  return remaining <= 0n ? OrderStatus.REFUNDED : OrderStatus.PARTIALLY_REFUNDED;
}

export type ParsedPaymentRefundedEvent = {
  paymentIntentId: string;
};

/** Validates PAYMENT_REFUNDED envelope before order lookup. */
export function parsePaymentRefundedEnvelope(envelope: EventEnvelope): ParsedPaymentRefundedEvent {
  if (envelope.eventName !== 'PAYMENT_REFUNDED') {
    throw new Error('Expected PAYMENT_REFUNDED envelope.');
  }
  if (envelope.aggregateType !== 'PaymentIntent') {
    throw new Error('PAYMENT_REFUNDED aggregateType must be PaymentIntent.');
  }
  if (!envelope.aggregateId) {
    throw new Error('PAYMENT_REFUNDED requires aggregateId (payment intent id).');
  }
  return { paymentIntentId: envelope.aggregateId };
}
