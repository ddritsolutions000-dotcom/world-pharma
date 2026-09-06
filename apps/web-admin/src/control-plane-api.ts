import { adminApiRoot, adminAuthHeaders } from './admin-http';

export type CountryReadinessState =
  | 'NOT_READY'
  | 'READY_FOR_SANDBOX'
  | 'READY_FOR_ACTIVATION'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'DRAFT'
  | 'CONFIGURING'
  | 'SANDBOX_READY'
  | 'PRODUCTION_READY';

export type MarketReadinessBlocker = string;

export type ControlPlaneSnapshot = {
  scope: string;
  currency?: string | null;
  country_code?: string | null;
  commerce: {
    orders: number;
    orders_today?: number;
    analytics: {
      order_paid_count: number;
      order_gmv_minor: string;
      checkout_started_count: number;
    } | null;
    successful_payments_24h?: number;
    failed_payments: number;
    refund_facts?: number;
    active_vendors?: number;
  };
  healthcare: {
    labs: number;
    doctors?: number;
    imaging_centers?: number;
    appointments_24h?: number;
    lab_bookings_open?: number;
    imaging_bookings_open?: number;
    partner_reviews_pending: number;
  };
  logistics: {
    active_shipments?: number;
    delivery_exceptions?: number;
    note: string;
  };
  finance: {
    facts: number;
    open_breaks: number;
    vendor_payables_open?: number;
    affiliate_facts?: number;
    affiliate_liabilities_open?: number;
    live_payment_enabled: boolean;
    sandbox: boolean;
    settlement_status?: string;
  };
  governance: {
    pending_grants: number;
    partner_reviews_pending: number;
    kyc_pending?: number;
    active_break_glass: number;
  };
  reliability?: {
    outbox_pending: number;
    outbox_dead_lettered: number;
  };
  security: { events_last_7d: number };
  global: { active_countries: number; total_countries: number };
};

export type ApprovalItem = {
  id: string;
  type: string;
  title: string;
  entity_id: string;
  country_code: string | null;
  status: string;
  created_at: string;
  required_permission: string;
  href: string;
  requester_label: string | null;
};

export type ExceptionItem = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  severity: 'warning' | 'critical' | 'info';
  href: string;
  country_code: string | null;
};

export type CountryOverviewRow = {
  country_code: string;
  name: string;
  status: string;
  currency: string;
  timezone: string;
  readiness: CountryReadinessState;
  readiness_legacy?: CountryReadinessState;
  blockers?: MarketReadinessBlocker[];
  can_activate_sandbox?: boolean;
  policy_published: boolean;
  updated_at?: string;
  payments_sandbox?: boolean;
  delivery_sandbox?: boolean;
  notifications_gated?: string;
  finance_gated?: string;
};

export type CountryDetail = CountryOverviewRow & {
  locale: string;
  region_code: string | null;
  activation_status?: string;
  external_gates?: MarketReadinessBlocker[];
  healthcare?: {
    status: string;
    items: Array<{ code: string; status: string }>;
  };
  policy: {
    published_version: number | null;
    draft_version: number | null;
    published_at: string | null;
    payment_configured?: boolean;
    delivery_configured?: boolean;
  };
  payments: {
    enabled_methods: number;
    live_enabled: boolean;
    sandbox: boolean;
    policy_configured?: boolean;
    live_psp?: string;
  };
  notifications: {
    total: number;
    verified: number;
    unconfigured: number;
    live_messaging?: string;
  };
  logistics: {
    serviceability_zones: number;
    delivery_policy_configured?: boolean;
    live_carrier?: string;
    sandbox_carrier?: boolean;
  };
  finance?: {
    settlement_policy_configured: boolean;
    currency: string;
    live_payout: string;
  };
  links: Record<string, string>;
};

