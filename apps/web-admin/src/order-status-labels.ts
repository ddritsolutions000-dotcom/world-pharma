/** Admin-facing order status labels — maps existing enum values only. */
export function orderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    PLACED: 'Placed',
    PAYMENT_PENDING: 'Payment pending',
    CONFIRMED: 'Confirmed',
    ALLOCATED: 'Allocated',
    PICKING: 'Picking',
    PICKED: 'Picked',
    PACKING: 'Packing',
    PACKED: 'Packed',
    READY_TO_SHIP: 'Ready to ship',
    SHIPPED: 'Shipped',
    OUT_FOR_DELIVERY: 'Out for delivery',
    DELIVERED: 'Delivered',
    PAID: 'Paid',
    FULFILLMENT: 'Fulfillment',
    CANCELLED: 'Cancelled',
    CANCEL_REQUESTED: 'Cancel requested',
    REFUNDED: 'Refunded',
    REFUND_PENDING: 'Refund pending',
    PAYMENT_FAILED: 'Payment failed',
    ON_HOLD: 'On hold',
  };
  return labels[status] ?? status.replaceAll('_', ' ').toLowerCase();
}

/** Suggested next fulfillment action for admin toolbar — server still enforces transitions. */
export function orderNextFulfillmentAction(status: string):
  | 'pick/start'
  | 'pick/complete'
  | 'pack/start'
  | 'pack/complete'
  | null {
  if (status === 'CONFIRMED' || status === 'ALLOCATED') {
    return 'pick/start';
  }
  if (status === 'PICKING') {
    return 'pick/complete';
  }
  if (status === 'PICKED') {
    return 'pack/start';
  }
  if (status === 'PACKING') {
    return 'pack/complete';
  }
  return null;
}
