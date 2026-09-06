/** Customer-facing labels for existing ShipmentStatus values — no new enum. */
export function shipmentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Preparing',
    READY: 'Ready for carrier booking',
    BOOKING: 'Booking with carrier',
    BOOKED: 'Booked',
    LABEL_CREATED: 'Label created',
    PICKUP_SCHEDULED: 'Pickup scheduled',
    PICKED_UP: 'Picked up',
    IN_TRANSIT: 'In transit',
    OUT_FOR_DELIVERY: 'Out for delivery',
    DELIVERED: 'Delivered',
    BOOKING_FAILED: 'Booking failed',
    BOOKING_UNKNOWN: 'Booking pending confirmation',
    DELIVERY_FAILED: 'Delivery failed',
    RETURN_TO_ORIGIN: 'Returning to sender',
    RETURNED: 'Returned',
    LOST: 'Lost',
    DAMAGED: 'Damaged',
    CANCEL_REQUESTED: 'Cancellation requested',
    CANCELLED: 'Cancelled',
    HANDOFF_PENDING: 'Handoff pending',
  };
  return labels[status] ?? status.replaceAll('_', ' ').toLowerCase();
}

export function shipmentLifecycleSummary(status: string): { headline: string; detail: string | null } {
  if (status === 'DELIVERED') {
    return { headline: 'Delivered', detail: 'Your order has been delivered.' };
  }
  if (status === 'OUT_FOR_DELIVERY') {
    return { headline: 'Out for delivery', detail: 'The courier is on the way.' };
  }
  if (status === 'IN_TRANSIT') {
    return { headline: 'In transit', detail: 'Your package is moving through the carrier network.' };
  }
  if (status === 'PICKED_UP') {
    return { headline: 'Picked up', detail: 'The carrier has collected your package.' };
  }
  if (status === 'PICKUP_SCHEDULED') {
    return { headline: 'Pickup scheduled', detail: 'Awaiting carrier pickup from the seller.' };
  }
  if (status === 'LABEL_CREATED' || status === 'BOOKED') {
    return { headline: 'Ready for pickup', detail: 'The seller has prepared your shipment.' };
  }
  if (status === 'BOOKING' || status === 'READY' || status === 'DRAFT') {
    return { headline: 'Preparing shipment', detail: 'Your order is being prepared for delivery.' };
  }
  if (status === 'DELIVERY_FAILED') {
    return { headline: 'Delivery issue', detail: 'Delivery could not be completed. Check updates below.' };
  }
  if (status === 'RETURN_TO_ORIGIN' || status === 'RETURNED') {
    return { headline: 'Return in progress', detail: 'The shipment is being returned.' };
  }
  if (status === 'CANCELLED' || status === 'CANCEL_REQUESTED') {
    return { headline: 'Cancelled', detail: null };
  }
  if (status === 'BOOKING_FAILED' || status === 'FAILED') {
    return { headline: 'Shipment issue', detail: 'There was a problem booking the shipment.' };
  }
  return { headline: shipmentStatusLabel(status), detail: null };
}
