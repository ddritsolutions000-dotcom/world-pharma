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

export type JoinPartnerTypeRow = {
  code: string;
  enabled: boolean;
  join_public: boolean;
  required_documents?: string[];
  required_fields?: string[];
};

export type JoinPublicResponse = {
  public: boolean;
  country_code?: string;
  partner_types: JoinPartnerTypeRow[];
};

export type JoinApplicationRow = {
  id: string;
  status: string;
  partner_type_code: string;
  rejection_reason?: string | null;
  info_request?: string | null;
  application_fields?: Record<string, string>;
  requested_fields?: string[];
  submitted_at?: string | null;
  created_at?: string;
  history?: Array<{ to_status: string; reason: string; created_at: string }>;
};

export type JoinDocumentRow = {
  document_type_code: string;
  status: string;
  original_name?: string;
  rejection_reason?: string | null;
};

export type CountryRow = {
  iso_alpha2: string;
  name: Record<string, string> | string;
  default_currency?: string;
};

export function fetchCountries() {
  return call('/api/v1/countries') as Promise<{ data: CountryRow[] }>;
}

export function fetchPublicJoin(country: string) {
  return call(`/api/v1/join/public?country=${encodeURIComponent(country)}`) as Promise<JoinPublicResponse>;
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

export function updateApplicationFields(
  token: string,
  applicationId: string,
  fields: Record<string, string>,
) {
  return call(`/api/v1/join/applications/${applicationId}/fields`, {
    method: 'POST',
    token,
    body: JSON.stringify({ fields }),
  });
}

export function fetchRequiredDocuments(token: string, applicationId: string, country: string) {
  return call(
    `/api/v1/join/applications/${applicationId}/required-documents?country=${encodeURIComponent(country)}`,
    { token },
  ) as Promise<{ document_types: string[]; required_fields: string[] }>;
}

export function fetchApplicationDocuments(token: string, applicationId: string) {
  return call(`/api/v1/join/applications/${applicationId}/documents`, { token }) as Promise<{
    data: JoinDocumentRow[];
    kyc_case_id: string | null;
  }>;
}

export type JoinOnboardingReadiness = {
  application_id: string;
  partner_id: string;
  partner_status: string;
  partner_type_code: string;
  lifecycle_phase: string;
  ready_for_activation: boolean;
  next_actions: string[];
  pharmacy_licence?: {
    applicable: boolean;
    status: string;
    verified: boolean;
    expired: boolean;
    has_evidence: boolean;
    blockers: string[];
    next_step: string | null;
    vendor_portal_path: string;
  };
};

export function fetchJoinOnboarding(token: string, applicationId: string) {
  return call(`/api/v1/join/applications/${applicationId}/onboarding`, {
    token,
  }) as Promise<JoinOnboardingReadiness>;
}

export function openKycCase(token: string, applicationId: string) {
  return call(`/api/v1/join/applications/${applicationId}/kyc/open`, {
    method: 'POST',
    token,
  }) as Promise<{ kyc_case_id: string; status: string }>;
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

export type JoinInboxItem = {
  id: string;
  channel: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  reference_type?: string;
  reference_id?: string;
};

export function fetchJoinInbox(token: string) {
  return call('/api/v1/me/notifications/inbox', { token }) as Promise<{ data: JoinInboxItem[] }>;
}

export function markJoinInboxRead(token: string, id: string) {
  return call(`/api/v1/me/notifications/inbox/${id}/read`, { token, method: 'POST' });
}
