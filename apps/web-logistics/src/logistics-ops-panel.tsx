'use client';

import { useCallback, useEffect, useState } from 'react';
import { COOKIE_SESSION_TOKEN } from '@world-pharma/shell-core';
import { PortalKpiCards, useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  Text,
} from '@world-pharma/ui-kit/web';
import { shipmentStatusLabel, isTerminalShipmentStatus } from './shipment-status-labels';

type ShipmentRow = {
  id: string;
  status: string;
  tracking_number?: string;
  quoted_cost_minor?: string | null;
  actual_cost_minor?: string | null;
  pod?: {
    delivered: boolean;
    otp_recorded: boolean;
    photo_attached: boolean;
    signature_attached: boolean;
    note?: string;
  };
};

function logisticsApiRoot(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '');
}

async function adminCall(path: string, token: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && token !== COOKIE_SESSION_TOKEN) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const res = await fetch(`${logisticsApiRoot()}${path}`, { ...init, headers, credentials: 'include' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error((body as { detail?: string }).detail ?? 'request_failed'), {
      status: res.status,
    });
  }
  return body;
}

export function LogisticsOpsPanel() {
  const { session, getAccessToken } = useSession();
  const [rows, setRows] = useState<ShipmentRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'delivered'>('all');
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body = await adminCall('/api/v1/admin/shipments', token);
      setRows((body.data ?? []) as ShipmentRow[]);
      setDenied(false);
    } catch (err) {
      if ((err as { status?: number }).status === 403) {
        setDenied(true);
      } else {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin') {
      void load();
    }
  }, [load, session.audience, session.status]);

  async function runAction(label: string, path: string, init?: RequestInit) {
    const token = getAccessToken();
    if (!token || !selectedId || actionBusy) {
      return;
    }
    setActionBusy(true);
    setMessage(null);
    try {
      await adminCall(path, token, init);
      setMessage(`${label} completed.`);
      await load();
    } catch (err) {
      setMessage((err as Error).message);
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

  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const visibleRows = rows.filter((row) => {
    if (statusFilter === 'delivered') return row.status === 'DELIVERED';
    if (statusFilter === 'active') return !isTerminalShipmentStatus(row.status);
    return true;
  });

  return (
    <>
      <div className="wp-toolbar">
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh shipments'}
        </Button>
        <Button size="sm" variant={statusFilter === 'all' ? 'primary' : 'secondary'} onClick={() => setStatusFilter('all')}>
          All
        </Button>
        <Button size="sm" variant={statusFilter === 'active' ? 'primary' : 'secondary'} onClick={() => setStatusFilter('active')}>
          Active
        </Button>
        <Button
          size="sm"
          variant={statusFilter === 'delivered' ? 'primary' : 'secondary'}
          onClick={() => setStatusFilter('delivered')}
        >
          Delivered
        </Button>
        {selectedId ? (
          <Button variant="ghost" onClick={() => setSelectedId(null)}>
            Close detail
          </Button>
        ) : null}
      </div>
      <div className="wp-fleet-map" aria-label="Live fleet tracking">
        <div className="wp-fleet-grid" />
        <span className="wp-fleet-pin" style={{ left: '18%', top: '42%' }}>
          P
        </span>
        <span className="wp-fleet-pin wp-fleet-pin--drop" style={{ left: '72%', top: '58%' }}>
          D
        </span>
        <span className="wp-fleet-truck" style={{ left: '44%', top: '46%' }}>
          🚚
        </span>
        <p>
          Live tracking · {rows.filter((row) => !isTerminalShipmentStatus(row.status)).length} active jobs · map tiles
          attach when carrier GPS is enabled
        </p>
      </div>
      <PortalKpiCards
        items={[
          { label: 'Active jobs', value: rows.filter((row) => !isTerminalShipmentStatus(row.status)).length },
          { label: 'Delivered', value: rows.filter((row) => row.status === 'DELIVERED').length },
          { label: 'All shipments', value: rows.length },
        ]}
      />
      {loading && !rows.length ? <LoadingState label="Loading shipments" /> : null}
      {error ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} /> : null}
      {!rows.length && !loading && !denied ? (
        <EmptyState title="No shipments" description="Transactional demo seed creates sandbox shipments after API restart." />
      ) : null}

      <div className="wp-order-layout">
        {visibleRows.length ? (
          <table className="wp-data-table">
            <thead>
              <tr>
                <th>Tracking</th>
                <th>Status</th>
                <th>Shipment</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id} className={selectedId === row.id ? 'is-selected' : undefined}>
                  <td>{row.tracking_number ?? 'Pending book'}</td>
                  <td>
                    <span className="wp-status">{shipmentStatusLabel(row.status)}</span>
                  </td>
                  <td>{row.id.slice(0, 8)}…</td>
                  <td>
                    <Button
                      size="sm"
                      variant={selectedId === row.id ? 'primary' : 'secondary'}
                      onClick={() => setSelectedId(row.id)}
                    >
                      Manage
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {selected ? (
          <Card className="wp-order-detail">
            <h2 className="wp-section-title">Shipment {selected.id.slice(0, 8)}</h2>
            <span className="wp-status">{shipmentStatusLabel(selected.status)}</span>
            <p className="wp-list-meta">Tracking: {selected.tracking_number ?? 'not booked'}</p>
            {selected.pod ? (
              <p className="wp-text-muted">
                POD: OTP {selected.pod.otp_recorded ? 'yes' : 'no'} · Photo {selected.pod.photo_attached ? 'yes' : 'no'} ·
                Signature {selected.pod.signature_attached ? 'yes' : 'no'}
              </p>
            ) : null}
            <p className="wp-text-muted">Sandbox mock carrier — not a live booking.</p>
            <div className="wp-toolbar">
              <Button
                size="sm"
                disabled={actionBusy}
                onClick={() =>
                  void runAction('Book', `/api/v1/admin/shipments/${selected.id}/book`, {
                    method: 'POST',
                    body: JSON.stringify({ scenario: 'BOOK_SUCCESS' }),
                  })
                }
              >
                Book (sandbox)
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={actionBusy}
                onClick={() =>
                  void runAction('Reconcile', `/api/v1/admin/shipments/${selected.id}/reconcile`, { method: 'POST' })
                }
              >
                Reconcile
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={actionBusy}
                onClick={() => void runAction('RTO', `/api/v1/admin/shipments/${selected.id}/rto`, { method: 'POST' })}
              >
                Return to origin
              </Button>
              <Button
                size="sm"
                variant="tertiary"
                disabled={actionBusy}
                onClick={() => void runAction('Create OTP', `/api/v1/admin/shipments/${selected.id}/otp`, { method: 'POST' })}
              >
                Ensure OTP POD
              </Button>
            </div>
            <FormField label="OTP verify code (sandbox: 123456)">
              {({ id }) => <Input id={id} value={otpCode} onChange={(e) => setOtpCode(e.target.value)} disabled={actionBusy} />}
            </FormField>
            <Button
              size="sm"
              variant="tertiary"
              disabled={actionBusy}
              onClick={() =>
                void runAction('Verify OTP', `/api/v1/admin/shipments/${selected.id}/otp/verify`, {
                  method: 'POST',
                  body: JSON.stringify({ code: otpCode }),
                })
              }
            >
              Verify OTP
            </Button>
            <FormField label="Assignee person ID">
              {({ id }) => <Input id={id} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} disabled={actionBusy} />}
            </FormField>
            <Button
              size="sm"
              disabled={actionBusy || !assigneeId.trim()}
              onClick={() =>
                void runAction('Assign job', '/api/v1/admin/delivery/jobs/assign', {
                  method: 'POST',
                  body: JSON.stringify({ shipment_id: selected.id, assignee_id: assigneeId }),
                })
              }
            >
              Assign delivery job
            </Button>
            {message ? <p className="wp-text-muted">{message}</p> : null}
          </Card>
        ) : null}
      </div>
    </>
  );
}
