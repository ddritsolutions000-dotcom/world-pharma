import { apiBaseUrl } from '@world-pharma/shell-core';

const base = () => apiBaseUrl(typeof process === 'undefined' ? {} : process.env);

export class PathologistApiError extends Error {
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
    throw new PathologistApiError(
      (body as { detail?: string }).detail ?? 'request_failed',
      res.status,
      (body as { code?: string }).code,
    );
  }
  return body as T;
}

export type PathologistOrg = {
  id: string;
  display_name: string;
  country_code: string;
  role_code: string;
};

export type PathologistCase = {
  id: string;
  accession_number: string;
  test_title: string;
  status: string | null;
  version_number: number | null;
  summary: string | null;
  results: Array<{ analyte_name: string; value: string; unit?: string | null }>;
};

export function fetchPathologistOrganizations(token: string) {
  return call<{ data: PathologistOrg[] }>('/api/v1/lab/organizations', token);
}

export function fetchPathologistWork(token: string, labOrgId: string) {
  return call<{ data: PathologistCase[] }>(
    `/api/v1/pathologist/work?lab_org_id=${encodeURIComponent(labOrgId)}`,
    token,
  );
}

export function assignPathologistCase(token: string, labOrgId: string, reportId: string) {
  return call(`/api/v1/pathologist/reports/${reportId}/assign`, token, {
    method: 'POST',
    body: JSON.stringify({ lab_org_id: labOrgId }),
  });
}

export function verifyPathologistReport(token: string, labOrgId: string, reportId: string) {
  return call(`/api/v1/pathologist/reports/${reportId}/verify`, token, {
    method: 'POST',
    body: JSON.stringify({ lab_org_id: labOrgId }),
  });
}

export function publishPathologistReport(token: string, labOrgId: string, reportId: string) {
  return call(`/api/v1/pathologist/reports/${reportId}/publish`, token, {
    method: 'POST',
    body: JSON.stringify({ lab_org_id: labOrgId }),
  });
}

export function amendPathologistReport(token: string, labOrgId: string, reportId: string, reason: string) {
  return call(`/api/v1/pathologist/reports/${reportId}/amend`, token, {
    method: 'POST',
    body: JSON.stringify({ lab_org_id: labOrgId, reason }),
  });
}
