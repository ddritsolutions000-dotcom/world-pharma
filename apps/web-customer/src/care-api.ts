import { apiBaseUrl } from '@world-pharma/shell-core';

const base = () => apiBaseUrl(typeof process === 'undefined' ? {} : process.env);

async function call(path: string, init: RequestInit & { token?: string | null } = {}) {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (init.token) {
    headers.set('Authorization', `Bearer ${init.token}`);
  }
  const { token, ...rest } = init;
  void token;
  const res = await fetch(`${base()}${path}`, { ...rest, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error((body as { detail?: string }).detail ?? 'request_failed'), {
      status: res.status,
    });
  }
  return body;
}

export function fetchCareDoctors(token: string, country: string) {
  return call(`/api/v1/care/doctors?country_code=${encodeURIComponent(country)}`, { token });
}

export function fetchDoctorSlots(token: string, profileId: string, country: string, from: string, to: string) {
  return call(
    `/api/v1/care/doctors/${profileId}/slots?country_code=${encodeURIComponent(country)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    { token },
  );
}

export function bookAppointment(token: string, payload: Record<string, unknown>) {
  return call('/api/v1/appointments', { method: 'POST', token, body: JSON.stringify(payload) });
}

export function fetchAppointments(token: string) {
  return call('/api/v1/appointments', { token });
}

export function fetchAppointment(token: string, id: string) {
  return call(`/api/v1/appointments/${id}`, { token });
}

export function cancelAppointment(token: string, id: string) {
  return call(`/api/v1/appointments/${id}/cancel`, {
    method: 'POST',
    token,
    body: JSON.stringify({ reason_code: 'customer_cancel' }),
  });
}

export function rescheduleAppointment(token: string, id: string, startsAt: string) {
  return call(`/api/v1/appointments/${id}/reschedule`, {
    method: 'POST',
    token,
    body: JSON.stringify({ starts_at: startsAt }),
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
  cancelled_at?: string | null;
  dispensing_status?: string | null;
  dispensing_case_id?: string | null;
  versions?: Array<{
    id: string;
    version_number: number;
    sealed_at?: string | null;
    lines?: PrescriptionLine[];
  }>;
};

export function fetchCustomerPrescriptions(token: string) {
  return call('/api/v1/customer/prescriptions', { token }) as Promise<{ prescriptions: Prescription[] }>;
}

export function fetchCustomerPrescription(token: string, id: string) {
  return call(`/api/v1/customer/prescriptions/${id}`, { token }) as Promise<Prescription>;
}

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

export function fetchCommerceEligibility(token: string, prescriptionId: string) {
  return call(`/api/v1/customer/prescriptions/${prescriptionId}/commerce-eligibility`, {
    token,
  }) as Promise<CommerceEligibility>;
}

export function startRxHandoff(token: string, dispensingCaseId: string, idempotencyKey: string) {
  return call('/api/v1/customer/rx-handoff', {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ dispensing_case_id: dispensingCaseId }),
  }) as Promise<RxHandoffResult>;
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

export function fetchRefillEligibility(token: string, prescriptionId: string) {
  return call(`/api/v1/customer/prescriptions/${prescriptionId}/refill-eligibility`, {
    token,
  }) as Promise<RefillEligibility>;
}

export function fetchRefillRequests(token: string) {
  return call('/api/v1/customer/refill-requests', { token }) as Promise<{ requests: RefillRequest[] }>;
}

export function requestRefill(token: string, prescriptionId: string, idempotencyKey: string) {
  return call('/api/v1/customer/refill-requests', {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ prescription_id: prescriptionId }),
  }) as Promise<RefillRequest>;
}

export function cancelRefillRequest(token: string, requestId: string, idempotencyKey: string) {
  return call(`/api/v1/customer/refill-requests/${requestId}/cancel`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({}),
  }) as Promise<RefillRequest>;
}

export function fetchRxSubscription(token: string, prescriptionId: string) {
  return call(`/api/v1/customer/prescriptions/${prescriptionId}/subscription`, {
    token,
  }) as Promise<RxSubscriptionView>;
}

export function pauseRxSubscription(token: string, prescriptionId: string) {
  return call(`/api/v1/customer/prescriptions/${prescriptionId}/subscription/pause`, {
    method: 'POST',
    token,
    body: JSON.stringify({}),
  }) as Promise<RxSubscriptionView>;
}

export function cancelRxSubscription(token: string, prescriptionId: string) {
  return call(`/api/v1/customer/prescriptions/${prescriptionId}/subscription/cancel`, {
    method: 'POST',
    token,
    body: JSON.stringify({}),
  }) as Promise<RxSubscriptionView>;
}
