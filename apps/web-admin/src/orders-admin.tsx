'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminRequestError } from './admin-request-error';
import { useSearchParams } from 'next/navigation';
import {
  Button,
  Card,
  EmptyState,
  Heading,
  Input,
  LoadingState,
  PermissionDeniedState,
  Select,
  Text,
} from '@world-pharma/ui-kit/web';
import { useSession } from '@world-pharma/shell-web';
import { AdminDataTable } from './admin-data-table';
import { formatMoney } from './format-money';
import {
  fetchAdminOrder,
  fetchAdminOrders,
  postAdminOrderAction,
  type AdminOrderDetail,
  type AdminOrderSummary,
} from './orders-admin-api';
import { orderNextFulfillmentAction, orderStatusLabel } from './order-status-labels';

const FULFILL_LABELS: Record<string, string> = {
  'pick/start': 'Start pick',
  'pick/complete': 'Complete pick',
  'pack/start': 'Start pack',
  'pack/complete': 'Complete pack',
};

export function OrdersAdminPanel() {
  const searchParams = useSearchParams();
  const initialOrderId = searchParams.get('orderId');
  const { session, getAccessToken } = useSession();
  const permissions = session.permissions ?? [];
  const canFulfill = permissions.includes('order:fulfill');
  const canCancel = permissions.includes('order:cancel');
  const canRefund = permissions.includes('order:admin');

  const [rows, setRows] = useState<AdminOrderSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [orderQuery, setOrderQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const autoOpened = useRef(false);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    setDenied(false);
    try {
      const data = await fetchAdminOrders(token);
      setRows(data);
      setSelectedId((current) => (current && !data.some((row) => row.id === current) ? null : current));
    } catch (err) {
      if ((err as { status?: number }).status === 403) {
        setDenied(true);
      } else {
        setError('Orders could not be loaded.');
      }
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  const loadDetail = useCallback(
    async (id: string) => {
      const token = getAccessToken();
      if (!token) {
        return;
      }
      setDetailLoading(true);
      setActionMessage(null);
      try {
        const row = await fetchAdminOrder(token, id);
        setDetail(row);
        setSelectedId(id);
      } catch (err) {
        if ((err as { status?: number }).status === 403) {
          setDenied(true);
        } else {
          setError('Order detail could not be loaded.');
        }
      } finally {
        setDetailLoading(false);
      }
    },
    [getAccessToken],
  );

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin') {
      void load();
    }
  }, [load, session.audience, session.status]);

  useEffect(() => {
    if (initialOrderId && session.status === 'authenticated' && session.audience === 'admin') {
      autoOpened.current = true;
      void loadDetail(initialOrderId);
    }
  }, [initialOrderId, loadDetail, session.audience, session.status]);

  useEffect(() => {
    if (autoOpened.current || initialOrderId || selectedId || !rows[0]) {
      return;
    }
    autoOpened.current = true;
    void loadDetail(rows[0].id);
  }, [initialOrderId, loadDetail, rows, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
    }
  }, [selectedId]);

  async function runAction(action: Parameters<typeof postAdminOrderAction>[2]) {
    const token = getAccessToken();
    if (!token || !selectedId) {
      return;
    }
    setActionBusy(true);
    setActionMessage(null);
    try {
      const updated = await postAdminOrderAction(token, selectedId, action);
      setDetail(updated);
      setActionMessage(`${FULFILL_LABELS[action] ?? action} completed.`);
      await load();
    } catch (err) {
      setActionMessage((err as Error).message);
    } finally {
      setActionBusy(false);
    }
  }

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  if (denied) {
    return <PermissionDeniedState />;
  }

  const nextAction = detail ? orderNextFulfillmentAction(detail.status) : null;
  const visibleRows = rows.filter((row) => {
    if (statusFilter !== 'all' && row.status !== statusFilter) {
      return false;
    }
    const q = orderQuery.trim().toLowerCase();
    if (!q) {
      return true;
    }
    return row.order_number.toLowerCase().includes(q) || row.id.toLowerCase().includes(q);
  });

  return (
    <section className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Orders</Heading>
        <p className="wp-page-intro">
          Sandbox order ops: pick, pack, cancel, or refund. Live carrier booking stays in Logistics and remains
          EXTERNAL_GATED until a production carrier is authorized. Empty list means no checkout yet on the customer
          store (port 3000).
        </p>
      </header>
      <div className="wp-toolbar">
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh orders'}
        </Button>
        <Input
          aria-label="Search orders"
          placeholder="Search order number"
          value={orderQuery}
          onChange={(event) => setOrderQuery(event.target.value)}
        />
        <Select
          aria-label="Filter order status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All statuses</option>
          {[...new Set(rows.map((row) => row.status))].sort().map((status) => (
            <option key={status} value={status}>
              {orderStatusLabel(status)}
            </option>
          ))}
        </Select>
        {selectedId ? (
          <Button variant="ghost" onClick={() => { setSelectedId(null); setDetail(null); }}>
            Close detail
          </Button>
        ) : null}
      </div>
      {loading && rows.length === 0 ? <LoadingState label="Loading orders" /> : null}
      {error ? <AdminRequestError error={error} onRetry={() => void load()} /> : null}
      {!loading && !error && rows.length === 0 ? (
        <EmptyState
          title="No orders yet"
          description="Checkout a product on the customer store (port 3000). Seeded demo orders also appear after sandbox seed."
        />
      ) : null}
      {rows.length > 0 && visibleRows.length === 0 ? (
        <EmptyState title="No matching orders" description="Clear the search to see the full queue." />
      ) : null}

      <div className="wp-order-layout">
        {visibleRows.length ? (
          <AdminDataTable
            caption="Orders queue"
            rowKey={(row) => row.id}
            rows={visibleRows}
            activeKey={selectedId ?? undefined}
            columns={[
              {
                id: 'order',
                header: 'Order',
                cell: (row) => row.order_number,
              },
              {
                id: 'status',
                header: 'Status',
                cell: (row) => <span className="wp-status">{orderStatusLabel(row.status)}</span>,
              },
              {
                id: 'total',
                header: 'Total',
                hideOnMobile: true,
                cell: (row) => formatMoney(row.total_minor, row.currency ?? 'XXX'),
              },
              {
                id: 'actions',
                header: '',
                cell: (row) => (
                  <Button
                    size="sm"
                    variant={selectedId === row.id ? 'primary' : 'secondary'}
                    onClick={() => void loadDetail(row.id)}
                  >
                    Manage
                  </Button>
                ),
              },
            ]}
          />
        ) : null}

        {selectedId ? (
          <Card className="wp-order-detail">
            {detailLoading ? <LoadingState label="Loading order detail" /> : null}
            {detail && !detailLoading ? (
              <div className="wp-stack">
                <h2 className="wp-section-title">{detail.order_number}</h2>
                <span className="wp-status">{orderStatusLabel(detail.status)}</span>
                <p className="wp-list-meta">{formatMoney(detail.total_minor, detail.currency ?? 'XXX')}</p>

                {detail.items?.length ? (
                  <>
                    <h3 className="wp-section-title">Line items</h3>
                    <div className="wp-admin-table-wrap">
                      <table className="wp-table">
                        <thead>
                          <tr>
                            <th>SKU</th>
                            <th>Qty</th>
                            <th>Line</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.items.map((item) => (
                            <tr key={item.id}>
                              <td>{item.sku}</td>
                              <td>{item.qty}</td>
                              <td>{formatMoney(item.line_minor, detail.currency ?? 'XXX')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}

                {detail.shipments?.length ? (
                  <>
                    <h3 className="wp-section-title">Shipments</h3>
                    {detail.shipments.map((shipment) => (
                      <p key={shipment.id} className="wp-text-muted">
                        {shipment.tracking_number ?? shipment.id.slice(0, 8)} ·{' '}
                        {orderStatusLabel(shipment.status)}
                      </p>
                    ))}
                    <Text size="caption">Book and reconcile shipments in Logistics.</Text>
                  </>
                ) : null}

                {detail.history?.length ? (
                  <>
                    <h3 className="wp-section-title">Status history</h3>
                    <ul className="wp-event-list">
                      {detail.history.slice(0, 8).map((entry, index) => {
                        const toStatus = entry.to_status ?? entry.toStatus ?? '';
                        const createdAt = entry.created_at ?? entry.createdAt ?? '';
                        return (
                          <li key={`${createdAt}-${index}`}>
                            <Text size="caption">
                              {createdAt ? `${new Date(createdAt).toLocaleString()} → ` : ''}
                              {orderStatusLabel(toStatus)}
                              {entry.reason ? ` (${entry.reason})` : ''}
                            </Text>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : null}

                <h3 className="wp-section-title">Actions</h3>
                {!canFulfill || !canCancel || !canRefund ? (
                  <p className="wp-text-muted">
                    {canFulfill ? null : 'This login cannot pick/pack (needs order:fulfill). '}
                    {canCancel ? null : 'Cancel needs order:cancel. '}
                    {canRefund ? null : 'Refund needs order:admin.'}
                  </p>
                ) : null}
                <div className="wp-toolbar">
                  {canFulfill && nextAction ? (
                    <Button disabled={actionBusy} onClick={() => void runAction(nextAction)}>
                      {FULFILL_LABELS[nextAction]}
                    </Button>
                  ) : canFulfill ? (
                    <Text size="caption">No pick/pack step for this status — use Logistics for shipped orders.</Text>
                  ) : null}
                  {canCancel ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={actionBusy}
                      onClick={() => void runAction('cancel')}
                    >
                      Cancel order
                    </Button>
                  ) : null}
                  {canRefund ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={actionBusy}
                      onClick={() => void runAction('refund')}
                    >
                      Request refund
                    </Button>
                  ) : null}
                </div>
                {actionMessage ? <p className="wp-text-muted">{actionMessage}</p> : null}
              </div>
            ) : null}
          </Card>
        ) : null}
      </div>
    </section>
  );
}
