import { adminJson, AdminHttpError } from './admin-http';

export class AffiliateApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AffiliateApiError';
  }
}

async function affiliateFetch(token: string, path: string, init?: RequestInit) {
  try {
    return await adminJson(token, path, init);
  } catch (err) {
    if (err instanceof AdminHttpError) {
      throw new AffiliateApiError(err.message, err.status);
    }
    throw new AffiliateApiError('request_failed', 0);
  }
}

export type AffiliatePartner = {
  id: string;
  display_name: string;
  legal_name: string;
  status: string;
  country_code: string;
};

export type AdminReferralCode = {
  id: string;
  code: string;
  status: string;
  organization_id: string;
  country_code: string;
};

export function listAffiliatePartners(token: string, countryCode: string) {
  return affiliateFetch(
    token,
    `/api/v1/admin/affiliate/partners?country_code=${encodeURIComponent(countryCode)}`,
  ) as Promise<{ data: AffiliatePartner[] }>;
}

export function adminCreateReferralCode(
  token: string,
  input: { country_code: string; organization_id: string; code: string },
) {
  return affiliateFetch(token, '/api/v1/admin/affiliate/referral-codes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `admin-aff-${input.code}` },
    body: JSON.stringify(input),
  }) as Promise<AdminReferralCode>;
}

export function approveAffiliateLiability(token: string, orderId: string) {
  return affiliateFetch(token, `/api/v1/admin/finance/affiliate/${orderId}/approve`, {
    method: 'POST',
  });
}

export function reverseAffiliateLiability(token: string, orderId: string) {
  return affiliateFetch(token, `/api/v1/admin/finance/affiliate/${orderId}/reverse`, {
    method: 'POST',
  });
}
