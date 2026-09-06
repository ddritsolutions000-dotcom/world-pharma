'use client';

import { adminApiRoot, adminAuthHeaders } from './admin-http';

export type FinanceBreakAction = {
  id: string;
  action: string;
  actor_person_id: string | null;
  note: string | null;
  idempotency_key: string;
  created_at: string;
};

export type FinanceBreakRow = {
  id: string;
  domain: string;
  status: string;
  workflow_status: string;
  break_type: string;
  classification: string | null;
  source_kind: string | null;
  source_ref: string | null;
  country_id: string | null;
  internal_ref: string | null;
  external_ref: string | null;
  amount_minor: string | null;
  currency: string | null;
  detail: string;
  investigated_by: string | null;
  investigated_at: string | null;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  close_note: string | null;
  closed_by: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  sandbox: boolean;
  live_psp: boolean;
  actions?: FinanceBreakAction[];
};

export type FinanceBreakListQuery = {
  country_id?: string;
  workflow_status?: string;
  classification?: string;
  source_kind?: string;
  domain?: string;
  include_closed?: boolean;
  limit?: number;
};

export const BREAK_WORKFLOW_STATUSES = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED'] as const;

export const BREAK_SOURCE_KINDS = [
  'SETTLEMENT_IMPORT',
  'PAYOUT',
  'PSP',
  'CARRIER',
  'MANUAL',
] as const;

function breaksUrl(query: FinanceBreakListQuery = {}): string {
  const params = new URLSearchParams();
  if (query.country_id) {
    params.set('country_id', query.country_id);
  }
  if (query.workflow_status) {
    params.set('workflow_status', query.workflow_status);
  }
  if (query.classification) {
    params.set('classification', query.classification);
  }
  if (query.source_kind) {
    params.set('source_kind', query.source_kind);
  }
  if (query.domain) {
    params.set('domain', query.domain);
  }
  if (query.include_closed) {
    params.set('include_closed', 'true');
  }
  if (query.limit !== undefined) {
    params.set('limit', String(query.limit));
  }
  const qs = params.toString();
  return `${adminApiRoot()}/api/v1/admin/finance/breaks${qs ? `?${qs}` : ''}`;
}

export async function fetchFinanceBreaks(token: string, query: FinanceBreakListQuery = {}) {
  return fetch(breaksUrl(query), {
    headers: adminAuthHeaders(token),
  });
}

export async function fetchFinanceBreakDetail(token: string, breakId: string) {
  return fetch(`${adminApiRoot()}/api/v1/admin/finance/breaks/${breakId}`, {
    headers: adminAuthHeaders(token),
  });
}

export async function investigateFinanceBreak(
  token: string,
  breakId: string,
  idempotencyKey: string,
  note?: string,
) {
  return fetch(`${adminApiRoot()}/api/v1/admin/finance/breaks/${breakId}/investigate`, {
    method: 'POST',
    headers: adminAuthHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ idempotency_key: idempotencyKey, note }),
  });
}

export async function resolveFinanceBreak(
  token: string,
  breakId: string,
  idempotencyKey: string,
  note?: string,
) {
  return fetch(`${adminApiRoot()}/api/v1/admin/finance/breaks/${breakId}/resolve`, {
    method: 'POST',
    headers: adminAuthHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ idempotency_key: idempotencyKey, note }),
  });
}

export async function closeFinanceBreak(
  token: string,
  breakId: string,
  idempotencyKey: string,
  note?: string,
) {
  return fetch(`${adminApiRoot()}/api/v1/admin/finance/breaks/${breakId}/close`, {
    method: 'POST',
    headers: adminAuthHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ idempotency_key: idempotencyKey, note }),
  });
}

export type FinanceScheduleRow = {
  id: string;
  country_id: string;
  country_iso2: string | null;
  provider_code: string;
  currency: string;
  enabled: boolean;
  worker_poll_ms: number;
  last_run: { status: string; completed_at: string | null } | null;
};

export async function fetchFinanceSchedules(token: string, countryId?: string) {
  const params = new URLSearchParams();
  if (countryId) {
    params.set('country_id', countryId);
  }
  const res = await fetch(`${adminApiRoot()}/api/v1/admin/finance/settlement-import-schedules?${params.toString()}`, {
    headers: adminAuthHeaders(token),
  });
  return res;
}

