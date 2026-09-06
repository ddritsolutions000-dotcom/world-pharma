/** Customer-facing labels for existing OrderStatus values — no new enum. */
export function orderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    CONFIRMED: 'Confirmed',
    ON_HOLD: 'On hold',
    ALLOCATED: 'Processing',
    PICKING: 'Picking items',
    PICKED: 'Items picked',
    PACKING: 'Packing',
    PACKED: 'Packed',
    READY_TO_SHIP: 'Ready to ship',
    SHIPPED: 'Shipped',
    OUT_FOR_DELIVERY: 'Out for delivery',
    DELIVERED: 'Delivered',
    CANCEL_REQUESTED: 'Cancellation requested',
    CANCELLED: 'Cancelled',
    RETURN_REQUESTED: 'Return requested',
    RETURNED: 'Returned',
    REFUND_PENDING: 'Refund pending',
    REFUNDED: 'Refunded',
    PARTIALLY_REFUNDED: 'Partially refunded',
    FAILED: 'Failed',
  };
  return labels[status] ?? status.replaceAll('_', ' ').toLowerCase();
}

const ORDER_TRACK_STEPS = [
  'CONFIRMED',
  'ALLOCATED',
  'PICKING',
  'PACKED',
  'SHIPPED',
  'DELIVERED',
] as const;

export function orderTrackStepIndex(status: string): number {
  if (status === 'DELIVERED') return 5;
  if (status === 'OUT_FOR_DELIVERY' || status === 'SHIPPED') return 4;
  if (status === 'READY_TO_SHIP' || status === 'PACKED') return 3;
  if (status === 'PICKING' || status === 'PICKED' || status === 'PACKING') return 2;
  if (status === 'ALLOCATED') return 1;
  if (status === 'CANCELLED' || status === 'CANCEL_REQUESTED' || status === 'FAILED') return -1;
  return 0;
}

export function orderTrackSteps(): readonly string[] {
  return ORDER_TRACK_STEPS;
}

/** Guest track page stepper — maps existing order statuses only. */
export function guestTrackStepIndex(status: string): number {
  return orderTrackStepIndex(status);
}


export function orderLifecycleSummary(status: string): { headline: string; detail: string | null } {
  if (status === 'DELIVERED') {
    return { headline: 'Delivered', detail: 'Your order has been delivered successfully.' };
  }
  if (status === 'OUT_FOR_DELIVERY') {
    return { headline: 'Out for delivery', detail: 'The courier is on the way to your address.' };
  }
  if (status === 'SHIPPED') {
    return { headline: 'Shipped', detail: 'Your package has left the pharmacy and is with the carrier.' };
  }
  if (status === 'READY_TO_SHIP' || status === 'PACKED') {
    return { headline: 'Ready to ship', detail: 'Your order is packed and awaiting carrier pickup.' };
  }
  if (status === 'PICKING' || status === 'PICKED' || status === 'PACKING') {
    return { headline: 'Being prepared', detail: 'The pharmacy is picking and packing your medicines.' };
  }
  if (status === 'ALLOCATED') {
    return { headline: 'Processing', detail: 'Your order is confirmed and being prepared.' };
  }
  if (status === 'CANCEL_REQUESTED') {
    return { headline: 'Cancellation requested', detail: 'We are processing your cancellation request.' };
  }
  if (status === 'CANCELLED') {
    return { headline: 'Cancelled', detail: 'This order was cancelled.' };
  }
  if (status === 'REFUND_PENDING' || status === 'REFUNDED' || status === 'PARTIALLY_REFUNDED') {
    return { headline: orderStatusLabel(status), detail: 'Refund status is shown in your payment history.' };
  }
  return { headline: orderStatusLabel(status), detail: null };
}
