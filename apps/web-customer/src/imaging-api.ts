import { apiBaseUrl } from '@world-pharma/shell-core';

const base = () => apiBaseUrl(typeof process === 'undefined' ? {} : process.env);

export class ImagingCustomerApiError extends Error {
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
    throw new ImagingCustomerApiError('network_failure', 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ImagingCustomerApiError(
      (body as { detail?: string; title?: string }).detail ??
        (body as { title?: string }).title ??
        'request_failed',
      res.status,
      (body as { code?: string }).code,
    );
  }
  return body as T;
}

export type ImagingOffer = {
  id: string;
  seller_org_id: string;
  seller_display_name: string;
  currency: string;
  price: { sell_minor: string; list_minor: string | null; version: number } | null;
  imaging_eligibility?: {
    state: string;
    booking_enabled: boolean;
    imaging_center_enabled: boolean;
  };
};

export type ImagingCatalogItem = {
  id: string;
  slug: string;
  title: string;
  description: string;
  offers: ImagingOffer[];
  note?: string;
};

export type ImagingBooking = {
  id: string;
  status: string;
  imaging_org_id: string;
  imaging_display_name?: string;
  imaging_location?: { id: string; name: string; city: string | null; address_line?: string } | null;
  currency: string;
  total_minor: string;
  slot_starts_at: string | null;
  slot_ends_at?: string | null;
  timezone?: string | null;
  prep_acknowledged: boolean;
  referral_reference?: string | null;
  payment_intent_id: string | null;
  sandbox: boolean;
  lines: Array<{ id: string; title: string; qty: number; line_minor: string; currency: string }>;
  boundary?: {
    creates_order: boolean;
    creates_study: boolean;
    live_money: boolean;
    acquisition: boolean;
    report: boolean;
  };
};

export type ImagingEligibility = {
  eligible: boolean;
  referral_required: boolean;
  blocked_reason: string | null;
  imaging_org_id: string;
  country_code: string;
};

export function fetchImagingCatalog(token: string, country: string, q?: string) {
  const qs = new URLSearchParams({ country });
  if (q) {
    qs.set('q', q);
  }
  return call<{ country_enabled: boolean; data: ImagingCatalogItem[]; note?: string; sandbox_note?: string }>(
    `/api/v1/me/imaging/catalog?${qs}`,
    { token },
  );
}

export function fetchImagingCatalogItem(token: string, slug: string, country: string) {
  return call<ImagingCatalogItem>(
    `/api/v1/me/imaging/catalog/${encodeURIComponent(slug)}?country=${encodeURIComponent(country)}`,
    { token },
  );
}

export function fetchImagingSlots(token: string, imagingOrgId: string, country: string) {
  const qs = new URLSearchParams({ imaging_org_id: imagingOrgId, country });
  return call<{ data: Array<{ starts_at: string; ends_at: string; timezone: string }> }>(
    `/api/v1/me/imaging/slots?${qs}`,
    { token },
  );
}

export function fetchImagingLocations(token: string, imagingOrgId: string, country: string) {
  const qs = new URLSearchParams({ imaging_org_id: imagingOrgId, country });
  return call<{ data: Array<{ id: string; name: string; city: string | null }> }>(
    `/api/v1/me/imaging/locations?${qs}`,
    { token },
  );
}

export function checkImagingEligibility(
  token: string,
  payload: { imaging_org_id: string; offer_id?: string; country: string; referral_reference?: string },
) {
  return call<ImagingEligibility>('/api/v1/me/imaging/eligibility', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  });
}

export function createImagingBooking(token: string, idempotencyKey: string, payload: Record<string, unknown>) {
  return call<ImagingBooking>('/api/v1/me/imaging/bookings', {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(payload),
  });
}

export function payImagingBooking(
  token: string,
  bookingId: string,
  idempotencyKey: string,
  scenario: 'success' | 'failed' = 'success',
) {
  return call<{ id: string; status: string; sandbox: boolean }>(
    `/api/v1/me/imaging/bookings/${bookingId}/pay`,
    {
      method: 'POST',
      token,
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ scenario }),
    },
  );
}

export function fetchImagingBookings(token: string) {
  return call<{ data: ImagingBooking[] }>('/api/v1/me/imaging/bookings', { token });
}

