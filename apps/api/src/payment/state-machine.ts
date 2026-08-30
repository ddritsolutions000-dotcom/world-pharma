import { PaymentIntentStatus, RefundStatus } from '@prisma/client';

const INTENT: Record<PaymentIntentStatus, PaymentIntentStatus[]> = {
  CREATED: [
    PaymentIntentStatus.REQUIRES_ACTION,
    PaymentIntentStatus.PROCESSING,
    PaymentIntentStatus.AUTHORIZED,
    PaymentIntentStatus.AUTHORIZED_COD,
    PaymentIntentStatus.CAPTURED,
    PaymentIntentStatus.FAILED,
    PaymentIntentStatus.CANCELLED,
    PaymentIntentStatus.EXPIRED,
    PaymentIntentStatus.UNKNOWN,
  ],
  REQUIRES_ACTION: [
    PaymentIntentStatus.PROCESSING,
    PaymentIntentStatus.AUTHORIZED,
    PaymentIntentStatus.CAPTURED,
    PaymentIntentStatus.FAILED,
    PaymentIntentStatus.CANCELLED,
    PaymentIntentStatus.EXPIRED,
    PaymentIntentStatus.UNKNOWN,
  ],
  PROCESSING: [
    PaymentIntentStatus.AUTHORIZED,
    PaymentIntentStatus.CAPTURED,
    PaymentIntentStatus.FAILED,
    PaymentIntentStatus.UNKNOWN,
    PaymentIntentStatus.CANCELLED,
  ],
  AUTHORIZED: [
    PaymentIntentStatus.CAPTURED,
    PaymentIntentStatus.CANCELLED,
    PaymentIntentStatus.EXPIRED,
    PaymentIntentStatus.FAILED,
  ],
  AUTHORIZED_COD: [PaymentIntentStatus.CANCELLED, PaymentIntentStatus.EXPIRED],
  CAPTURED: [],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
  UNKNOWN: [
    PaymentIntentStatus.AUTHORIZED,
    PaymentIntentStatus.CAPTURED,
    PaymentIntentStatus.FAILED,
    PaymentIntentStatus.CANCELLED,
  ],
};

const REFUND: Record<RefundStatus, RefundStatus[]> = {
  REQUESTED: [RefundStatus.PROCESSING, RefundStatus.FAILED],
  PROCESSING: [RefundStatus.REFUNDED, RefundStatus.FAILED],
  REFUNDED: [],
  FAILED: [],
};

export function canTransitionIntent(from: PaymentIntentStatus, to: PaymentIntentStatus): boolean {
  return from === to || (INTENT[from]?.includes(to) ?? false);
}

export function canTransitionRefund(from: RefundStatus, to: RefundStatus): boolean {
  return from === to || (REFUND[from]?.includes(to) ?? false);
}

export function assertIntentTransition(from: PaymentIntentStatus, to: PaymentIntentStatus): void {
  if (!canTransitionIntent(from, to)) {
    throw Object.assign(new Error(`Illegal payment transition ${from} → ${to}`), {
      status: 409,
      code: 'ILLEGAL_PAYMENT_TRANSITION',
    });
  }
}

export const TERMINAL_INTENTS: PaymentIntentStatus[] = [
  PaymentIntentStatus.CAPTURED,
  PaymentIntentStatus.FAILED,
  PaymentIntentStatus.CANCELLED,
  PaymentIntentStatus.EXPIRED,
];
