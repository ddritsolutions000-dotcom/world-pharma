/** Customer-facing labels for imaging booking statuses. */
export function imagingBookingStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    BOOKED: 'Awaiting payment',
    PAYMENT_FAILED: 'Payment failed',
    CONFIRMED: 'Confirmed',
    CANCELLED: 'Cancelled',
    COMPLETED: 'Completed',
    SCHEDULED: 'Scheduled',
  };
  return labels[status] ?? status.replaceAll('_', ' ').toLowerCase();
}

export function imagingProgressLabel(progress: string): string {
  return progress.replaceAll('_', ' ').toLowerCase();
}

/** Visual progress steps from existing progress/boundary fields — no invented states. */
export const IMAGING_TRACK_STEPS = [
  'Payment',
  'Scheduled',
  'Acquisition',
  'Interpretation',
  'Report',
  'Study images',
] as const;

export function imagingTrackStepIndex(input: {
  bookingStatus: string;
  progress?: string | null;
  reportAvailable?: boolean;
  viewerAvailable?: boolean;
  boundary?: {
    acquisition?: boolean;
    interpretation?: boolean;
    report?: boolean;
    viewer?: boolean;
  } | null;
}): number {
  if (input.bookingStatus === 'CANCELLED') return -1;
  if (input.bookingStatus === 'BOOKED' || input.bookingStatus === 'PAYMENT_FAILED') return 0;
  if (input.viewerAvailable || input.boundary?.viewer) return 5;
  if (input.reportAvailable || input.boundary?.report) return 4;
  if (input.boundary?.interpretation) return 3;
  if (input.boundary?.acquisition) return 2;
  const p = (input.progress ?? '').toUpperCase();
  if (p.includes('REPORT') || p.includes('PUBLISH')) return 4;
  if (p.includes('INTERPRET') || p.includes('REVIEW')) return 3;
  if (p.includes('ACQUIR') || p.includes('STUDY') || p.includes('INGEST')) return 2;
  return 1;
}
