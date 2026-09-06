'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { visibleNavItems } from '@world-pharma/shell-core';
import { PortalKpiCards, useSession } from '@world-pharma/shell-web';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Heading,
  LoadingState,
  Stat,
  Text,
} from '@world-pharma/ui-kit/web';
import { formatCount, formatMinorUnits } from './analytics-format';
import { workingCountry, scopeLabel } from './working-country';
import { MarketCountrySelect } from './market-country-select';
import {
  buildWorkQueue,
  loadActionSupportTickets,
  loadAdminCollectionCount,
  loadAnalyticsOverview,
  loadApiHealthReady,
  loadFinanceDashboard,
  loadGlobalDashboardSnapshot,
  loadOpenFinanceBreakCount,
  loadPartnerReviewCount,
  loadPendingPartnerApplications,
  loadPromoActiveCount,
  loadRecentOrders,
  loadRecentSecurityEvents,
  loadRecentShipments,
  loadReviewsPendingCount,
  loadR14AGates,
  loadSupportOpenCount,
  sectionFail,
  type GlobalDashboardSnapshot,
  type SectionResult,
  type WorkQueueItem,
} from './home-dashboard-api';
import {
  fetchControlPlaneSnapshot,
  fetchOperationsExceptions,
  type ControlPlaneSnapshot,
  type ExceptionItem,
} from './control-plane-api';
import { ADMIN_NAV } from './nav';
import { BarChart, Sparkline } from './admin-charts';

type ViewState = 'loading' | 'idle';

function defaultToDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultFromDate(): string {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 29);
  return end.toISOString().slice(0, 10);
}

function AttentionTile({
  href,
  count,
  label,
  visible,
}: {
  href: string;
  count: number | null;
  label: string;
  visible: boolean;
}) {
  if (!visible) {
    return null;
  }
  return (
    <Link href={href} className="wp-attention-tile">
      <span className="wp-attention-count">{count == null ? '—' : formatCount(count)}</span>
      <span className="wp-attention-label">{label}</span>
    </Link>
  );
}

function WorkQueueRow({ item }: { item: WorkQueueItem }) {
  return (
    <Link href={item.href} className="wp-work-queue-card" role="listitem">
      <span className="wp-kind-badge">{item.kind}</span>
      <h3 className="wp-work-queue-title">{item.title}</h3>
      <span className="wp-work-queue-status">{item.statusLabel}</span>
      <p className="wp-work-queue-meta">{item.subtitle}</p>
      <span className="wp-work-queue-open">Open</span>
    </Link>
  );
}