export async function createFinanceSchedule(
  token: string,
  body: { country_id: string; provider_code: string; currency: string; enabled?: boolean },
) {
  const res = await fetch(`${adminApiRoot()}/api/v1/admin/finance/settlement-import-schedules`, {
    method: 'POST',
    headers: adminAuthHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  return res;
}

export async function updateFinanceSchedule(
  token: string,
  scheduleId: string,
  body: { currency?: string; enabled?: boolean },
) {
  const res = await fetch(`${adminApiRoot()}/api/v1/admin/finance/settlement-import-schedules/${scheduleId}`, {
    method: 'PATCH',
    headers: adminAuthHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  return res;
}

export async function fetchFinanceWorkerRuns(token: string, countryId?: string) {
  const params = new URLSearchParams();
  if (countryId) {
    params.set('country_id', countryId);
  }
  const res = await fetch(`${adminApiRoot()}/api/v1/admin/finance/settlement-import-worker/runs?${params.toString()}`, {
    headers: adminAuthHeaders(token),
  });
  return res;
}

export async function fetchFinancePayables(token: string) {
  return fetch(`${adminApiRoot()}/api/v1/admin/finance/payables`, {
    headers: adminAuthHeaders(token),
  });
}

export async function fetchAffiliateLiabilities(token: string, countryCode?: string) {
  const params = new URLSearchParams();
  if (countryCode) {
    params.set('country_code', countryCode);
  }
  return fetch(`${adminApiRoot()}/api/v1/admin/finance/affiliate-liabilities?${params.toString()}`, {
    headers: adminAuthHeaders(token),
  });
}

export async function fetchDoctorEarningsAdmin(token: string, countryCode?: string) {
  const params = new URLSearchParams();
  if (countryCode) {
    params.set('country_code', countryCode);
  }
  return fetch(`${adminApiRoot()}/api/v1/admin/finance/doctor-earnings?${params.toString()}`, {
    headers: adminAuthHeaders(token),
  });
}

export async function fetchLabEarningsAdmin(token: string, countryCode?: string) {
  const params = new URLSearchParams();
  if (countryCode) {
    params.set('country_code', countryCode);
  }
  return fetch(`${adminApiRoot()}/api/v1/admin/finance/lab-earnings?${params.toString()}`, {
    headers: adminAuthHeaders(token),
  });
}

export async function fetchSettlementBatches(token: string, countryCode?: string) {
  const params = new URLSearchParams();
  if (countryCode) {
    params.set('country_code', countryCode);
  }
  return fetch(`${adminApiRoot()}/api/v1/admin/finance/settlements?${params.toString()}`, {
    headers: adminAuthHeaders(token),
  });
}

export async function fetchFinanceReconciliation(token: string, countryCode?: string) {
  const params = new URLSearchParams();
  if (countryCode) {
    params.set('country_code', countryCode);
  }
  return fetch(`${adminApiRoot()}/api/v1/admin/finance/reconciliation/overview?${params.toString()}`, {
    headers: adminAuthHeaders(token),
  });
}

export type PartnerWithdrawAdminRow = {
  id: string;
  status: string;
  amount_minor: string;
  currency: string;
  destination_hint: string | null;
  partner_type: string;
  partner_id: string;
  created_at: string;
  payout_account: {
    method: string;
    account_holder_name: string;
    account_number_masked: string | null;
    upi_id_masked: string | null;
  } | null;
};

export function fetchPartnerWithdraws(token: string, status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  return fetch(`${adminApiRoot()}/api/v1/admin/finance/partner-withdraws${q}`, {
    headers: adminAuthHeaders(token),
  });
}

export function approvePartnerWithdraw(token: string, id: string) {
  return fetch(`${adminApiRoot()}/api/v1/admin/finance/partner-withdraws/${id}/approve`, {
    method: 'POST',
    headers: adminAuthHeaders(token),
  });
}

export function rejectPartnerWithdraw(token: string, id: string, note?: string) {
  return fetch(`${adminApiRoot()}/api/v1/admin/finance/partner-withdraws/${id}/reject`, {
    method: 'POST',
    headers: { ...adminAuthHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  });
}

export function executePartnerWithdraw(token: string, id: string) {
  return fetch(`${adminApiRoot()}/api/v1/admin/finance/partner-withdraws/${id}/execute`, {
    method: 'POST',
    headers: adminAuthHeaders(token),
  });
}
