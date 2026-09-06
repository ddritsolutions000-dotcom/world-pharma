import { apiBaseUrl } from '@world-pharma/shell-core';

const base = () => apiBaseUrl(typeof process === 'undefined' ? {} : process.env);

export class LabApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function call<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${base()}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new LabApiError(
      (body as { detail?: string }).detail ?? 'request_failed',
      res.status,
      (body as { code?: string }).code,
    );
  }
  return body as T;
}

export type LabOrganization = {
  id: string;
  display_name: string;
  legal_name: string;
  kind: string;
  status: string;
  country_code: string;
  role_code: string;
  role_name: string;
  location_id?: string | null;
};

export type LabOffer = {
  id: string;
  variant_id?: string;
  seller_org_id?: string;
  country_code?: string;
  currency?: string;
  ownership?: string;
  sell_minor?: string | number;
  status?: string;
  title?: string;
  sku?: string;
};

export type LabEligibility = {
  lab_org_id: string;
  country_code: string | null;
  state: string;
  acceptance: string;
  attestation_code_required: string;
  attested: boolean;
  attested_at: string | null;
  pack: {
    published: boolean;
    lab_home_enabled: boolean;
    lab_center_enabled: boolean;
    lab_partner_type_enabled: boolean;
  };
  organization_status: string | null;
  gates: {
    country: boolean;
    lab_organization: boolean;
    lab_service: boolean;
    lab_partner_type: boolean;
    catalog_write: boolean;
  };
  blocked_reason: string | null;
  next_action: string | null;
  sandbox_note: string;
  booking_enabled: false;
  live_payout: false;
};

export function fetchLabOrganizations(token: string) {
  return call<{ data: LabOrganization[] }>('/api/v1/lab/organizations', token);
}

export function fetchLabEligibility(token: string, labOrgId: string) {
  return call<LabEligibility>(
    `/api/v1/lab/capabilities/eligibility?lab_org_id=${encodeURIComponent(labOrgId)}`,
    token,
  );
}

export function attestLabPartner(token: string, labOrgId: string, attestationCode: string) {
  return call<LabEligibility>('/api/v1/lab/capabilities/attest', token, {
    method: 'POST',
    body: JSON.stringify({ lab_org_id: labOrgId, attestation_code: attestationCode }),
  });
}

export function fetchLabActivity(token: string, labOrgId: string) {
  return call<{ data: Array<{ id: string; type: string; outcome: string; created_at: string }> }>(
    `/api/v1/lab/capabilities/activity?lab_org_id=${encodeURIComponent(labOrgId)}`,
    token,
  );
}

export function fetchLabOffers(token: string, labOrgId: string) {
  return call<{ data: LabOffer[] }>(
    `/api/v1/lab/catalog/offers?lab_org_id=${encodeURIComponent(labOrgId)}`,
    token,
  );
}

export function createLabItem(
  token: string,
  input: {
    slug: string;
    lab_org_id: string;
    title: string;
    description?: string;
    countries: Array<{ country_code: string }>;
  },
) {
  return call<{ id: string; kind: string }>('/api/v1/lab/catalog/items', token, {
    method: 'POST',
    body: JSON.stringify({ ...input, kind: 'LAB_TEST' }),
  });
}