export function HomeDashboard() {
  const { session, getAccessToken } = useSession();
  const permissions = session.permissions ?? [];
  const can = (perm: string) => permissions.includes(perm);

  const [dashboardScope, setDashboardScope] = useState(() => workingCountry(session.countryCode));
  const countryCode = dashboardScope.trim();
  const scopeDisplay = scopeLabel(dashboardScope || null);
  const from = defaultFromDate();
  const to = defaultToDate();

  const [viewState, setViewState] = useState<ViewState>('loading');
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  const [supportOpen, setSupportOpen] = useState<SectionResult<number> | null>(null);
  const [partnerReview, setPartnerReview] = useState<SectionResult<number> | null>(null);
  const [openBreaks, setOpenBreaks] = useState<SectionResult<number> | null>(null);
  const [recentOrders, setRecentOrders] = useState<SectionResult<import('./home-dashboard-api').AdminOrderRow[]> | null>(
    null,
  );
  const [actionTickets, setActionTickets] = useState<
    SectionResult<import('./support-desk-api').SupportTicketSummary[]> | null
  >(null);
  const [pendingPartners, setPendingPartners] = useState<
    SectionResult<import('./home-dashboard-api').PartnerApplicationRow[]> | null
  >(null);
  const [recentShipments, setRecentShipments] = useState<
    SectionResult<import('./home-dashboard-api').AdminShipmentRow[]> | null
  >(null);
  const [analytics, setAnalytics] = useState<SectionResult<import('./analytics-api').AnalyticsOverviewResponse> | null>(
    null,
  );
  const [r14a, setR14a] = useState<SectionResult<import('./payments-admin-api').R14AGateConfigResponse> | null>(null);
  const [apiHealth, setApiHealth] = useState<SectionResult<'ready' | 'not_ready'> | null>(null);
  const [securityEvents, setSecurityEvents] = useState<
    SectionResult<import('./home-dashboard-api').SecurityEventRow[]> | null
  >(null);
  const [deliveryJobs, setDeliveryJobs] = useState<SectionResult<number> | null>(null);
  const [appointments, setAppointments] = useState<SectionResult<number> | null>(null);
  const [refills, setRefills] = useState<SectionResult<number> | null>(null);
  const [reviewsPending, setReviewsPending] = useState<SectionResult<number> | null>(null);
  const [promoActive, setPromoActive] = useState<SectionResult<number> | null>(null);
  const [financeDash, setFinanceDash] = useState<
    SectionResult<import('./home-dashboard-api').FinanceDashboardSnapshot> | null
  >(null);
  const [globalSnap, setGlobalSnap] = useState<SectionResult<GlobalDashboardSnapshot> | null>(null);
  const [controlPlane, setControlPlane] = useState<SectionResult<ControlPlaneSnapshot> | null>(null);
  const [exceptions, setExceptions] = useState<SectionResult<ExceptionItem[]> | null>(null);

  const quickLinks = useMemo(
    () =>
      visibleNavItems(session, ADMIN_NAV)
        .filter((item) => item.id !== 'home' && item.href !== '/#ops')
        .slice(0, 12),
    [session],
  );

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated') {
      setViewState('idle');
      return;
    }
    setViewState('loading');

    setSupportOpen(can('support:read') ? null : { ok: false, kind: 'forbidden' });
    setPartnerReview(can('partner:manage') ? null : { ok: false, kind: 'forbidden' });
    setOpenBreaks(can('finance:read') ? null : { ok: false, kind: 'forbidden' });
    setRecentOrders(can('order:read') ? null : { ok: false, kind: 'forbidden' });
    setActionTickets(can('support:read') ? null : { ok: false, kind: 'forbidden' });
    setPendingPartners(can('partner:manage') ? null : { ok: false, kind: 'forbidden' });
    setRecentShipments(can('logistics:read') ? null : { ok: false, kind: 'forbidden' });
    setAnalytics(can('analytics:read') ? null : { ok: false, kind: 'forbidden' });
    setR14a(can('payment:read') ? null : { ok: false, kind: 'forbidden' });
    setSecurityEvents(can('identity:audit_read') ? null : { ok: false, kind: 'forbidden' });
    setDeliveryJobs(can('logistics:manage') ? null : { ok: false, kind: 'forbidden' });
    setAppointments(can('appointment:read') ? null : { ok: false, kind: 'forbidden' });
    setRefills(can('prescription:read') ? null : { ok: false, kind: 'forbidden' });
    setReviewsPending(can('review:moderate') ? null : { ok: false, kind: 'forbidden' });
    setPromoActive(can('promo:read') ? null : { ok: false, kind: 'forbidden' });
    setFinanceDash(can('finance:read') ? null : { ok: false, kind: 'forbidden' });
    setGlobalSnap(null);
    setControlPlane(null);
    setExceptions(null);
    setApiHealth(null);

    const scope = { countryCode, from, to };
    const tasks: Array<Promise<void>> = [];

    if (can('support:read') && countryCode) {
      tasks.push(loadSupportOpenCount(token, countryCode).then(setSupportOpen));
      tasks.push(loadActionSupportTickets(token, countryCode).then(setActionTickets));
    } else if (can('support:read')) {
      setSupportOpen({ ok: false, kind: 'unavailable', detail: 'Select a country scope' });
      setActionTickets({ ok: false, kind: 'unavailable', detail: 'Select a country scope' });
    }
    if (can('partner:manage')) {
      tasks.push(loadPartnerReviewCount(token).then(setPartnerReview));
      tasks.push(loadPendingPartnerApplications(token).then(setPendingPartners));
    }
    if (can('finance:read')) {
      tasks.push(loadOpenFinanceBreakCount(token).then(setOpenBreaks));
      tasks.push(loadFinanceDashboard(token).then(setFinanceDash));
    }
    if (can('order:read')) {
      tasks.push(loadRecentOrders(token).then(setRecentOrders));
    }
    if (can('logistics:read')) {
      tasks.push(loadRecentShipments(token).then(setRecentShipments));
    }
    if (can('analytics:read') && countryCode) {
      tasks.push(loadAnalyticsOverview(token, scope).then(setAnalytics));
    } else if (can('analytics:read')) {
      setAnalytics({ ok: false, kind: 'unavailable', detail: 'Select a country scope for analytics' });
    }
    if (can('payment:read')) {
      tasks.push(loadR14AGates(token).then(setR14a));
    }
    if (can('identity:audit_read')) {
      tasks.push(loadRecentSecurityEvents(token, 5).then(setSecurityEvents));
    }
    if (can('logistics:manage')) {
      tasks.push(loadAdminCollectionCount(token, '/api/v1/admin/delivery/jobs').then(setDeliveryJobs));
    }
    if (can('appointment:read')) {
      tasks.push(loadAdminCollectionCount(token, '/api/v1/admin/appointments').then(setAppointments));
    }
    if (can('prescription:read')) {
      tasks.push(loadAdminCollectionCount(token, '/api/v1/admin/refill-requests').then(setRefills));
    }
    if (can('review:moderate') && countryCode) {
      tasks.push(loadReviewsPendingCount(token, countryCode).then(setReviewsPending));
    }
    if (can('promo:read') && countryCode) {
      tasks.push(loadPromoActiveCount(token, countryCode).then(setPromoActive));
    }
    if (can('policy:read')) {
      tasks.push(
        fetchControlPlaneSnapshot(token, countryCode || undefined)
          .then((data) => ({ ok: true as const, data }))
          .catch((err) => sectionFail(err))
          .then(setControlPlane),
      );
      tasks.push(
        fetchOperationsExceptions(token)
          .then((body) => ({ ok: true as const, data: body.data }))
          .catch((err) => sectionFail(err))
          .then(setExceptions),
      );
    }
    if (!countryCode) {
      tasks.push(loadGlobalDashboardSnapshot(token).then(setGlobalSnap));
    }

    tasks.push(loadApiHealthReady().then(setApiHealth));

    await Promise.all(tasks);
    setLastRefreshed(new Date().toLocaleString());
    setViewState('idle');
  }, [countryCode, dashboardScope, from, getAccessToken, permissions, session.status, to]);

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin') {
      void load();
      return;
    }
    setViewState('idle');
  }, [load, session.audience, session.status]);

  const workQueue = useMemo(() => {
    return buildWorkQueue({
      countryCode,
      orders: recentOrders?.ok ? recentOrders.data : [],
      tickets: actionTickets?.ok ? actionTickets.data : [],
      partners: pendingPartners?.ok ? pendingPartners.data : [],
      shipments: recentShipments?.ok ? recentShipments.data : [],
    });
  }, [actionTickets, countryCode, pendingPartners, recentOrders, recentShipments]);

  const activeOrderCount = recentOrders?.ok ? recentOrders.data.length : null;
  const totals = analytics?.ok ? analytics.data.totals : null;

  if (viewState === 'loading' && !lastRefreshed) {
    return <LoadingState label="Loading operations center" />;
  }

  return (
    <div className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Executive control plane</Heading>
        <p className="wp-page-intro">
          Global and country-scoped operations view ({scopeDisplay}): exception queues, finance gates, partner onboarding,
          delivery, and security signals from live APIs.
        </p>
      </header>

      <div className="wp-toolbar">
        <MarketCountrySelect
          value={dashboardScope}
          onChange={setDashboardScope}
          label="Scope"
          ariaLabel="Dashboard country scope"
          allowEmpty
        />
        {!countryCode ? (
          <Badge kind="info">Global — country-specific KPIs hidden until a market is selected</Badge>
        ) : null}
      </div>

      <Card>
        <PortalKpiCards
          items={[
            {
              label: 'Open support',
              value: supportOpen?.ok ? supportOpen.data : '—',
            },
            {
              label: 'Partner review',
              value: partnerReview?.ok ? partnerReview.data : '—',
            },
            {
              label: 'Open breaks',
              value: openBreaks?.ok ? openBreaks.data : '—',
            },
            {
              label: 'Delivery jobs',
              value: deliveryJobs?.ok ? deliveryJobs.data : '—',
            },
          ]}
        />
      </Card>

      {!countryCode && globalSnap?.ok ? (
        <section>
          <h2 className="wp-section-title">Global overview</h2>
          <div className="wp-dashboard-grid">
            <Card>
              <Stat label="Recent orders (slice)" value={String(globalSnap.data.orders ?? '—')} />
            </Card>
            <Card>
              <Stat label="Partner reviews pending" value={String(globalSnap.data.partners_pending ?? '—')} />
            </Card>
            <Card>
              <Stat label="Lab partners" value={String(globalSnap.data.labs ?? '—')} />
            </Card>
            <Card>
              <Stat label="Finance facts" value={String(globalSnap.data.finance_facts ?? '—')} />
            </Card>
            <Card>
              <Stat label="Recent security events" value={String(globalSnap.data.security_events ?? '—')} />
            </Card>
          </div>
        </section>
      ) : null}

      {controlPlane?.ok ? (
        <section>
          <h2 className="wp-section-title">Command center</h2>
          {controlPlane.data.currency || controlPlane.data.finance.settlement_status ? (
            <p className="wp-list-meta">
              {controlPlane.data.country_code ? `Market ${controlPlane.data.country_code}` : 'Global scope'}
              {controlPlane.data.currency ? ` · ${controlPlane.data.currency}` : ''}
              {` · ${controlPlane.data.finance.sandbox ? 'SANDBOX' : 'LIVE_GATED'}`}
              {controlPlane.data.finance.settlement_status
                ? ` · settlement ${
                    controlPlane.data.finance.settlement_status === 'SANDBOX_NOT_SETTLED'
                      ? 'Sandbox — not settled'
                      : controlPlane.data.finance.settlement_status.replaceAll('_', ' ')
                  }`
                : ''}
            </p>
          ) : null}
          <div className="wp-dashboard-grid">
            <Card>
              <Stat label="Orders" value={formatCount(controlPlane.data.commerce.orders)} />
              <Stat label="Orders (24h)" value={formatCount(controlPlane.data.commerce.orders_today ?? 0)} />
              <Link href="/orders">
                <Button size="sm" variant="tertiary">
                  Open orders
                </Button>
              </Link>
            </Card>
            <Card>
              <Stat
                label="Payments captured (24h)"
                value={formatCount(controlPlane.data.commerce.successful_payments_24h ?? 0)}
              />
              <Stat label="Failed payments" value={formatCount(controlPlane.data.commerce.failed_payments)} />
              <Link href="/payments">
                <Button size="sm" variant="tertiary">
                  Payments
                </Button>
              </Link>
            </Card>
            <Card>
              <Stat
                label="GMV (30d minor)"
                value={
                  controlPlane.data.commerce.analytics
                    ? formatMinorUnits(controlPlane.data.commerce.analytics.order_gmv_minor)
                    : 'Select country'
                }
              />
              <Stat label="Active vendors" value={formatCount(controlPlane.data.commerce.active_vendors ?? 0)} />
            </Card>
            <Card>
              <Stat label="Doctors" value={formatCount(controlPlane.data.healthcare.doctors ?? 0)} />
              <Stat label="Labs" value={formatCount(controlPlane.data.healthcare.labs)} />
              <Stat label="Imaging" value={formatCount(controlPlane.data.healthcare.imaging_centers ?? 0)} />
              <Link href="/labs">
                <Button size="sm" variant="tertiary">
                  Healthcare consoles
                </Button>
              </Link>
            </Card>
            <Card>
              <Stat label="Active shipments" value={formatCount(controlPlane.data.logistics.active_shipments ?? 0)} />
              <Stat
                label="Delivery exceptions"
                value={formatCount(controlPlane.data.logistics.delivery_exceptions ?? 0)}
              />
              <Link href="/logistics">
                <Button size="sm" variant="tertiary">
                  Logistics
                </Button>
              </Link>
            </Card>
            <Card>
              <Stat
                label="Vendor payables open"
                value={formatCount(controlPlane.data.finance.vendor_payables_open ?? 0)}
              />
              <Stat
                label="Affiliate liabilities"
                value={formatCount(controlPlane.data.finance.affiliate_liabilities_open ?? 0)}
              />
              <Link href="/finance">
                <Button size="sm" variant="tertiary">
                  Finance
                </Button>
              </Link>
            </Card>
            <Card>
              <Stat label="Pending approvals" value={formatCount(controlPlane.data.governance.pending_grants)} />
              <Stat label="KYC pending" value={formatCount(controlPlane.data.governance.kyc_pending ?? 0)} />
              <Link href="/approvals">
                <Button size="sm" variant="tertiary">
                  Approval center
                </Button>
              </Link>
            </Card>
            <Card>
              <Stat
                label="Outbox dead letters"
                value={formatCount(controlPlane.data.reliability?.outbox_dead_lettered ?? 0)}
              />
              <Stat label="Outbox pending" value={formatCount(controlPlane.data.reliability?.outbox_pending ?? 0)} />
              <Link href="/reliability">
                <Button size="sm" variant="tertiary">
                  Reliability
                </Button>
              </Link>
            </Card>
            <Card>
              <Stat label="Active countries" value={formatCount(controlPlane.data.global.active_countries)} />
              <Link href="/countries">
                <Button size="sm" variant="tertiary">
                  Country control
                </Button>
              </Link>
            </Card>
          </div>
        </section>
      ) : null}

      {exceptions?.ok && exceptions.data.length ? (
        <section>
          <h2 className="wp-section-title">Operations exceptions</h2>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Kind</th>
                  <th>Issue</th>
                  <th>Detail</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {exceptions.data.slice(0, 8).map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Badge kind={row.severity === 'critical' ? 'warning' : 'info'}>{row.severity}</Badge>
                    </td>
                    <td>{row.kind.replaceAll('_', ' ')}</td>
                    <td>{row.title}</td>
                    <td>{row.detail}</td>
                    <td>
                      <Link href={row.href}>
                        <Button size="sm" variant="secondary">
                          Investigate
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="wp-status-bar">
        {apiHealth?.ok ? (
          <Badge kind={apiHealth.data === 'ready' ? 'success' : 'warning'}>
            API {apiHealth.data === 'ready' ? 'ready' : 'not ready'}
          </Badge>
        ) : (
          <Badge kind="info">Checking API…</Badge>
        )}
        <Badge kind="info">Sandbox · scope {scopeDisplay}</Badge>
        {r14a?.ok ? (
          <Badge kind={r14a.data.live_payment_enabled ? 'warning' : 'info'}>
            {r14a.data.live_payment_enabled ? 'Live payments flagged' : 'Live payments blocked'}
          </Badge>
        ) : null}
        <Button size="sm" variant="secondary" onClick={() => void load()} disabled={viewState === 'loading'}>
          {viewState === 'loading' ? 'Refreshing…' : 'Refresh'}
        </Button>
        {lastRefreshed ? (
          <Text size="caption" tone="secondary">
            Updated {lastRefreshed}
          </Text>
        ) : null}
      </div>

      <section>
        <h2 className="wp-section-title">Needs attention</h2>
        <div className="wp-attention-grid">
          <AttentionTile
            href="/support"
            count={supportOpen?.ok ? supportOpen.data : supportOpen ? 0 : null}
            label="Open support tickets"
            visible={can('support:read')}
          />
          <AttentionTile
            href="/partners"
            count={partnerReview?.ok ? partnerReview.data : partnerReview ? 0 : null}
            label="Partner reviews"
            visible={can('partner:manage')}
          />
          <AttentionTile
            href="/finance"
            count={openBreaks?.ok ? openBreaks.data : openBreaks ? 0 : null}
            label="Finance breaks"
            visible={can('finance:read')}
          />
          <AttentionTile
            href="/orders"
            count={activeOrderCount}
            label="Open order slice"
            visible={can('order:read')}
          />
          <AttentionTile
            href="/delivery"
            count={deliveryJobs?.ok ? deliveryJobs.data : deliveryJobs ? 0 : null}
            label="Delivery jobs"
            visible={can('logistics:manage')}
          />
          <AttentionTile
            href="/appointments"
            count={appointments?.ok ? appointments.data : appointments ? 0 : null}
            label="Appointments"
            visible={can('appointment:read')}
          />
          <AttentionTile
            href="/refills"
            count={refills?.ok ? refills.data : refills ? 0 : null}
            label="Refill requests"
            visible={can('prescription:read')}
          />
          <AttentionTile
            href="/reviews"
            count={reviewsPending?.ok ? reviewsPending.data : reviewsPending ? 0 : null}
            label="Reviews to moderate"
            visible={can('review:moderate')}
          />
          <AttentionTile
            href="/promo"
            count={promoActive?.ok ? promoActive.data : promoActive ? 0 : null}
            label="Active promos"
            visible={can('promo:read')}
          />
        </div>
      </section>

      <section>
        <h2 className="wp-section-title">Ops lanes</h2>
        <div className="wp-ops-lanes">
          <Card>
            <Heading level={3}>Commerce</Heading>
            <ul className="wp-ops-lane-links">
              {can('order:read') ? (
                <li>
                  <Link href="/orders">Orders — SLA, cancel, exceptions</Link>
                </li>
              ) : null}
              {can('inventory:read') ? (
                <li>
                  <Link href="/inventory">Inventory — lots, GRN, recall</Link>
                </li>
              ) : null}
              {can('catalog:admin') ? (
                <li>
                  <Link href="/catalog">Catalog / medicines publish</Link>
                </li>
              ) : null}
              {can('logistics:read') ? (
                <li>
                  <Link href="/logistics">Logistics shipments</Link>
                </li>
              ) : null}
              {can('logistics:manage') ? (
                <li>
                  <Link href="/delivery">Delivery assign</Link>
                </li>
              ) : null}
              {can('logistics:read') ? (
                <li>
                  <Link href="/serviceability">Pincode serviceability</Link>
                </li>
              ) : null}
              {can('partner:manage') ? (
                <li>
                  <Link href="/marketplace">Marketplace sellers</Link>
                </li>
              ) : null}
            </ul>
          </Card>
          <Card>
            <Heading level={3}>Care</Heading>
            <ul className="wp-ops-lane-links">
              {can('doctor:review') ? (
                <li>
                  <Link href="/doctors">Doctor KYC / publish</Link>
                </li>
              ) : null}
              {can('lab:review') ? (
                <li>
                  <Link href="/labs">Labs, collections, packages</Link>
                </li>
              ) : null}
              {can('partner:manage') ? (
                <li>
                  <Link href="/imaging">Imaging jobs</Link>
                </li>
              ) : null}
              {can('appointment:read') ? (
                <li>
                  <Link href="/appointments">Appointment exceptions</Link>
                </li>
              ) : null}
              {can('prescription:read') ? (
                <li>
                  <Link href="/prescriptions">Rx desk · refills · dispensing</Link>
                </li>
              ) : null}
            </ul>
          </Card>
          <Card>
            <Heading level={3}>Partners &amp; money</Heading>
            <ul className="wp-ops-lane-links">
              {can('partner:manage') ? (
                <li>
                  <Link href="/partners">Unified partner KYC queue</Link>
                </li>
              ) : null}
              {can('affiliate:read') ? (
                <li>
                  <Link href="/affiliates">Affiliates</Link>
                </li>
              ) : null}
              {can('payment:read') ? (
                <li>
                  <Link href="/payments">Payments / R14-A gates</Link>
                </li>
              ) : null}
              {can('finance:read') ? (
                <li>
                  <Link href="/finance">Ledger breaks &amp; settlements</Link>
                </li>
              ) : null}
            </ul>
          </Card>
          <Card>
            <Heading level={3}>Growth &amp; support</Heading>
            <ul className="wp-ops-lane-links">
              {can('support:read') ? (
                <li>
                  <Link href="/support">Support desk</Link>
                </li>
              ) : null}
              {can('crm:read') ? (
                <li>
                  <Link href="/crm">CRM 360 (no clinical payload)</Link>
                </li>
              ) : null}
              {can('campaign:read') ? (
                <li>
                  <Link href="/marketing">Marketing</Link>
                </li>
              ) : null}
              {can('analytics:read') ? (
                <li>
                  <Link href="/analytics">Country analytics rollups</Link>
                </li>
              ) : null}
              {can('cms:read') ? (
                <li>
                  <Link href="/storefront/chrome">Header, footer, homepage copy</Link>
                </li>
              ) : null}
              {can('cms:read') ? (
                <li>
                  <Link href="/cms">CMS / SEO</Link>
                </li>
              ) : null}
            </ul>
          </Card>
        </div>
      </section>

      <Card>
        <Heading level={2}>Work queue</Heading>
        <Text tone="secondary">Actionable items across modules — newest first. Click Open to handle.</Text>
        {workQueue.length ? (
          <div className="wp-work-queue-grid" role="list">
            {workQueue.map((item) => (
              <WorkQueueRow key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Queue is clear"
            description="No open orders, tickets, partner reviews, or shipments loaded. Restart the API with sandbox seed enabled, then sign in as sandbox-admin@dev.local."
          />
        )}
      </Card>

      <Card>
        <Heading level={2}>Website without a developer</Heading>
        <Text tone="secondary">Permission-aware content and merchandising. Publish still needs cms:publish.</Text>
        <div className="wp-toolbar">
          {can('cms:write') || can('cms:read') ? (
            <>
              <Link href="/storefront/chrome">
                <Button size="sm">Header / footer / SEO</Button>
              </Link>
              <Link href="/cms/blog">
                <Button size="sm" variant="secondary">
                  Blog
                </Button>
              </Link>
              <Link href="/cms/legal">
                <Button size="sm" variant="secondary">
                  Legal
                </Button>
              </Link>
              <Link href="/cms/faq">
                <Button size="sm" variant="secondary">
                  FAQ
                </Button>
              </Link>
              <Link href="/cms/pages">
                <Button size="sm" variant="secondary">
                  Company & join pages
                </Button>
              </Link>
              <Link href="/cms/new?type=LANDING">
                <Button size="sm" variant="secondary">
                  Landing page
                </Button>
              </Link>
            </>
          ) : null}
          {can('catalog:admin') ? (
            <Link href="/catalog">
              <Button size="sm" variant="secondary">
                Product copy
              </Button>
            </Link>
          ) : null}
          {can('promo:read') ? (
            <Link href="/promo">
              <Button size="sm" variant="secondary">
                Promotions
              </Button>
            </Link>
          ) : null}
          {can('campaign:read') ? (
            <Link href="/marketing">
              <Button size="sm" variant="secondary">
                Campaigns
              </Button>
            </Link>
          ) : null}
        </div>
      </Card>

      <div id="ops">
      <Card>
        <Heading level={2}>Quick modules</Heading>
        <Text tone="secondary">Jump to a console your role can access.</Text>
        <div className="wp-toolbar">
          {quickLinks.map((item) => (
            <Link key={item.id} href={item.href}>
              <Button variant="tertiary" size="sm">
                {item.label}
              </Button>
            </Link>
          ))}
        </div>
        {quickLinks.length === 0 ? (
          <EmptyState title="No module shortcuts" description="Your admin role has limited navigation entries." />
        ) : null}
      </Card>
      </div>

      {can('finance:read') && financeDash?.ok ? (
        <Card>
          <Heading level={3}>Finance posture</Heading>
          <Text tone="secondary">{financeDash.data.note}</Text>
          <dl className="wp-kpi-grid">
            <div>
              <dt>
                <Text tone="secondary">Ledger facts</Text>
              </dt>
              <dd>{formatCount(financeDash.data.facts)}</dd>
            </div>
            <div>
              <dt>
                <Text tone="secondary">Vendor payables</Text>
              </dt>
              <dd>{formatCount(financeDash.data.vendor_payables)}</dd>
            </div>
            <div>
              <dt>
                <Text tone="secondary">Payouts</Text>
              </dt>
              <dd>{formatCount(financeDash.data.payouts)}</dd>
            </div>
            <div>
              <dt>
                <Text tone="secondary">Contributions</Text>
              </dt>
              <dd>{formatCount(financeDash.data.contributions)}</dd>
            </div>
          </dl>
          <div className="wp-toolbar">
            <Badge kind={financeDash.data.live_payout ? 'warning' : 'info'}>
              {financeDash.data.live_payout ? 'Live payout enabled' : 'Sandbox payout only'}
            </Badge>
            <Link href="/finance">
              <Button size="sm" variant="secondary">
                Open finance console
              </Button>
            </Link>
          </div>
        </Card>
      ) : null}

      {can('analytics:read') ? (
        <Card>
          <Heading level={3}>Analytics snapshot ({countryCode})</Heading>
          {analytics?.ok && totals ? (
            <>
              <dl className="wp-kpi-grid">
                <div>
                  <dt>
                    <Text tone="secondary">Orders paid</Text>
                  </dt>
                  <dd>{formatCount(totals.order_paid_count)}</dd>
                </div>
                <div>
                  <dt>
                    <Text tone="secondary">GMV (minor units)</Text>
                  </dt>
                  <dd>{formatMinorUnits(String(totals.order_gmv_minor))}</dd>
                </div>
                <div>
                  <dt>
                    <Text tone="secondary">Checkouts started</Text>
                  </dt>
                  <dd>{formatCount(totals.checkout_started_count)}</dd>
                </div>
              </dl>
              <div className="wp-chart-grid">
                <div>
                  <p className="wp-section-title">Paid orders</p>
                  <Sparkline
                    label="Daily paid orders"
                    values={(analytics.data.daily ?? []).map((row) => row.order_paid_count)}
                  />
                </div>
                <div>
                  <p className="wp-section-title">GMV</p>
                  <Sparkline
                    label="Daily GMV"
                    values={(analytics.data.daily ?? []).map((row) => Number(row.order_gmv_minor || 0))}
                  />
                </div>
                <div>
                  <p className="wp-section-title">Funnel</p>
                  <BarChart
                    rows={[
                      { label: 'Views', value: totals.product_view_count },
                      { label: 'Checkouts', value: totals.checkout_started_count },
                      { label: 'Paid', value: totals.order_paid_count },
                    ]}
                  />
                </div>
              </div>
            </>
          ) : analytics && !analytics.ok ? (
            <ErrorState description="Analytics snapshot could not be loaded." />
          ) : (
            <LoadingState label="Loading analytics" />
          )}
          <Link href="/analytics">
            <Button variant="secondary" size="sm">
              Full analytics
            </Button>
          </Link>
        </Card>
      ) : null}

      {can('payment:read') && r14a?.ok ? (
        <Card>
          <Heading level={3}>Payments posture</Heading>
          <Text>
            R14-A gates evidenced: {formatCount(r14a.data.owner_evidenced_count)} /{' '}
            {formatCount(r14a.data.owner_evidenced_count + r14a.data.placeholder_count)}
          </Text>
          <Text tone="secondary">{r14a.data.live_unlock_blocked_reason ?? r14a.data.next_required_action}</Text>
          <Link href="/payments">
            <Button variant="secondary" size="sm">
              Payments console
            </Button>
          </Link>
        </Card>
      ) : null}

      {can('identity:audit_read') ? (
        <Card>
          <Heading level={3}>Recent security events</Heading>
          {securityEvents?.ok && securityEvents.data.length ? (
            <ul className="wp-event-list">
              {securityEvents.data.map((row, index) => (
                <li key={String(row.id ?? index)}>
                  <Text size="caption">
                    {String(row.created_at ?? row.createdAt ?? '—')} · {String(row.type ?? 'event')} ·{' '}
                    {String(row.outcome ?? '—')}
                  </Text>
                </li>
              ))}
            </ul>
          ) : (
            <Text tone="secondary">No recent security events.</Text>
          )}
          <Link href="/audit">
            <Button variant="tertiary" size="sm">
              Audit log
            </Button>
          </Link>
        </Card>
      ) : null}
    </div>
  );
}
