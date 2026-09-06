import { apiBaseUrl } from '@world-pharma/shell-core';

const base = () => apiBaseUrl(typeof process === 'undefined' ? {} : process.env);

export class RadiologistApiError extends Error {
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
    throw new RadiologistApiError(
      (body as { detail?: string }).detail ?? 'request_failed',
      res.status,
      (body as { code?: string }).code,
    );
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
    entered_by?: string | null;
    verified_by?: string | null;
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

export function fetchRadiologistMe(token: string) {
  return call<{ person_id: string }>('/api/v1/radiologist/me', token);
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

export function fetchRadiologistViewerSession(token: string, imagingOrgId: string, studyId: string) {
  return call<{
    imaging_study_id: string;
    imaging_booking_id: string;
    study_instance_uid: string;
    accession_number: string;
    modality_code: string | null;
    study_description: string | null;
    study_date_time: string | null;
    sandbox: boolean;
    viewer: {
      available: boolean;
      certified_diagnostic_workstation: boolean;
      note: string;
      report_separate_from_viewer?: boolean;
    };
    series: Array<{
      series_id: string;
      series_instance_uid: string;
      series_number: number;
      modality_code: string | null;
      description: string | null;
      frame_count: number;
      instance_count: number;
    }>;
    capabilities: {
      zoom: boolean;
      pan: boolean;
      rotate: boolean;
      reset: boolean;
      fit_to_screen: boolean;
      series_navigation: boolean;
      slice_navigation: boolean;
      fullscreen: boolean;
    };
  }>(
    `/api/v1/radiologist/studies/${studyId}/viewer?imaging_org_id=${encodeURIComponent(imagingOrgId)}`,
    token,
  );
}

export async function fetchRadiologistViewerFrameBlob(
  token: string,
  imagingOrgId: string,
  studyId: string,
  seriesId: string,
  frameIndex: number,
): Promise<Blob> {
  const headers = new Headers({ Accept: 'image/png', Authorization: `Bearer ${token}` });
  const res = await fetch(
    `${base()}/api/v1/radiologist/studies/${studyId}/viewer/series/${seriesId}/frames/${frameIndex}?imaging_org_id=${encodeURIComponent(imagingOrgId)}`,
    { headers },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new RadiologistApiError(
      (body as { detail?: string }).detail ?? 'frame_request_failed',
      res.status,
      (body as { code?: string }).code,
    );
  }
  return res.blob();
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
