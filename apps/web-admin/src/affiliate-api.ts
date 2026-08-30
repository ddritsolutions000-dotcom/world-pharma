const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export class AffiliateApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AffiliateApiError';
  }
}

async function parseJson(res: Response) {
  return res.json().catch(() => ({}));
}

async function affiliateFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new AffiliateApiError((body.detail as string) ?? 'request_failed', res.status);
  }
  return body;
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
