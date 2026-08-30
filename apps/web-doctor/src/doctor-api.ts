import { apiCall, type ApiCallResult } from '@world-pharma/shell-core';

type TokenOpts = {
  token: string;
  onUnauthorized?: () => void;
};

export type DoctorCredential = {
  id: string;
  credential_type: string;
  issuer: string;
  number_masked: string;
  issued_on: string | null;
  expires_on: string | null;
  status: string;
  has_document: boolean;
};

export type DoctorMe = {
  partner_id: string;
  country_code: string | null;
  profile?: { display_name?: string };
};

export type ClinicalAccessEvaluation = {
  allowed: boolean;
  reason: string;
  doctor_partner_id?: string | null;
};

export function fetchDoctorCredentials(
  opts: TokenOpts,
): Promise<ApiCallResult<{ credentials: DoctorCredential[] }>> {
  return apiCall<{ credentials: DoctorCredential[] }>('api/v1/doctor/me/credentials', {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
  });
}

export function submitDoctorCredential(
  opts: TokenOpts & {
    credential_type: string;
    issuer: string;
    number: string;
    issued_on?: string;
    expires_on?: string;
  },
): Promise<ApiCallResult<DoctorCredential>> {
  const { token, onUnauthorized, ...body } = opts;
  return apiCall<DoctorCredential>('api/v1/doctor/me/credentials', {
    method: 'POST',
    token,
    onUnauthorized,
    body,
  });
}

export function fetchDoctorMe(opts: TokenOpts): Promise<ApiCallResult<DoctorMe>> {
  return apiCall<DoctorMe>('api/v1/doctor/me', {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
  });
}

export function evaluateClinicalAccess(
  opts: TokenOpts & { patient_person_id: string; purpose: string; country_code: string },
): Promise<ApiCallResult<ClinicalAccessEvaluation>> {
  const { token, onUnauthorized, patient_person_id, purpose, country_code } = opts;
  return apiCall<ClinicalAccessEvaluation>('api/v1/clinical/access/evaluate', {
    method: 'POST',
    token,
    onUnauthorized,
    body: { patient_person_id, purpose, country_code },
  });
}

export type PrescriptionLineInput = {
  clinical_concept_code: string;
  clinical_concept_label: string;
  dosage_instructions: string;
  quantity_authorized: string;
  quantity_unit?: string;
};

export type PrescriptionLine = PrescriptionLineInput & {
  line_number?: number;
  strength_text?: string | null;
  form_text?: string | null;
  route_text?: string | null;
};

export type PrescriptionVersion = {
  id: string;
  version_number: number;
  sealed_at?: string | null;
  lines?: PrescriptionLine[];
};

export type Prescription = {
  id: string;
  status: string;
  origin?: string;
  encounter_id?: string | null;
  current_version_id?: string | null;
  current_version_number?: number | null;
  created_at?: string;
  cancelled_at?: string | null;
  dispensing_status?: string | null;
  dispensing_case_id?: string | null;
  commercial_status?: string | null;
  versions?: PrescriptionVersion[];
  status_history?: Array<{
    from_status: string | null;
    to_status: string;
    reason_code?: string | null;
    created_at: string;
  }>;
};

export function newIdempotencyKey(prefix = 'rx'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}`;
}

export function fetchDoctorPrescriptions(
  opts: TokenOpts,
): Promise<ApiCallResult<{ prescriptions: Prescription[] }>> {
  return apiCall<{ prescriptions: Prescription[] }>('api/v1/doctor/prescriptions', {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
  });
}

export function fetchDoctorPrescription(
  opts: TokenOpts & { id: string },
): Promise<ApiCallResult<Prescription>> {
  return apiCall<Prescription>(`api/v1/doctor/prescriptions/${opts.id}`, {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
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

export function fetchPrescriptionContext(
  opts: TokenOpts & { encounterId: string },
): Promise<ApiCallResult<PrescriptionContext>> {
  return apiCall<PrescriptionContext>(`api/v1/doctor/encounters/${opts.encounterId}/prescription-context`, {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
  });
}

export function fetchDoctorAppointments(
  opts: TokenOpts,
): Promise<ApiCallResult<{ appointments: Array<{ id: string; status: string; starts_at?: string; encounter?: { id: string; status: string } | null }> }>> {
  return apiCall('api/v1/doctor/appointments', {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
  });
}

export function createDoctorPrescription(
  opts: TokenOpts & {
    encounter_id: string;
    lines: PrescriptionLineInput[];
    idempotencyKey: string;
  },
): Promise<ApiCallResult<Prescription>> {
  const { token, onUnauthorized, idempotencyKey, encounter_id, lines } = opts;
  return apiCall<Prescription>('api/v1/doctor/prescriptions', {
    method: 'POST',
    token,
    onUnauthorized,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: { encounter_id, lines },
  });
}

export function issueDoctorPrescription(
  opts: TokenOpts & { id: string; idempotencyKey: string },
): Promise<ApiCallResult<Prescription>> {
  return apiCall<Prescription>(`api/v1/doctor/prescriptions/${opts.id}/issue`, {
    method: 'POST',
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
    headers: { 'Idempotency-Key': opts.idempotencyKey },
  });
}

export function amendDoctorPrescription(
  opts: TokenOpts & { id: string; lines: PrescriptionLineInput[]; idempotencyKey: string },
): Promise<ApiCallResult<Prescription>> {
  return apiCall<Prescription>(`api/v1/doctor/prescriptions/${opts.id}/amend`, {
    method: 'POST',
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
    headers: { 'Idempotency-Key': opts.idempotencyKey },
    body: { lines: opts.lines },
  });
}

export function cancelDoctorPrescription(
  opts: TokenOpts & { id: string; reason_code?: string; idempotencyKey: string },
): Promise<ApiCallResult<Prescription>> {
  return apiCall<Prescription>(`api/v1/doctor/prescriptions/${opts.id}/cancel`, {
    method: 'POST',
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
    headers: { 'Idempotency-Key': opts.idempotencyKey },
    body: { reason_code: opts.reason_code ?? 'cancel' },
  });
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

export type DoctorRefillRequest = {
  id: string;
  prescription_id: string;
  prescription_version_id: string;
  status: string;
  eligibility_reason_code?: string | null;
  dispensing_case_id?: string | null;
  order_id?: string | null;
  created_at: string;
  next?: string | null;
  ed_r5e_01?: string;
};

export function fetchDoctorRefillRequests(
  opts: TokenOpts,
): Promise<ApiCallResult<{ requests: DoctorRefillRequest[] }>> {
  return apiCall<{ requests: DoctorRefillRequest[] }>('api/v1/doctor/refill-requests', {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
  });
}

export function approveDoctorRefillRequest(
  opts: TokenOpts & { id: string; idempotencyKey: string },
): Promise<ApiCallResult<DoctorRefillRequest>> {
  return apiCall<DoctorRefillRequest>(`api/v1/doctor/refill-requests/${opts.id}/approve`, {
    method: 'POST',
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
    headers: { 'Idempotency-Key': opts.idempotencyKey },
    body: {},
  });
}

export function rejectDoctorRefillRequest(
  opts: TokenOpts & { id: string; idempotencyKey: string; reason_code?: string },
): Promise<ApiCallResult<DoctorRefillRequest>> {
  return apiCall<DoctorRefillRequest>(`api/v1/doctor/refill-requests/${opts.id}/reject`, {
    method: 'POST',
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
    headers: { 'Idempotency-Key': opts.idempotencyKey },
    body: { reason_code: opts.reason_code ?? 'doctor_rejected' },
  });
}
