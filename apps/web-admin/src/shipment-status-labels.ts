/** Admin-facing labels for existing ShipmentStatus values. */
export function shipmentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Preparing',
    READY: 'Ready for booking',
    BOOKING: 'Booking',
    BOOKED: 'Booked',
    LABEL_CREATED: 'Label created',
    PICKUP_SCHEDULED: 'Pickup scheduled',
    PICKED_UP: 'Picked up',
    IN_TRANSIT: 'In transit',
    OUT_FOR_DELIVERY: 'Out for delivery',
    DELIVERED: 'Delivered',
    BOOKING_FAILED: 'Booking failed',
    RETURN_TO_ORIGIN: 'Return to origin',
    RETURNED: 'Returned',
    CANCELLED: 'Cancelled',
  };
  return labels[status] ?? status.replaceAll('_', ' ').toLowerCase();
}
