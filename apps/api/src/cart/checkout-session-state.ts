import { CheckoutStatus, Prisma } from '@prisma/client';
import type { OutboxService } from '../events/outbox.service';
import { Errors } from '../common/problem';

export type CheckoutPaymentOutcome = 'paid' | 'pre_submit_failed' | 'order_creation_failed';

const RETRYABLE_PAY_STATUSES: readonly CheckoutStatus[] = [
  CheckoutStatus.READY_FOR_PAYMENT,
  CheckoutStatus.QUOTED,
  CheckoutStatus.FAILED,
];

const PAID_FROM_STATUSES: readonly CheckoutStatus[] = [
  CheckoutStatus.READY_FOR_PAYMENT,
  CheckoutStatus.QUOTED,
  CheckoutStatus.FAILED,
];

/** Checkout sessions that may enter pay (including idempotent replay on PAID). */
export function isCheckoutSessionPayable(status: CheckoutStatus): boolean {
  return RETRYABLE_PAY_STATUSES.includes(status) || status === CheckoutStatus.PAID;
}

export function resolveCheckoutSessionPaymentTarget(
  current: CheckoutStatus,
  outcome: CheckoutPaymentOutcome,
): CheckoutStatus | null {
  if (current === CheckoutStatus.CANCELLED || current === CheckoutStatus.EXPIRED) {
    return null;
  }
  if (outcome === 'paid') {
    if (current === CheckoutStatus.PAID) {
      return null;
    }
    if (!PAID_FROM_STATUSES.includes(current)) {
      return null;
    }
    return CheckoutStatus.PAID;
  }
  if (outcome === 'order_creation_failed') {
    if (current === CheckoutStatus.PAID) {
      return CheckoutStatus.FAILED;
    }
    if (current === CheckoutStatus.FAILED) {
      return null;
    }
    if (current === CheckoutStatus.READY_FOR_PAYMENT || current === CheckoutStatus.QUOTED) {
      return CheckoutStatus.FAILED;
    }
    return null;
  }
  if (current === CheckoutStatus.PAID) {
    return null;
  }
  if (current === CheckoutStatus.FAILED) {
    return null;
  }
  if (current === CheckoutStatus.READY_FOR_PAYMENT || current === CheckoutStatus.QUOTED) {
    return CheckoutStatus.FAILED;
  }
  return null;
}

/** Align checkout session status with a terminal payment outcome (same tx as payment side effects). */
export async function applyCheckoutSessionPaymentOutcome(
  tx: Prisma.TransactionClient,
  outbox: OutboxService,
  input: {
    checkoutSessionId: string;
    customerPersonId: string;
    countryId: string;
    paymentIntentId: string;
    outcome: CheckoutPaymentOutcome;
  },
): Promise<{ status: CheckoutStatus; changed: boolean }> {
  const session = await tx.checkoutSession.findUnique({ where: { id: input.checkoutSessionId } });
  if (!session) {
    return { status: CheckoutStatus.EXPIRED, changed: false };
  }
  if (session.customerPersonId !== input.customerPersonId) {
    throw Errors.forbidden('You cannot update another customer’s checkout session.');
  }
  if (session.countryId !== input.countryId) {
    throw Errors.forbidden('Checkout session country does not match payment scope.');
  }

  const target = resolveCheckoutSessionPaymentTarget(session.status, input.outcome);
  if (!target || target === session.status) {
    return { status: session.status, changed: false };
  }

  await tx.checkoutSession.update({
    where: { id: session.id },
    data: { status: target },
  });

  if (target === CheckoutStatus.PAID) {
    await outbox.enqueue(tx, {
      type: 'CHECKOUT_SESSION_PAID',
      aggregateType: 'CheckoutSession',
      aggregateId: session.id,
      producer: 'cart',
      countryId: input.countryId,
      actorId: input.customerPersonId,
      payload: {
        payment_intent_id: input.paymentIntentId,
        checkout_status: target,
      },
      occurrenceKey: `checkout-session-paid:${input.paymentIntentId}`,
    });
  }

  return { status: target, changed: true };
}
