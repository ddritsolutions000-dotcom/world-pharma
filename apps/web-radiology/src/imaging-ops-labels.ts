export function imagingBookingStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  const labels: Record<string, string> = {
    BOOKED: 'Booked (awaiting payment)',
    PAYMENT_FAILED: 'Payment failed',
    CONFIRMED: 'Confirmed',
    CANCELLED: 'Cancelled',
    EXPIRED: 'Expired',
    COMPLETED: 'Completed',
    SCHEDULED: 'Scheduled',
  };
  return labels[status] ?? status.replaceAll('_', ' ').toLowerCase();
}

export function imagingStudyStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  const labels: Record<string, string> = {
    SCHEDULED: 'Scheduled',
    CHECKED_IN: 'Checked in',
    ACQUISITION_IN_PROGRESS: 'Acquisition in progress',
    ACQUIRED: 'Acquired',
    ACQUISITION_FAILED: 'Acquisition failed',
    CANCELLED: 'Cancelled',
  };
  return labels[status] ?? status.replaceAll('_', ' ').toLowerCase();
}
