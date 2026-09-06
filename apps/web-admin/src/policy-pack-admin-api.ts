import { adminApiRoot } from './admin-http';

export class PolicyPackAdminApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type PolicyPackVersion = {
  id: string;
  version: number;
  status: 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED';
  published_at: string | null;
  created_at: string;
  checksum: string | null;
  created_by_id: string | null;
  published_by_id: string | null;
};

export type PolicyOperatorView = {
  services: Record<string, boolean>;
  i18n: {
    default_locale: string;
    locales: string[];
  };
  currency: {
    default: string;
    allowed: string[];
  };
  timezone_default: string;
  payments: {
    enabled: boolean;
    methods: string[];
    gateway_refs: string[];
    currencies: string[];
  };
  tax_profile_id: string | null;
  ledger_legal_entity_id: string | null;
  ledger_accounting_currency: string | null;
  recording_allowed: boolean;
  data_residency_mode: 'shared' | 'pinned_region' | 'dedicated_db';
  healthcare_flags: Record<string, boolean>;
  crm_enabled: boolean;
  analytics_enabled: boolean;
  search_discovery_enabled: boolean;
  commerce: {
    platform_fee_bps: number;
    platform_fee_flat_minor: number;
    delivery_fee_minor: number;
    packaging_fee_minor: number;
    handling_fee_minor: number;
    payment_convenience_fee_minor: number;
    free_delivery_threshold_minor: number | null;
    carrier_cost_estimate_minor: number;
  };
};

export type PolicyPackDetail = PolicyPackVersion & {
  country_code: string;
  document: Record<string, unknown>;
  operator: PolicyOperatorView;
  operator_status: string;
  dual_control_required: boolean;
  live_payment_enabled: boolean;
  registered_gateway_codes: string[];
  payment_method_families: string[];
};

export type PolicyPackListResponse = {
  country_code: string;
  data: PolicyPackVersion[];
  published_id: string | null;
  registered_gateway_codes: string[];
  payment_method_families: string[];
  service_keys: string[];
  healthcare_flag_keys: string[];
  data_residency_modes: string[];
  live_payment_enabled: boolean;
  live_unlock_note: string;
  baseline_operator: PolicyOperatorView;
};

export type PolicyDiffEntry = { path: string; before: unknown; after: unknown };

export type PolicyValidateResponse = {
  ok: boolean;
  errors: string[];
  operator_status: 'VALIDATED' | 'INVALID';
  dual_control_required: boolean;
  live_payment_enabled: boolean;
  diff: PolicyDiffEntry[];
  operator: PolicyOperatorView;
};

async function policyCall<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const base = adminApiRoot();
  const res = await fetch(`${base}/api/v1/admin/policy-packs${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new PolicyPackAdminApiError(
      (body as { detail?: string; code?: string }).detail ??
        (body as { code?: string }).code ??
        'request_failed',
      res.status,
    );
  }
  return body as T;
}

export function listPolicyPacks(token: string, country: string) {
  return policyCall<PolicyPackListResponse>(token, `?country=${encodeURIComponent(country)}`);
}

export function getPolicyPack(token: string, id: string) {
  return policyCall<PolicyPackDetail>(token, `/${encodeURIComponent(id)}`);
}

export function getPolicyPackDiff(token: string, id: string) {
  return policyCall<{ pack_id: string; country_code: string; entries: PolicyDiffEntry[] }>(
    token,
    `/${encodeURIComponent(id)}/diff`,
  );
}

export function validatePolicyPackDocument(
  token: string,
  country: string,
  document: Record<string, unknown>,
) {
  return policyCall<PolicyValidateResponse>(token, '/validate', {
    method: 'POST',
    body: JSON.stringify({ country_code: country, document }),
  });
}

export function validateStoredPolicyPack(token: string, id: string) {
  return policyCall<PolicyValidateResponse>(token, `/${encodeURIComponent(id)}/validate`, {
    method: 'POST',
  });
}

export function createPolicyPackDraft(token: string, country: string, document: Record<string, unknown>) {
  return policyCall<PolicyPackDetail>(token, '', {
    method: 'POST',
    body: JSON.stringify({ country_code: country, document }),
  });
}

export function publishPolicyPack(token: string, id: string, dualControl?: boolean) {
  return policyCall<Record<string, unknown>>(token, `/${encodeURIComponent(id)}/publish`, {
    method: 'POST',
    body: JSON.stringify({ dual_control: dualControl === true }),
  });
}

export function rollbackPolicyPack(token: string, country: string) {
  return policyCall<Record<string, unknown>>(token, '/rollback', {
    method: 'POST',
    body: JSON.stringify({ country_code: country }),
  });
}

export function applyOperatorToDocument(
  document: Record<string, unknown>,
  operator: PolicyOperatorView,
): Record<string, unknown> {
  const current = document as {
    services?: Record<string, boolean>;
    healthcare?: Record<string, unknown>;
    crm?: Record<string, unknown>;
    analytics?: Record<string, unknown>;
    search?: Record<string, unknown>;
    timezone?: { default?: string; allowed?: string[] };
  };
  const timezoneDefault = operator.timezone_default.trim();
  const timezoneAllowed = [...new Set([timezoneDefault, ...(current.timezone?.allowed ?? [])])].filter(Boolean);
  return {
    ...document,
    services: { ...(current.services ?? {}), ...operator.services },
    i18n: {
      default_locale: operator.i18n.default_locale,
      locales: [...operator.i18n.locales],
    },
    currency: {
      default: operator.currency.default,
      allowed: [...operator.currency.allowed],
    },
    timezone: {
      default: timezoneDefault,
      allowed: timezoneAllowed.length ? timezoneAllowed : [timezoneDefault || 'UTC'],
    },
    payments: {
      enabled: operator.payments.enabled,
      methods: [...operator.payments.methods],
      gateway_refs: [...operator.payments.gateway_refs],
      currencies: [...operator.payments.currencies],
    },
    tax_profile_id: operator.tax_profile_id?.trim() ? operator.tax_profile_id.trim() : null,
    ledger: {
      legal_entity_id: operator.ledger_legal_entity_id?.trim() ? operator.ledger_legal_entity_id.trim() : null,
      accounting_currency: operator.ledger_accounting_currency?.trim()
        ? operator.ledger_accounting_currency.trim().toUpperCase()
        : null,
    },
    recording_allowed: operator.recording_allowed,
    data_residency_mode: operator.data_residency_mode,
    healthcare: { ...(current.healthcare ?? {}), ...operator.healthcare_flags },
    crm: { ...(current.crm ?? {}), enabled: operator.crm_enabled },
    analytics: { ...(current.analytics ?? {}), enabled: operator.analytics_enabled },
    search: { ...(current.search ?? {}), discovery_enabled: operator.search_discovery_enabled },
  };
}

function toggleList(values: string[], item: string, enabled: boolean): string[] {
  const next = values.filter((value) => value !== item);
  if (enabled) {
    next.push(item);
  }
  return next;
}

export function toggleOperatorGateway(operator: PolicyOperatorView, code: string, enabled: boolean): PolicyOperatorView {
  return {
    ...operator,
    payments: { ...operator.payments, gateway_refs: toggleList(operator.payments.gateway_refs, code, enabled) },
  };
}

export function toggleOperatorMethod(operator: PolicyOperatorView, method: string, enabled: boolean): PolicyOperatorView {
  return {
    ...operator,
    payments: { ...operator.payments, methods: toggleList(operator.payments.methods, method, enabled) },
  };
}