async function controlPlaneFetch<T>(
  token: string,
  path: string,
  init?: { method?: string; body?: string },
): Promise<T> {
  const res = await fetch(`${adminApiRoot()}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      ...adminAuthHeaders(token),
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init?.body,
  });
  if (res.status === 403) {
    throw Object.assign(new Error('forbidden'), { status: 403 });
  }
  if (!res.ok) {
    let detail = 'request_failed';
    try {
      const body = (await res.json()) as { detail?: string; code?: string };
      detail = body.detail ?? body.code ?? detail;
    } catch {
      // ignore
    }
    throw Object.assign(new Error(detail), { status: res.status });
  }
  return (await res.json()) as T;
}

export function fetchControlPlaneSnapshot(token: string, countryCode?: string) {
  const qs = countryCode ? `?country_code=${encodeURIComponent(countryCode)}` : '';
  return controlPlaneFetch<ControlPlaneSnapshot>(token, `/api/v1/admin/control-plane/snapshot${qs}`);
}

export function fetchApprovalQueue(token: string) {
  return controlPlaneFetch<{ data: ApprovalItem[] }>(token, '/api/v1/admin/control-plane/approvals');
}

export function fetchOperationsExceptions(token: string) {
  return controlPlaneFetch<{ data: ExceptionItem[] }>(token, '/api/v1/admin/control-plane/exceptions');
}

export function fetchCountriesOverview(token: string) {
  return controlPlaneFetch<{ data: CountryOverviewRow[] }>(token, '/api/v1/admin/control-plane/countries');
}

export function fetchCountryDetail(token: string, iso: string) {
  return controlPlaneFetch<CountryDetail>(token, `/api/v1/admin/control-plane/countries/${encodeURIComponent(iso)}`);
}

export function activateCountry(token: string, iso: string) {
  return controlPlaneFetch<CountryDetail>(
    token,
    `/api/v1/admin/control-plane/countries/${encodeURIComponent(iso)}/activate`,
    { method: 'POST' },
  );
}

export function suspendCountry(token: string, iso: string) {
  return controlPlaneFetch<CountryDetail>(
    token,
    `/api/v1/admin/control-plane/countries/${encodeURIComponent(iso)}/suspend`,
    { method: 'POST' },
  );
}

export type ProductionDimensionView = {
  dimension: string;
  status: string;
  blockers: string[];
  warnings: string[];
};

export type ProductionReadinessView = {
  country_code: string;
  production_lifecycle: string;
  overall_status: string;
  production_ready: boolean;
  activation_eligible: boolean;
  dimensions: ProductionDimensionView[];
  blockers: string[];
  warnings: string[];
  requirement_coverage: Array<{
    code: string;
    label: string;
    mandatory: boolean;
    evidence_status: string | null;
    satisfied: boolean;
    expires_at: string | null;
    blocker: string | null;
  }>;
  partner_readiness: {
    pharmacy_licence_verified: boolean;
    kyc_verified: boolean;
    commercial_approved: boolean;
  };
};

export type RegulatoryEvidenceAdminRow = {
  id: string;
  requirement_code: string | null;
  requirement_label: string | null;
  document_type: string;
  status: string;
  expires_at: string | null;
  verified_by_id: string | null;
  verified_at: string | null;
  has_private_object_ref: boolean;
};

export function fetchProductionReadiness(token: string, iso: string) {
  return controlPlaneFetch<ProductionReadinessView>(
    token,
    `/api/v1/admin/regulatory/countries/${encodeURIComponent(iso)}/production-readiness`,
  );
}

export type LaunchDimensionStatus =
  | 'READY'
  | 'BLOCKED'
  | 'EXTERNAL_GATED'
  | 'SUSPENDED'
  | 'NOT_CONFIGURED';

export type FinalLaunchReadinessView = {
  country_code: string;
  country_id: string;
  production_lifecycle: string;
  evaluated_at: string;
  overall_decision: 'READY_FOR_ACTIVATION' | 'NOT_READY' | 'SUSPENDED';
  activation_impossible: boolean;
  software_ready_vs_real_world: {
    software_composition_ready: boolean;
    real_world_dependencies_required: boolean;
    note: string;
  };
  dimensions: Array<{
    id: string;
    label: string;
    status: LaunchDimensionStatus;
    blocker_count: number;
    external_gated_count: number;
    summary: string;
    software_ready_note: string;
  }>;
  blockers: Array<{
    code: string;
    dimension: string;
    explanation: string;
    severity: string;
    actionable: 'INTERNAL' | 'EXTERNAL';
    taxonomy?: string;
    country_code: string;
    category: string;
    evidence_or_approval_required: string;
    blocks_activation: true;
    actionability?: {
      taxonomy: string;
      what_is_missing: string;
      why_blocks_launch: string;
      resolving_workflow: string;
      resolving_href: string | null;
      authorized_permission: string;
      requires_external_party: boolean;
      status_after_resolution: string;
      can_clear_from_application: boolean;
      runbook_stage: number;
      dependency_category: string | null;
      required_provider_class: string | null;
      config_reference_required: boolean;
      credentials_missing: boolean | null;
      live_verification_required: boolean;
    };
  }>;
  checklist: Array<{
    id: string;
    category:
      | 'LEGAL'
      | 'PARTNERS'
      | 'PAYMENTS'
      | 'COMMUNICATIONS'
      | 'LOGISTICS'
      | 'INFRASTRUCTURE'
      | 'HEALTHCARE';
    label: string;
    status: LaunchDimensionStatus;
    blocker_code: string | null;
    external: boolean;
  }>;
  external_gated_items: Array<{ code: string; dimension: string; label: string }>;
  never_fake_green: true;
  never_expose_secrets: true;
  never_expose_phi: true;
};

export function fetchFinalLaunchReadiness(token: string, iso: string) {
  return controlPlaneFetch<FinalLaunchReadinessView>(
    token,
    `/api/v1/admin/regulatory/countries/${encodeURIComponent(iso)}/final-launch-readiness`,
  );
}

export type FirstCountryLaunchPackageView = {
  country_code: string;
  country_id: string;
  country_neutral: true;
  no_india_assumptions: true;
  evaluated_at: string;
  overall_decision: 'READY_FOR_ACTIVATION' | 'NOT_READY' | 'SUSPENDED';
  why_not_launch: string;
  next_action: string | null;
  taxonomy_counts: Record<string, number>;
  sections: Array<{
    id: string;
    label: string;
    status: string;
    summary: string;
    blocker_codes: string[];
    next_action: string | null;
  }>;
  runbook: Array<{
    id: string;
    stage: number;
    stage_label: string;
    label: string;
    status: string;
    blocker_code: string | null;
    taxonomy: string | null;
    can_clear_from_application: boolean | null;
  }>;
  readiness: FinalLaunchReadinessView;
  never_fake_green: true;
};

export type ActivationDryRunView = {
  country_code: string;
  result: 'PASS' | 'FAIL';
  would_activate: false;
  mutated: false;
  never_mutates: true;
  overall_decision: string;
  activation_impossible: boolean;
  why_not_launch: string;
  next_action: string | null;
  evaluated_at: string;
  taxonomy_counts: Record<string, number>;
  blockers: FinalLaunchReadinessView['blockers'];
  internal_blockers: FinalLaunchReadinessView['blockers'];
  external_blockers: FinalLaunchReadinessView['blockers'];
  production_lifecycle_before: string;
  production_lifecycle_after: string;
  audit_event_emitted: boolean;
};

export function fetchFirstCountryLaunchPackage(token: string, iso: string) {
  return controlPlaneFetch<FirstCountryLaunchPackageView>(
    token,
    `/api/v1/admin/regulatory/countries/${encodeURIComponent(iso)}/first-country-launch-package`,
  );
}

export function runActivationDryRun(token: string, iso: string) {
  return controlPlaneFetch<ActivationDryRunView>(
    token,
    `/api/v1/admin/regulatory/countries/${encodeURIComponent(iso)}/activation-dry-run`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export function fetchRegulatoryEvidence(token: string, iso: string) {
  return controlPlaneFetch<RegulatoryEvidenceAdminRow[]>(
    token,
    `/api/v1/admin/regulatory/countries/${encodeURIComponent(iso)}/evidence`,
  );
}

export function activateProductionCountry(token: string, iso: string, reason?: string) {
  return controlPlaneFetch<ProductionReadinessView>(
    token,
    `/api/v1/admin/regulatory/countries/${encodeURIComponent(iso)}/production/activate`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  );
}

export function suspendProductionCountry(token: string, iso: string, reason: string) {
  return controlPlaneFetch<ProductionReadinessView>(
    token,
    `/api/v1/admin/regulatory/countries/${encodeURIComponent(iso)}/production/suspend`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  );
}

export function transitionProductionLifecycle(
  token: string,
  iso: string,
  to: string,
  reason?: string,
) {
  return controlPlaneFetch(
    token,
    `/api/v1/admin/regulatory/countries/${encodeURIComponent(iso)}/lifecycle/transition`,
    { method: 'POST', body: JSON.stringify({ to, reason }) },
  );
}

export function fetchReliabilitySnapshot(token: string) {
  return controlPlaneFetch<{
    outbox: Record<string, number>;
    idempotency: { records_last_24h: number };
    live_payment_enabled: boolean;
  }>(token, '/api/v1/admin/control-plane/reliability/snapshot');
}

export type ProductionLaunchControlView = {
  sprint: number;
  foundation_sprints: string;
  evaluated_at: string;
  correlation_id: string;
  market: string;
  service_scope: string;
  can_production_launch: 'YES' | 'NO';
  overall_status: 'NOT_READY' | 'READY';
  decision: string;
  force_launch_available: false;
  message: string;
  provider_activation_any_live_enabled: boolean;
  mandatory_unresolved: string[];
  not_applicable_rails: string[];
  groups: Array<{
    id: string;
    label: string;
    rails: string[];
    blocked: boolean;
    blockers: string[];
  }>;
  rails: Array<{
    rail_id: string;
    group: string;
    label: string;
    provider_name: string;
    stage: string;
    enabled: boolean;
    sandbox_status: string;
    production_status: string;
    blocker_codes: string[];
    blocker_category: string;
    source: string;
    notes: string[];
  }>;
  active_blockers: Array<{
    rail_id: string;
    code: string;
    category: string;
    applicability: string;
  }>;
  semantic_guards: Record<string, boolean>;
  secrets_printed: false;
};

export function fetchProductionLaunchControl(
  token: string,
  opts?: { market?: string; service_scope?: string },
) {
  const qs = new URLSearchParams();
  if (opts?.market) qs.set('market', opts.market);
  if (opts?.service_scope) qs.set('service_scope', opts.service_scope);
  const suffix = qs.toString() ? `?${qs}` : '';
  return controlPlaneFetch<ProductionLaunchControlView>(
    token,
    `/api/v1/admin/control-plane/production-launch-control${suffix}`,
  );
}
