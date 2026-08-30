import { InventoryReservationStatus, Prisma } from '@prisma/client';
import type { OutboxService } from '../events/outbox.service';
import { Errors } from '../common/problem';

export type CheckoutReservationReleaseStatus = 'released' | 'already_released' | 'none';

export type CheckoutReservationReleaseResult = {
  status: CheckoutReservationReleaseStatus;
  released_reservation_ids: string[];
};

type ReleaseReservationFn = (
  tx: Prisma.TransactionClient,
  reservation: {
    id: string;
    lotId: string | null;
    qty: number;
    ownerOrgId: string;
    locationId: string;
    variantId: string;
  },
  idempotencyKey: string,
  actorPersonId: string,
  status: InventoryReservationStatus,
) => Promise<unknown>;

/** Release checkout holds after a terminal pre-submit payment failure (same autonomous tx as audit persist). */
export async function releaseCheckoutReservationsForPaymentFailure(
  tx: Prisma.TransactionClient,
  outbox: OutboxService,
  releaseReservation: ReleaseReservationFn,
  input: {
    checkoutSessionId: string;
    customerPersonId: string;
    countryId: string;
    paymentIntentId: string;
  },
): Promise<CheckoutReservationReleaseResult> {
  const session = await tx.checkoutSession.findUnique({ where: { id: input.checkoutSessionId } });
  if (!session) {
    return { status: 'none', released_reservation_ids: [] };
  }
  if (session.customerPersonId !== input.customerPersonId) {
    throw Errors.forbidden('You cannot release another customer’s checkout reservation.');
  }
  if (session.countryId !== input.countryId) {
    throw Errors.forbidden('Checkout reservation country does not match payment scope.');
  }
  if (session.skipInventoryHold || !session.reservationIds.length) {
    return { status: 'already_released', released_reservation_ids: [] };
  }

  const released: string[] = [];
  for (const reservationId of session.reservationIds) {
    const reservation = await tx.inventoryReservation.findUnique({ where: { id: reservationId } });
    if (!reservation || reservation.status !== InventoryReservationStatus.OPEN) {
      continue;
    }
    await releaseReservation(
      tx,
      reservation,
      `payment-failed:${input.paymentIntentId}:${reservationId}`,
      input.customerPersonId,
      InventoryReservationStatus.RELEASED,
    );
    released.push(reservationId);
  }

  await tx.checkoutSession.update({
    where: { id: session.id },
    data: { reservationIds: [] },
  });

  if (released.length) {
    await outbox.enqueue(tx, {
      type: 'CHECKOUT_PAYMENT_FAILED_RESERVATION_RELEASED',
      aggregateType: 'CheckoutSession',
      aggregateId: session.id,
      producer: 'inventory',
      actorId: input.customerPersonId,
      countryId: input.countryId,
      payload: {
        payment_intent_id: input.paymentIntentId,
        released_reservation_ids: released,
        reservation_release: 'released',
      },
      occurrenceKey: `checkout-payment-failed-release:${input.paymentIntentId}`,
    });
  }

  return {
    status: released.length ? 'released' : 'already_released',
    released_reservation_ids: released,
  };
}
