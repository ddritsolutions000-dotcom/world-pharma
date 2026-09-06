/** Admin-facing labels for appointment statuses. */
export function appointmentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    REQUESTED: 'Requested',
    CONFIRMED: 'Confirmed',
    RESCHEDULE_REQUESTED: 'Reschedule requested',
    RESCHEDULED: 'Rescheduled',
    CHECKED_IN: 'Checked in',
    IN_CONSULTATION: 'In consultation',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    NO_SHOW: 'No show',
    FAILED: 'Failed',
  };
  return labels[status] ?? status.replaceAll('_', ' ').toLowerCase();
}
