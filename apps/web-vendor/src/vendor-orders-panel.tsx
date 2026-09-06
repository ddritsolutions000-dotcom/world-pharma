'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  VendorApiError,
  fetchVendorOrder,
  fetchVendorOrders,
  vendorOrderAccept,
  vendorOrderFulfill,
  vendorOrderReject,
  type VendorOrder,
  type VendorOrderDetail,
} from './vendor-api';
import { formatCurrencyMinor, statusBadgeClass } from './vendor-format';

type StatusFilter = 'all' | 'action' | 'open' | 'done';

const REJECT_REASONS = [
  { value: 'OUT_OF_STOCK', label: 'Out of stock' },
  { value: 'CANNOT_FULFILL', label: 'Cannot fulfill in time' },
  { value: 'POLICY', label: 'Policy / compliance block' },
  { value: 'OTHER', label: 'Other (see note)' },
] as const;

function actionsForStatus(
  status: string,
  vendorAccepted?: boolean,
): Array<{ action: Parameters<typeof vendorOrderFulfill>[2]; label: string }> {
  switch (status.toUpperCase()) {
    case 'ALLOCATED':
      if (!vendorAccepted) {
        return [];
      }
      return [{ action: 'pick/start', label: 'Start pick' }];
    case 'PICKING':
      return [{ action: 'pick/complete', label: 'Complete pick' }];
    case 'PICKED':
      return [{ action: 'pack/complete', label: 'Complete pack & book carrier' }];
    case 'PACKING':
      return [{ action: 'pack/complete', label: 'Complete pack & book carrier' }];
    case 'PACKED':
      return [{ action: 'ready', label: 'Mark ready to ship' }];
    default:
      return [];
  }
}

function canAccept(status: string, vendorAccepted?: boolean): boolean {
  const s = status.toUpperCase();
  return ['ALLOCATED', 'ON_HOLD', 'CONFIRMED'].includes(s) && !vendorAccepted;
}

function canReject(status: string): boolean {
  return ['ALLOCATED', 'ON_HOLD', 'CONFIRMED'].includes(status.toUpperCase());
}

/** Human next-step copy — only actions the state machine will accept. */
function nextActionHint(status: string, vendorAccepted?: boolean): string | null {
  const s = status.toUpperCase();
  if (['ALLOCATED', 'ON_HOLD', 'CONFIRMED'].includes(s) && !vendorAccepted) {
    return 'Next: Accept this order. Pick is blocked until accept is recorded.';
  }
  if (s === 'ALLOCATED' && vendorAccepted) {
    return 'Next: Start pick. Inventory must already be allocated.';
  }
  if (s === 'PICKING') {
    return 'Next: Complete pick, then pack.';
  }
  if (s === 'PICKED' || s === 'PACKING') {
    return 'Next: Complete pack (sandbox carrier booking runs automatically).';
  }
  if (s === 'PACKED') {
    return 'Next: Mark ready to ship (sandbox carrier booking if not already created).';
  }
  if (s === 'READY_TO_SHIP') {
    return 'Sandbox shipment is ready. Live carrier remains EXTERNAL_GATED.';
  }
  if (s === 'SHIPPED' || s === 'OUT_FOR_DELIVERY') {
    return 'In transit — customer tracking should reflect sandbox shipment events.';
  }
  return null;
}

function matchesFilter(status: string, filter: StatusFilter): boolean {
  const s = status.toUpperCase();
  if (filter === 'all') {
    return true;
  }
  if (filter === 'action') {
    return ['ALLOCATED', 'PICKING', 'PICKED', 'PACKING', 'PACKED'].includes(s);
  }
  if (filter === 'open') {
    return !['DELIVERED', 'CANCELLED', 'RETURNED', 'REFUNDED'].includes(s);
  }
  return ['DELIVERED', 'CANCELLED', 'RETURNED', 'REFUNDED', 'READY_TO_SHIP', 'SHIPPED'].includes(s);
}

