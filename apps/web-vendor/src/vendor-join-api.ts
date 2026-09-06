import { vendorApiRoot } from './vendor-http';

export class VendorJoinApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'VendorJoinApiError';
  }
}

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (init.token) {
    headers.set('Authorization', `Bearer ${init.token}`);
  }
  const res = await fetch(`${vendorApiRoot()}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new VendorJoinApiError((body as { detail?: string }).detail ?? 'request_failed', res.status);
  }
  return body as T;
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

export type OnboardingReadinessCondition = {
  code: string;
  label: string;
  satisfied: boolean;
  required: boolean;
  detail: string | null;
  next_action: string | null;
};

export type OnboardingReadiness = {
  application_id: string;
  partner_id: string;
  partner_status: string;
  partner_type_code?: string;
  lifecycle_phase: string;
  ready_for_activation: boolean;
  marketplace_visible: boolean;
  organization_id: string | null;
  conditions: OnboardingReadinessCondition[];
  next_actions: string[];
  pharmacy_licence?: {
    applicable: boolean;
    status: string;
    verified: boolean;
    expired: boolean;
    has_evidence: boolean;
    blockers: string[];
    next_step: string | null;
    vendor_submit_path: string;
    vendor_portal_path: string;
  };
};

export type VendorOpsReadiness = {
  lifecycle: string;
  final_status: string;
  ready_for_activation: boolean;
  marketplace_purchasable: boolean;
  blockers: string[];
  warnings: string[];
  licence_readiness: { status: string; verified: boolean; expired: boolean };
  kyc_readiness: {
    status: string | null;
    verified: boolean;
    verification_class: string | null;
    external_gated: boolean;
  };
  commercial_readiness: { approved: boolean };
  catalog_readiness: { ready: boolean; offer_count: number };
  inventory_readiness: { ready: boolean };
  serviceability_readiness: { ready: boolean; required: boolean };
  document_checklist: Array<{
    requirement_code: string;
    label: string;
    required: boolean;
    submitted: boolean;
    verified: boolean;
    expiry: string | null;
    status: string;
  }>;
  conditions: OnboardingReadinessCondition[];
};

export type CountryRow = {
  iso_alpha2: string;
  name: Record<string, string> | string;
  default_currency?: string;
};

export type JoinSupportTicket = {
  id: string;
  subject: string;
  body: string;
  status: string;
  created_at: string;
};

export function fetchJoinCountries() {
  return call<{ data: CountryRow[] }>('/api/v1/countries');
}

export function fetchJoinPublic(country: string) {
  return call<JoinPublicResponse>(`/api/v1/join/public?country=${encodeURIComponent(country)}`);
}

export function createJoinApplication(token: string, partnerTypeCode: string, countryCode: string) {
  return call<{ application?: { id: string } }>('/api/v1/join/applications', {
    method: 'POST',
    token,
    body: JSON.stringify({ partner_type_code: partnerTypeCode, country_code: countryCode }),
  });
}

export function fetchMyJoinApplications(token: string) {
  return call<{ data: JoinApplicationRow[] }>('/api/v1/join/applications/me', { token });
}

export function fetchJoinApplication(token: string, applicationId: string) {
  return call<JoinApplicationRow>(`/api/v1/join/applications/${applicationId}`, { token });
}

export function fetchJoinOnboarding(token: string, applicationId: string) {
  return call<OnboardingReadiness>(`/api/v1/join/applications/${applicationId}/onboarding`, { token });
}

export function fetchVendorOpsReadiness(token: string, applicationId: string) {
  return call<VendorOpsReadiness>(`/api/v1/vendor/onboarding/${applicationId}/operations-readiness`, {
    token,
  });
}

export function submitJoinApplication(token: string, applicationId: string) {
  return call(`/api/v1/join/applications/${applicationId}/submit`, { method: 'POST', token });
}

export function submitPharmacyLicence(
  token: string,
  payload: {
    partner_id: string;
    licenceAuthority: string;
    licenceNumber: string;
    responsiblePharmacist?: string;
    issuedAt?: string;
    expiresAt?: string;
    notes?: string;
  },
) {
  return call<{ id: string; status: string; has_evidence?: boolean }>(
    '/api/v1/vendor/onboarding/pharmacy-licence',
    {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    },
  );
}

export function updateJoinApplicationFields(token: string, applicationId: string, fields: Record<string, string>) {
  return call(`/api/v1/join/applications/${applicationId}/fields`, {
    method: 'POST',
    token,
    body: JSON.stringify({ fields }),
  });
}

export function fetchJoinRequiredDocuments(token: string, applicationId: string, country: string) {
  return call<{ document_types: string[]; required_fields: string[] }>(
    `/api/v1/join/applications/${applicationId}/required-documents?country=${encodeURIComponent(country)}`,
    { token },
  );
}

export function fetchJoinApplicationDocuments(token: string, applicationId: string) {
  return call<{ data: JoinDocumentRow[]; kyc_case_id: string | null }>(
    `/api/v1/join/applications/${applicationId}/documents`,
    { token },
  );
}

export function uploadJoinApplicationDocument(
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

export function fetchJoinSupportTickets(token: string) {
  return call<{ data: JoinSupportTicket[] }>('/api/v1/join/support/tickets', { token });
}

export function createJoinSupportTicket(
  token: string,
  body: { subject: string; body: string; reference_type?: string; reference_id?: string },
) {
  return call<JoinSupportTicket>('/api/v1/join/support/tickets', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
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
