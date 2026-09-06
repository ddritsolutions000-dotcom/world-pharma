import { apiFetch } from '@world-pharma/shell-core';

export class DoctorApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type DoctorAppointment = {
  id: string;
  status: string;
  starts_at?: string;
  type?: string;
  customer_person_id?: string;
  encounter?: { id: string; status: string } | null;
};

export type DoctorProfile = {
  partner_id?: string;
  country_code?: string | null;
  display_name?: string;
  profile?: { display_name?: string; professional_name?: string; timezone?: string };
};

export type AvailabilityData = {
  timezone?: string;
  windows?: Array<{ id: string; weekday: number; start_local: string; end_local: string }>;
};

export type DoctorCredential = {
  id: string;
  credential_type: string;
  issuer: string;
  number_masked: string;
  status: string;
};

export type ClinicalAccessEvaluation = {
  allowed: boolean;
  reason: string;
};

export type DoctorOrgMembership = {
  organization_id?: string | null;
  organization_name?: string | null;
  role?: string;
  status?: string;
};

export function formatAvailabilitySummary(data: AvailabilityData): string {
  const windows = data.windows ?? [];
  if (!windows.length) {
    return 'No availability windows';
  }
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const first = windows[0]!;
  return `${data.timezone ?? 'UTC'} · ${labels[first.weekday] ?? first.weekday} ${first.start_local}–${first.end_local}${windows.length > 1 ? ` (+${windows.length - 1} more)` : ''}`;
}

export function accessReasonLabel(reason: string): { label: string; state: 'allowed' | 'denied' | 'pending' } {
  if (reason === 'allowed') {
    return { label: 'Access permitted', state: 'allowed' };
  }
  if (reason === 'consent_missing_or_inactive') {
    return { label: 'Pending — patient consent required', state: 'pending' };
  }
  if (reason === 'no_relationship') {
    return { label: 'Denied — no active clinical relationship', state: 'denied' };
  }
  if (reason === 'consent_expired') {
    return { label: 'Denied — consent expired', state: 'denied' };
  }
  if (reason.startsWith('policy_')) {
    return { label: 'Denied — not enabled by country policy', state: 'denied' };
  }
  return { label: `Denied — ${reason}`, state: 'denied' };
}

async function call<T>(path: string, token: string, init: Parameters<typeof apiFetch>[1] = {}): Promise<T> {
  const res = await apiFetch(path, { ...init, accessToken: token });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new DoctorApiError((body as { detail?: string }).detail ?? 'request_failed', res.status);
  }
  return body as T;
}

export function fetchProfile(token: string) {
  return call<DoctorProfile>('api/v1/doctor/me', token);
}

export function fetchAvailability(token: string) {
  return call<AvailabilityData>('api/v1/doctor/me/availability/windows', token);
}

export function saveAvailability(token: string) {
  return call('api/v1/doctor/me/availability/windows', token, {
    method: 'PUT',
    body: JSON.stringify({
      timezone: 'UTC',
      windows: [1, 2, 3, 4, 5].map((weekday) => ({
        weekday,
        start_local: '09:00',
        end_local: '17:00',
        slot_minutes: 30,
        buffer_minutes: 0,
      })),
    }),
  });
}

export function fetchAppointments(token: string) {
  return call<{ appointments: DoctorAppointment[] }>('api/v1/doctor/appointments', token);
}