export function fetchImagingBooking(token: string, id: string) {
  return call<ImagingBooking>(`/api/v1/me/imaging/bookings/${id}`, { token });
}

export function fetchImagingPreparation(token: string, bookingId: string) {
  return call<{
    imaging_booking_id: string;
    study_title: string;
    instructions: string[];
    prep_acknowledged: boolean;
    note: string;
  }>(`/api/v1/me/imaging/bookings/${bookingId}/preparation`, { token });
}

export function fetchImagingProgress(token: string, bookingId: string) {
  return call<{
    imaging_booking_id: string;
    booking_status: string;
    progress: string;
    study_status: string | null;
    accession_number: string | null;
    slot_starts_at: string | null;
    note: string;
    boundary: {
      acquisition: boolean;
      interpretation: boolean;
      report: boolean;
      dicom: boolean;
      pacs: boolean;
    };
  }>(`/api/v1/me/imaging/bookings/${bookingId}/progress`, { token });
}

export function cancelImagingBooking(token: string, id: string) {
  return call<ImagingBooking>(`/api/v1/me/imaging/bookings/${id}/cancel`, {
    method: 'POST',
    token,
    body: JSON.stringify({ reason_code: 'customer_cancel' }),
  });
}

export type ImagingReportStatus = {
  imaging_booking_id: string;
  imaging_report_id?: string;
  report_available: boolean;
  status: string | null;
  version_number?: number | null;
  published_at?: string | null;
  amends_version?: string | null;
  amendment_reason?: string | null;
  note?: string;
};

export type ImagingCustomerReport = {
  imaging_booking_id: string;
  imaging_report_id: string;
  accession_number: string | null;
  version_number: number;
  published_at: string | null;
  amendment_reason?: string | null;
  summary: string | null;
  findings: Array<{
    finding_code: string;
    finding_text: string;
    body_region_code?: string | null;
    severity_code?: string | null;
  }>;
  sandbox: boolean;
  note?: string;
};

export function fetchImagingReportStatus(token: string, bookingId: string) {
  return call<ImagingReportStatus>(`/api/v1/me/imaging/bookings/${bookingId}/report/status`, { token });
}

export function fetchImagingReport(token: string, bookingId: string) {
  return call<ImagingCustomerReport>(`/api/v1/me/imaging/bookings/${bookingId}/report`, { token });
}

export type ImagingPhysicalReportEligibility = {
  eligible: boolean;
  reason: string | null;
  physical_report_delivery_enabled: boolean;
  report_published: boolean;
  existing_request_id: string | null;
  existing_status: string | null;
};

export type ImagingPhysicalReportStatus = {
  id: string;
  imaging_booking_id: string;
  status: string;
  sealed_package_id: string | null;
  logistics_job_id: string | null;
  logistics_job_status: string | null;
  failure_reason: string | null;
  failure_code: string | null;
  cancel_reason: string | null;
  sandbox: boolean;
  sandbox_delivery_fee_minor?: string;
  created_at: string;
  updated_at: string;
  note?: string;
};

export function fetchImagingPhysicalReportEligibility(token: string, bookingId: string) {
  return call<ImagingPhysicalReportEligibility>(
    `/api/v1/me/imaging/bookings/${bookingId}/physical-report/eligibility`,
    { token },
  );
}

export function requestImagingPhysicalReport(
  token: string,
  bookingId: string,
  idempotencyKey: string,
  customerAddressId: string,
) {
  return call<ImagingPhysicalReportStatus>(`/api/v1/me/imaging/bookings/${bookingId}/physical-report`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ customer_address_id: customerAddressId }),
  });
}

export function fetchImagingPhysicalReportStatus(token: string, bookingId: string) {
  return call<ImagingPhysicalReportStatus>(`/api/v1/me/imaging/bookings/${bookingId}/physical-report`, { token });
}

export function cancelImagingPhysicalReport(token: string, bookingId: string, reason?: string) {
  return call<ImagingPhysicalReportStatus>(`/api/v1/me/imaging/bookings/${bookingId}/physical-report/cancel`, {
    method: 'POST',
    token,
    body: JSON.stringify({ reason }),
  });
}
