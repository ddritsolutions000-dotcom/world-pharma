import { apiBaseUrl } from '@world-pharma/shell-core';

const base = () => apiBaseUrl(typeof process === 'undefined' ? {} : process.env);

export class LabCustomerApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit & { token?: string | null } = {}): Promise<T> {
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
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, { ...rest, headers });
  } catch {
    throw new LabCustomerApiError('network_failure', 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new LabCustomerApiError(
      (body as { detail?: string; title?: string }).detail ??
        (body as { title?: string }).title ??
        'request_failed',
      res.status,
      (body as { code?: string }).code,
    );
  }
  return body as T;
}

export type LabOffer = {
  id: string;
  seller_org_id: string;
  seller_display_name: string;
  currency: string;
  price: { sell_minor: string; list_minor: string | null; version: number } | null;
  lab_eligibility?: {
    booking_enabled: boolean;
    lab_home_enabled: boolean;
    lab_center_enabled: boolean;
  };
};

export type LabCatalogItem = {
  id: string;
  slug: string;
  title: string;
  description: string;
  offers: LabOffer[];
  note?: string;
};

export type LabBooking = {
  id: string;
  status: string;
  collection_mode: string;
  lab_org_id: string;
  lab_display_name?: string;
  lab_location?: { id: string; name: string; city: string | null } | null;
  currency: string;
  total_minor: string;
  slot_starts_at: string | null;
  payment_intent_id: string | null;
  sandbox: boolean;
  lines: Array<{ id: string; title: string; qty: number; line_minor: string; currency: string }>;
  boundary?: { creates_order: boolean; creates_specimen: boolean; live_money: boolean };
};

export function fetchLabCatalog(token: string, country: string, q?: string) {
  const qs = new URLSearchParams({ country });
  if (q) {
    qs.set('q', q);
  }
  return call<{ country_enabled: boolean; data: LabCatalogItem[]; note?: string }>(
    `/api/v1/me/lab/catalog?${qs}`,
    { token },
  );
}

export function fetchLabCatalogItem(token: string, slug: string, country: string) {
  return call<LabCatalogItem>(`/api/v1/me/lab/catalog/${encodeURIComponent(slug)}?country=${encodeURIComponent(country)}`, {
    token,
  });
}

export function fetchLabSlots(
  token: string,
  labOrgId: string,
  collectionMode: 'HOME' | 'CENTER',
  country: string,
) {
  const qs = new URLSearchParams({
    lab_org_id: labOrgId,
    collection_mode: collectionMode,
    country,
  });
  return call<{ data: Array<{ starts_at: string; ends_at: string; timezone: string }> }>(
    `/api/v1/me/lab/slots?${qs}`,
    { token },
  );
}

export function fetchLabLocations(token: string, labOrgId: string, country: string) {
  const qs = new URLSearchParams({ lab_org_id: labOrgId, country });
  return call<{ data: Array<{ id: string; name: string; city: string | null }> }>(
    `/api/v1/me/lab/locations?${qs}`,
    { token },
  );
}

export function createLabBooking(token: string, idempotencyKey: string, payload: Record<string, unknown>) {
  return call<LabBooking>('/api/v1/me/lab/bookings', {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(payload),
  });
}

export function payLabBooking(
  token: string,
  bookingId: string,
  idempotencyKey: string,
  scenario: 'success' | 'failed' = 'success',
) {
  return call<{ id: string; status: string; sandbox: boolean }>(`/api/v1/me/lab/bookings/${bookingId}/pay`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ scenario }),
  });
}

export function fetchLabBookings(token: string) {
  return call<{ data: LabBooking[] }>('/api/v1/me/lab/bookings', { token });
}

export function fetchLabBooking(token: string, id: string) {
  return call<LabBooking>(`/api/v1/me/lab/bookings/${id}`, { token });
}

export function cancelLabBooking(token: string, id: string) {
  return call<LabBooking>(`/api/v1/me/lab/bookings/${id}/cancel`, {
    method: 'POST',
    token,
    body: JSON.stringify({ reason_code: 'customer_cancel' }),
  });
}

export type LabBookingCollection = {
  lab_booking_id: string;
  lab_sample_id?: string;
  collection_started: boolean;
  status: string | null;
  transport_in_progress?: boolean;
  lab_received?: boolean;
  accession_number?: string | null;
  processing_status?: string | null;
  report_status?: string | null;
  report_available?: boolean;
  custody_timeline: Array<{
    to_status: string;
    action_code: string;
    created_at: string;
  }>;
  note?: string;
  phlebotomist?: {
    job_id: string;
    status: string;
    assigned: boolean;
    live_tracking: boolean;
    eta_label: string;
  } | null;
  boundary?: { pathology: boolean; results_available: boolean };
};

export function fetchLabBookingCollection(token: string, bookingId: string) {
  return call<LabBookingCollection>(`/api/v1/me/lab/bookings/${bookingId}/collection`, { token });
}

export type LabCustomerReport = {
  lab_booking_id: string;
  lab_report_id: string;
  accession_number: string;
  version_number: number;
  published_at: string | null;
  summary: string | null;
  results: Array<{ analyte_name: string; value: string; unit?: string | null; reference_range?: string | null }>;
  note?: string;
};

export type LabReportStatus = {
  lab_booking_id: string;
  report_available: boolean;
  status: string | null;
  note?: string;
};

export function fetchLabReportStatus(token: string, bookingId: string) {
  return call<LabReportStatus>(`/api/v1/me/lab/bookings/${bookingId}/report/status`, { token });
}

export function fetchLabReport(token: string, bookingId: string) {
  return call<LabCustomerReport>(`/api/v1/me/lab/bookings/${bookingId}/report`, { token });
}

export type PhysicalReportEligibility = {
  eligible: boolean;
  reason: string | null;
  physical_report_delivery_enabled: boolean;
  report_published: boolean;
  existing_request_id: string | null;
  existing_status: string | null;
};

export type PhysicalReportStatus = {
  id: string;
  lab_booking_id: string;
  status: string;
  sealed_package_id: string | null;
  logistics_job_id: string | null;
  logistics_job_status: string | null;
  failure_reason: string | null;
  failure_code: string | null;
  cancel_reason: string | null;
  sandbox: boolean;
  created_at: string;
  updated_at: string;
  note?: string;
};

export function fetchPhysicalReportEligibility(token: string, bookingId: string) {
  return call<PhysicalReportEligibility>(`/api/v1/me/lab/bookings/${bookingId}/physical-report/eligibility`, { token });
}

export function requestPhysicalReport(token: string, bookingId: string, idempotencyKey: string) {
  return call<PhysicalReportStatus>(`/api/v1/me/lab/bookings/${bookingId}/physical-report`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({}),
  });
}

export function fetchPhysicalReportStatus(token: string, bookingId: string) {
  return call<PhysicalReportStatus>(`/api/v1/me/lab/bookings/${bookingId}/physical-report`, { token });
}

export function cancelPhysicalReport(token: string, bookingId: string, reason?: string) {
  return call<PhysicalReportStatus>(`/api/v1/me/lab/bookings/${bookingId}/physical-report/cancel`, {
    method: 'POST',
    token,
    body: JSON.stringify({ reason }),
  });
}
