const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export class PromoApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PromoApiError';
  }
}

async function parseJson(res: Response) {
  return res.json().catch(() => ({}));
}

async function promoFetch(token: string, path: string, init?: RequestInit) {
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
    throw new PromoApiError((body.detail as string) ?? 'request_failed', res.status);
  }
  return body;
}

export type PromoCampaign = {
  id: string;
  code: string;
  kind: string;
  percent_bps: number;
  fixed_minor: string;
  min_basket_minor: string;
  funding: string;
  country_code: string;
  status: string;
  max_redemptions: number | null;
  redeemed_count: number;
  expires_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type PromoRedemption = {
  id: string;
  session_id: string;
  campaign_id: string;
  discount_minor: string;
  funding: string;
  created_at: string;
};

export function listPromoCampaigns(token: string, countryCode: string) {
  return promoFetch(token, `/api/v1/admin/promo/campaigns?country_code=${encodeURIComponent(countryCode)}`) as Promise<{
    data: PromoCampaign[];
  }>;
}

export function createPromoCampaign(
  token: string,
  input: {
    country_code: string;
    code: string;
    kind: string;
    percent_bps?: number;
    fixed_minor?: string;
    min_basket_minor?: string;
    funding?: string;
    max_redemptions?: number | null;
    expires_at?: string | null;
  },
) {
  return promoFetch(token, '/api/v1/admin/promo/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `promo-create-${input.code}` },
    body: JSON.stringify(input),
  }) as Promise<PromoCampaign>;
}

export function updatePromoCampaign(
  token: string,
  id: string,
  input: {
    country_code: string;
    status?: string;
    version?: number;
    percent_bps?: number;
    fixed_minor?: string;
    min_basket_minor?: string;
    max_redemptions?: number | null;
    expires_at?: string | null;
  },
) {
  return promoFetch(token, `/api/v1/admin/promo/campaigns/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `promo-update-${id}-${input.version ?? 0}` },
    body: JSON.stringify(input),
  }) as Promise<PromoCampaign>;
}

export function listPromoRedemptions(token: string, id: string, countryCode: string) {
  return promoFetch(
    token,
    `/api/v1/admin/promo/campaigns/${id}/redemptions?country_code=${encodeURIComponent(countryCode)}`,
  ) as Promise<{ data: PromoRedemption[] }>;
}
