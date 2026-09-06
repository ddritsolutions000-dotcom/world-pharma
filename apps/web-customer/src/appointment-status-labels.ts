/** Customer/doctor-facing labels for existing AppointmentStatus values — no new enum. */
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

export function appointmentLifecycleSummary(input: {
  status: string;
  starts_at?: string | null;
  encounter_status?: string | null;
}): { headline: string; detail: string | null } {
  const { status, starts_at, encounter_status } = input;
  if (status === 'CANCELLED') {
    return { headline: 'Appointment cancelled', detail: null };
  }
  if (status === 'NO_SHOW') {
    return { headline: 'Missed appointment', detail: 'The visit was marked as a no-show.' };
  }
  if (status === 'FAILED') {
    return { headline: 'Appointment failed', detail: 'Contact support if you need assistance.' };
  }
  if (status === 'COMPLETED') {
    return { headline: 'Consultation completed', detail: 'Prescriptions and records appear in Health when available.' };
  }
  if (status === 'IN_CONSULTATION') {
    return { headline: 'In consultation', detail: encounter_status ? `Encounter: ${encounter_status}` : null };
  }
  if (status === 'CHECKED_IN') {
    return { headline: 'Checked in', detail: 'Your visit is ready to begin.' };
  }
  if (status === 'RESCHEDULE_REQUESTED') {
    return { headline: 'Reschedule pending', detail: 'Awaiting confirmation of the new time.' };
  }
  if (status === 'RESCHEDULED') {
    return { headline: 'Rescheduled', detail: starts_at ? `New time: ${starts_at}` : null };
  }
  if (status === 'CONFIRMED') {
    return { headline: 'Upcoming', detail: starts_at ? `Scheduled: ${starts_at}` : 'Your appointment is confirmed.' };
  }
  if (status === 'REQUESTED') {
    return { headline: 'Requested', detail: 'Awaiting confirmation from the doctor or clinic.' };
  }
  return { headline: appointmentStatusLabel(status), detail: null };
}