export function VendorOrdersPanel({
  organizationId,
  token,
  onError,
  initialOrderId,
}: {
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
  initialOrderId?: string;
}) {
  const [rows, setRows] = useState<VendorOrder[]>([]);
  const [detail, setDetail] = useState<VendorOrderDetail | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('action');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [rejectReason, setRejectReason] = useState<(typeof REJECT_REASONS)[number]['value']>('OUT_OF_STOCK');
  const [rejectNote, setRejectNote] = useState('');

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

  const visibleRows = useMemo(
    () =>
      [...rows]
        .filter((row) => matchesFilter(row.status, filter))
        .filter((row) => {
          if (!search.trim()) {
            return true;
          }
          const q = search.trim().toLowerCase();
          return (
            row.order_number?.toLowerCase().includes(q) ||
            row.id.toLowerCase().includes(q) ||
            row.status.toLowerCase().includes(q)
          );
        })
        .sort((a, b) => {
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tb - ta;
        }),
    [filter, rows, search],
  );

  const openDetail = async (orderId: string) => {
    setSelectedId(orderId);
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

  useEffect(() => {
    if (initialOrderId) {
      void openDetail(initialOrderId);
    }
  }, [initialOrderId]);

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

  const runAccept = async () => {
    if (!detail) {
      return;
    }
    setBusy(true);
    setFormError(null);
    setMessage(null);
    try {
      const next = await vendorOrderAccept(token, detail.id);
      setDetail(next);
      setMessage('Order accepted — you can start picking.');
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

  const runReject = async () => {
    if (!detail) {
      return;
    }
    const reason = rejectNote.trim()
      ? `${rejectReason}:${rejectNote.trim()}`
      : rejectReason;
    if (
      !window.confirm(
        `Reject order ${detail.order_number}? This cancels the order for the customer. Reason: ${reason}`,
      )
    ) {
      return;
    }
    setBusy(true);
    setFormError(null);
    setMessage(null);
    try {
      const next = await vendorOrderReject(token, detail.id, reason, `vendor-reject-${detail.id}`);
      setDetail(next);
      setMessage(`Order rejected → ${next.status}`);
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
      <div className="wp-toolbar">
        <FormField label="Search">
          {({ id }) => (
            <Input
              id={id}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Order #, id, status…"
            />
          )}
        </FormField>
        <FormField label="Filter">
          {({ id }) => (
            <select id={id} className="wp-input" value={filter} onChange={(event) => setFilter(event.target.value as StatusFilter)}>
              <option value="action">Needs action</option>
              <option value="open">Open</option>
              <option value="done">Completed / shipped</option>
              <option value="all">All</option>
            </select>
          )}
        </FormField>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {formError ? (
        <Text tone="secondary">
          Could not update fulfillment: {formError}. Refresh the order and try the next action again. If a sandbox
          shipment already exists, open Shipments for tracking (live carrier remains EXTERNAL_GATED).
        </Text>
      ) : null}
      {message ? <Text>{message}</Text> : null}

      {!rows.length ? (
        <EmptyState title="No orders" description="No seller orders in this sandbox for the selected organization." />
      ) : (
        <div className="wp-order-layout">
          <Card>
            <Heading level={3}>Order queue ({visibleRows.length})</Heading>
            {visibleRows.length === 0 ? (
              <EmptyState title="No orders in this filter" description="Try another filter or wait for new customer orders." />
            ) : (
              <ul className="wp-mini-list">
                {visibleRows.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className={`wp-order-row${selectedId === row.id ? ' wp-order-row--active' : ''}`}
                      onClick={() => void openDetail(row.id)}
                    >
                      <div className="wp-mini-main">
                        <p className="wp-mini-title">
                          <span className="wp-mini-id">#{row.order_number}</span>
                          <span className={statusBadgeClass(row.status)}>{row.status}</span>
                          {row.vendor_accepted ? (
                            <span className="wp-mini-tag">Accepted</span>
                          ) : null}
                          {row.rx_origin ? <span className="wp-mini-tag wp-mini-tag--rx">Rx</span> : null}
                        </p>
                        <p className="wp-mini-meta">
                          {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                        </p>
                      </div>
                      <div className="wp-mini-right">
                        <Text size="bodyLg">{formatCurrencyMinor(row.total_minor, row.currency ?? 'XXX')}</Text>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="wp-order-detail">
            {detailLoading ? <LoadingState label="Loading order detail…" /> : null}
            {notFound ? (
              <EmptyState title="Order not found" description="This order is not available to your seller organization." />
            ) : null}

            {detail && !detailLoading ? (
              <Card>
                <Heading level={2}>
                  {detail.order_number} · <span className={statusBadgeClass(detail.status)}>{detail.status}</span>
                </Heading>
                {detail.status === 'READY_TO_SHIP' ? (
                  <Text size="caption">
                    Carrier booking is created automatically. Tracking appears below; riders pick this up from the delivery
                    app.
                  </Text>
                ) : null}
                {detail.rx_origin ? (
                  <Text size="caption">
                    Rx-origin order
                    {detail.rx_fulfillment_status ? ` · ${detail.rx_fulfillment_status}` : ''}
                    {' '}(no clinical content in this view).
                  </Text>
                ) : detail.rx_fulfillment_status ? (
                  <Text size="caption">Rx: {detail.rx_fulfillment_status}</Text>
                ) : null}
                <Text size="caption">
                  Total {formatCurrencyMinor(detail.total_minor, detail.currency ?? 'XXX')} · Goods{' '}
                  {formatCurrencyMinor(detail.goods_minor, detail.currency ?? 'XXX')} · Tax{' '}
                  {formatCurrencyMinor(detail.tax_minor, detail.currency ?? 'XXX')} · Shipping{' '}
                  {formatCurrencyMinor(detail.shipping_minor, detail.currency ?? 'XXX')}
                </Text>
                {detail.economics ? (
                  <Text size="caption">
                    Payable est. {formatCurrencyMinor(detail.economics.vendor_payable_est_minor, detail.currency ?? 'XXX')}
                  </Text>
                ) : null}
                {detail.exceptions?.length ? (
                  <Text size="caption">Exceptions: {detail.exceptions.join(', ')}</Text>
                ) : null}

                {detail.after_sales_status ? (
                  <Text size="caption">After-sales: {detail.after_sales_status.replaceAll('_', ' ').toLowerCase()}</Text>
                ) : null}
                {detail.payment_status ? (
                  <Text size="caption">Payment: {detail.payment_status.replaceAll('_', ' ').toLowerCase()}</Text>
                ) : null}

                <Heading level={3}>Lines</Heading>
                {detail.items?.length ? (
                  <ul className="wp-mini-list">
                    {detail.items.map((item) => (
                      <li key={item.id} className="wp-mini-row">
                        <div className="wp-mini-main">
                          <p className="wp-mini-title">{item.sku}</p>
                          <p className="wp-mini-meta">
                            Qty {item.qty} · Unit {formatCurrencyMinor(item.unit_minor, detail.currency ?? 'XXX')}
                          </p>
                        </div>
                        <div className="wp-mini-right">
                          <Text size="bodyLg">{formatCurrencyMinor(item.line_minor, detail.currency ?? 'XXX')}</Text>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="No lines" description="Order has no seller lines." />
                )}

                <Heading level={3}>Ship-to</Heading>
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
                    {detail.ship_to.postal_code ? ` ${detail.ship_to.postal_code}` : ''} · {detail.ship_to.country_code}
                  </Text>
                ) : (
                  <Text size="caption">No ship-to snapshot.</Text>
                )}

                <Heading level={3}>Seller actions</Heading>
                {detail.sandbox ? (
                  <Text size="caption">Sandbox fulfillment — carrier booking uses mock adapter only.</Text>
                ) : null}
                <div className="wp-toolbar wp-toolbar--wrap">
                  {canAccept(detail.status, detail.vendor_accepted) ? (
                    <Button disabled={busy} onClick={() => void runAccept()}>
                      {busy ? 'Updating…' : 'Accept order'}
                    </Button>
                  ) : null}
                  {canReject(detail.status) ? (
                    <>
                      <FormField label="Reject reason">
                        {({ id }) => (
                          <select
                            id={id}
                            className="wp-input"
                            value={rejectReason}
                            disabled={busy}
                            onChange={(e) =>
                              setRejectReason(e.target.value as (typeof REJECT_REASONS)[number]['value'])
                            }
                          >
                            {REJECT_REASONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </FormField>
                      <FormField label="Note (optional)">
                        {({ id }) => (
                          <Input
                            id={id}
                            value={rejectNote}
                            disabled={busy}
                            onChange={(e) => setRejectNote(e.target.value)}
                            placeholder="Short note for audit trail"
                          />
                        )}
                      </FormField>
                      <Button variant="secondary" disabled={busy} onClick={() => void runReject()}>
                        {busy ? 'Updating…' : 'Reject order'}
                      </Button>
                    </>
                  ) : null}
                  {actionsForStatus(detail.status, detail.vendor_accepted).map((item) => (
                    <Button key={item.action} disabled={busy} onClick={() => void runFulfill(item.action, item.label)}>
                      {busy ? 'Updating…' : item.label}
                    </Button>
                  ))}
                  {!canAccept(detail.status, detail.vendor_accepted) &&
                  !canReject(detail.status) &&
                  !actionsForStatus(detail.status, detail.vendor_accepted).length ? (
                    <Text size="caption">No seller actions for status {detail.status}.</Text>
                  ) : null}
                  {nextActionHint(detail.status, detail.vendor_accepted) ? (
                    <Text size="caption">{nextActionHint(detail.status, detail.vendor_accepted)}</Text>
                  ) : null}
                </div>

                {detail.fulfillment?.groups?.length ? (
                  <>
                    <Heading level={3}>Pick & pack tasks</Heading>
                    <ul className="wp-mini-list">
                      {detail.fulfillment.groups.map((group) => (
                        <li key={group.id} className="wp-mini-row">
                          <div className="wp-mini-main">
                            <p className="wp-mini-title">
                              Group {group.id.slice(0, 8)}
                              <span className={statusBadgeClass(group.status)}>{group.status}</span>
                            </p>
                            {group.pick_tasks.map((task) => (
                              <p key={task.id} className="wp-mini-meta">
                                Pick {task.status}: {task.picked_qty}/{task.required_qty}
                              </p>
                            ))}
                            {group.pack_tasks.map((task) => (
                              <p key={task.id} className="wp-mini-meta">
                                Pack {task.status}
                              </p>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}

                {detail.shipments?.length ? (
                  <>
                    <Heading level={3}>Linked shipments</Heading>
                    <ul className="wp-mini-list">
                      {detail.shipments.map((s) => (
                        <li key={s.id} className="wp-mini-row">
                          <div className="wp-mini-main">
                            <p className="wp-mini-title">
                              {s.tracking_number ?? s.id.slice(0, 8)}
                              <span className={statusBadgeClass(s.status)}>{s.status}</span>
                            </p>
                            <p className="wp-mini-meta">{s.carrier ?? 'sandbox'} (mock carrier)</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}

                {detail.history?.length ? (
                  <>
                    <Heading level={3}>Timeline</Heading>
                    <ul className="vd-activity-list">
                      {detail.history.map((event, idx) => (
                        <li key={`${event.created_at}-${idx}`}>
                          <Text size="caption">
                            {new Date(event.created_at).toLocaleString()} · {event.from_status} → {event.to_status}
                            {event.reason ? ` · ${event.reason}` : ''}
                          </Text>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}

                {detail.returns?.length ? (
                  <>
                    <Heading level={3}>Returns</Heading>
                    <ul className="wp-mini-list">
                      {detail.returns.map((r) => (
                        <li key={r.id} className="wp-mini-row">
                          <Text size="caption">
                            {r.reason} · {new Date(r.created_at).toLocaleString()}
                          </Text>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}

                {detail.message ? <Text size="caption">{detail.message}</Text> : null}
              </Card>
            ) : !detailLoading && !notFound ? (
              <Card>
                <EmptyState title="Select an order" description="Choose an order from the queue to pick, pack, and mark ready." />
              </Card>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
