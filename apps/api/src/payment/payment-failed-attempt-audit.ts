import {
  PaymentAttemptStatus,
  PaymentIntentStatus,
  PaymentMethodFamily,
  Prisma,
} from '@prisma/client';
import type { OutboxService } from '../events/outbox.service';
import { sanitizeObservabilityPayload } from './payment-observability';

export type PreSubmitAttemptAudit = {
  id: string;
  gatewayId: string;
  method: PaymentMethodFamily;
  routingJson: Prisma.InputJsonValue;
  errorCode: string | null;
  createdAt: Date;
};

export type PreSubmitFailureIntentAudit = {
  id: string;
  checkoutSessionId?: string | null;
  checkoutQuoteId?: string | null;
  labBookingId?: string | null;
  imagingBookingId?: string | null;
  customerPersonId: string;
  countryId: string;
  method: PaymentMethodFamily;
  amountMinor: bigint;
  currency: string;
  idempotencyKey: string;
  sandbox: boolean;
};

/** Persist FAILED intent + pre-submit attempts in an autonomous transaction (survives HTTP rollback). */
export async function persistPreSubmitFailureAudit(
  tx: Prisma.TransactionClient,
  outbox: OutboxService,
  input: {
    intent: PreSubmitFailureIntentAudit;
    attempts: PreSubmitAttemptAudit[];
    intentCreatedPayload: Record<string, unknown>;
    failurePayload: Record<string, unknown>;
  },
): Promise<boolean> {
  const existing = await tx.paymentIntent.findUnique({
    where: { id: input.intent.id },
    select: { id: true },
  });
  if (existing) {
    return false;
  }

  await tx.paymentIntent.create({
    data: {
      id: input.intent.id,
      checkoutSessionId: input.intent.checkoutSessionId ?? null,
      checkoutQuoteId: input.intent.checkoutQuoteId ?? null,
      labBookingId: input.intent.labBookingId ?? null,
      imagingBookingId: input.intent.imagingBookingId ?? null,
      customerPersonId: input.intent.customerPersonId,
      countryId: input.intent.countryId,
      method: input.intent.method,
      status: PaymentIntentStatus.FAILED,
      amountMinor: input.intent.amountMinor,
      currency: input.intent.currency,
      idempotencyKey: input.intent.idempotencyKey,
      sandbox: input.intent.sandbox,
      capturedMinor: 0n,
      refundedMinor: 0n,
    },
  });

  for (const attempt of input.attempts) {
    await tx.paymentAttempt.create({
      data: {
        id: attempt.id,
        intentId: input.intent.id,
        gatewayId: attempt.gatewayId,
        method: attempt.method,
        routingJson: attempt.routingJson,
        status: PaymentAttemptStatus.FAILED,
        errorCode: attempt.errorCode,
        submitted: false,
        createdAt: attempt.createdAt,
      },
    });
  }

  await outbox.enqueue(tx, {
    type: 'PAYMENT_INTENT_CREATED',
    aggregateType: 'PaymentIntent',
    aggregateId: input.intent.id,
    producer: 'payment',
    countryId: input.intent.countryId,
    payload: sanitizeObservabilityPayload({ ...input.intentCreatedPayload, sandbox: true }) as Record<string, unknown>,
    occurrenceKey: `PAYMENT_INTENT_CREATED:${input.intent.id}`,
  });

  await outbox.enqueue(tx, {
    type: 'PAYMENT_FAILED',
    aggregateType: 'PaymentIntent',
    aggregateId: input.intent.id,
    producer: 'payment',
    countryId: input.intent.countryId,
    payload: sanitizeObservabilityPayload({
      ...input.failurePayload,
      sandbox: true,
      pre_submit_failure: true,
      failure_outcome: 'PRE_SUBMIT_FAILURE',
    }) as Record<string, unknown>,
    occurrenceKey: `PAYMENT_FAILED:pre_submit:${input.intent.id}`,
  });

  return true;
}
