import { apiCall, type ApiCallResult } from '@world-pharma/shell-core';

export type CareDoctor = {
  profile_id: string;
  partner_id?: string;
  display_name: string;
  specialties?: string[];
  online_capable?: boolean;
};

export type AppointmentRow = {
  id: string;
  status: string;
  starts_at?: string;
  ends_at?: string;
  doctor_display_name?: string;
  doctor_profile_id?: string;
  type?: string;
  encounter?: { id: string; status: string } | null;
};

export type DoctorSlot = {
  starts_at: string;
};

type TokenOpts = {
  token: string;
  onUnauthorized?: () => void;
};

function call<T>(
  path: string,
  opts: TokenOpts & { method?: string; body?: unknown; headers?: Record<string, string> },
): Promise<ApiCallResult<T>> {
  return apiCall<T>(path, {
    method: opts.method,
    token: opts.token,
    body: opts.body,
    headers: opts.headers,
    onUnauthorized: opts.onUnauthorized,
  });
}

export function fetchPublicCareDoctors(country: string) {
  return apiCall<{ doctors: CareDoctor[] }>(
    `api/v1/public/care/doctors?country_code=${encodeURIComponent(country)}`,
  );
}

export function fetchCareDoctors(opts: TokenOpts & { country: string }) {
  return call<{ doctors: CareDoctor[] }>(
    `api/v1/care/doctors?country_code=${encodeURIComponent(opts.country)}`,
    opts,
  );
}

