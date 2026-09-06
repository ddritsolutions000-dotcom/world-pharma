/** Admin-facing labels for support ticket statuses. */
export function supportTicketStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    OPEN: 'Open',
    ASSIGNED: 'Assigned',
    IN_PROGRESS: 'In progress',
    WAITING_CUSTOMER: 'Waiting on customer',
    RESOLVED: 'Resolved',
    CLOSED: 'Closed',
  };
  return labels[status] ?? status.replaceAll('_', ' ').toLowerCase();
}
