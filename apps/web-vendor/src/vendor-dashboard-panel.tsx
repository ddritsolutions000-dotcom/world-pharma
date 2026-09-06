'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  NetworkErrorState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  VendorApiError,
  fetchMarketplaceEligibility,
  fetchVendorLots,
  fetchVendorMarketplaceActivity,
  fetchVendorNotificationInbox,
  fetchVendorOffers,
  fetchVendorOrders,
  fetchVendorSettlements,
  fetchVendorShipments,
  fetchVendorSupportTickets,
  type MarketplaceEligibility,
  type VendorActivityItem,
  type VendorInboxItem,
  type VendorLot,
  type VendorOffer,
  type VendorOrder,
  type VendorOrganization,
  type VendorSettlement,
  type VendorShipment,
  type VendorSupportTicket,
} from './vendor-api';
import {
  currencyForCountry,
  formatCount,
  formatCurrencyMinor,
  statusBadgeClass,
} from './vendor-format';

import { PortalKpiChart } from '@world-pharma/shell-web';
import { type VendorTabId } from './vendor-workspace-nav';

type KpiDef = {
  id: string;
  label: string;
  value: string;
  delta?: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'negative';
  hint?: string;
  tab?: VendorTabId;
};

type QuickAction = {
  id: VendorTabId;
  label: string;
  count: number;
  hint: string;
};

type SetupStep = {
  id: string;
  label: string;
  done: boolean;
  tab: VendorTabId;
  detail: string;
};

function formatMoney(currency: string, minor: bigint) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(minor / 100n));
}

