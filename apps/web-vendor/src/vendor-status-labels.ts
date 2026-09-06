export function vendorSettlementStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    OPEN: 'Open',
    PENDING: 'Pending',
    SCHEDULED: 'Scheduled',
    APPROVED: 'Approved',
    PROCESSING: 'Processing',
    ON_HOLD: 'On hold',
    PAYABLE: 'Payable',
    PAID: 'Paid',
    SETTLED: 'Settled',
    FAILED: 'Failed',
    CANCELLED: 'Cancelled',
    VOID: 'Void',
  };
  return labels[status] ?? status.replaceAll('_', ' ').toLowerCase();
}

export function vendorPayoutStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  const labels: Record<string, string> = {
    CREATED: 'Created',
    PENDING_APPROVAL: 'Pending approval',
    APPROVED: 'Approved',
    SUBMITTED: 'Submitted',
    PAID: 'Paid (sandbox)',
    FAILED: 'Failed',
    UNKNOWN: 'Unknown — needs ops review',
    CANCELLED: 'Cancelled',
  };
  return labels[status] ?? status.replaceAll('_', ' ').toLowerCase();
}

export function vendorPayableStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  const labels: Record<string, string> = {
    OPEN: 'Open',
    HELD: 'Held',
    RELEASED: 'Released',
    PAID: 'Paid',
    BLOCKED: 'Blocked',
  };
  return labels[status] ?? status.replaceAll('_', ' ').toLowerCase();
}
