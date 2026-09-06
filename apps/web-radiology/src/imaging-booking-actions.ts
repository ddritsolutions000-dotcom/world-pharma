/** Imaging booking inbox helpers — mirrors backend ImagingBookingStatus. */
export type ImagingBookingFilter = 'all' | 'active' | 'confirmed' | 'cancelled';

export function imagingBookingStatusFilter(status: string, filter: ImagingBookingFilter): boolean {
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

export function imagingBookingNextStep(status: string): string | null {
  switch (status.toUpperCase()) {
    case 'BOOKED':
      return 'Customer must complete sandbox payment before check-in is available.';
    case 'CONFIRMED':
      return 'Use Check-in tab to create the imaging study, then Studies tab for acquisition.';
    case 'PAYMENT_FAILED':
      return 'Customer can retry payment from their imaging bookings page.';
    case 'CANCELLED':
    case 'EXPIRED':
      return null;
    default:
      return null;
  }
}