export function appointmentAction(
  token: string,
  appointmentId: string,
  action: 'check-in' | 'start' | 'complete' | 'confirm',
  body?: Record<string, unknown>,
) {
  return call(`api/v1/doctor/appointments/${appointmentId}/${action}`, token, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function cancelAppointment(token: string, appointmentId: string, reasonCode = 'doctor_cancelled') {
  return call(`api/v1/doctor/appointments/${appointmentId}/cancel`, token, {
    method: 'POST',
    body: JSON.stringify({ reason_code: reasonCode }),
  });
}

export function markAppointmentNoShow(token: string, appointmentId: string) {
  return call(`api/v1/doctor/appointments/${appointmentId}/no-show`, token, { method: 'POST' });
}

export type DoctorEarningsSummary = {
  sandbox: true;
  completed_consult_count: number;
  doctor_payable_minor: string;
  gross_minor: string;
  currency: string;
  settlement_status: string;
  message: string;
};

export function fetchEarningsSummary(token: string) {
  return call<DoctorEarningsSummary>('api/v1/doctor/earnings/summary', token);
}

export function fetchCredentials(token: string) {
  return call<{ credentials: DoctorCredential[] }>('api/v1/doctor/me/credentials', token);
}

export function submitCredential(
  token: string,
  input: { credential_type: string; issuer: string; number: string },
) {
  return call<DoctorCredential>('api/v1/doctor/me/credentials', token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchOrganizations(token: string) {
  return call<{ organizations: DoctorOrgMembership[] }>('api/v1/doctor/me/organizations', token);
}

export function evaluateClinicalAccess(
  token: string,
  input: { patient_person_id: string; purpose: string; country_code: string },
) {
  return call<ClinicalAccessEvaluation>('api/v1/clinical/access/evaluate', token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchNotificationPreferences(token: string) {
  return call<{
    email_enabled?: boolean;
    push_enabled?: boolean;
    appointment_updates?: boolean;
  }>('api/v1/me/notifications/preferences', token);
}

export type DoctorInboxItem = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  reference_type?: string;
  reference_id?: string;
};

export function fetchDoctorInbox(token: string) {
  return call<{ data: DoctorInboxItem[] }>('api/v1/me/notifications/inbox', token);
}

export function markDoctorInboxRead(token: string, id: string) {
  return call(`api/v1/me/notifications/inbox/${id}/read`, token, { method: 'POST' });
}

export type DoctorSupportTicket = {
  id: string;
  subject: string;
  body: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export function fetchDoctorSupportTickets(token: string) {
  return call<{ data: DoctorSupportTicket[] }>('api/v1/support/tickets', token);
}

export function createDoctorSupportTicket(token: string, input: { subject: string; body: string }) {
  return call<DoctorSupportTicket>('api/v1/support/tickets', token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export type PrescriptionLineInput = {
  clinical_concept_code: string;
  clinical_concept_label: string;
  dosage_instructions: string;
  quantity_authorized: string;
};

export type Prescription = {
  id: string;
  status: string;
  encounter_id?: string | null;
  current_version_number?: number | null;
  current_version_id?: string | null;
  created_at?: string;
  dispensing_status?: string | null;
  dispensing_case_id?: string | null;
  commercial_status?: string | null;
  versions?: Array<{
    id: string;
    version_number: number;
    lines?: Array<
      PrescriptionLineInput & {
        line_number?: number;
      }
    >;
  }>;
};

export function newIdempotencyKey(prefix = 'rx'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function fetchPrescriptions(token: string) {
  return call<{ prescriptions: Prescription[] }>('api/v1/doctor/prescriptions', token);
}

export function fetchPrescription(token: string, id: string) {
  return call<Prescription>(`api/v1/doctor/prescriptions/${id}`, token);
}

export function createPrescription(
  token: string,
  input: { encounter_id: string; lines: PrescriptionLineInput[] },
  idempotencyKey: string,
) {
  return call<Prescription>('api/v1/doctor/prescriptions', token, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function issuePrescription(token: string, id: string, idempotencyKey: string) {
  return call<Prescription>(`api/v1/doctor/prescriptions/${id}/issue`, token, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

export type PrescriptionContext = {
  encounter_id: string;
  encounter_status: string;
  appointment_id: string;
  appointment_starts_at?: string;
  appointment_type?: string;
  country_code?: string;
  patient_person_id: string;
  rx_prescribe_enabled: boolean;
  clinical_access_allowed: boolean;
  clinical_access_reason: string;
  od_r5b_02_draft_lines_patch?: string;
  note?: string;
};

export function fetchPrescriptionContext(token: string, encounterId: string) {
  return call<PrescriptionContext>(`api/v1/doctor/encounters/${encounterId}/prescription-context`, token);
}

export function amendPrescription(
  token: string,
  id: string,
  lines: PrescriptionLineInput[],
  idempotencyKey: string,
) {
  return call<Prescription>(`api/v1/doctor/prescriptions/${id}/amend`, token, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ lines }),
  });
}

export function cancelPrescription(
  token: string,
  id: string,
  idempotencyKey: string,
  reasonCode = 'cancel',
) {
  return call<Prescription>(`api/v1/doctor/prescriptions/${id}/cancel`, token, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ reason_code: reasonCode }),
  });
}

export type DoctorRefillRequest = {
  id: string;
  prescription_id: string;
  prescription_version_id: string;
  status: string;
  created_at: string;
  next?: string | null;
};

export function fetchDoctorRefillRequests(token: string) {
  return call<{ requests: DoctorRefillRequest[] }>('api/v1/doctor/refill-requests', token);
}

export function approveDoctorRefillRequest(token: string, id: string, idempotencyKey: string) {
  return call<DoctorRefillRequest>(`api/v1/doctor/refill-requests/${id}/approve`, token, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({}),
  });
}

export function rejectDoctorRefillRequest(token: string, id: string, idempotencyKey: string, reasonCode = 'doctor_rejected') {
  return call<DoctorRefillRequest>(`api/v1/doctor/refill-requests/${id}/reject`, token, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ reason_code: reasonCode }),
  });
}
