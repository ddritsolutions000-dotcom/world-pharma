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
    throw new AffiliateApiError((body.detail as string) ?? (body.title as string) ?? 'request_failed', res.status);
  }
  return body;
}

export type ReferralCode = {
  id: string;
  code: string;
  status: string;
  version: number;
  country_code: string;
  redeemable: boolean;
};

export type ReferralLink = {
  id: string;
  label: string | null;
  referral_code: string;
  share_url: string;
  status: string;
  version: number;
};

export type AffiliateStats = {
  clicks_total: number;
  links_total: number;
  codes_active: number;
  earnings_pending_minor: string;
  clinical_blocked_default: boolean;
  payout_enabled: boolean;
};

export type AffiliateEarning = {
  order_id: string;
  amount_minor: string;
  currency: string;
  status: string;
  clinical_blocked: boolean;
  affiliate_code: string | null;
};

export function listReferralCodes(token: string, countryCode: string) {
  return affiliateFetch(
    token,
    `/api/v1/me/affiliate/codes?country_code=${encodeURIComponent(countryCode)}`,
  ) as Promise<{ data: ReferralCode[] }>;
}

export function createReferralCode(token: string, input: { country_code: string; code: string }) {
  return affiliateFetch(token, '/api/v1/me/affiliate/codes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `code-${input.code}` },
    body: JSON.stringify(input),
  }) as Promise<ReferralCode>;
}

export function listReferralLinks(token: string, countryCode: string) {
  return affiliateFetch(
    token,
    `/api/v1/me/affiliate/links?country_code=${encodeURIComponent(countryCode)}`,
  ) as Promise<{ data: ReferralLink[] }>;
}

export function createReferralLink(
  token: string,
  input: { country_code: string; referral_code_id: string; label?: string },
) {
  return affiliateFetch(token, '/api/v1/me/affiliate/links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `link-${input.referral_code_id}` },
    body: JSON.stringify(input),
  }) as Promise<ReferralLink>;
}

export function fetchAffiliateStats(token: string, countryCode: string) {
  return affiliateFetch(
    token,
    `/api/v1/me/affiliate/stats?country_code=${encodeURIComponent(countryCode)}`,
  ) as Promise<AffiliateStats>;
}

export function listAffiliateEarnings(token: string) {
  return affiliateFetch(token, '/api/v1/me/affiliate/earnings') as Promise<{
    data: AffiliateEarning[];
    live_payout: boolean;
  }>;
}
