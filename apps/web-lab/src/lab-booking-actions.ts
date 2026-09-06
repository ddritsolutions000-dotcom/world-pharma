/** Lab booking inbox helpers — mirrors backend LabBookingStatus (no parallel state machine). */
export type LabBookingFilter = 'all' | 'active' | 'confirmed' | 'cancelled';

export function labBookingStatusFilter(status: string, filter: LabBookingFilter): boolean {
  if (filter === 'all') {
    return true;
  }
  const normalized = status.toUpperCase();
  if (filter === 'confirmed') {
    return normalized === 'CONFIRMED';
  }
  if (filter === 'cancelled') {
    return normalized === 'CANCELLED' || normalized === 'EXPIRED' || normalized === 'PAYMENT_FAILED';
  }
  return normalized === 'BOOKED' || normalized === 'CONFIRMED';
}

export function labBookingNextStep(status: string): string | null {
  switch (status.toUpperCase()) {
    case 'BOOKED':
      return 'Customer must complete sandbox payment before collection is enqueued.';
    case 'CONFIRMED':
      return 'Collection queue on Collections tab — assign phlebotomist via admin if home collection.';
    case 'PAYMENT_FAILED':
      return 'Customer can retry payment from their bookings page.';
    case 'CANCELLED':
    case 'EXPIRED':
      return null;
    default:
      return null;
  }
}
