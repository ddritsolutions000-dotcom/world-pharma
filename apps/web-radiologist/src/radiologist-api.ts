import { apiBaseUrl } from '@world-pharma/shell-core';

const base = () => apiBaseUrl(typeof process === 'undefined' ? {} : process.env);

export class RadiologistApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
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
    throw new RadiologistApiError((body as { detail?: string }).detail ?? 'request_failed', res.status);
  }
  return body as T;
}

export type RadiologistOrg = {
  id: string;
  display_name: string;
  country_code: string;
  role_code: string;
};

export type RadiologistCase = {
  id: string;
  imaging_study_id: string;
  accession_number: string;
  study_title: string;
  study_status: string;
  status: string | null;
  version_number: number | null;
  assigned_radiologist_id: string | null;
  finding_line_count: number;
};

export type RadiologistCaseDetail = RadiologistCase & {
  modality_code: string | null;
  body_region_code: string | null;
  acquisition: {
    status: string;
    sandbox_object_ref: string | null;
    note: string;
    pacs: false;
    dicom: false;
  } | null;
  version: {
    id: string;
    status: string;
    summary: string | null;
    findings: Array<{
      finding_code: string;
      finding_text: string;
      body_region_code?: string | null;
      severity_code?: string | null;
    }>;
  } | null;
  boundary: { publication: boolean; customer_report: boolean; pacs: false; dicom: false; note: string };
};

export function fetchRadiologistOrganizations(token: string) {
  return call<{ data: RadiologistOrg[] }>('/api/v1/radiologist/organizations', token);
}

export function fetchRadiologistWorklist(token: string, imagingOrgId: string) {
  return call<{ data: RadiologistCase[] }>(
    `/api/v1/radiologist/worklist?imaging_org_id=${encodeURIComponent(imagingOrgId)}`,
    token,
  );
}

export function fetchRadiologistVerifyQueue(token: string, imagingOrgId: string) {
  return call<{ data: RadiologistCase[] }>(
    `/api/v1/radiologist/verify-queue?imaging_org_id=${encodeURIComponent(imagingOrgId)}`,
    token,
  );
}

export function fetchRadiologistCase(token: string, imagingOrgId: string, studyId: string) {
  return call<RadiologistCaseDetail>(
    `/api/v1/radiologist/cases/${studyId}?imaging_org_id=${encodeURIComponent(imagingOrgId)}`,
    token,
  );
}

export function assignRadiologistCase(token: string, imagingOrgId: string, reportId: string) {
  return call(`/api/v1/radiologist/reports/${reportId}/assign`, token, {
    method: 'POST',
    body: JSON.stringify({ imaging_org_id: imagingOrgId }),
  });
}

export function saveRadiologistFindings(
  token: string,
  imagingOrgId: string,
  reportId: string,
  input: { summary?: string; findings: Array<{ finding_code: string; finding_text: string }> },
) {
  return call(`/api/v1/radiologist/reports/${reportId}/findings`, token, {
    method: 'POST',
    body: JSON.stringify({ imaging_org_id: imagingOrgId, ...input }),
  });
}

export function submitRadiologistReport(token: string, imagingOrgId: string, reportId: string) {
  return call(`/api/v1/radiologist/reports/${reportId}/submit`, token, {
    method: 'POST',
    body: JSON.stringify({ imaging_org_id: imagingOrgId }),
  });
}

export function verifyRadiologistReport(token: string, imagingOrgId: string, reportId: string) {
  return call(`/api/v1/radiologist/reports/${reportId}/verify`, token, {
    method: 'POST',
    body: JSON.stringify({ imaging_org_id: imagingOrgId }),
  });
}

export function publishRadiologistReport(
  token: string,
  imagingOrgId: string,
  reportId: string,
  idempotencyKey?: string,
) {
  return call<RadiologistCaseDetail>(`/api/v1/radiologist/reports/${reportId}/publish`, token, {
    method: 'POST',
    body: JSON.stringify({ imaging_org_id: imagingOrgId, idempotency_key: idempotencyKey }),
  });
}

export function amendRadiologistReport(
  token: string,
  imagingOrgId: string,
  reportId: string,
  reason: string,
) {
  return call<RadiologistCaseDetail>(`/api/v1/radiologist/reports/${reportId}/amend`, token, {
    method: 'POST',
    body: JSON.stringify({ imaging_org_id: imagingOrgId, reason }),
  });
}