function orderPipelineBuckets(orders: VendorOrder[]) {
  const buckets = {
    queue: 0,
    fulfil: 0,
    shipped: 0,
    closed: 0,
  };
  for (const order of orders) {
    const status = order.status.toUpperCase();
    if (['ALLOCATED', 'PICKING', 'PICKED', 'PACKING', 'PACKED', 'READY'].includes(status)) {
      buckets.fulfil += 1;
    } else if (['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(status)) {
      buckets.shipped += 1;
    } else if (['CANCELLED', 'REFUNDED', 'RETURNED', 'CLOSED'].includes(status)) {
      buckets.closed += 1;
    } else {
      buckets.queue += 1;
    }
  }
  return buckets;
}

function DashboardKpi({ kpi, onNavigate }: { kpi: KpiDef; onNavigate: (tab: VendorTabId) => void }) {
  const tone = kpi.tone ?? 'neutral';
  const inner = (
    <>
      <Text tone="secondary" size="caption" className="vd-kpi-label">
        {kpi.label}
      </Text>
      <div className="vd-kpi-row">
        <Heading level={3} className="vd-kpi-value">
          {kpi.value}
        </Heading>
        {kpi.delta ? <span className={`vd-kpi-delta vd-kpi-delta--${tone}`}>{kpi.delta}</span> : null}
      </div>
      {kpi.hint ? (
        <Text size="caption" tone="secondary" className="vd-kpi-hint">
          {kpi.hint}
        </Text>
      ) : null}
    </>
  );

  if (kpi.tab) {
    return (
      <button type="button" className={`vd-kpi vd-kpi--${tone} vd-kpi--clickable`} onClick={() => onNavigate(kpi.tab!)}>
        {inner}
      </button>
    );
  }

  return <Card className={`vd-kpi vd-kpi--${tone}`}>{inner}</Card>;
}

function QuickTile({
  item,
  onSelect,
}: {
  item: QuickAction;
  onSelect: (id: VendorTabId) => void;
}) {
  return (
    <button type="button" className="vd-quick-tile" onClick={() => onSelect(item.id)}>
      <span className="vd-quick-count">{formatCount(item.count)}</span>
      <span className="vd-quick-label">{item.label}</span>
      <span className="vd-quick-hint">{item.hint}</span>
    </button>
  );
}

export function VendorDashboardPanel({
  organizationId,
  organization,
  token,
  onNavigate,
  onError,
}: {
  organizationId: string;
  organization: VendorOrganization | null;
  token: string;
  onNavigate: (tab: VendorTabId) => void;
  onError: (err: unknown) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offers, setOffers] = useState<VendorOffer[]>([]);
  const [lots, setLots] = useState<VendorLot[]>([]);
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [shipments, setShipments] = useState<VendorShipment[]>([]);
  const [settlements, setSettlements] = useState<VendorSettlement[]>([]);
  const [eligibility, setEligibility] = useState<MarketplaceEligibility | null>(null);
  const [activity, setActivity] = useState<VendorActivityItem[]>([]);
  const [inbox, setInbox] = useState<VendorInboxItem[]>([]);
  const [tickets, setTickets] = useState<VendorSupportTicket[]>([]);

  const currency = currencyForCountry(organization?.country_code);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [offerRes, lotRes, orderRes, shipRes, settleRes, eligRes, actRes, inboxRes, ticketRes] =
        await Promise.all([
        fetchVendorOffers(token, organizationId),
        fetchVendorLots(token, organizationId),
        fetchVendorOrders(token, organizationId),
        fetchVendorShipments(token, organizationId),
        fetchVendorSettlements(token, organizationId),
        fetchMarketplaceEligibility(token, organizationId),
        fetchVendorMarketplaceActivity(token, organizationId),
        fetchVendorNotificationInbox(token).catch(() => ({ data: [] as VendorInboxItem[] })),
        fetchVendorSupportTickets(token).catch(() => ({ data: [] as VendorSupportTicket[] })),
      ]);
      setOffers(offerRes.data);
      setLots(lotRes.data);
      setOrders(orderRes.data);
      setShipments(shipRes.data);
      setSettlements(settleRes.data);
      setEligibility(eligRes);
      setActivity(actRes.data ?? []);
      setInbox(inboxRes.data ?? []);
      setTickets(
        (ticketRes.data ?? []).filter(
          (ticket) => !ticket.seller_org_id || ticket.seller_org_id === organizationId,
        ),
      );
    } catch (err) {
      if (err instanceof VendorApiError && (err.status === 401 || err.status === 403)) {
        onError(err);
        return;
      }
      setError(err instanceof Error ? err.message : 'Unable to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [organizationId, onError, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = useMemo(() => {
    const grossMinor = orders.reduce<bigint>((acc, o) => {
      try {
        return acc + BigInt(o.total_minor ?? '0');
      } catch {
        return acc;
      }
    }, 0n);

    const pendingPayoutMinor = settlements.reduce<bigint>((acc, s) => {
      if (['PENDING', 'PROCESSING', 'HOLD'].includes(s.status.toUpperCase())) {
        try {
          return acc + BigInt(s.net_minor ?? '0');
        } catch {
          return acc;
        }
      }
      return acc;
    }, 0n);

    const paidOutMinor = settlements.reduce<bigint>((acc, s) => {
      if (['PAID', 'SETTLED', 'PAID_OUT'].includes(s.status.toUpperCase())) {
        try {
          return acc + BigInt(s.net_minor ?? '0');
        } catch {
          return acc;
        }
      }
      return acc;
    }, 0n);

    const actionOrders = orders.filter((o) =>
      ['ALLOCATED', 'PICKING', 'PICKED', 'PACKING', 'PACKED', 'READY'].includes(o.status.toUpperCase()),
    ).length;

    const activeOffers = offers.filter((o) => (o.status ?? 'ACTIVE').toUpperCase() === 'ACTIVE').length;
    const lowStock = lots.filter((l) => l.available > 0 && l.available <= 5).length;
    const outOfStock = lots.filter((l) => l.available <= 0).length;
    const activeShipments = shipments.filter((s) =>
      ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'SHIPPED'].includes(s.status.toUpperCase()),
    ).length;

    return {
      grossMinor,
      pendingPayoutMinor,
      paidOutMinor,
      actionOrders,
      activeOffers,
      lowStock,
      outOfStock,
      activeShipments,
      orderCount: orders.length,
      settlementCount: settlements.length,
      avgOrderMinor: orders.length ? grossMinor / BigInt(orders.length) : 0n,
    };
  }, [lots, offers, orders, settlements, shipments]);

  const primaryKpis = useMemo<KpiDef[]>(() => {
    const gross = Number(metrics.grossMinor / 100n);
    const pending = Number(metrics.pendingPayoutMinor / 100n);
    return [
      {
        id: 'revenue',
        label: 'Gross sales',
        value: new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency,
          maximumFractionDigits: 0,
        }).format(gross),
        delta: metrics.orderCount ? `${formatCount(metrics.orderCount)} orders` : undefined,
        tone: 'positive',
        hint: 'Customer paid total',
        tab: 'orders',
      },
      {
        id: 'action-orders',
        label: 'Orders to fulfil',
        value: formatCount(metrics.actionOrders),
        tone: metrics.actionOrders > 0 ? 'warning' : 'positive',
        hint: 'Pick · pack · ready',
        tab: 'orders',
      },
      {
        id: 'listings',
        label: 'Live listings',
        value: formatCount(metrics.activeOffers),
        delta: offers.length ? `of ${formatCount(offers.length)}` : undefined,
        tone: 'neutral',
        hint: 'Published marketplace offers',
        tab: 'catalog',
      },
      {
        id: 'payout',
        label: 'Pending payout',
        value: new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency,
          maximumFractionDigits: 0,
        }).format(pending),
        tone: pending > 0 ? 'warning' : 'positive',
        hint: 'Settlement lines in pipeline',
        tab: 'settlements',
      },
    ];
  }, [currency, metrics, offers.length]);

  const secondaryKpis = useMemo<KpiDef[]>(() => {
    const openTickets = tickets.filter((t) => !['CLOSED', 'RESOLVED'].includes(t.status.toUpperCase())).length;
    const unread = inbox.filter((n) => !n.read).length;
    return [
      {
        id: 'aov',
        label: 'Avg order value',
        value: formatMoney(currency, metrics.avgOrderMinor),
        tone: 'neutral',
        hint: metrics.orderCount ? 'Per order' : 'No orders yet',
        tab: 'orders',
      },
      {
        id: 'paid',
        label: 'Paid out',
        value: formatMoney(currency, metrics.paidOutMinor),
        tone: 'positive',
        hint: 'Settled to bank',
        tab: 'settlements',
      },
      {
        id: 'stock',
        label: 'Stock health',
        value: `${formatCount(metrics.lowStock)} / ${formatCount(metrics.outOfStock)}`,
        tone: metrics.lowStock + metrics.outOfStock > 0 ? 'warning' : 'positive',
        hint: 'Low · out of stock lots',
        tab: 'inventory',
      },
      {
        id: 'inbox',
        label: 'Notifications',
        value: formatCount(unread),
        delta: inbox.length ? `${formatCount(inbox.length)} total` : undefined,
        tone: unread > 0 ? 'warning' : 'neutral',
        hint: 'Unread inbox items',
        tab: 'notifications',
      },
      {
        id: 'tickets',
        label: 'Open tickets',
        value: formatCount(openTickets),
        tone: openTickets > 0 ? 'warning' : 'positive',
        hint: 'Seller support queue',
        tab: 'support',
      },
    ];
  }, [currency, inbox, metrics, tickets]);

  const pipeline = useMemo(() => orderPipelineBuckets(orders), [orders]);

  const lowStockLots = useMemo(() => {
    return [...lots]
      .filter((lot) => lot.available <= 5)
      .sort((a, b) => a.available - b.available)
      .slice(0, 5);
  }, [lots]);

  const unreadInbox = useMemo(() => inbox.filter((item) => !item.read).slice(0, 4), [inbox]);

  const openTickets = useMemo(
    () =>
      tickets
        .filter((t) => !['CLOSED', 'RESOLVED'].includes(t.status.toUpperCase()))
        .slice(0, 4),
    [tickets],
  );

  const quickActions = useMemo<QuickAction[]>(() => {
    const pendingSettlements = settlements.filter((s) =>
      ['PENDING', 'PROCESSING', 'HOLD'].includes(s.status.toUpperCase()),
    ).length;
    return [
      {
        id: 'orders',
        label: 'Orders queue',
        count: metrics.actionOrders,
        hint: 'Fulfilment workflow',
      },
      {
        id: 'shipments',
        label: 'In transit',
        count: metrics.activeShipments,
        hint: 'Active shipments',
      },
      {
        id: 'catalog',
        label: 'Catalog',
        count: offers.length,
        hint: 'Manage listings',
      },
      {
        id: 'inventory',
        label: 'Inventory lots',
        count: lots.length,
        hint: 'Stock on hand',
      },
      {
        id: 'settlements',
        label: 'Settlements',
        count: pendingSettlements,
        hint: 'Payout pipeline',
      },
      {
        id: 'support',
        label: 'Support',
        count: tickets.filter((t) => !['CLOSED', 'RESOLVED'].includes(t.status.toUpperCase())).length,
        hint: 'Seller help desk',
      },
    ];
  }, [lots.length, metrics.actionOrders, metrics.activeShipments, offers.length, settlements, tickets]);

  const setupSteps = useMemo<SetupStep[]>(() => {
    const marketplaceOk = eligibility?.state === 'ELIGIBLE';
    const hasOffers = offers.length > 0;
    const hasStock = lots.length > 0;
    const hasOrders = orders.length > 0;
    return [
      {
        id: 'marketplace',
        label: 'Marketplace eligibility',
        done: marketplaceOk,
        tab: 'marketplace',
        detail: marketplaceOk ? 'Eligible to sell' : (eligibility?.state ?? 'Check status'),
      },
      {
        id: 'catalog',
        label: 'Catalog offers',
        done: hasOffers,
        tab: 'catalog',
        detail: hasOffers ? `${offers.length} offer(s)` : 'Create your first listing',
      },
      {
        id: 'inventory',
        label: 'Warehouse stock',
        done: hasStock,
        tab: 'inventory',
        detail: hasStock ? `${lots.length} lot(s) tracked` : 'Receive or adjust stock',
      },
      {
        id: 'orders',
        label: 'Customer orders',
        done: hasOrders,
        tab: 'orders',
        detail: hasOrders ? `${orders.length} order(s) received` : 'Waiting for demand',
      },
    ];
  }, [eligibility?.state, lots.length, offers.length, orders.length]);

  const recentOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
      .slice(0, 5);
  }, [orders]);

  const recentShipments = useMemo(() => {
    return [...shipments].slice(0, 4);
  }, [shipments]);

  const recentSettlements = useMemo(() => {
    return [...settlements]
      .sort((a, b) => new Date(b.period_ends_at ?? 0).getTime() - new Date(a.period_ends_at ?? 0).getTime())
      .slice(0, 4);
  }, [settlements]);

  const alerts = useMemo(() => {
    const items: Array<{ tone: 'warning' | 'info'; text: string; tab: VendorTabId }> = [];
    if (metrics.actionOrders > 0) {
      items.push({
        tone: 'warning',
        text: `${formatCount(metrics.actionOrders)} order(s) need pick/pack action`,
        tab: 'orders',
      });
    }
    if (metrics.lowStock > 0 || metrics.outOfStock > 0) {
      items.push({
        tone: 'warning',
        text: `Stock alert: ${formatCount(metrics.lowStock)} low · ${formatCount(metrics.outOfStock)} out`,
        tab: 'inventory',
      });
    }
    if (eligibility && eligibility.state !== 'ELIGIBLE') {
      items.push({
        tone: 'info',
        text: `Marketplace: ${eligibility.state.replaceAll('_', ' ').toLowerCase()}`,
        tab: 'marketplace',
      });
    }
    return items;
  }, [eligibility, metrics.actionOrders, metrics.lowStock, metrics.outOfStock]);

  const setupComplete = setupSteps.filter((s) => s.done).length;
  const pipelineTotal = Math.max(pipeline.queue + pipeline.fulfil + pipeline.shipped + pipeline.closed, 1);

  if (loading) {
    return <LoadingState label="Loading seller dashboard…" />;
  }

  if (error) {
    return <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />;
  }

  return (
    <div className="vd-root wp-stack">
      <section className="vd-hero">
        <div className="vd-hero-copy">
          <p className="vd-hero-kicker">Seller dashboard</p>
          <Heading level={2}>{organization?.display_name ?? 'Your vendor organization'}</Heading>
          <Text tone="secondary" size="caption">
            {organization?.country_code ?? '—'} · {currency} · {organization?.role_name ?? 'Vendor operator'}
          </Text>
        </div>
        <div className="vd-hero-actions">
          {eligibility ? (
            <span className={`vd-status-pill vd-status-pill--${eligibility.state.toLowerCase()}`}>
              Marketplace {eligibility.state.replaceAll('_', ' ')}
            </span>
          ) : null}
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            Refresh
          </Button>
        </div>
      </section>

      {alerts.length ? (
        <ul className="vd-alerts">
          {alerts.map((alert) => (
            <li key={alert.text}>
              <button type="button" className={`vd-alert vd-alert--${alert.tone}`} onClick={() => onNavigate(alert.tab)}>
                {alert.text}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <PortalKpiChart
        items={[
          { label: 'Orders', value: metrics.orderCount },
          { label: 'To fulfil', value: metrics.actionOrders },
          { label: 'Listings', value: metrics.activeOffers },
          { label: 'Shipments', value: metrics.activeShipments },
        ]}
      />
      <section className="vd-kpi-primary">
        {primaryKpis.map((kpi) => (
          <DashboardKpi key={kpi.id} kpi={kpi} onNavigate={onNavigate} />
        ))}
      </section>

      <section className="vd-kpi-secondary">
        {secondaryKpis.map((kpi) => (
          <DashboardKpi key={kpi.id} kpi={kpi} onNavigate={onNavigate} />
        ))}
      </section>

      <Card className="vd-panel vd-pipeline">
        <header className="vd-panel-head">
          <Heading level={3}>Order pipeline</Heading>
          <Button size="sm" variant="secondary" onClick={() => onNavigate('orders')}>
            Manage orders
          </Button>
        </header>
        <div className="vd-pipeline-bar" aria-hidden>
          <span className="vd-pipeline-seg vd-pipeline-seg--queue" style={{ flex: pipeline.queue || 0.001 }} />
          <span className="vd-pipeline-seg vd-pipeline-seg--fulfil" style={{ flex: pipeline.fulfil || 0.001 }} />
          <span className="vd-pipeline-seg vd-pipeline-seg--shipped" style={{ flex: pipeline.shipped || 0.001 }} />
          <span className="vd-pipeline-seg vd-pipeline-seg--closed" style={{ flex: pipeline.closed || 0.001 }} />
        </div>
        <ul className="vd-pipeline-legend">
          <li>
            <span className="vd-pipeline-dot vd-pipeline-dot--queue" />
            Queue <strong>{formatCount(pipeline.queue)}</strong>
            <small>{Math.round((pipeline.queue / pipelineTotal) * 100)}%</small>
          </li>
          <li>
            <span className="vd-pipeline-dot vd-pipeline-dot--fulfil" />
            Fulfilment <strong>{formatCount(pipeline.fulfil)}</strong>
            <small>{Math.round((pipeline.fulfil / pipelineTotal) * 100)}%</small>
          </li>
          <li>
            <span className="vd-pipeline-dot vd-pipeline-dot--shipped" />
            In transit <strong>{formatCount(pipeline.shipped)}</strong>
            <small>{Math.round((pipeline.shipped / pipelineTotal) * 100)}%</small>
          </li>
          <li>
            <span className="vd-pipeline-dot vd-pipeline-dot--closed" />
            Closed <strong>{formatCount(pipeline.closed)}</strong>
            <small>{Math.round((pipeline.closed / pipelineTotal) * 100)}%</small>
          </li>
        </ul>
      </Card>

      <section>
        <header className="vd-section-head">
          <Heading level={3}>Quick actions</Heading>
          <Text tone="secondary" size="caption">
            Jump to daily seller operations
          </Text>
        </header>
        <div className="vd-quick-grid">
          {quickActions.map((item) => (
            <QuickTile key={item.id} item={item} onSelect={onNavigate} />
          ))}
        </div>
      </section>

      <div className="vd-main-grid">
        <Card className="vd-panel">
          <header className="vd-panel-head">
            <Heading level={3}>Recent orders</Heading>
            <Button size="sm" variant="secondary" onClick={() => onNavigate('orders')}>
              View all
            </Button>
          </header>
          {recentOrders.length === 0 ? (
            <EmptyState
              title="No orders yet"
              description="Publish catalog offers and pass marketplace eligibility — customer orders will appear here for fulfilment."
              action={{ label: 'Open catalog', onClick: () => onNavigate('catalog') }}
            />
          ) : (
            <table className="wp-data-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Status</th>
                  <th>When</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id} className="wp-mini-row--clickable" onClick={() => onNavigate('orders')}>
                    <td className="wp-mini-id">#{o.order_number ?? o.id.slice(0, 8)}</td>
                    <td>
                      <span className={statusBadgeClass(o.status)}>{o.status}</span>
                    </td>
                    <td>{o.created_at ? new Date(o.created_at).toLocaleString() : '—'}</td>
                    <td>{formatCurrencyMinor(o.total_minor, o.currency ?? currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="vd-panel">
          <header className="vd-panel-head">
            <Heading level={3}>Setup progress</Heading>
            <Text size="caption" tone="secondary">
              {setupComplete}/{setupSteps.length} complete
            </Text>
          </header>
          <ul className="vd-setup-list">
            {setupSteps.map((step) => (
              <li key={step.id}>
                <button type="button" className="vd-setup-row" onClick={() => onNavigate(step.tab)}>
                  <span className={`vd-setup-check${step.done ? ' is-done' : ''}`} aria-hidden>
                    {step.done ? '✓' : '○'}
                  </span>
                  <span className="vd-setup-body">
                    <strong>{step.label}</strong>
                    <small>{step.detail}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="vd-setup-progress" aria-hidden>
            <span style={{ width: `${(setupComplete / setupSteps.length) * 100}%` }} />
          </div>
        </Card>

        {lowStockLots.length ? (
          <Card className="vd-panel">
            <header className="vd-panel-head">
              <Heading level={3}>Low stock</Heading>
              <Button size="sm" variant="secondary" onClick={() => onNavigate('inventory')}>
                Restock
              </Button>
            </header>
            <table className="wp-data-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Location</th>
                  <th>Qty</th>
                </tr>
              </thead>
              <tbody>
                {lowStockLots.map((lot) => (
                  <tr key={lot.id}>
                    <td>{lot.sku ?? lot.lot_code}</td>
                    <td>{lot.location_name ?? 'Warehouse'}</td>
                    <td>
                      <span className={statusBadgeClass(lot.available <= 0 ? 'OUT_OF_STOCK' : 'LOW')}>
                        {lot.available <= 0 ? 'Out' : `${lot.available} left`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : null}

        {unreadInbox.length ? (
          <Card className="vd-panel">
            <header className="vd-panel-head">
              <Heading level={3}>Unread notifications</Heading>
              <Button size="sm" variant="secondary" onClick={() => onNavigate('notifications')}>
                Inbox
              </Button>
            </header>
            <ul className="vd-activity-list">
              {unreadInbox.map((item) => (
                <li key={item.id}>
                  <button type="button" className="vd-inbox-row" onClick={() => onNavigate('notifications')}>
                    <strong>{item.title}</strong>
                    <Text size="caption" tone="secondary">
                      {new Date(item.created_at).toLocaleString()}
                    </Text>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {openTickets.length ? (
          <Card className="vd-panel">
            <header className="vd-panel-head">
              <Heading level={3}>Open support tickets</Heading>
              <Button size="sm" variant="secondary" onClick={() => onNavigate('support')}>
                Support desk
              </Button>
            </header>
            <ul className="vd-activity-list">
              {openTickets.map((ticket) => (
                <li key={ticket.id}>
                  <button type="button" className="vd-inbox-row" onClick={() => onNavigate('support')}>
                    <strong>{ticket.subject}</strong>
                    <Text size="caption" tone="secondary">
                      {ticket.status} · {new Date(ticket.created_at).toLocaleDateString()}
                    </Text>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card className="vd-panel">
          <header className="vd-panel-head">
            <Heading level={3}>Settlements</Heading>
            <Button size="sm" variant="secondary" onClick={() => onNavigate('settlements')}>
              View all
            </Button>
          </header>
          {recentSettlements.length === 0 ? (
            <EmptyState title="No settlements" description="Payable lines appear after order settlement cycles." />
          ) : (
            <table className="wp-data-table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Status</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                {recentSettlements.map((s) => (
                  <tr key={s.id}>
                    <td>{s.batch_id?.slice(0, 8) ?? s.id.slice(0, 8)}</td>
                    <td>
                      <span className={statusBadgeClass(s.status)}>{s.status}</span>
                    </td>
                    <td>{formatCurrencyMinor(s.net_minor, s.currency ?? currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="vd-panel">
          <header className="vd-panel-head">
            <Heading level={3}>Shipments</Heading>
            <Button size="sm" variant="secondary" onClick={() => onNavigate('shipments')}>
              View all
            </Button>
          </header>
          {recentShipments.length === 0 ? (
            <EmptyState title="No shipments" description="Dispatched orders show tracking here." />
          ) : (
            <table className="wp-data-table">
              <thead>
                <tr>
                  <th>Tracking</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentShipments.map((s) => (
                  <tr key={s.id}>
                    <td>{s.tracking_number ?? s.id.slice(0, 8)}</td>
                    <td>
                      <span className={statusBadgeClass(s.status)}>{s.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {activity.length ? (
        <Card className="vd-panel">
          <header className="vd-panel-head">
            <Heading level={3}>Recent activity</Heading>
          </header>
          <ul className="vd-activity-list">
            {activity.slice(0, 6).map((item) => (
              <li key={item.id}>
                <Text size="caption">
                  {new Date(item.created_at).toLocaleString()} · {item.type} · {item.outcome}
                </Text>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
