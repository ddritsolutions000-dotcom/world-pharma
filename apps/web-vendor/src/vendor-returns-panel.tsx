'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  approveVendorReturn,
  fetchVendorReturns,
  receiveVendorReturn,
  rejectVendorReturn,
  type VendorReturnRow,
} from './vendor-api';
import { formatCurrencyMinor, statusBadgeClass } from './vendor-format';

export function VendorReturnsPanel({
  organizationId,
  token,
  onError,
}: {
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
}) {
  const [rows, setRows] = useState<VendorReturnRow[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<VendorReturnRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) {
      return;
    }
    setLoading(true);
    try {
      const body = await fetchVendorReturns(token, organizationId, filter || undefined);
      setRows(body.data);
    } catch (err) {
      onError(err);
    } finally {
      setLoading(false);
    }
  }, [filter, organizationId, onError, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async (row: VendorReturnRow) => {
    setBusy(true);
    try {
      await approveVendorReturn(token, row.order_id, row.id);
      await load();
      setSelected(null);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const receive = async (row: VendorReturnRow) => {
    setBusy(true);
    try {
      await receiveVendorReturn(token, row.order_id, row.id);
      await load();
      setSelected(null);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const reject = async (row: VendorReturnRow) => {
    if (!rejectReason.trim()) {
      return;
    }
    setBusy(true);
    try {
      await rejectVendorReturn(token, row.order_id, row.id, rejectReason.trim());
      setRejectReason('');
      await load();
      setSelected(null);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading return requests…" />;
  }

  return (
    <div className="wp-stack">
      <Text tone="secondary">
        1mg-like returns: approve schedules reverse pickup; receive at warehouse restocks (except damaged/Rx). Refunds
        stay platform-authoritative.
      </Text>
      <div className="wp-form-row">
        <label>
          Filter status
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All</option>
            <option value="REQUESTED">Requested</option>
            <option value="PICKUP_SCHEDULED">Pickup scheduled</option>
            <option value="APPROVED">Approved / received</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </label>
      </div>

      {!rows.length ? (
        <EmptyState title="No return requests" description="Customer return requests for your orders will appear here." />
      ) : (
        <div className="wp-order-layout">
          <Card>
            <Heading level={2}>Returns queue ({rows.length})</Heading>
            <ul className="wp-mini-list">
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className={`wp-order-row${selected?.id === row.id ? ' wp-order-row--active' : ''}`}
                    onClick={() => setSelected(row)}
                  >
                    <div className="wp-mini-main">
                      <p className="wp-mini-title">
                        <span className="wp-mini-id">{row.order_number}</span>
                        <span className={statusBadgeClass(row.status)}>{row.status}</span>
                      </p>
                      <p className="wp-mini-meta">
                        {row.reason} · {row.order_status}
                        {row.vendor_action_required ? ' · action required' : ''}
                      </p>
                    </div>
                    <div className="wp-mini-right">
                      <Text size="bodyLg">{formatCurrencyMinor(row.total_minor, row.currency)}</Text>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <div className="wp-order-detail">
            {selected ? (
              <Card>
                <Heading level={2}>Return detail</Heading>
                <Text>Order {selected.order_number}</Text>
                <Text size="caption">Reason: {selected.reason}</Text>
                <Text size="caption">Return status: {selected.status}</Text>
                <Text size="caption">Order status: {selected.order_status}</Text>
                {selected.tracking_number ? (
                  <Text size="caption">Return tracking: {selected.tracking_number}</Text>
                ) : null}
                {selected.pickup_slot_start ? (
                  <Text size="caption">
                    Pickup slot: {new Date(selected.pickup_slot_start).toLocaleString()}
                    {selected.pickup_slot_end
                      ? ` – ${new Date(selected.pickup_slot_end).toLocaleString()}`
                      : ''}
                  </Text>
                ) : null}
                {selected.refund_status ? (
                  <Text size="caption">Refund status: {selected.refund_status}</Text>
                ) : null}
                {selected.note ? <Text size="caption">Note: {selected.note}</Text> : null}
                {selected.status === 'REQUESTED' && selected.vendor_action_required ? (
                  <div className="wp-form-row">
                    <Button disabled={busy} onClick={() => void approve(selected)}>
                      Approve &amp; schedule pickup
                    </Button>
                    <label>
                      Reject reason
                      <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                    </label>
                    <Button variant="secondary" disabled={busy || !rejectReason.trim()} onClick={() => void reject(selected)}>
                      Reject return
                    </Button>
                  </div>
                ) : null}
                {selected.status === 'PICKUP_SCHEDULED' ? (
                  <div className="wp-form-row">
                    <Button disabled={busy} onClick={() => void receive(selected)}>
                      Mark received at warehouse
                    </Button>
                  </div>
                ) : null}
                {selected.status !== 'REQUESTED' && selected.status !== 'PICKUP_SCHEDULED' ? (
                  <Text size="caption">No vendor action required for this return.</Text>
                ) : null}
              </Card>
            ) : (
              <Card>
                <EmptyState title="Select a return" description="Choose a return request to review details and actions." />
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
