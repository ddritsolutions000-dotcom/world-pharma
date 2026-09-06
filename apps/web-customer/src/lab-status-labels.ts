import type { LabBookingCollection } from './lab-api';

/** Customer-facing lifecycle summary from existing collection/booking fields — no fake states. */
export function labLifecycleSummary(
  bookingStatus: string,
  collection: LabBookingCollection | null,
): { headline: string; detail: string | null } {
  if (bookingStatus === 'CANCELLED') {
    return { headline: 'Booking cancelled', detail: null };
  }
  if (bookingStatus === 'PAYMENT_FAILED') {
    return { headline: 'Payment failed', detail: 'Retry payment or cancel the booking.' };
  }
  if (bookingStatus === 'BOOKED') {
    return { headline: 'Awaiting payment', detail: 'Complete sandbox payment to confirm collection.' };
  }
  if (!collection?.collection_started) {
    return { headline: 'Confirmed', detail: collection?.note ?? 'Collection will be scheduled.' };
  }
  if (collection.report_available || collection.boundary?.results_available) {
    return { headline: 'Report ready', detail: 'Your diagnostic report is available to view.' };
  }
  if (collection.processing_status === 'IN_PROGRESS' || collection.processing_status === 'QUEUED') {
    return { headline: 'Processing', detail: `Lab processing: ${collection.processing_status}` };
  }
  if (collection.lab_received) {
    return { headline: 'Sample at lab', detail: collection.accession_number ? `Accession ${collection.accession_number}` : null };
  }
  if (collection.transport_in_progress) {
    return { headline: 'In transit to lab', detail: 'Sample is being transported to the laboratory.' };
  }
  if (collection.status === 'COLLECTED' || collection.status === 'SEALED' || collection.status === 'HANDED_OVER') {
    return { headline: 'Sample collected', detail: collection.status ? `Chain of custody: ${collection.status}` : null };
  }
  if (collection.status === 'ASSIGNED' || collection.status === 'ACCEPTED' || collection.status === 'ARRIVED') {
    return { headline: 'Collection scheduled', detail: collection.status ? `Status: ${collection.status}` : null };
  }
  return {
    headline: collection.status ?? 'In progress',
    detail: collection.report_status ? `Report pipeline: ${collection.report_status}` : null,
  };
}

/** Visual track steps for customer lab journey (labels only — derived from existing fields). */
export const LAB_TRACK_STEPS = [
  'Payment',
  'Confirmed',
  'Collection',
  'At lab',
  'Processing',
  'Report',
] as const;

export function labTrackStepIndex(
  bookingStatus: string,
  collection: LabBookingCollection | null,
): number {
  if (bookingStatus === 'CANCELLED') return -1;
  if (bookingStatus === 'BOOKED' || bookingStatus === 'PAYMENT_FAILED') return 0;
  if (!collection?.collection_started) return 1;
  if (collection.report_available || collection.boundary?.results_available) return 5;
  if (collection.processing_status === 'IN_PROGRESS' || collection.processing_status === 'QUEUED') return 4;
  if (collection.lab_received) return 3;
  if (
    collection.transport_in_progress ||
    collection.status === 'COLLECTED' ||
    collection.status === 'SEALED' ||
    collection.status === 'HANDED_OVER' ||
    collection.status === 'ASSIGNED' ||
    collection.status === 'ACCEPTED' ||
    collection.status === 'ARRIVED'
  ) {
    return 2;
  }
  return 1;
}

export function labBookingStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    BOOKED: 'Awaiting payment',
    PAYMENT_FAILED: 'Payment failed',
    CONFIRMED: 'Confirmed',
    CANCELLED: 'Cancelled',
    COMPLETED: 'Completed',
  };
  return labels[status] ?? status.replaceAll('_', ' ').toLowerCase();
}