export function fetchDoctorSlots(
  opts: TokenOpts & { profileId: string; country: string; from: string; to: string },
) {
  const { profileId, country, from, to, ...rest } = opts;
  return call<{ slots: DoctorSlot[] }>(
    `api/v1/care/doctors/${profileId}/slots?country_code=${encodeURIComponent(country)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    rest,
  );
}

export type DoctorPublicProfile = {
  profile_id: string;
  display_name: string;
  specialties?: string[];
  languages?: string[];
  timezone?: string;
  online_capable?: boolean;
  bio?: string | null;
};

export function fetchDoctorProfile(opts: TokenOpts & { profileId: string; country: string }) {
  const { profileId, country, ...rest } = opts;
  return call<DoctorPublicProfile>(
    `api/v1/care/doctors/${profileId}?country_code=${encodeURIComponent(country)}`,
    rest,
  );
}

export function bookAppointment(
  opts: TokenOpts & {
    doctor_profile_id: string;
    country_code: string;
    starts_at: string;
    type?: string;
  },
) {
  const { token, onUnauthorized, ...body } = opts;
  return call('api/v1/appointments', {
    token,
    onUnauthorized,
    method: 'POST',
    body,
  });
}

export function fetchAppointments(opts: TokenOpts) {
  return call<{ appointments: AppointmentRow[] }>('api/v1/appointments', opts);
}

export function fetchAppointment(opts: TokenOpts & { id: string }) {
  const { id, ...rest } = opts;
  return call<AppointmentRow>(`api/v1/appointments/${id}`, rest);
}

export function cancelAppointment(opts: TokenOpts & { id: string }) {
  const { id, ...rest } = opts;
  return call(`api/v1/appointments/${id}/cancel`, {
    ...rest,
    method: 'POST',
    body: { reason_code: 'customer_cancel' },
  });
}

export function rescheduleAppointment(opts: TokenOpts & { id: string; starts_at: string }) {
  const { id, starts_at, ...rest } = opts;
  return call(`api/v1/appointments/${id}/reschedule`, {
    ...rest,
    method: 'POST',
    body: { starts_at },
  });
}

export type PrescriptionLine = {
  line_number?: number;
  clinical_concept_code: string;
  clinical_concept_label: string;
  dosage_instructions: string;
  quantity_authorized: string;
};

export type Prescription = {
  id: string;
  status: string;
  current_version_id?: string | null;
  current_version_number?: number | null;
  created_at?: string;
  dispensing_status?: string | null;
  dispensing_case_id?: string | null;
  versions?: Array<{
    id: string;
    version_number: number;
    lines?: PrescriptionLine[];
  }>;
};

export type CommerceEligibilityItem = {
  catalog_item_id: string;
  catalog_variant_id: string;
  inventory_lot_id: string;
  quantity_dispensed: string;
  prescription_line_id: string;
};

export type CommerceEligibility = {
  prescription_id: string;
  prescription_status: string;
  eligible: boolean;
  reason: string;
  dispensing_case_id?: string | null;
  dispense_event_id?: string | null;
  dispensing_status?: string | null;
  order_id?: string | null;
  commerce_items?: CommerceEligibilityItem[];
};

export type RxHandoffResult = {
  handoff_key?: string;
  dispensing_case_id: string;
  dispense_event_id?: string;
  prescription_id?: string;
  cart_id?: string | null;
  order_id?: string | null;
  already_ordered?: boolean;
  skip_inventory_hold?: boolean;
};

export function fetchPrescriptions(opts: TokenOpts) {
  return call<{ prescriptions: Prescription[] }>('api/v1/customer/prescriptions', opts);
}

export function fetchPrescription(opts: TokenOpts & { id: string }) {
  const { id, ...rest } = opts;
  return call<Prescription>(`api/v1/customer/prescriptions/${id}`, rest);
}

export function fetchCommerceEligibility(opts: TokenOpts & { id: string }) {
  const { id, ...rest } = opts;
  return call<CommerceEligibility>(`api/v1/customer/prescriptions/${id}/commerce-eligibility`, rest);
}

export function startRxHandoff(opts: TokenOpts & { dispensingCaseId: string; idempotencyKey: string }) {
  const { dispensingCaseId, idempotencyKey, ...rest } = opts;
  return call<RxHandoffResult>('api/v1/customer/rx-handoff', {
    ...rest,
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: { dispensing_case_id: dispensingCaseId },
  });
}

export type RxSubscriptionView = {
  available: boolean;
  id?: string;
  status: string;
  auto_execute_enabled: boolean;
  next_attempt_at?: string | null;
  pause_reason_code?: string | null;
  note?: string;
  pack_subscription_enabled?: boolean;
  pack_auto_execute_enabled?: boolean;
  message?: string;
};

export type RxSubscriptionListItem = RxSubscriptionView & {
  prescription_id: string;
  prescription_status: string;
  prescription_version_number: number | null;
  medicine_label: string | null;
};

export type RefillEligibility = {
  eligible: boolean;
  reason: string;
  prescription_id: string;
  prescription_status?: string | null;
  require_doctor_reauth?: boolean;
  open_request_id?: string | null;
  open_request_status?: string | null;
  subscription?: RxSubscriptionView;
  auto_refill: boolean;
  ed_r5e_01?: string;
};

export type RefillRequestHistoryEntry = {
  from_status: string;
  to_status: string;
  reason_code?: string | null;
  created_at: string;
};

export type RefillRequest = {
  id: string;
  prescription_id: string;
  prescription_version_id: string;
  status: string;
  eligibility_reason_code?: string | null;
  dispensing_case_id?: string | null;
  order_id?: string | null;
  decided_at?: string | null;
  decision_reason_code?: string | null;
  created_at: string;
  history?: RefillRequestHistoryEntry[];
  next?: string | null;
  ed_r5e_01?: string;
};

export function refillEligibilityLabel(reason: string): string {
  const labels: Record<string, string> = {
    ok: 'You may request a refill. Doctor re-authorization is required before pharmacy dispense.',
    rx_refill_disabled: 'Refill is not available in your region (policy off).',
    no_prior_dispense: 'Initial pharmacy dispense must complete before requesting a refill.',
    open_dispensing_case: 'A dispensing case is already in progress for this prescription.',
    prescription_cancelled: 'This prescription was cancelled.',
    prescription_expired: 'This prescription has expired.',
    prescription_draft: 'Prescription is not yet issued.',
    prescription_status_not_refillable: 'Prescription status does not allow refill.',
    version_not_sealed: 'Prescription version is not sealed.',
    version_expired: 'Prescription validity period has ended.',
    version_not_yet_valid: 'Prescription is not yet valid.',
    policy_missing: 'Refill policy is unavailable (fail-closed).',
    rx_dispense_disabled: 'Pharmacy dispense is not enabled for your region.',
    medication_restriction: 'A medication restriction blocks refill.',
    clinical_relationship_missing: 'Active clinical relationship required.',
    consent_missing: 'Consent is required before refill.',
    not_found_or_not_owner: 'Prescription not found.',
  };
  return labels[reason] ?? `Refill not available (${reason}).`;
}

export function fetchRefillEligibility(opts: TokenOpts & { id: string }) {
  const { id, ...rest } = opts;
  return call<RefillEligibility>(`api/v1/customer/prescriptions/${id}/refill-eligibility`, rest);
}

export function fetchRefillRequests(opts: TokenOpts) {
  return call<{ requests: RefillRequest[] }>('api/v1/customer/refill-requests', opts);
}

export function requestRefill(opts: TokenOpts & { prescriptionId: string; idempotencyKey: string }) {
  const { prescriptionId, idempotencyKey, ...rest } = opts;
  return call<RefillRequest>('api/v1/customer/refill-requests', {
    ...rest,
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: { prescription_id: prescriptionId },
  });
}

export function cancelRefillRequest(opts: TokenOpts & { requestId: string; idempotencyKey: string }) {
  const { requestId, idempotencyKey, ...rest } = opts;
  return call<RefillRequest>(`api/v1/customer/refill-requests/${requestId}/cancel`, {
    ...rest,
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: {},
  });
}

export function fetchRxSubscription(opts: TokenOpts & { id: string }) {
  const { id, ...rest } = opts;
  return call<RxSubscriptionView>(`api/v1/customer/prescriptions/${id}/subscription`, rest);
}

export function fetchCustomerSubscriptions(opts: TokenOpts) {
  return call<{ subscriptions: RxSubscriptionListItem[] }>('api/v1/customer/subscriptions', opts);
}

export function enableRxSubscription(opts: TokenOpts & { id: string }) {
  const { id, ...rest } = opts;
  return call<RxSubscriptionView>(`api/v1/customer/prescriptions/${id}/subscription/enable`, {
    ...rest,
    method: 'POST',
    body: {},
  });
}

export function pauseRxSubscription(opts: TokenOpts & { id: string }) {
  const { id, ...rest } = opts;
  return call<RxSubscriptionView>(`api/v1/customer/prescriptions/${id}/subscription/pause`, {
    ...rest,
    method: 'POST',
    body: {},
  });
}

export function cancelRxSubscription(opts: TokenOpts & { id: string }) {
  const { id, ...rest } = opts;
  return call<RxSubscriptionView>(`api/v1/customer/prescriptions/${id}/subscription/cancel`, {
    ...rest,
    method: 'POST',
    body: {},
  });
}
