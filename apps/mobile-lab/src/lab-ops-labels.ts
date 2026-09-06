export function labOpsStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  const labels: Record<string, string> = {
    PENDING: 'Pending',
    CONFIRMED: 'Confirmed',
    SCHEDULED: 'Scheduled',
    CANCELLED: 'Cancelled',
    COMPLETED: 'Completed',
    ASSIGNED: 'Assigned',
    ACCEPTED: 'Accepted',
    ARRIVED: 'Arrived',
    VERIFIED: 'Customer verified',
    COLLECTED: 'Specimen collected',
    SEALED: 'Sealed',
    HANDED_OVER: 'Handed over',
    IN_TRANSIT: 'In transit',
    LAB_RECEIVED: 'Received at lab',
    ACCEPTED_BY_LAB: 'Accepted by lab',
    PROCESSING: 'Processing',
    QUEUED: 'Queued',
    IN_PROGRESS: 'In progress',
    ON_HOLD: 'On hold',
    FAILED: 'Failed',
    REJECTED: 'Rejected',
    DRAFT: 'Draft',
    PENDING_VERIFY: 'Pending verification',
    PUBLISHED: 'Published',
    SUPERSEDED: 'Superseded',
  };
  return labels[status] ?? status.replaceAll('_', ' ').toLowerCase();
}

export function labCollectionModeLabel(mode: string | null | undefined): string {
  if (!mode) return '—';
  if (mode === 'HOME') return 'Home collection';
  if (mode === 'LAB' || mode === 'CENTRE' || mode === 'CENTER') return 'Lab visit';
  return mode.replaceAll('_', ' ').toLowerCase();
}
