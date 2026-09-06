import { apiFetch } from '@world-pharma/shell-core';

export class AffiliateApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'AffiliateApiError';
  }
}

async function call<T>(path: string, token: string, init: Parameters<typeof apiFetch>[1] = {}): Promise<T> {
  const res = await apiFetch(path, { ...init, accessToken: token });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AffiliateApiError(
      (body as { detail?: string; title?: string }).detail ??
        (body as { title?: string }).title ??
        'request_failed',
      res.status,
    );
  }
  return body as T;
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

export function fetchAffiliateStats(token: string, countryCode: string) {
  return call<AffiliateStats>(
    `api/v1/me/affiliate/stats?country_code=${encodeURIComponent(countryCode)}`,
    token,
  );
}

export function listReferralCodes(token: string, countryCode: string) {
  return call<{ data: ReferralCode[] }>(
    `api/v1/me/affiliate/codes?country_code=${encodeURIComponent(countryCode)}`,
    token,
  );
}

export function createReferralCode(token: string, input: { country_code: string; code: string }) {
  return call<ReferralCode>('api/v1/me/affiliate/codes', token, {
    method: 'POST',
    headers: { 'Idempotency-Key': `code-${input.code}` },
    body: JSON.stringify(input),
  });
}

export function updateReferralCode(
  token: string,
  id: string,
  input: { country_code: string; status: string; version: number },
) {
  return call<ReferralCode>(`api/v1/me/affiliate/codes/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function listReferralLinks(token: string, countryCode: string) {
  return call<{ data: ReferralLink[] }>(
    `api/v1/me/affiliate/links?country_code=${encodeURIComponent(countryCode)}`,
    token,
  );
}

export function createReferralLink(
  token: string,
  input: { country_code: string; referral_code_id: string; label?: string },
) {
  return call<ReferralLink>('api/v1/me/affiliate/links', token, {
    method: 'POST',
    headers: { 'Idempotency-Key': `link-${input.referral_code_id}-${Date.now()}` },
    body: JSON.stringify(input),
  });
}

export function listAffiliateEarnings(token: string) {
  return call<AffiliateEarningsResponse>('api/v1/me/affiliate/earnings', token);
}

export type PartnerWalletView = {
  available_minor: string;
  held_minor: string;
  lifetime_earned_minor: string;
  lifetime_withdrawn_minor: string;
  currency: string;
  message: string;
  payout_account: {
    method: string;
    account_holder_name: string;
    bank_name: string | null;
    account_number_masked: string | null;
    upi_id_masked: string | null;
  } | null;
};

export function fetchAffiliatePartnerWallet(token: string) {
  return call<PartnerWalletView>('api/v1/partner/wallet?partner_type=AFFILIATE', token);
}

export function saveAffiliatePayoutAccount(
  token: string,
  body: {
    method: 'BANK' | 'UPI';
    account_holder_name: string;
    bank_name?: string;
    account_number?: string;
    ifsc_or_routing?: string;
    upi_id?: string;
  },
) {
  return call('api/v1/partner/wallet/payout-account', token, {
    method: 'POST',
    body: JSON.stringify({ partner_type: 'AFFILIATE', ...body }),
  });
}

export function withdrawAffiliatePartnerWallet(token: string, amount_minor: string) {
  return call<{ message: string; status: string }>('api/v1/partner/wallet/withdraw', token, {
    method: 'POST',
    body: JSON.stringify({ partner_type: 'AFFILIATE', amount_minor }),
  });
}

export function listAffiliateStatement(token: string) {
  return call<{
    data: AffiliateStatementRow[];
    currency: string | null;
    sandbox: boolean;
    live_payout: boolean;
  }>('api/v1/me/affiliate/statement', token);
}

export function fetchAffiliateInbox(token: string) {
  return call<{ data: AffiliateInboxItem[] }>('api/v1/me/notifications/inbox', token);
}

export function markAffiliateInboxRead(token: string, id: string) {
  return call(`api/v1/me/notifications/inbox/${id}/read`, token, { method: 'POST' });
}

export function fetchAffiliateSupportTickets(token: string) {
  return call<{ data: AffiliateSupportTicket[] }>('api/v1/support/tickets', token);
}

export function createAffiliateSupportTicket(
  token: string,
  input: { subject: string; body: string },
) {
  return call<AffiliateSupportTicket>('api/v1/support/tickets', token, {
    method: 'POST',
    headers: { 'Idempotency-Key': `aff-mobile-support-${Date.now()}` },
    body: JSON.stringify(input),
  });
}
