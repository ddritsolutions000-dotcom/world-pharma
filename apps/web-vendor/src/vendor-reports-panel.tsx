'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Card,
  EmptyState,
  Heading,
  LoadingState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  fetchVendorLots,
  fetchVendorOffers,
  fetchVendorOrders,
  fetchVendorSettlements,
  fetchVendorShipments,
} from './vendor-api';
import { computeVendorDashboardMetrics } from './vendor-dashboard-metrics';
import { currencyForCountry, formatCount, formatCurrencyMinor } from './vendor-format';
import type { VendorOrganization } from './vendor-api';

export function VendorReportsPanel({
  organizationId,
  organization,
  token,
  onError,
}: {
  organizationId: string;
  organization: VendorOrganization | null;
  token: string;
  onError: (err: unknown) => void;
}) {
  const [loading, setLoading] = useState(true);
  const currency = currencyForCountry(organization?.country_code);

  const [orders, setOrders] = useState<Awaited<ReturnType<typeof fetchVendorOrders>>['data']>([]);
  const [offers, setOffers] = useState<Awaited<ReturnType<typeof fetchVendorOffers>>['data']>([]);
  const [lots, setLots] = useState<Awaited<ReturnType<typeof fetchVendorLots>>['data']>([]);
  const [settlements, setSettlements] = useState<Awaited<ReturnType<typeof fetchVendorSettlements>>['data']>([]);
  const [shipments, setShipments] = useState<Awaited<ReturnType<typeof fetchVendorShipments>>['data']>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, of, l, s, sh] = await Promise.all([
        fetchVendorOrders(token, organizationId),
        fetchVendorOffers(token, organizationId),
        fetchVendorLots(token, organizationId),
        fetchVendorSettlements(token, organizationId),
        fetchVendorShipments(token, organizationId),
      ]);
      setOrders(o.data);
      setOffers(of.data);
      setLots(l.data);
      setSettlements(s.data);
      setShipments(sh.data);
    } catch (err) {
      onError(err);
    } finally {
      setLoading(false);
    }
  }, [organizationId, onError, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = useMemo(
    () =>
      computeVendorDashboardMetrics({
        orders,
        offers,
        lots,
        settlements,
        shipments,
        tickets: [],
        inbox: [],
        eligibility: null,
      }),
    [lots, offers, orders, settlements, shipments],
  );

  const topSkus = useMemo(() => {
    const counts = new Map<string, number>();
    for (const order of orders) {
      void order;
    }
    for (const offer of offers) {
      const sku = offer.sku ?? offer.title ?? offer.id.slice(0, 8);
      counts.set(sku, (counts.get(sku) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [offers, orders]);

  const aovMinor =
    orders.length > 0 ? metrics.sales.salesValueMinor / BigInt(orders.length) : 0n;

  if (loading) {
    return <LoadingState label="Building seller reports from live data…" />;
  }

  if (!orders.length && !offers.length) {
    return (
      <EmptyState
        title="No report data yet"
        description="Reports are computed from your orders, catalog, inventory, and settlements. Start selling to see analytics."
      />
    );
  }

  return (
    <div className="wp-stack">
      <Text tone="secondary" size="caption">
        Analytics are computed from the latest API lists (max 50 rows per resource). No platform-wide data is shown.
        Export API is not available — use settlement lines for finance detail.
      </Text>

      <div className="vd-kpi-primary">
        <Card className="vd-kpi">
          <Text size="caption" tone="secondary">
            Gross sales (loaded orders)
          </Text>
          <Heading level={3}>{formatCurrencyMinor(String(metrics.sales.salesValueMinor), currency)}</Heading>
        </Card>
        <Card className="vd-kpi">
          <Text size="caption" tone="secondary">
            Orders loaded
          </Text>
          <Heading level={3}>{formatCount(orders.length)}</Heading>
        </Card>
        <Card className="vd-kpi">
          <Text size="caption" tone="secondary">
            Average order value
          </Text>
          <Heading level={3}>{formatCurrencyMinor(String(aovMinor), currency)}</Heading>
        </Card>
        <Card className="vd-kpi">
          <Text size="caption" tone="secondary">
            Fulfilment backlog
          </Text>
          <Heading level={3}>
            {formatCount(metrics.fulfilment.awaitingAcceptance + metrics.fulfilment.packingPending)}
          </Heading>
        </Card>
      </div>

      <div className="vd-main-grid">
        <Card className="vd-panel">
          <Heading level={3}>Sales breakdown</Heading>
          <ul className="vws-kv-list">
            <div>
              <dt>Today&apos;s orders</dt>
              <dd>{formatCount(metrics.sales.todayOrders)}</dd>
            </div>
            <div>
              <dt>Pending</dt>
              <dd>{formatCount(metrics.sales.pendingOrders)}</dd>
            </div>
            <div>
              <dt>Completed</dt>
              <dd>{formatCount(metrics.sales.completedOrders)}</dd>
            </div>
            <div>
              <dt>Cancelled / returned</dt>
              <dd>{formatCount(metrics.sales.cancelledOrders)}</dd>
            </div>
          </ul>
        </Card>

        <Card className="vd-panel">
          <Heading level={3}>Inventory</Heading>
          <ul className="vws-kv-list">
            <div>
              <dt>Active listings</dt>
              <dd>{formatCount(metrics.inventory.activeProducts)}</dd>
            </div>
            <div>
              <dt>Low stock lots</dt>
              <dd>{formatCount(metrics.inventory.lowStock)}</dd>
            </div>
            <div>
              <dt>Out of stock</dt>
              <dd>{formatCount(metrics.inventory.outOfStock)}</dd>
            </div>
            <div>
              <dt>Inactive offers</dt>
              <dd>{formatCount(metrics.inventory.inactiveProducts)}</dd>
            </div>
          </ul>
        </Card>

        <Card className="vd-panel">
          <Heading level={3}>Finance (settlement lines)</Heading>
          <ul className="vws-kv-list">
            <div>
              <dt>Pending payout</dt>
              <dd>{formatCurrencyMinor(String(metrics.finance.pendingPayoutMinor), currency)}</dd>
            </div>
            <div>
              <dt>Paid out</dt>
              <dd>{formatCurrencyMinor(String(metrics.finance.paidPayoutMinor), currency)}</dd>
            </div>
            <div>
              <dt>Reconciliation flags</dt>
              <dd>{formatCount(metrics.finance.reconciliationIssues)}</dd>
            </div>
            <div>
              <dt>Statement lines</dt>
              <dd>{formatCount(metrics.finance.statementLines)}</dd>
            </div>
          </ul>
        </Card>

        <Card className="vd-panel">
          <Heading level={3}>Fulfilment & logistics</Heading>
          <ul className="vws-kv-list">
            <div>
              <dt>Ready to ship</dt>
              <dd>{formatCount(metrics.fulfilment.readyToShip)}</dd>
            </div>
            <div>
              <dt>Shipment pending</dt>
              <dd>{formatCount(metrics.fulfilment.shipmentPending)}</dd>
            </div>
            <div>
              <dt>Delivery problems</dt>
              <dd>{formatCount(metrics.fulfilment.deliveryProblems)}</dd>
            </div>
            <div>
              <dt>RTO</dt>
              <dd>{formatCount(metrics.fulfilment.rto)}</dd>
            </div>
          </ul>
        </Card>
      </div>

      {topSkus.length ? (
        <Card>
          <Heading level={3}>Catalog breadth</Heading>
          <Text size="caption" tone="secondary">
            Per-SKU order performance requires a dedicated analytics API — showing active offer count by SKU/title.
          </Text>
          <ul className="wp-mini-list">
            {topSkus.map(([sku, count]) => (
              <li key={sku} className="wp-mini-row">
                <span>{sku}</span>
                <strong>{formatCount(count)} offer(s)</strong>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
