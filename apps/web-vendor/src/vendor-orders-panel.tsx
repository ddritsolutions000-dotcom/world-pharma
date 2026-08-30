'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  Table,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  VendorApiError,
  fetchVendorOrder,
  fetchVendorOrders,
  vendorOrderFulfill,
  type VendorOrder,
  type VendorOrderDetail,
} from './vendor-api';

function actionsForStatus(status: string): Array<{ action: Parameters<typeof vendorOrderFulfill>[2]; label: string }> {
  switch (status) {
    case 'ALLOCATED':
      return [{ action: 'pick/start', label: 'Start pick' }];
    case 'PICKING':
      return [{ action: 'pick/complete', label: 'Complete pick' }];
    case 'PICKED':
      return [
        { action: 'pack/start', label: 'Start pack' },
        { action: 'pack/complete', label: 'Pack & ready' },
      ];
    case 'PACKING':
      return [{ action: 'pack/complete', label: 'Complete pack & ready' }];
    case 'PACKED':
      return [{ action: 'ready', label: 'Mark ready to ship' }];
    default:
      return [];
  }
}

export function VendorOrdersPanel({
  organizationId,
  token,
  onError,
}: {
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
}) {
  const [rows, setRows] = useState<VendorOrder[]>([]);
  const [detail, setDetail] = useState<VendorOrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) {
      return;
    }
    setLoading(true);
    try {
      const body = await fetchVendorOrders(token, organizationId);
      setRows(body.data);
    } catch (err) {
      onError(err);
    } finally {
      setLoading(false);
    }
  }, [organizationId, onError, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (orderId: string) => {
    setFormError(null);
    setMessage(null);
    setNotFound(false);
    setDetailLoading(true);
    try {
      const body = await fetchVendorOrder(token, orderId);
      setDetail(body);
    } catch (err) {
      if (err instanceof VendorApiError) {
        if (err.status === 404) {
          setNotFound(true);
          setDetail(null);
          return;
        }
        if (err.status === 401 || err.status === 403) {
          onError(err);
          return;
        }
        setFormError(err.message);
        return;
      }
      onError(err);
    } finally {
      setDetailLoading(false);
    }
  };

  const runFulfill = async (action: Parameters<typeof vendorOrderFulfill>[2], label: string) => {
    if (!detail) {
      return;
    }
    if (
      !window.confirm(
        `Confirm “${label}” for order ${detail.order_number}?\nThis advances seller fulfillment only (not Store Rx dispense or Delivery POD).`,
      )
    ) {
      return;
    }
    setBusy(true);
    setFormError(null);
    setMessage(null);
    try {
      const next = await vendorOrderFulfill(token, detail.id, action);
      setDetail(next);
      setMessage(`Fulfillment updated → ${next.status}`);
      await load();
    } catch (err) {
      if (err instanceof VendorApiError) {
        if (err.status === 401 || err.status === 403) {
          onError(err);
          return;
        }
        setFormError(err.message);
        return;
      }
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading medicine seller orders…" />;
  }

  return (
    <div className="wp-stack">
      <Text tone="secondary">
        Seller orders for this VENDOR organization. Fulfillment uses pick → pack → ready on the shared order kernel.
        Store pharmacy dispense and Delivery POD are separate surfaces.
      </Text>
      {formError ? <Text tone="secondary">{formError}</Text> : null}
      {message ? <Text>{message}</Text> : null}

      {!rows.length ? (
        <EmptyState title="No orders" description="No seller orders in this sandbox for the selected organization." />
      ) : (
        <Card>
          <Heading level={2}>Orders</Heading>
          <Table
            caption="Vendor orders"
            columns={['Order', 'Status', 'Total', 'Rx']}
            rows={rows.map((row) => [
              row.order_number,
              row.status,
              row.total_minor && row.currency ? `${row.total_minor} ${row.currency}` : '—',
              row.rx_origin ? 'Rx-origin' : '—',
            ])}
          />
          <div className="wp-stack" style={{ gap: 8 }}>
            {rows.map((row) => (
              <div
                key={row.id}
                className="wp-stack"
                style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}
              >
                <Text>
                  {row.order_number} ({row.status})
                </Text>
                <Button size="sm" variant="secondary" onClick={() => void openDetail(row.id)}>
                  Open detail
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {detailLoading ? <LoadingState label="Loading order fulfillment detail…" /> : null}
      {notFound ? (
        <EmptyState title="Order not found" description="This order is not available to your seller organization." />
      ) : null}

      {detail && !detailLoading ? (
        <Card>
          <Heading level={2}>
            {detail.order_number} · {detail.status}
          </Heading>
          {detail.rx_origin ? (
            <Text size="caption">
              Rx-origin: yes (opaque prescription correlation only — no clinical content in this view).
            </Text>
          ) : (
            <Text size="caption">Rx-origin: no</Text>
          )}
          <Text size="caption">
            Commercial total: {detail.total_minor ?? '—'} {detail.currency ?? ''} · Goods {detail.goods_minor ?? '—'} ·
            Tax {detail.tax_minor ?? '—'} · Shipping {detail.shipping_minor ?? '—'}
          </Text>
          {detail.economics ? (
            <Text size="caption">
              Payable est. {detail.economics.vendor_payable_est_minor} · Customer paid{' '}
              {detail.economics.customer_paid_minor}
            </Text>
          ) : null}
          {detail.exceptions?.length ? (
            <Text size="caption">Exceptions: {detail.exceptions.join(', ')}</Text>
          ) : null}

          <Heading level={3}>Lines</Heading>
          {detail.items?.length ? (
            <Table
              caption="Order lines"
              columns={['SKU', 'Qty', 'Unit', 'Line']}
              rows={detail.items.map((item) => [
                item.sku,
                String(item.qty),
                item.unit_minor,
                item.line_minor,
              ])}
            />
          ) : (
            <EmptyState title="No lines" description="Order has no seller lines." />
          )}

          <Heading level={3}>Ship-to (fulfillment)</Heading>
          {detail.ship_to ? (
            <Text>
              {detail.ship_to.recipient_name}
              <br />
              {detail.ship_to.line1}
              {detail.ship_to.line2 ? (
                <>
                  <br />
                  {detail.ship_to.line2}
                </>
              ) : null}
              <br />
              {detail.ship_to.city}
              {detail.ship_to.postal_code ? ` ${detail.ship_to.postal_code}` : ''} ·{' '}
              {detail.ship_to.country_code}
              {detail.ship_to.phone ? (
                <>
                  <br />
                  {detail.ship_to.phone}
                </>
              ) : null}
            </Text>
          ) : (
            <Text size="caption">No ship-to snapshot.</Text>
          )}

          <Heading level={3}>Shipments</Heading>
          {detail.shipments?.length ? (
            <Table
              caption="Shipments"
              columns={['Shipment', 'Status', 'Tracking', 'Carrier']}
              rows={detail.shipments.map((row) => [
                row.id.slice(0, 8),
                row.status,
                row.tracking_number ?? '—',
                row.carrier ?? 'sandbox',
              ])}
            />
          ) : (
            <Text size="caption">No shipment yet.</Text>
          )}

          <Heading level={3}>Status history</Heading>
          {detail.history?.length ? (
            <Table
              caption="Order history"
              columns={['When', 'From', 'To', 'Reason']}
              rows={detail.history.slice(0, 20).map((row) => [
                String(row.created_at).slice(0, 19),
                row.from_status,
                row.to_status,
                row.reason,
              ])}
            />
          ) : (
            <Text size="caption">No history.</Text>
          )}

          <Heading level={3}>Seller fulfillment actions</Heading>
          <Text tone="secondary" size="caption">
            Does not perform Store Rx dispense or Delivery handoff. Sandbox carrier booking only when marking ready.
          </Text>
          <div className="wp-stack" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {actionsForStatus(detail.status).map((item) => (
              <Button key={item.action} disabled={busy} onClick={() => void runFulfill(item.action, item.label)}>
                {busy ? 'Updating…' : item.label}
              </Button>
            ))}
            {!actionsForStatus(detail.status).length ? (
              <Text size="caption">No seller fulfillment actions for status {detail.status}.</Text>
            ) : null}
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setDetail(null)}>
              Close detail
            </Button>
          </div>
          {detail.message ? <Text size="caption">{detail.message}</Text> : null}
        </Card>
      ) : null}
    </div>
  );
}
