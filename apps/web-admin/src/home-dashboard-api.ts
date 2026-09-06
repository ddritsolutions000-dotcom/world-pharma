import { adminApiRoot, adminAuthHeaders, classifyAdminViewState } from './admin-http';
import { fetchAnalyticsOverview, type AnalyticsOverviewResponse } from './analytics-api';
import { fetchFinanceBreaks } from './finance-admin-api';
import { getPaymentRoutingMatrix, getR14AGateConfig, type R14AGateConfigResponse } from './payments-admin-api';
import { listPolicyPacks, type PolicyPackListResponse } from './policy-pack-admin-api';
import { listPromoCampaigns } from './promo-api';
import { listReviewModeration } from './reviews-api';
import { listSupportTickets, type SupportTicketSummary } from './support-desk-api';

export type SectionResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: 'forbidden' | 'network' | 'unavailable'; detail?: string };

export type FinanceDashboardSnapshot = {
  sandbox: boolean;
  live_payout: boolean;
  facts: number;
  vendor_payables: number;
  payouts: number;
  contributions: number;
  note: string;
};

export type AdminOrderRow = {
  id: string;
  order_number: string;
  status: string;
  total_minor?: string;
  currency?: string;
  created_at?: string;
};

export type AdminShipmentRow = {
  id: string;
  status: string;
  tracking_number?: string | null;
};

export type WorkQueueItem = {
  id: string;
  kind: 'order' | 'support' | 'partner' | 'shipment';
  title: string;
  subtitle: string;
  statusLabel: string;
  href: string;
  sortKey: number;
};

export type PartnerApplicationRow = {
  id: string;
  status: string;
  partner_type_code: string;
};

export type SecurityEventRow = {
  id?: string;
  type?: string;
  outcome?: string;
  created_at?: string;
  createdAt?: string;
};

export type HomeDashboardScope = {
  countryCode: string;
  from: string;
  to: string;
};

const PARTNER_REVIEW_STATUSES = new Set([
  'UNDER_REVIEW',
  'DOCUMENTS_SUBMITTED',
  'ADDITIONAL_INFORMATION_REQUIRED',
  'DOCUMENTS_REQUIRED',
  'PROFILE_INCOMPLETE',
]);

const SUPPORT_OPEN_STATUSES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] as const;

export function sectionFail(err?: unknown): Extract<SectionResult<never>, { ok: false }> {
  if (err === undefined) {
    return { ok: false, kind: 'network' };
  }
  const kind = classifyAdminViewState(err);
  if (kind === 'forbidden') {
    return { ok: false, kind: 'forbidden' };
  }
  if (kind === 'network') {
    return { ok: false, kind: 'network' };
  }
  return { ok: false, kind: 'unavailable' };
}

async function adminJson<T>(token: string, path: string): Promise<SectionResult<T>> {
  try {
    const res = await fetch(`${adminApiRoot()}${path}`, {
      headers: adminAuthHeaders(token),
    });
    if (res.status === 403) {
      return { ok: false, kind: 'forbidden' };
    }
    if (!res.ok) {
      return { ok: false, kind: 'unavailable', detail: `HTTP ${res.status}` };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, kind: 'network', detail: 'network_error' };
  }
}

export async function loadFinanceDashboard(token: string): Promise<SectionResult<FinanceDashboardSnapshot>> {
  return adminJson<FinanceDashboardSnapshot>(token, '/api/v1/admin/finance/dashboard');
}

export async function loadOpenFinanceBreakCount(token: string): Promise<SectionResult<number>> {
  try {
    const res = await fetchFinanceBreaks(token, { workflow_status: 'OPEN', limit: 100 });
    if (res.status === 403) {
      return { ok: false, kind: 'forbidden' };
    }
    if (!res.ok) {
      return { ok: false, kind: 'unavailable' };
    }
    const body = (await res.json()) as { data?: unknown[] };
    return { ok: true, data: body.data?.length ?? 0 };
  } catch {
    return { ok: false, kind: 'network' };
  }
}

export async function loadAnalyticsOverview(
  token: string,
  scope: HomeDashboardScope,
): Promise<SectionResult<AnalyticsOverviewResponse>> {
  try {
    const data = await fetchAnalyticsOverview(token, {
      countryCode: scope.countryCode,
      from: scope.from,
      to: scope.to,
    });
    return { ok: true, data };
  } catch (err) {
    return sectionFail(err);
  }
}

