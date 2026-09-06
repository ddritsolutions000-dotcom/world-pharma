const TERMINAL_SHIPMENT_STATUSES = [
  'DELIVERED',
  'DELIVERY_FAILED',
  'RETURN_TO_ORIGIN',
  'RETURNED',
  'CANCELLED',
  'LOST',
  'DAMAGED',
] as const;

export function shipmentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    READY: 'Ready',
    BOOKING: 'Booking',
    BOOKED: 'Booked',
    LABEL_CREATED: 'Label created',
    PICKUP_SCHEDULED: 'Pickup scheduled',
    PICKED_UP: 'Picked up',
    IN_TRANSIT: 'In transit',
    OUT_FOR_DELIVERY: 'Out for delivery',
    DELIVERED: 'Delivered',
    DELIVERY_FAILED: 'Delivery failed',
    RETURN_TO_ORIGIN: 'Return to origin',
    RETURNED: 'Returned',
    CANCELLED: 'Cancelled',
    BOOKING_FAILED: 'Booking failed',
    BOOKING_UNKNOWN: 'Booking unknown',
  };
  return labels[status] ?? status.replaceAll('_', ' ').toLowerCase();
}

export function isTerminalShipmentStatus(status: string): boolean {
  return (TERMINAL_SHIPMENT_STATUSES as readonly string[]).includes(status);
}
