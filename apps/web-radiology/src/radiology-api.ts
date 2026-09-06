import { apiBaseUrl } from '@world-pharma/shell-core';

const base = () => apiBaseUrl(typeof process === 'undefined' ? {} : process.env);

export class RadiologyApiError extends Error {
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
    throw new RadiologyApiError(
      (body as { detail?: string }).detail ?? 'request_failed',
      res.status,
      (body as { code?: string }).code,
    );
  }
  return body as T;
}

export type ImagingOrganization = {
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

export type ImagingOffer = {
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

export type ImagingEligibility = {
  imaging_org_id: string;
  country_code: string | null;
  state: string;
  acceptance: string;
  attestation_code_required: string;
  attested: boolean;
  attested_at: string | null;
  pack: {
    published: boolean;
    imaging_center_enabled: boolean;
    imaging_partner_type_enabled: boolean;
  };
  organization_status: string | null;
  gates: {
    country: boolean;
    imaging_organization: boolean;
    imaging_service: boolean;
    imaging_partner_type: boolean;
    catalog_write: boolean;
  };
  blocked_reason: string | null;
  next_action: string | null;
  sandbox_note: string;
  booking_enabled: false;
  live_payout: false;
};

export type ImagingStaffBooking = {
  id: string;
  status: string;
  currency: string;
  total_minor: string;
  slot_starts_at: string | null;
  sandbox: boolean;
  imaging_location?: { name: string; city: string | null } | null;
  lines: Array<{ title: string; qty: number; line_minor: string; currency: string }>;
  note?: string;
};

export function fetchImagingOrganizations(token: string) {
  return call<{ data: ImagingOrganization[] }>('/api/v1/radiology/organizations', token);
}

export function fetchRadiologyMe(token: string) {
  return call<{ person_id: string }>('/api/v1/radiology/me', token);
}

export function fetchImagingEligibility(token: string, imagingOrgId: string) {
  return call<ImagingEligibility>(
    `/api/v1/radiology/capabilities/eligibility?imaging_org_id=${encodeURIComponent(imagingOrgId)}`,
    token,
  );
}

export function attestImagingPartner(token: string, imagingOrgId: string, attestationCode: string) {
  return call<ImagingEligibility>('/api/v1/radiology/capabilities/attest', token, {
    method: 'POST',
    body: JSON.stringify({ imaging_org_id: imagingOrgId, attestation_code: attestationCode }),
  });
}

export function fetchImagingActivity(token: string, imagingOrgId: string) {
  return call<{ data: Array<{ id: string; type: string; outcome: string; created_at: string }> }>(
    `/api/v1/radiology/capabilities/activity?imaging_org_id=${encodeURIComponent(imagingOrgId)}`,
    token,
  );
}

export function fetchImagingOffers(token: string, imagingOrgId: string) {
  return call<{ data: ImagingOffer[] }>(
    `/api/v1/radiology/catalog/offers?imaging_org_id=${encodeURIComponent(imagingOrgId)}`,
    token,
  );
}

export function createImagingItem(
  token: string,
  input: {
    slug: string;
    imaging_org_id: string;
    title: string;
    description?: string;
    countries: Array<{ country_code: string }>;
  },
) {
  return call<{ id: string; kind: string }>('/api/v1/radiology/catalog/items', token, {
    method: 'POST',
    body: JSON.stringify({ ...input, kind: 'IMAGING_STUDY' }),
  });
}

export function createImagingVariant(
  token: string,
  itemId: string,
  imagingOrgId: string,
  input: { sku_code: string; pack_size: string },
) {
  return call<{ id: string }>(
    `/api/v1/radiology/catalog/items/${itemId}/variants?imaging_org_id=${encodeURIComponent(imagingOrgId)}`,
    token,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export function createImagingOffer(
  token: string,
  input: {
    variant_id: string;
    imaging_org_id: string;
    country_code: string;
    currency: string;
    cost_minor: string;
    sell_minor: string;
  },
) {
  return call<{ id: string; ownership: string }>('/api/v1/radiology/catalog/offers', token, {
    method: 'POST',
    body: JSON.stringify({ ...input, ownership: 'IMAGING_OWNED' }),
  });
}

export function publishImagingOffer(token: string, offerId: string) {
  return call<{ id: string }>(`/api/v1/radiology/catalog/offers/${offerId}/publish`, token, {
    method: 'POST',
    body: '{}',
  });
}

export function replaceImagingOfferPrice(
  token: string,
  offerId: string,
  input: { cost_minor: string; sell_minor: string },
) {
  return call<{ id: string }>(`/api/v1/radiology/catalog/offers/${offerId}/prices`, token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchImagingStaffBookings(token: string, imagingOrgId: string) {
  return call<{ data: ImagingStaffBooking[]; note?: string }>(
    `/api/v1/radiology/bookings?imaging_org_id=${encodeURIComponent(imagingOrgId)}`,
    token,
  );
}

export type ImagingStudyRow = {
  id: string;
  imaging_booking_id: string;
  status: string;
  accession_number: string;
  study_instance_uid?: string;
  study_description?: string | null;
  study_date_time?: string | null;
  modality_code?: string | null;
  series_count?: number;
  instance_count?: number;
  study_title: string;
  assignee_person_id: string | null;
  dicom?: {
    study_instance_uid: string;
    series: Array<{
      series_instance_uid: string;
      instances: Array<{ sop_instance_uid: string; status: string; object_stored: boolean }>;
    }>;
    sandbox: boolean;
    production_pacs: boolean;
    viewer: boolean;
  };
  acquisition: {
    status: string;
    sandbox_object_ref: string | null;
    failure_code: string | null;
  } | null;
  boundary: { pacs: boolean; dicom: boolean; interpretation: boolean; report: boolean; publication?: boolean; viewer?: boolean };
  interpretation_status?: string | null;
  interpretation_version?: number | null;
  assigned_radiologist_id?: string | null;
};

export function fetchImagingInterpretations(token: string, imagingOrgId: string) {
  return call<{
    data: Array<{
      id: string;
      imaging_study_id: string;
      accession_number: string;
      study_status: string;
      interpretation_status: string | null;
      version_number: number | null;
      assigned_radiologist_id: string | null;
    }>;
    note?: string;
  }>(`/api/v1/radiology/interpretations?imaging_org_id=${encodeURIComponent(imagingOrgId)}`, token);
}

export function fetchImagingStudies(token: string, imagingOrgId: string, status?: string) {
  const qs = new URLSearchParams({ imaging_org_id: imagingOrgId });
  if (status) {
    qs.set('status', status);
  }
  return call<{ data: ImagingStudyRow[]; note?: string; boundary: ImagingStudyRow['boundary'] }>(
    `/api/v1/radiology/studies?${qs}`,
    token,
  );
}

export function fetchImagingStudy(token: string, imagingOrgId: string, studyId: string) {
  return call<ImagingStudyRow>(
    `/api/v1/radiology/studies/${studyId}?imaging_org_id=${encodeURIComponent(imagingOrgId)}`,
    token,
  );
}

export function checkInImagingBooking(
  token: string,
  input: { imaging_org_id: string; imaging_booking_id: string; assignee_person_id?: string },
) {
  return call<ImagingStudyRow>('/api/v1/radiology/check-in', token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function assignImagingStudy(
  token: string,
  studyId: string,
  input: { imaging_org_id: string; assignee_person_id: string },
) {
  return call<ImagingStudyRow>(`/api/v1/radiology/studies/${studyId}/assign`, token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function startImagingAcquisition(token: string, imagingOrgId: string, studyId: string, idempotencyKey: string) {
  return call<ImagingStudyRow>(
    `/api/v1/radiology/studies/${studyId}/start?imaging_org_id=${encodeURIComponent(imagingOrgId)}`,
    token,
    { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } },
  );
}

export function completeImagingAcquisition(
  token: string,
  studyId: string,
  input: { imaging_org_id: string; equipment_code?: string; modality_code?: string },
) {
  return call<ImagingStudyRow>(`/api/v1/radiology/studies/${studyId}/complete`, token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function failImagingAcquisition(
  token: string,
  studyId: string,
  input: { imaging_org_id: string; failure_code: string },
) {
  return call<ImagingStudyRow>(`/api/v1/radiology/studies/${studyId}/fail`, token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export type ImagingPhysicalReportRow = {
  id: string;
  imaging_booking_id: string;
  imaging_report_id: string;
  imaging_report_version_id: string;
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

export function fetchImagingPhysicalReports(token: string, imagingOrgId: string) {
  return call<{ data: ImagingPhysicalReportRow[] }>(
    `/api/v1/radiology/physical-reports?imaging_org_id=${encodeURIComponent(imagingOrgId)}`,
    token,
  );
}

export function acceptImagingPhysicalReport(token: string, requestId: string, imagingOrgId: string) {
  return call<ImagingPhysicalReportRow>(`/api/v1/radiology/physical-reports/${requestId}/accept`, token, {
    method: 'POST',
    body: JSON.stringify({ imaging_org_id: imagingOrgId }),
  });
}

export function prepareImagingPhysicalReport(token: string, requestId: string, imagingOrgId: string) {
  return call<ImagingPhysicalReportRow>(`/api/v1/radiology/physical-reports/${requestId}/prepare`, token, {
    method: 'POST',
    body: JSON.stringify({ imaging_org_id: imagingOrgId }),
  });
}

export function packImagingPhysicalReport(
  token: string,
  requestId: string,
  imagingOrgId: string,
  sealedPackageId: string,
) {
  return call<ImagingPhysicalReportRow>(`/api/v1/radiology/physical-reports/${requestId}/pack`, token, {
    method: 'POST',
    body: JSON.stringify({ imaging_org_id: imagingOrgId, sealed_package_id: sealedPackageId }),
  });
}

export function dispatchImagingPhysicalReport(
  token: string,
  requestId: string,
  imagingOrgId: string,
  idempotencyKey: string,
) {
  return call<ImagingPhysicalReportRow>(`/api/v1/radiology/physical-reports/${requestId}/dispatch`, token, {
    method: 'POST',
    body: JSON.stringify({ imaging_org_id: imagingOrgId, idempotency_key: idempotencyKey }),
  });
}
