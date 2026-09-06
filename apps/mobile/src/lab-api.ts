import { apiCall, type ApiCallResult } from '@world-pharma/shell-core';

export type LabCatalogItem = {
  id: string;
  slug: string;
  title: string;
  description: string;
  offers: Array<{
    id: string;
    seller_org_id: string;
    seller_display_name: string;
    currency: string;
    price: { sell_minor: string } | null;
    lab_eligibility?: {
      booking_enabled: boolean;
      lab_home_enabled: boolean;
      lab_center_enabled: boolean;
    };
  }>;
};

export type LabBooking = {
  id: string;
  status: string;
  collection_mode: string;
  lab_display_name?: string;
  currency: string;
  total_minor: string;
  lines: Array<{ title: string }>;
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

export function fetchLabCatalog(opts: TokenOpts & { country: string; q?: string }) {
  const qs = new URLSearchParams({ country: opts.country });
  if (opts.q) {
    qs.set('q', opts.q);
  }
  return call<{ country_enabled: boolean; data: LabCatalogItem[]; note?: string }>(
    `api/v1/me/lab/catalog?${qs}`,
    opts,
  );
}

export function fetchLabCatalogItem(opts: TokenOpts & { slug: string; country: string }) {
  return call<LabCatalogItem>(
    `api/v1/me/lab/catalog/${encodeURIComponent(opts.slug)}?country=${encodeURIComponent(opts.country)}`,
    opts,
  );
}

export type LabLocation = {
  id: string;
  name: string;
  city?: string | null;
};

export function fetchLabLocations(opts: TokenOpts & { labOrgId: string; country: string }) {
  const qs = new URLSearchParams({
    lab_org_id: opts.labOrgId,
    country: opts.country,
  });
  return call<{ data: LabLocation[] }>(`api/v1/me/lab/locations?${qs}`, opts);
}

export function fetchLabSlots(
  opts: TokenOpts & { labOrgId: string; collectionMode: 'HOME' | 'CENTER'; country: string },
) {
  const qs = new URLSearchParams({
    lab_org_id: opts.labOrgId,
    collection_mode: opts.collectionMode,
    country: opts.country,
  });
  return call<{ data: Array<{ starts_at: string; ends_at: string }> }>(`api/v1/me/lab/slots?${qs}`, opts);
}

export function createLabBooking(
  opts: TokenOpts & { idempotencyKey: string; payload: Record<string, unknown> },
) {
  return call<LabBooking>('api/v1/me/lab/bookings', {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
    method: 'POST',
    headers: { 'Idempotency-Key': opts.idempotencyKey },
    body: opts.payload,
  });
}

export function payLabBooking(
  opts: TokenOpts & { bookingId: string; idempotencyKey: string; scenario?: 'success' | 'failed' },
) {
  return call<{ id: string; status: string }>(`api/v1/me/lab/bookings/${opts.bookingId}/pay`, {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
    method: 'POST',
    headers: { 'Idempotency-Key': opts.idempotencyKey },
    body: { scenario: opts.scenario ?? 'success' },
  });
}

export function fetchLabBookings(opts: TokenOpts) {
  return call<{ data: LabBooking[] }>('api/v1/me/lab/bookings', opts);
}

export function fetchLabBooking(opts: TokenOpts & { id: string }) {
  return call<LabBooking>(`api/v1/me/lab/bookings/${opts.id}`, opts);
}

export function cancelLabBooking(opts: TokenOpts & { id: string }) {
  return call<LabBooking>(`api/v1/me/lab/bookings/${opts.id}/cancel`, {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
    method: 'POST',
    body: { reason_code: 'customer_cancel' },
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
  boundary?: { pathology: boolean; results_available: boolean };
  custody_timeline: Array<{
    to_status: string;
    action_code: string;
    created_at: string;
  }>;
  note?: string;
};

export function fetchLabBookingCollection(opts: TokenOpts & { id: string }) {
  return call<LabBookingCollection>(`api/v1/me/lab/bookings/${opts.id}/collection`, opts);
}

export type LabCustomerReport = {
  lab_booking_id: string;
  accession_number: string;
  version_number: number;
  summary: string | null;
  results: Array<{ analyte_name: string; value: string; unit?: string | null }>;
  note?: string;
};

export function fetchLabReport(opts: TokenOpts & { id: string }) {
  return call<LabCustomerReport>(`api/v1/me/lab/bookings/${opts.id}/report`, opts);
}

export type LabReportStatus = {
  lab_booking_id: string;
  report_available: boolean;
  status: string | null;
  note?: string;
};

export function fetchLabReportStatus(opts: TokenOpts & { id: string }) {
  return call<LabReportStatus>(`api/v1/me/lab/bookings/${opts.id}/report/status`, opts);
}

export function cancelPhysicalReport(opts: TokenOpts & { id: string; reason?: string }) {
  return call<PhysicalReportStatus>(`api/v1/me/lab/bookings/${opts.id}/physical-report/cancel`, {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
    method: 'POST',
    body: { reason: opts.reason },
  });
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
  status: string;
  sealed_package_id: string | null;
  logistics_job_status: string | null;
  failure_reason: string | null;
  note?: string;
};

export function fetchPhysicalReportEligibility(opts: TokenOpts & { id: string }) {
  return call<PhysicalReportEligibility>(`api/v1/me/lab/bookings/${opts.id}/physical-report/eligibility`, opts);
}

export function requestPhysicalReport(opts: TokenOpts & { id: string; idempotencyKey: string }) {
  return call<PhysicalReportStatus>(`api/v1/me/lab/bookings/${opts.id}/physical-report`, {
    ...opts,
    method: 'POST',
    headers: { 'Idempotency-Key': opts.idempotencyKey },
    body: JSON.stringify({}),
  });
}

export function fetchPhysicalReportStatus(opts: TokenOpts & { id: string }) {
  return call<PhysicalReportStatus>(`api/v1/me/lab/bookings/${opts.id}/physical-report`, opts);
}

export type HealthPackageCard = {
  id: string;
  name: string;
  price: number;
  original_price: number;
  discount: number;
  tests_count: number;
};

export function fetchPopularHealthPackages(country: string): Promise<ApiCallResult<{ popular_packages: HealthPackageCard[] }>> {
  return apiCall<{ popular_packages: HealthPackageCard[] }>(
    `api/v1/public/health-packages/popular?country_code=${encodeURIComponent(country)}`,
  );
}

export type SpecialityProgramCard = {
  id: string;
  name: string;
  description: string;
  category: string;
  features: string[];
};

export function fetchPublicSpecialityPrograms(country: string): Promise<ApiCallResult<{ programs: SpecialityProgramCard[] }>> {
  return apiCall<{ programs: SpecialityProgramCard[] }>(
    `api/v1/public/speciality-care/programs?country_code=${encodeURIComponent(country)}`,
  );
}

export function enrollSpecialityProgram(
  token: string,
  programId: string,
  country: string,
  onUnauthorized?: () => void,
): Promise<ApiCallResult<{ message: string }>> {
  return apiCall<{ message: string }>(
    `api/v1/customer/speciality-care/programs/${encodeURIComponent(programId)}/enroll`,
    {
      token,
      onUnauthorized,
      method: 'POST',
      body: { country_code: country },
    },
  );
}
