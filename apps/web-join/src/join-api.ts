import { apiBaseUrl } from '@world-pharma/shell-core';

const base = () => apiBaseUrl(typeof process === 'undefined' ? {} : process.env);

async function call(path: string, init: RequestInit & { token?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (init.token) {
    headers.set('Authorization', `Bearer ${init.token}`);
  }
  const res = await fetch(`${base()}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error((body as { detail?: string }).detail ?? 'request_failed'), {
      status: res.status,
      code: (body as { code?: string }).code,
    });
  }
  return body;
}

export function fetchPublicJoin(country: string) {
  return call(`/api/v1/join/public?country=${encodeURIComponent(country)}`);
}

export function createApplication(token: string, partnerTypeCode: string, countryCode: string) {
  return call('/api/v1/join/applications', {
    method: 'POST',
    token,
    body: JSON.stringify({ partner_type_code: partnerTypeCode, country_code: countryCode }),
  });
}

export function fetchMyApplications(token: string) {
  return call('/api/v1/join/applications/me', { token });
}

export function fetchApplication(token: string, applicationId: string) {
  return call(`/api/v1/join/applications/${applicationId}`, { token });
}

export function submitApplication(token: string, applicationId: string) {
  return call(`/api/v1/join/applications/${applicationId}/submit`, { method: 'POST', token });
}

export function fetchRequiredDocuments(token: string, applicationId: string, country: string) {
  return call(
    `/api/v1/join/applications/${applicationId}/required-documents?country=${encodeURIComponent(country)}`,
    { token },
  );
}

export function fetchApplicationDocuments(token: string, applicationId: string) {
  return call(`/api/v1/join/applications/${applicationId}/documents`, { token });
}

export function uploadApplicationDocument(
  token: string,
  applicationId: string,
  payload: {
    document_type_code: string;
    content_type: string;
    original_name: string;
    content_base64: string;
  },
) {
  return call(`/api/v1/join/applications/${applicationId}/documents`, {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  });
}

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export type JoinSupportTicket = {
  id: string;
  subject: string;
  body: string;
  status: string;
  reference_type?: string;
  reference_id?: string;
  created_at: string;
  category?: string;
  note?: string;
};

export function fetchJoinSupportTickets(token: string) {
  return call('/api/v1/join/support/tickets', { token }) as Promise<{ data: JoinSupportTicket[] }>;
}

export function createJoinSupportTicket(
  token: string,
  body: {
    subject: string;
    body: string;
    reference_type?: string;
    reference_id?: string;
  },
) {
  return call('/api/v1/join/support/tickets', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  }) as Promise<JoinSupportTicket>;
}
