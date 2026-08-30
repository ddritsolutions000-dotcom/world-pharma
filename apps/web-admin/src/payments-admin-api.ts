import { apiBaseUrl } from '@world-pharma/shell-core';

export class PaymentsAdminApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type PaymentSummary = {
  id: string;
  status: string;
  amount_minor?: string;
  currency?: string;
  sandbox?: boolean;
  environment?: string;
  country_code?: string;
  order_id?: string | null;
  order_number?: string | null;
  gateway_code?: string | null;
  gateway_environment?: string | null;
  failure_classification?: string | null;
  failure_outcome?: 'PRE_SUBMIT_FAILURE' | null;
  last_reconciliation_status?: string | null;
  last_reconciliation_break?: string | null;
};

export type WebhookEventRow = {
  id: string;
  provider_event_id: string;
  gateway_code: string;
  gateway_environment: string;
  event_type: string;
  processing_status: 'received' | 'processed' | 'duplicate' | 'rejected';
  rejection_reason?: string | null;
  received_at: string;
  processed_at?: string | null;
};

export type RoutingMatrixRow = {
  gateway_code: string;
  gateway_environment: string;
  priority: number;
  capabilities: string[];
  registry_registered: boolean;
  policy_allowed: boolean;
  router_eligible: boolean;
  status: 'active' | 'inactive' | 'blocked';
  fail_closed_reason: string | null;
  effective_rank: number | null;
  policy_source: string;
  routing_reason: string | null;
};

export type PaymentRoutingMatrix = {
  sandbox: boolean;
  active_environment: 'sandbox';
  live_payments_enabled: boolean;
  runtime_environment: string;
  country_code: string;
  method: string;
  currency: string;
  payments_enabled: boolean;
  policy_source: string;
  gateway_refs: string[];
  rows: RoutingMatrixRow[];
  effective_route: {
    gateway_code: string;
    gateway_environment: string;
    priority: number;
    account_code: string;
    routing_reason: string;
  } | null;
  effective_fail_closed_reason: string | null;
  router_decision_matches: boolean;
  production_preview: {
    active: false;
    fail_closed_reason: string;
    rows: RoutingMatrixRow[];
  };
};

export type PaymentAttemptHistory = {
  fallback_occurred: boolean;
  final_selected_gateway: string | null;
  attempts: Array<{
    id: string;
    attempt_number: number;
    gateway_code: string | null;
    gateway_environment: string | null;
    priority: number | null;
    status: string;
    submitted: boolean;
    outcome: string;
    failure_classification: string | null;
    failure_outcome?: 'PRE_SUBMIT_FAILURE' | null;
    error_code: string | null;
    created_at: string;
    selected: boolean;
  }>;
};

export type PaymentObservabilityDetail = {
  sandbox: boolean;
  payment: PaymentSummary;
  attempt_history: PaymentAttemptHistory;
  webhooks: WebhookEventRow[];
  reconciliations: Array<{
    id: string;
    status: string;
    break_type: string | null;
    category: string;
    detail: string;
    created_at: string;
  }>;
  audit_timeline: Array<{
    id: string;
    source: string;
    type: string;
    occurred_at: string;
    actor_id: string | null;
    references: Record<string, unknown>;
  }>;
  refunds: Array<{ id: string; status: string; amount_minor: string; currency: string; created_at: string }>;
  transactions: Array<{ id: string; kind: string; amount_minor: string; currency: string; created_at: string }>;
};

async function paymentsCall<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBaseUrl()}/api/v1/admin/payments${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new PaymentsAdminApiError(`Payments admin API ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}

export async function listPayments(token: string, countryCode: string) {
  return paymentsCall<{ data: PaymentSummary[] }>(token, `?country_code=${encodeURIComponent(countryCode)}`);
}

export async function listUnknownPayments(token: string, countryCode: string) {
  return paymentsCall<{ data: PaymentSummary[] }>(token, `/unknown?country_code=${encodeURIComponent(countryCode)}`);
}

export async function getPaymentObservability(token: string, paymentId: string, countryCode: string) {
  return paymentsCall<PaymentObservabilityDetail>(
    token,
    `/${paymentId}/observability?country_code=${encodeURIComponent(countryCode)}`,
  );
}

export async function listPaymentWebhooks(token: string, countryCode: string, intentId?: string) {
  const query = new URLSearchParams({ country_code: countryCode });
  if (intentId) {
    query.set('intent_id', intentId);
  }
  return paymentsCall<{ data: WebhookEventRow[] }>(token, `/webhooks?${query.toString()}`);
}

export async function getPaymentRoutingMatrix(token: string, countryCode: string) {
  return paymentsCall<PaymentRoutingMatrix>(
    token,
    `/routing-matrix?country_code=${encodeURIComponent(countryCode)}`,
  );
}
