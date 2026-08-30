import { apiCall, type ApiCallResult } from '@world-pharma/shell-core';

export type ImagingCatalogItem = {
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
    imaging_eligibility?: {
      booking_enabled: boolean;
      imaging_center_enabled: boolean;
    };
  }>;
};

export type ImagingBooking = {
  id: string;
  status: string;
  imaging_display_name?: string;
  currency: string;
  total_minor: string;
  slot_starts_at?: string | null;
  imaging_location?: { name: string; city: string | null } | null;
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

export function fetchImagingCatalog(opts: TokenOpts & { country: string; q?: string }) {
  const qs = new URLSearchParams({ country: opts.country });
  if (opts.q) {
    qs.set('q', opts.q);
  }
  return call<{ country_enabled: boolean; data: ImagingCatalogItem[]; note?: string }>(
    `api/v1/me/imaging/catalog?${qs}`,
    opts,
  );
}

export function fetchImagingCatalogItem(opts: TokenOpts & { slug: string; country: string }) {
  return call<ImagingCatalogItem>(
    `api/v1/me/imaging/catalog/${encodeURIComponent(opts.slug)}?country=${encodeURIComponent(opts.country)}`,
    opts,
  );
}

export function fetchImagingLocations(opts: TokenOpts & { imagingOrgId: string; country: string }) {
  const qs = new URLSearchParams({ imaging_org_id: opts.imagingOrgId, country: opts.country });
  return call<{ data: Array<{ id: string; name: string; city?: string | null }> }>(
    `api/v1/me/imaging/locations?${qs}`,
    opts,
  );
}

export function fetchImagingSlots(opts: TokenOpts & { imagingOrgId: string; country: string }) {
  const qs = new URLSearchParams({ imaging_org_id: opts.imagingOrgId, country: opts.country });
  return call<{ data: Array<{ starts_at: string; ends_at: string }> }>(`api/v1/me/imaging/slots?${qs}`, opts);
}

export function checkImagingEligibility(
  opts: TokenOpts & { imagingOrgId: string; offerId?: string; country: string; referralReference?: string },
) {
  return call<{ eligible: boolean; referral_required: boolean; blocked_reason: string | null }>(
    'api/v1/me/imaging/eligibility',
    {
      token: opts.token,
      onUnauthorized: opts.onUnauthorized,
      method: 'POST',
      body: {
        imaging_org_id: opts.imagingOrgId,
        offer_id: opts.offerId,
        country: opts.country,
        referral_reference: opts.referralReference,
      },
    },
  );
}

export function createImagingBooking(
  opts: TokenOpts & { idempotencyKey: string; payload: Record<string, unknown> },
) {
  return call<ImagingBooking>('api/v1/me/imaging/bookings', {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
    method: 'POST',
    headers: { 'Idempotency-Key': opts.idempotencyKey },
    body: opts.payload,
  });
}

export function payImagingBooking(
  opts: TokenOpts & { bookingId: string; idempotencyKey: string; scenario?: 'success' | 'failed' },
) {
  return call<{ id: string; status: string }>(`api/v1/me/imaging/bookings/${opts.bookingId}/pay`, {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
    method: 'POST',
    headers: { 'Idempotency-Key': opts.idempotencyKey },
    body: { scenario: opts.scenario ?? 'success' },
  });
}

export function fetchImagingBookings(opts: TokenOpts) {
  return call<{ data: ImagingBooking[] }>('api/v1/me/imaging/bookings', opts);
}

export function fetchImagingBooking(opts: TokenOpts & { id: string }) {
  return call<ImagingBooking>(`api/v1/me/imaging/bookings/${opts.id}`, opts);
}

export function cancelImagingBooking(opts: TokenOpts & { id: string }) {
  return call<ImagingBooking>(`api/v1/me/imaging/bookings/${opts.id}/cancel`, {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
    method: 'POST',
    body: { reason_code: 'customer_cancel' },
  });
}

export function fetchImagingProgress(opts: TokenOpts & { id: string }) {
  return call<{
    progress: string;
    note: string;
    study_status: string | null;
    accession_number: string | null;
    slot_starts_at: string | null;
    boundary?: { acquisition: boolean; interpretation: boolean; report: boolean };
  }>(`api/v1/me/imaging/bookings/${opts.id}/progress`, opts);
}

export type ImagingPreparation = {
  imaging_booking_id: string;
  study_title: string;
  instructions: string[];
  prep_acknowledged: boolean;
  note: string;
};

export function fetchImagingPreparation(opts: TokenOpts & { id: string }) {
  return call<ImagingPreparation>(`api/v1/me/imaging/bookings/${opts.id}/preparation`, opts);
}

export type ImagingReportStatus = {
  imaging_booking_id: string;
  imaging_report_id?: string;
  report_available: boolean;
  status: string | null;
  version_number?: number | null;
  published_at?: string | null;
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
  findings: Array<{ finding_code: string; finding_text: string }>;
  sandbox: boolean;
  note?: string;
};

export function fetchImagingReportStatus(opts: TokenOpts & { id: string }) {
  return call<ImagingReportStatus>(`api/v1/me/imaging/bookings/${opts.id}/report/status`, opts);
}

export function fetchImagingReport(opts: TokenOpts & { id: string }) {
  return call<ImagingCustomerReport>(`api/v1/me/imaging/bookings/${opts.id}/report`, opts);
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

export function fetchImagingPhysicalReportEligibility(opts: TokenOpts & { id: string }) {
  return call<ImagingPhysicalReportEligibility>(
    `api/v1/me/imaging/bookings/${opts.id}/physical-report/eligibility`,
    opts,
  );
}

export function requestImagingPhysicalReport(
  opts: TokenOpts & { id: string; idempotencyKey: string; customerAddressId: string },
) {
  return call<ImagingPhysicalReportStatus>(`api/v1/me/imaging/bookings/${opts.id}/physical-report`, {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
    method: 'POST',
    headers: { 'Idempotency-Key': opts.idempotencyKey },
    body: { customer_address_id: opts.customerAddressId },
  });
}

export function fetchImagingPhysicalReportStatus(opts: TokenOpts & { id: string }) {
  return call<ImagingPhysicalReportStatus>(`api/v1/me/imaging/bookings/${opts.id}/physical-report`, opts);
}

export function cancelImagingPhysicalReport(opts: TokenOpts & { id: string; reason?: string }) {
  return call<ImagingPhysicalReportStatus>(`api/v1/me/imaging/bookings/${opts.id}/physical-report/cancel`, {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
    method: 'POST',
    body: { reason: opts.reason },
  });
}

/** R8-B: customer may retry sandbox pay while booking awaits payment. */
export function imagingPaymentRetryable(status: string): boolean {
  return status === 'BOOKED' || status === 'PAYMENT_FAILED';
}

/** Returns a validation message when booking draft is incomplete, else null. */
export function imagingBookingDraftError(opts: {
  eligible: boolean | null;
  locationId: string;
  slotStartsAt: string;
  prepAcknowledged: boolean;
  referralRequired: boolean;
  referralReference: string;
}): string | null {
  if (opts.eligible === false) {
    return 'Not eligible for booking.';
  }
  if (!opts.locationId) {
    return 'Select an imaging center location.';
  }
  if (!opts.slotStartsAt) {
    return 'Select an appointment slot.';
  }
  if (!opts.prepAcknowledged) {
    return 'Acknowledge preparation instructions before booking.';
  }
  if (opts.referralRequired && !opts.referralReference.trim()) {
    return 'Referral reference is required for this country pack.';
  }
  return null;
}