export async function loadSupportOpenCount(
  token: string,
  countryCode: string,
): Promise<SectionResult<number>> {
  try {
    const counts = await Promise.all(
      SUPPORT_OPEN_STATUSES.map(async (status) => {
        const body = await listSupportTickets(token, { country_code: countryCode, status });
        return body.data?.length ?? 0;
      }),
    );
    return { ok: true, data: counts.reduce((sum, value) => sum + value, 0) };
  } catch (err) {
    return sectionFail(err);
  }
}

export async function loadPartnerReviewCount(token: string): Promise<SectionResult<number>> {
  const result = await adminJson<{ data?: PartnerApplicationRow[] }>(token, '/api/v1/admin/partners/applications');
  if (!result.ok) {
    return result;
  }
  const pending = (result.data.data ?? []).filter((row) => PARTNER_REVIEW_STATUSES.has(row.status)).length;
  return { ok: true, data: pending };
}

export async function loadPolicyPackSummary(
  token: string,
  countryCode: string,
): Promise<SectionResult<PolicyPackListResponse>> {
  try {
    const data = await listPolicyPacks(token, countryCode);
    return { ok: true, data };
  } catch (err) {
    return sectionFail(err);
  }
}

export async function loadR14AGates(token: string): Promise<SectionResult<R14AGateConfigResponse>> {
  try {
    const data = await getR14AGateConfig(token);
    return { ok: true, data };
  } catch (err) {
    return sectionFail(err);
  }
}

export async function loadPaymentRoutingSummary(
  token: string,
  countryCode: string,
): Promise<SectionResult<{ live_payments_enabled: boolean; payments_enabled: boolean; sandbox: boolean }>> {
  try {
    const matrix = await getPaymentRoutingMatrix(token, countryCode);
    return {
      ok: true,
      data: {
        live_payments_enabled: matrix.live_payments_enabled,
        payments_enabled: matrix.payments_enabled,
        sandbox: matrix.sandbox,
      },
    };
  } catch (err) {
    return sectionFail(err);
  }
}

export async function loadReviewsPendingCount(
  token: string,
  countryCode: string,
): Promise<SectionResult<number>> {
  try {
    const body = await listReviewModeration(token, countryCode, 'SUBMITTED');
    return { ok: true, data: body.data?.length ?? 0 };
  } catch (err) {
    return sectionFail(err);
  }
}

export async function loadPromoActiveCount(
  token: string,
  countryCode: string,
): Promise<SectionResult<number>> {
  try {
    const body = await listPromoCampaigns(token, countryCode);
    const active = (body.data ?? []).filter((row) => row.status === 'ACTIVE').length;
    return { ok: true, data: active };
  } catch (err) {
    return sectionFail(err);
  }
}

export async function loadRecentSecurityEvents(
  token: string,
  limit = 5,
): Promise<SectionResult<SecurityEventRow[]>> {
  const result = await adminJson<{ data?: SecurityEventRow[] }>(
    token,
    `/api/v1/admin/security-events?limit=${limit}`,
  );
  if (!result.ok) {
    return result;
  }
  return { ok: true, data: result.data.data ?? [] };
}

export async function loadApiHealthReady(): Promise<SectionResult<'ready' | 'not_ready'>> {
  try {
    const res = await fetch(`${adminApiRoot()}/health/ready`);
    if (!res.ok) {
      return { ok: true, data: 'not_ready' };
    }
    return { ok: true, data: 'ready' };
  } catch {
    return { ok: false, kind: 'network' };
  }
}

export async function loadRecentOrders(token: string, limit = 8): Promise<SectionResult<AdminOrderRow[]>> {
  const result = await adminJson<{ data?: AdminOrderRow[] }>(token, '/api/v1/admin/orders');
  if (!result.ok) {
    return result;
  }
  return { ok: true, data: (result.data.data ?? []).slice(0, limit) };
}

export async function loadActionSupportTickets(
  token: string,
  countryCode: string,
  limit = 8,
): Promise<SectionResult<SupportTicketSummary[]>> {
  try {
    const seen = new Set<string>();
    const rows: SupportTicketSummary[] = [];
    for (const status of SUPPORT_OPEN_STATUSES) {
      const body = await listSupportTickets(token, { country_code: countryCode, status });
      for (const row of body.data ?? []) {
        if (seen.has(row.id)) {
          continue;
        }
        seen.add(row.id);
        rows.push(row);
      }
    }
    rows.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
    return { ok: true, data: rows.slice(0, limit) };
  } catch (err) {
    return sectionFail(err);
  }
}