export function createLabVariant(
  token: string,
  itemId: string,
  labOrgId: string,
  input: { sku_code: string; pack_size: string },
) {
  return call<{ id: string }>(
    `/api/v1/lab/catalog/items/${itemId}/variants?lab_org_id=${encodeURIComponent(labOrgId)}`,
    token,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export function createLabOffer(
  token: string,
  input: {
    variant_id: string;
    lab_org_id: string;
    country_code: string;
    currency: string;
    cost_minor: string;
    sell_minor: string;
  },
) {
  return call<{ id: string }>('/api/v1/lab/catalog/offers', token, {
    method: 'POST',
    body: JSON.stringify({ ...input, ownership: 'LAB_OWNED' }),
  });
}

export function publishLabOffer(token: string, offerId: string) {
  return call<{ id: string }>(`/api/v1/lab/catalog/offers/${offerId}/publish`, token, {
    method: 'POST',
    body: '{}',
  });
}

export function replaceLabOfferPrice(
  token: string,
  offerId: string,
  input: { cost_minor: string; sell_minor: string },
) {
  return call<{ id: string }>(`/api/v1/lab/catalog/offers/${offerId}/prices`, token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export type LabStaffBooking = {
  id: string;
  status: string;
  collection_mode: string;
  currency: string;
  total_minor: string;
  slot_starts_at: string | null;
  slot_ends_at?: string | null;
  timezone?: string | null;
  sandbox: boolean;
  created_at?: string;
  lab_location?: { id: string; name: string; city: string | null; address_line: string | null } | null;
  lines: Array<{ id: string; title: string; qty: number; line_minor: string; currency: string }>;
  note?: string;
};

export function fetchLabStaffBookings(token: string, labOrgId: string) {
  return call<{ data: LabStaffBooking[]; note?: string }>(
    `/api/v1/lab/bookings?lab_org_id=${encodeURIComponent(labOrgId)}`,
    token,
  );
}

export function fetchLabStaffBooking(token: string, labOrgId: string, bookingId: string) {
  return call<LabStaffBooking>(
    `/api/v1/lab/bookings/${encodeURIComponent(bookingId)}?lab_org_id=${encodeURIComponent(labOrgId)}`,
    token,
  );
}

export type LabCollectionRow = {
  id: string;
  lab_booking_id: string;
  status: string;
  assignee_person_id: string | null;
  container_barcode: string | null;
  collection_mode: string;
  test_title: string;
  slot_starts_at: string | null;
  custody_timeline: Array<{
    id: string;
    from_status: string | null;
    to_status: string;
    action_code: string;
    created_at: string;
  }>;
  sandbox: boolean;
  note?: string;
};

export function fetchLabCollections(token: string, labOrgId: string) {
  return call<{ data: LabCollectionRow[]; note?: string }>(
    `/api/v1/lab/collections?lab_org_id=${encodeURIComponent(labOrgId)}`,
    token,
  );
}

export type LabTransportRow = {
  id: string;
  status: string;
  coc_status: string | null;
  container_barcode: string | null;
  test_title: string;
  lab_sample_id: string | null;
  custody_timeline: Array<{ to_status: string; action_code: string; created_at: string }>;
  note?: string;
};

export type LabAccessionRow = {
  id: string;
  lab_sample_id: string;
  accession_number: string;
  sample_status: string;
  test_title: string;
  container_barcode: string | null;
  processing_status: string | null;
  custody_timeline: Array<{ id: string; to_status: string; action_code: string; created_at: string }>;
  note?: string;
};

export type LabProcessingRow = {
  id: string;
  lab_sample_id: string;
  accession_number: string;
  status: string;
  test_title: string;
  container_barcode: string | null;
  started_at: string | null;
  completed_at: string | null;
  note?: string;
};

export function fetchLabTransport(token: string, labOrgId: string) {
  return call<{ data: LabTransportRow[]; note?: string }>(
    `/api/v1/lab/transport?lab_org_id=${encodeURIComponent(labOrgId)}`,
    token,
  );
}

export function fetchLabAccessions(token: string, labOrgId: string) {
  return call<{ data: LabAccessionRow[]; note?: string }>(
    `/api/v1/lab/accessions?lab_org_id=${encodeURIComponent(labOrgId)}`,
    token,
  );
}

export function accessionLabSample(
  token: string,
  labOrgId: string,
  labSampleId: string,
  idempotencyKey?: string,
) {
  return call<LabAccessionRow>('/api/v1/lab/accessions', token, {
    method: 'POST',
    body: JSON.stringify({ lab_org_id: labOrgId, lab_sample_id: labSampleId, idempotency_key: idempotencyKey }),
  });
}

export function receiveLabSample(token: string, labOrgId: string, sampleId: string, idempotencyKey?: string) {
  return call(`/api/v1/lab/samples/${sampleId}/receive`, token, {
    method: 'POST',
    body: JSON.stringify({ lab_org_id: labOrgId, idempotency_key: idempotencyKey }),
  });
}

export function fetchLabProcessing(token: string, labOrgId: string) {
  return call<{ data: LabProcessingRow[]; note?: string }>(
    `/api/v1/lab/processing?lab_org_id=${encodeURIComponent(labOrgId)}`,
    token,
  );
}

export function startLabProcessing(token: string, labOrgId: string, processingId: string) {
  return call<LabProcessingRow>(`/api/v1/lab/processing/${processingId}/start`, token, {
    method: 'POST',
    body: JSON.stringify({ lab_org_id: labOrgId }),
  });
}

export function completeLabProcessing(token: string, labOrgId: string, processingId: string) {
  return call<LabProcessingRow>(`/api/v1/lab/processing/${processingId}/complete`, token, {
    method: 'POST',
    body: JSON.stringify({ lab_org_id: labOrgId }),
  });
}

export function failLabProcessing(token: string, labOrgId: string, processingId: string) {
  return call<LabProcessingRow>(`/api/v1/lab/processing/${processingId}/fail`, token, {
    method: 'POST',
    body: JSON.stringify({ lab_org_id: labOrgId }),
  });
}

export type LabPathologyRow = {
  id: string;
  accession_number: string;
  test_title: string;
  status: string | null;
  version_number: number | null;
  result_line_count: number;
  assigned_pathologist_id: string | null;
};

export type LabReportDetail = {
  id: string;
  accession_number: string;
  test_title: string;
  version: {
    id: string;
    status: string;
    summary: string | null;
    results: Array<{ analyte_code: string; analyte_name: string; value: string; unit?: string | null }>;
  } | null;
};

export function fetchLabPathology(token: string, labOrgId: string) {
  return call<{ data: LabPathologyRow[] }>(`/api/v1/lab/pathology?lab_org_id=${encodeURIComponent(labOrgId)}`, token);
}

export function fetchLabReport(token: string, labOrgId: string, reportId: string) {
  return call<LabReportDetail>(
    `/api/v1/lab/reports/${reportId}?lab_org_id=${encodeURIComponent(labOrgId)}`,
    token,
  );
}

export function enterLabReportResults(
  token: string,
  labOrgId: string,
  reportId: string,
  input: { summary?: string; lines: Array<{ analyte_code: string; analyte_name: string; value: string; unit?: string }> },
) {
  return call<LabReportDetail>(`/api/v1/lab/reports/${reportId}/results`, token, {
    method: 'POST',
    body: JSON.stringify({ lab_org_id: labOrgId, ...input }),
  });
}

export function submitLabReportVerify(token: string, labOrgId: string, reportId: string) {
  return call<LabReportDetail>(`/api/v1/lab/reports/${reportId}/submit-verify`, token, {
    method: 'POST',
    body: JSON.stringify({ lab_org_id: labOrgId }),
  });
}

export type LabPhysicalReportRow = {
  id: string;
  lab_booking_id: string;
  lab_report_id: string;
  lab_report_version_id: string;
  report_version_number: number;
  customer_person_id: string;
  status: string;
  sealed_package_id: string | null;
  logistics_job_id: string | null;
  logistics_job_status: string | null;
  failure_reason: string | null;
  cancel_reason: string | null;
  sandbox: boolean;
  created_at: string;
  updated_at: string;
};

export function fetchLabPhysicalReports(token: string, labOrgId: string) {
  return call<{ data: LabPhysicalReportRow[] }>(
    `/api/v1/lab/physical-reports?lab_org_id=${encodeURIComponent(labOrgId)}`,
    token,
  );
}

export function acceptLabPhysicalReport(token: string, labOrgId: string, requestId: string) {
  return call<LabPhysicalReportRow>(`/api/v1/lab/physical-reports/${requestId}/accept`, token, {
    method: 'POST',
    body: JSON.stringify({ lab_org_id: labOrgId }),
  });
}

export function prepareLabPhysicalReport(token: string, labOrgId: string, requestId: string) {
  return call<LabPhysicalReportRow>(`/api/v1/lab/physical-reports/${requestId}/prepare`, token, {
    method: 'POST',
    body: JSON.stringify({ lab_org_id: labOrgId }),
  });
}

export function packLabPhysicalReport(
  token: string,
  labOrgId: string,
  requestId: string,
  sealedPackageId: string,
) {
  return call<LabPhysicalReportRow>(`/api/v1/lab/physical-reports/${requestId}/pack`, token, {
    method: 'POST',
    body: JSON.stringify({ lab_org_id: labOrgId, sealed_package_id: sealedPackageId }),
  });
}

export function dispatchLabPhysicalReport(
  token: string,
  labOrgId: string,
  requestId: string,
  idempotencyKey: string,
) {
  return call<LabPhysicalReportRow>(`/api/v1/lab/physical-reports/${requestId}/dispatch`, token, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ lab_org_id: labOrgId, idempotency_key: idempotencyKey }),
  });
}

export type LabEarningsSummary = {
  sandbox: true;
  live_payout: false;
  settlement_enabled: false;
  payout_authority: string;
  message: string;
  lab_org_id: string;
  country_code: string;
  currency: string;
  completed_booking_count: number;
  gross_minor: string;
  platform_fee_bps: number;
  platform_fee_minor: string;
  platform_fee_modeled: boolean;
  lab_payable_minor: string;
  pending_settlement_minor: string;
  settled_minor: string;
  settlement_status: string;
  settlement_batch_id: string | null;
};

export type LabEarningsBookingRow = {
  lab_booking_id: string;
  lab_report_id: string;
  published_at: string | null;
  report_version: number | null;
  country_code: string;
  currency: string;
  gross_minor: string;
  platform_fee_minor: string;
  lab_payable_minor: string;
  settlement_status: string;
  settlement_batch_id: string | null;
  financial_fact_source_key: string | null;
};

export function fetchLabEarningsSummary(token: string, labOrgId: string) {
  return call<LabEarningsSummary>(
    `/api/v1/lab/earnings/summary?lab_org_id=${encodeURIComponent(labOrgId)}`,
    token,
  );
}

export function fetchLabEarningsBookings(token: string, labOrgId: string) {
  return call<{ sandbox: true; live_payout: false; data: LabEarningsBookingRow[] }>(
    `/api/v1/lab/earnings/bookings?lab_org_id=${encodeURIComponent(labOrgId)}`,
    token,
  );
}

export type LabTeamMember = {
  person_id: string;
  display_name: string;
  membership_role_code: string;
  membership_role_name: string;
  partner_types: string[];
  operational_roles: string[];
  location_id: string | null;
};

export function fetchLabTeam(token: string, labOrgId: string) {
  return call<{ lab_org_id: string; country_code: string; data: LabTeamMember[]; note: string }>(
    `/api/v1/lab/team?lab_org_id=${encodeURIComponent(labOrgId)}`,
    token,
  );
}
