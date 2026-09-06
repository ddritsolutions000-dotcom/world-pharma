import { adminFetch } from './admin-http';

export class PaymentsAdminApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
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
  const res = await adminFetch(token, `/api/v1/admin/payments${path}`, init);
  const body = (await res.json().catch(() => ({}))) as T & { code?: string };
  if (!res.ok) {
    throw new PaymentsAdminApiError(`Payments admin API ${res.status}`, res.status, body.code);
  }
  return body;
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

export type R14AGateRow = {
  gate_code: string;
  value: string;
  evidence_class: string;
  workflow_status: 'NOT_EVIDENCED' | 'PENDING' | 'OWNER_EVIDENCED';
  evidence_ref: string | null;
  placeholder: boolean;
  updated_by_person_id: string | null;
  verified_by_person_id: string | null;
  verified_at: string | null;
  updated_at: string;
};

export type R14AGateConfigResponse = {
  engineering_config_status: string;
  readiness_status: string;
  next_required_action: string;
  live_production_status: string;
  book_263_production_evidence: string;
  live_payment_enabled: boolean;
  owner_evidenced_count: number;
  placeholder_count: number;
  live_unlock_blocked_reason: string | null;
  note: string;
  gates: R14AGateRow[];
};

export type R14AGateRevision = {
  id: string;
  action: string;
  previous_value: string;
  new_value: string;
  previous_evidence_class: string;
  new_evidence_class: string;
  actor_person_id: string;
  note: string | null;
  created_at: string;
};

export async function getR14AGateConfig(token: string) {
  return paymentsCall<R14AGateConfigResponse>(token, '/r14a-gates');
}

export async function updateR14AGate(
  token: string,
  gateCode: string,
  body: { value: string; evidence_ref?: string | null },
) {
  return paymentsCall<R14AGateConfigResponse>(token, `/r14a-gates/${encodeURIComponent(gateCode)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function verifyR14AGate(token: string, gateCode: string, body: { evidence_ref: string }) {
  return paymentsCall<R14AGateConfigResponse>(token, `/r14a-gates/${encodeURIComponent(gateCode)}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function listR14AGateRevisions(token: string, gateCode: string) {
  return paymentsCall<{ gate_code: string; data: R14AGateRevision[] }>(
    token,
    `/r14a-gates/${encodeURIComponent(gateCode)}/revisions`,
  );
}

export type PaymentProviderAccount = {
  code: string;
  active: boolean;
  environment: string;
  countries_csv: string;
  currencies_csv: string;
  methods_csv: string;
  vault_path: string;
};

export type PaymentProviderRow = {
  code: string;
  name: string;
  environment: string;
  active: boolean;
  priority: number;
  health_score: number;
  vault_path: string;
  registry_registered: boolean;
  capabilities: string[];
  accounts: PaymentProviderAccount[];
  updated_at: string;
};

export type PaymentProviderConfigResponse = {
  kernel: 'provider_agnostic';
  selection: 'configuration_driven';
  live_payment_enabled: boolean;
  live_production_status: string;
  owner_evidenced_count: number;
  live_unlock_blocked_reason: string | null;
  registered_adapter_codes: string[];
  note: string;
  providers: PaymentProviderRow[];
};

export async function getPaymentProviders(token: string) {
  return paymentsCall<PaymentProviderConfigResponse>(token, '/providers');
}

export type PaymentProviderPatch = {
  active?: boolean;
  priority?: number;
  account?: {
    countries_csv?: string;
    currencies_csv?: string;
    methods_csv?: string;
    vault_path?: string;
  };
};

export type PaymentProviderAuditRow = {
  id: string;
  outcome: string;
  actor_person_id: string | null;
  created_at: string;
};

export async function updatePaymentProvider(token: string, code: string, body: PaymentProviderPatch) {
  return paymentsCall<PaymentProviderConfigResponse>(token, `/providers/${encodeURIComponent(code)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function getPaymentProviderAudit(token: string, code: string) {
  return paymentsCall<{ gateway_code: string; data: PaymentProviderAuditRow[] }>(
    token,
    `/providers/${encodeURIComponent(code)}/audit`,
  );
}

export async function refundPayment(
  token: string,
  intentId: string,
  idempotencyKey: string,
  amountMinor?: string,
) {
  return paymentsCall<PaymentSummary>(token, `/${encodeURIComponent(intentId)}/refund`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(amountMinor ? { amount_minor: amountMinor } : {}),
  });
}

export type ProductionPaymentAvailability = {
  country_code: string;
  available: boolean;
  environment: string;
  live_payments_enabled: boolean;
  country_production_lifecycle: string;
  blockers: string[];
  warnings: string[];
  message: string;
  r14a: {
    live_production_status: string;
    owner_evidenced_count: number;
    live_unlock_blocked_reason: string | null;
  };
  payment_dependency: {
    present: boolean;
    status: string | null;
    external_gated: boolean;
    config_reference: string | null;
  };
};

export type ReconReviewRow = {
  reconciliation_id: string;
  intent_id: string | null;
  order_id: string | null;
  discrepancy: string;
  reconciliation_status: string;
  expected_amount_minor: string | null;
  provider_amount_minor: string | null;
  expected_currency: string | null;
  provider_currency: string | null;
  webhook_state: string | null;
  created_at: string;
};

export async function getProductionPaymentAvailability(token: string, countryCode: string) {
  return paymentsCall<ProductionPaymentAvailability>(
    token,
    `/production-availability?country_code=${encodeURIComponent(countryCode)}`,
  );
}

export async function listPaymentReconciliations(
  token: string,
  opts: { country_code?: string; status?: string; limit?: number } = {},
) {
  const params = new URLSearchParams();
  if (opts.country_code) params.set('country_code', opts.country_code);
  if (opts.status) params.set('status', opts.status);
  if (opts.limit) params.set('limit', String(opts.limit));
  const q = params.toString();
  return paymentsCall<{ data: ReconReviewRow[]; sandbox: true }>(
    token,
    `/reconciliation${q ? `?${q}` : ''}`,
  );
}
