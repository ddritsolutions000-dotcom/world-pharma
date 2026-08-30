import { apiCall, type ApiCallResult } from '@world-pharma/shell-core';

export type ConsentGrant = {
  id: string;
  purpose: string;
  scope: unknown;
  status: string;
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  recipient_partner_id: string;
  recipient_display_name?: string | null;
};

export type CareDoctor = {
  profile_id: string;
  partner_id: string;
  display_name: string;
  specialties?: string[];
};

type TokenOpts = {
  token: string;
  onUnauthorized?: () => void;
};

export function fetchConsentGrants(opts: TokenOpts): Promise<ApiCallResult<{ consents: ConsentGrant[] }>> {
  return apiCall<{ consents: ConsentGrant[] }>('api/v1/consent/grants', {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
  });
}

export function grantConsent(
  opts: TokenOpts & {
    recipient_partner_id: string;
    purpose: string;
    scope?: string[];
    organization_id?: string;
    expires_at?: string;
  },
): Promise<ApiCallResult<ConsentGrant>> {
  const { token, onUnauthorized, ...body } = opts;
  return apiCall<ConsentGrant>('api/v1/consent/grants', {
    method: 'POST',
    token,
    onUnauthorized,
    body,
  });
}

export function revokeConsent(
  opts: TokenOpts & { consentId: string },
): Promise<ApiCallResult<ConsentGrant>> {
  const { token, onUnauthorized, consentId } = opts;
  return apiCall<ConsentGrant>(`api/v1/consent/grants/${consentId}/revoke`, {
    method: 'POST',
    token,
    onUnauthorized,
  });
}

export function fetchCareDoctorsForConsent(
  opts: TokenOpts & { countryCode: string },
): Promise<ApiCallResult<{ doctors: CareDoctor[] }>> {
  return apiCall<{ doctors: CareDoctor[] }>(
    `api/v1/care/doctors?country_code=${encodeURIComponent(opts.countryCode)}`,
    { token: opts.token, onUnauthorized: opts.onUnauthorized },
  );
}

export const CONSENT_PURPOSES = [
  { value: 'consultation', label: 'Consultation access' },
  { value: 'treatment', label: 'Treatment access' },
  { value: 'telemedicine', label: 'Telemedicine access' },
] as const;

export const CONSENT_SCOPES = [
  { value: 'LAB_REPORT', label: 'Lab reports' },
  { value: 'IMAGING_REPORT', label: 'Imaging reports' },
] as const;