export async function loadPendingPartnerApplications(
  token: string,
  limit = 8,
): Promise<SectionResult<PartnerApplicationRow[]>> {
  const result = await adminJson<{ data?: PartnerApplicationRow[] }>(token, '/api/v1/admin/partners/applications');
  if (!result.ok) {
    return result;
  }
  const pending = (result.data.data ?? []).filter((row) => PARTNER_REVIEW_STATUSES.has(row.status));
  return { ok: true, data: pending.slice(0, limit) };
}

export async function loadRecentShipments(token: string, limit = 8): Promise<SectionResult<AdminShipmentRow[]>> {
  const result = await adminJson<{ data?: AdminShipmentRow[] }>(token, '/api/v1/admin/shipments');
  if (!result.ok) {
    return result;
  }
  return { ok: true, data: (result.data.data ?? []).slice(0, limit) };
}

export async function loadAdminCollectionCount(token: string, path: string): Promise<SectionResult<number>> {
  const result = await adminJson<{ data?: unknown[]; labs?: unknown[] }>(token, path);
  if (!result.ok) {
    return result;
  }
  if (Array.isArray(result.data.labs)) {
    return { ok: true, data: result.data.labs.length };
  }
  return { ok: true, data: result.data.data?.length ?? 0 };
}

export type GlobalDashboardSnapshot = {
  orders: number | null;
  partners_pending: number | null;
  labs: number | null;
  security_events: number | null;
  finance_facts: number | null;
  api_ready: boolean;
};

export async function loadGlobalDashboardSnapshot(token: string): Promise<SectionResult<GlobalDashboardSnapshot>> {
  const [orders, partners, labs, security, finance, apiHealth] = await Promise.all([
    loadRecentOrders(token, 100),
    loadPartnerReviewCount(token),
    adminJson<{ labs?: unknown[] }>(token, '/api/v1/admin/labs'),
    loadRecentSecurityEvents(token, 10),
    loadFinanceDashboard(token),
    loadApiHealthReady(),
  ]);

  return {
    ok: true,
    data: {
      orders: orders.ok ? orders.data.length : null,
      partners_pending: partners.ok ? partners.data : null,
      labs: labs.ok ? (labs.data.labs?.length ?? 0) : null,
      security_events: security.ok ? security.data.length : null,
      finance_facts: finance.ok ? Number(finance.data.facts ?? 0) : null,
      api_ready: apiHealth.ok ? apiHealth.data === 'ready' : false,
    },
  };
}

export function buildWorkQueue(input: {
  countryCode: string;
  orders: AdminOrderRow[];
  tickets: SupportTicketSummary[];
  partners: PartnerApplicationRow[];
  shipments: AdminShipmentRow[];
}): WorkQueueItem[] {
  const items: WorkQueueItem[] = [];
  for (const row of input.orders) {
    items.push({
      id: `order-${row.id}`,
      kind: 'order',
      title: row.order_number,
      subtitle: 'Commerce order — fulfillment and exceptions',
      statusLabel: row.status.replaceAll('_', ' ').toLowerCase(),
      href: `/orders?orderId=${row.id}`,
      sortKey: Number.isFinite(Date.parse(row.created_at ?? '')) ? Date.parse(row.created_at ?? '') : 0,
    });
  }
  for (const row of input.tickets) {
    items.push({
      id: `support-${row.id}`,
      kind: 'support',
      title: row.subject,
      subtitle: `${row.queue_code} · ticket ${row.id.slice(0, 8)}`,
      statusLabel: row.status.replaceAll('_', ' ').toLowerCase(),
      href: `/support/${row.id}?country=${input.countryCode}`,
      sortKey: Date.parse(row.updated_at) || 0,
    });
  }
  for (const row of input.partners) {
    items.push({
      id: `partner-${row.id}`,
      kind: 'partner',
      title: `${row.partner_type_code} application`,
      subtitle: `Application ${row.id.slice(0, 8)}`,
      statusLabel: row.status.replaceAll('_', ' ').toLowerCase(),
      href: '/partners',
      sortKey: 0,
    });
  }
  for (const row of input.shipments) {
    items.push({
      id: `shipment-${row.id}`,
      kind: 'shipment',
      title: row.tracking_number ?? `Shipment ${row.id.slice(0, 8)}`,
      subtitle: 'Carrier booking, reconcile, or delivery exception',
      statusLabel: row.status.replaceAll('_', ' ').toLowerCase(),
      href: '/logistics',
      sortKey: 0,
    });
  }
  return items.sort((a, b) => b.sortKey - a.sortKey).slice(0, 12);
}
