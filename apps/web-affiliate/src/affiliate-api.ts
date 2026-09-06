import { apiBaseUrl } from '@world-pharma/shell-core';

const API_BASE = apiBaseUrl();

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
  earnings_approved_minor?: string;
  earnings_payable_minor?: string;
  earnings_paid_minor?: string;
  earnings_reversed_minor?: string;
  earnings_calculated_minor?: string;
  gross_attributed_commission_minor?: string;
  conversions_total?: number;
  clinical_blocked_default: boolean;
  payout_enabled: boolean;
  payout_status?: string;
  sandbox?: boolean;
};

export type AffiliateEarning = {
  order_id: string;
  amount_minor: string;
  currency: string;
  status: string;
  clinical_blocked: boolean;
  affiliate_code: string | null;
  created_at?: string;
  updated_at?: string;
};

export type AffiliateEarningsResponse = {
  data: AffiliateEarning[];
  summary?: {
    calculated_minor: string;
    pending_minor: string;
    approved_minor: string;
    payable_minor: string;
    paid_minor: string;
    reversed_minor: string;
  };
  payout_status?: string;
  payout_execution_enabled?: boolean;
  live_payout: boolean;
  sandbox?: boolean;
};

export type AffiliateStatementRow = {
  date: string;
  order_id: string;
  order_number: string | null;
  commission_amount_minor: string;
  currency: string;
  status: string;
  affiliate_code: string | null;
  reversal: boolean;
  refund_adjusted: boolean;
  period: string;
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

export function updateReferralCode(
  token: string,
  id: string,
  input: { country_code: string; status: string; version: number },
) {
  return affiliateFetch(token, `/api/v1/me/affiliate/codes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
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
  return affiliateFetch(token, '/api/v1/me/affiliate/earnings') as Promise<AffiliateEarningsResponse>;
}

export function listAffiliateStatement(token: string, params?: { from?: string; to?: string }) {
  const query = new URLSearchParams();
  if (params?.from) {
    query.set('from', params.from);
  }
  if (params?.to) {
    query.set('to', params.to);
  }
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return affiliateFetch(token, `/api/v1/me/affiliate/statement${suffix}`) as Promise<{
    data: AffiliateStatementRow[];
    currency: string | null;
    sandbox: boolean;
    live_payout: boolean;
  }>;
}

export function affiliateStatementCsvUrl(token: string, params?: { from?: string; to?: string }) {
  const query = new URLSearchParams();
  if (params?.from) {
    query.set('from', params.from);
  }
  if (params?.to) {
    query.set('to', params.to);
  }
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return `${API_BASE}/api/v1/me/affiliate/statement/export.csv${suffix}`;
}

export type AffiliateInboxItem = {
  id: string;
  channel: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  reference_type?: string;
  reference_id?: string;
};

export type AffiliateSupportTicket = {
  id: string;
  subject: string;
  body: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export function fetchAffiliateInbox(token: string) {
  return affiliateFetch(token, '/api/v1/me/notifications/inbox') as Promise<{ data: AffiliateInboxItem[] }>;
}

export function markAffiliateInboxRead(token: string, id: string) {
  return affiliateFetch(token, `/api/v1/me/notifications/inbox/${id}/read`, { method: 'POST' });
}

export function fetchAffiliateSupportTickets(token: string) {
  return affiliateFetch(token, '/api/v1/support/tickets') as Promise<{ data: AffiliateSupportTicket[] }>;
}

export function createAffiliateSupportTicket(
  token: string,
  input: { subject: string; body: string; reference_type?: string; reference_id?: string },
) {
  return affiliateFetch(token, '/api/v1/support/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `aff-support-${Date.now()}` },
    body: JSON.stringify(input),
  }) as Promise<AffiliateSupportTicket>;
}
