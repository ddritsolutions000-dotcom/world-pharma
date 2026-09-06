import { apiCall, type ApiCallResult } from '@world-pharma/shell-core';

/** Always same-origin in the browser so Next /api rewrites are used (avoids false Connection problem). */
function doctorCall<T>(
  path: string,
  options: {
    method?: string;
    token?: string | null;
    body?: unknown;
    onUnauthorized?: () => void;
  } = {},
): Promise<ApiCallResult<T>> {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : undefined;
  return apiCall<T>(path, { ...options, baseUrl });
}

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

export type InboxItem = {
  id: string;
  channel: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  reference_type?: string;
  reference_id?: string;
};

export function fetchNotificationInbox(
  opts: TokenOpts,
): Promise<ApiCallResult<{ data: InboxItem[] }>> {
  return doctorCall<{ data: InboxItem[] }>('api/v1/me/notifications/inbox', {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
  });
}

export function markNotificationRead(
  opts: TokenOpts & { id: string },
): Promise<ApiCallResult<{ data: InboxItem[] }>> {
  return doctorCall<{ data: InboxItem[] }>(`api/v1/me/notifications/inbox/${opts.id}/read`, {
    method: 'POST',
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
  });
}

export type DoctorSupportTicket = {
  id: string;
  subject: string;
  body: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export function fetchDoctorSupportTickets(
  opts: TokenOpts,
): Promise<ApiCallResult<{ data: DoctorSupportTicket[] }>> {
  return doctorCall<{ data: DoctorSupportTicket[] }>('api/v1/support/tickets', {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
  });
}

export function createDoctorSupportTicket(
  opts: TokenOpts & { subject: string; body: string },
): Promise<ApiCallResult<DoctorSupportTicket>> {
  return doctorCall<DoctorSupportTicket>('api/v1/support/tickets', {
    method: 'POST',
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
    body: { subject: opts.subject, body: opts.body },
  });
}

export function fetchDoctorCredentials(
  opts: TokenOpts,
): Promise<ApiCallResult<{ credentials: DoctorCredential[] }>> {
  return doctorCall<{ credentials: DoctorCredential[] }>('api/v1/doctor/me/credentials', {
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
  return doctorCall<DoctorCredential>('api/v1/doctor/me/credentials', {
    method: 'POST',
    token,
    onUnauthorized,
    body,
  });
}

export type DoctorOrgMembership = {
  membership_id: string;
  organization_id: string;
  organization_name?: string | null;
  organization_kind?: string | null;
  role?: string;
  status?: string;
  starts_at?: string | null;
  ends_at?: string | null;
};

export function fetchDoctorOrganizations(
  opts: TokenOpts,
): Promise<ApiCallResult<{ organizations: DoctorOrgMembership[] }>> {
  return doctorCall<{ organizations: DoctorOrgMembership[] }>('api/v1/doctor/me/organizations', {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
  });
}

export function fetchDoctorMe(opts: TokenOpts): Promise<ApiCallResult<DoctorMe>> {
  return doctorCall<DoctorMe>('api/v1/doctor/me', {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
  });
}

export function updateDoctorMe(
  opts: TokenOpts & {
    display_name?: string;
    professional_name?: string;
    bio?: string | null;
    languages?: string[];
    specialties?: string[];
    timezone?: string;
    online_capable?: boolean;
  },
): Promise<ApiCallResult<DoctorMe>> {
  const { token, onUnauthorized, ...body } = opts;
  return doctorCall<DoctorMe>('api/v1/doctor/me', {
    method: 'PATCH',
    token,
    onUnauthorized,
    body,
  });
}

export function evaluateClinicalAccess(
  opts: TokenOpts & { patient_person_id: string; purpose: string; country_code: string },
): Promise<ApiCallResult<ClinicalAccessEvaluation>> {
  const { token, onUnauthorized, patient_person_id, purpose, country_code } = opts;
  return doctorCall<ClinicalAccessEvaluation>('api/v1/clinical/access/evaluate', {
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
  return doctorCall<{ prescriptions: Prescription[] }>('api/v1/doctor/prescriptions', {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
  });
}

export function fetchDoctorPrescription(
  opts: TokenOpts & { id: string },
): Promise<ApiCallResult<Prescription>> {
  return doctorCall<Prescription>(`api/v1/doctor/prescriptions/${opts.id}`, {
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
  return doctorCall<PrescriptionContext>(`api/v1/doctor/encounters/${opts.encounterId}/prescription-context`, {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
  });
}

export function fetchDoctorAppointments(
  opts: TokenOpts,
): Promise<ApiCallResult<{ appointments: Array<{ id: string; status: string; starts_at?: string; encounter?: { id: string; status: string } | null }> }>> {
  return doctorCall('api/v1/doctor/appointments', {
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
  return doctorCall<Prescription>('api/v1/doctor/prescriptions', {
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
  return doctorCall<Prescription>(`api/v1/doctor/prescriptions/${opts.id}/issue`, {
    method: 'POST',
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
    headers: { 'Idempotency-Key': opts.idempotencyKey },
  });
}

export function amendDoctorPrescription(
  opts: TokenOpts & { id: string; lines: PrescriptionLineInput[]; idempotencyKey: string },
): Promise<ApiCallResult<Prescription>> {
  return doctorCall<Prescription>(`api/v1/doctor/prescriptions/${opts.id}/amend`, {
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
  return doctorCall<Prescription>(`api/v1/doctor/prescriptions/${opts.id}/cancel`, {
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
  return doctorCall<{ requests: DoctorRefillRequest[] }>('api/v1/doctor/refill-requests', {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
  });
}

export function approveDoctorRefillRequest(
  opts: TokenOpts & { id: string; idempotencyKey: string },
): Promise<ApiCallResult<DoctorRefillRequest>> {
  return doctorCall<DoctorRefillRequest>(`api/v1/doctor/refill-requests/${opts.id}/approve`, {
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
  return doctorCall<DoctorRefillRequest>(`api/v1/doctor/refill-requests/${opts.id}/reject`, {
    method: 'POST',
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
    headers: { 'Idempotency-Key': opts.idempotencyKey },
    body: { reason_code: opts.reason_code ?? 'doctor_rejected' },
  });
}

export type DoctorEarningsSummary = {
  sandbox: true;
  live_payout: false;
  settlement_enabled: false;
  payout_authority: string;
  message: string;
  country_code: string;
  currency: string;
  completed_consult_count: number;
  unit_fee_minor: string;
  platform_fee_bps: number;
  gross_minor: string;
  platform_fee_minor: string;
  doctor_payable_minor: string;
  pending_settlement_minor: string;
  settled_minor: string;
  settlement_status: string;
  wallet_enabled?: boolean;
  self_withdraw_enabled?: boolean;
  available_minor?: string;
  held_minor?: string;
  lifetime_earned_minor?: string;
  lifetime_withdrawn_minor?: string;
};

export type DoctorWalletView = {
  sandbox: true;
  live_payout: false;
  wallet_enabled: true;
  self_withdraw_enabled: boolean;
  payout_account_required: boolean;
  message: string;
  country_code: string;
  currency: string;
  available_minor: string;
  held_minor: string;
  lifetime_earned_minor: string;
  lifetime_withdrawn_minor: string;
  unit_fee_minor: string;
  platform_fee_bps: number;
  payout_account: {
    method: string;
    account_holder_name: string;
    bank_name: string | null;
    account_number_masked: string | null;
    ifsc_or_routing: string | null;
    upi_id_masked: string | null;
    verified_sandbox: boolean;
  } | null;
  ledger: Array<{
    id: string;
    kind: string;
    amount_minor: string;
    currency: string;
    balance_after_minor: string;
    source: string;
    source_key: string;
    appointment_id: string | null;
    note: string | null;
    created_at: string;
  }>;
  withdraw_requests: Array<{
    id: string;
    amount_minor: string;
    currency: string;
    status: string;
    destination_hint: string | null;
    sandbox: boolean;
    live_payout: boolean;
    provider_ref: string | null;
    created_at: string;
    paid_at: string | null;
  }>;
};

export function fetchDoctorEarningsSummary(
  opts: TokenOpts,
): Promise<ApiCallResult<DoctorEarningsSummary>> {
  return doctorCall<DoctorEarningsSummary>('api/v1/doctor/earnings/summary', {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
  });
}

export function fetchDoctorEarningsConsultations(
  opts: TokenOpts,
): Promise<ApiCallResult<{ sandbox: true; live_payout: false; data: Array<{ appointment_id: string }> }>> {
  return doctorCall('api/v1/doctor/earnings/consultations', {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
  });
}

export function fetchDoctorEarningsWallet(opts: TokenOpts): Promise<ApiCallResult<DoctorWalletView>> {
  return doctorCall<DoctorWalletView>('api/v1/doctor/earnings/wallet', {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
  });
}

export function saveDoctorPayoutAccount(
  opts: TokenOpts & {
    method: 'BANK' | 'UPI';
    account_holder_name: string;
    bank_name?: string;
    account_number?: string;
    ifsc_or_routing?: string;
    upi_id?: string;
  },
): Promise<ApiCallResult<{ sandbox: true; message: string; payout_account: DoctorWalletView['payout_account'] }>> {
  return doctorCall('api/v1/doctor/earnings/payout-account', {
    method: 'POST',
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
    body: {
      method: opts.method,
      account_holder_name: opts.account_holder_name,
      bank_name: opts.bank_name,
      account_number: opts.account_number,
      ifsc_or_routing: opts.ifsc_or_routing,
      upi_id: opts.upi_id,
    },
  });
}

export function requestDoctorWalletWithdraw(
  opts: TokenOpts & { amount_minor: string; destination_hint?: string },
): Promise<
  ApiCallResult<{
    sandbox: true;
    live_payout: false;
    message: string;
    available_minor: string;
    withdraw_request: {
      id: string;
      amount_minor: string;
      currency: string;
      status: string;
      destination_hint: string | null;
      provider_ref: string | null;
      paid_at: string | null;
    };
  }>
> {
  return doctorCall('api/v1/doctor/earnings/wallet/withdraw', {
    method: 'POST',
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
    body: {
      amount_minor: opts.amount_minor,
      destination_hint: opts.destination_hint,
    },
  });
}

export function cancelDoctorAppointment(
  opts: TokenOpts & { appointmentId: string; reason_code?: string },
): Promise<ApiCallResult<unknown>> {
  return doctorCall(`api/v1/doctor/appointments/${opts.appointmentId}/cancel`, {
    method: 'POST',
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
    body: { reason_code: opts.reason_code ?? 'doctor_cancelled' },
  });
}

export function markDoctorAppointmentNoShow(
  opts: TokenOpts & { appointmentId: string },
): Promise<ApiCallResult<unknown>> {
  return doctorCall(`api/v1/doctor/appointments/${opts.appointmentId}/no-show`, {
    method: 'POST',
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
  });
}
