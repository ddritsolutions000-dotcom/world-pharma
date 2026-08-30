import { PaymentIntentStatus } from '@prisma/client';

/** Successful checkout payment — repeat pay returns the existing intent. */
export const CHECKOUT_PAY_SUCCESS_STATUSES: readonly PaymentIntentStatus[] = [
  PaymentIntentStatus.CAPTURED,
  PaymentIntentStatus.AUTHORIZED_COD,
];

/** Non-failed in-progress checkout payment — must not create a parallel intent. */
export const CHECKOUT_PAY_BLOCK_NEW_INTENT_STATUSES: readonly PaymentIntentStatus[] = [
  PaymentIntentStatus.CREATED,
  PaymentIntentStatus.PROCESSING,
  PaymentIntentStatus.REQUIRES_ACTION,
  PaymentIntentStatus.AUTHORIZED,
  PaymentIntentStatus.UNKNOWN,
];

export type CheckoutPayGuardDecision =
  | { action: 'proceed' }
  | { action: 'return_existing'; intentId: string; alreadyPaid: true }
  | { action: 'return_existing'; intentId: string; alreadyPaid: false }
  | { action: 'reject_in_flight'; intentId: string };

export function resolveCheckoutPayGuard(
  intents: Array<{ id: string; status: PaymentIntentStatus; createdAt: Date }>,
): CheckoutPayGuardDecision {
  if (!intents.length) {
    return { action: 'proceed' };
  }
  const ordered = [...intents].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const successful = ordered.find((row) => CHECKOUT_PAY_SUCCESS_STATUSES.includes(row.status));
  if (successful) {
    return { action: 'return_existing', intentId: successful.id, alreadyPaid: true };
  }

  const blocking = ordered.find((row) => CHECKOUT_PAY_BLOCK_NEW_INTENT_STATUSES.includes(row.status));
  if (blocking) {
    if (
      blocking.status === PaymentIntentStatus.CREATED ||
      blocking.status === PaymentIntentStatus.PROCESSING
    ) {
      return { action: 'reject_in_flight', intentId: blocking.id };
    }
    return { action: 'return_existing', intentId: blocking.id, alreadyPaid: false };
  }

  return { action: 'proceed' };
}
