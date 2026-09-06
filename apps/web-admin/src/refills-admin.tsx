'use client';

import Link from 'next/link';
import { AdminRequestError } from './admin-request-error';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  LoadingState,
  Select,
} from '@world-pharma/ui-kit/web';
import { adminApiRoot, adminAuthHeaders } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import { prescriptionStatusLabel } from './prescription-status-labels';

type RefillRow = {
  id: string;
  prescription_id: string;
  status: string;
  eligibility_reason_code?: string | null;
  dispensing_case_id?: string | null;
  customer_person_id?: string;
  created_at?: string;
  decided_at?: string | null;
};

const OPS_CANCEL = new Set(['REQUESTED', 'PENDING_REAUTH']);

function truncateId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export function RefillsAdminPanel() {
  const { session, getAccessToken } = useSession();
  const [rows, setRows] = useState<RefillRow[]>([]);
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setDenied(false);
    setError(false);
    const res = await fetch(`${adminApiRoot()}/api/v1/admin/refill-requests`, {
      headers: adminAuthHeaders(token),
    });
    setLoading(false);
    if (res.status === 403) {
      setDenied(true);
      return;
    }
    if (!res.ok) {
      setError(true);
      return;
    }
    const body = (await res.json()) as { requests?: RefillRow[] };
    setRows(body.requests ?? []);
  }, [getAccessToken]);

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin') {
      void load();
    }
  }, [load, session.audience, session.status]);

  const statuses = useMemo(() => {
    const set = new Set(rows.map((row) => row.status));
    return ['all', ...Array.from(set).sort()];
  }, [rows]);

  const visible = useMemo(
    () => rows.filter((row) => status === 'all' || row.status === status),
    [rows, status],
  );

  async function cancel(id: string) {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setBusyId(id);
    setMessage(null);
    const res = await fetch(`${adminApiRoot()}/api/v1/admin/refill-requests/${id}/cancel`, {
      method: 'POST',
      headers: adminAuthHeaders(token, { 'Content-Type': 'application/json' }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { detail?: string };
      setMessage(body.detail ?? 'Cancel failed.');
      return;
    }
    setMessage('Request cancelled. Approve/reject remains on the doctor portal.');
    await load();
  }

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  return (
    <section className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Refill requests</Heading>
        <p className="wp-page-intro">
          Queue from `/admin/refill-requests`. Clinical approve/reject stays on the doctor portal. Ops can cancel only
          before queue.
        </p>
      </header>
      <div className="wp-toolbar">
        <FormField label="Status">
          {({ id }) => (
            <Select id={id} aria-label="Refill status filter" value={status} onChange={(e) => setStatus(e.target.value)}>
              {statuses.map((row) => (
                <option key={row} value={row}>
                  {row}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
        <Link href="/prescriptions">Prescriptions</Link>
      </div>
      {message ? <p className="wp-text-muted">{message}</p> : null}
      {loading && rows.length === 0 ? <LoadingState label="Loading refill requests" /> : null}
      {denied ? <EmptyState title="Permission denied" description="Requires prescription:read." /> : null}
      {error ? <AdminRequestError error={error} onRetry={() => void load()} /> : null}
      {!loading && !denied && !error && visible.length === 0 ? (
        <EmptyState title="No refill requests" description="Patient refill requests appear after checkout of an issued Rx." />
      ) : null}
      {visible.length ? (
        <Card>
          <h2 className="wp-section-title">{visible.length} request(s)</h2>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Rx</th>
                  <th>Case</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="wp-status">{prescriptionStatusLabel(row.status)}</span>
                    </td>
                    <td>
                      <code>{truncateId(row.prescription_id)}</code>
                    </td>
                    <td>{row.dispensing_case_id ? <code>{truncateId(row.dispensing_case_id)}</code> : '—'}</td>
                    <td>{row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</td>
                    <td>
                      {OPS_CANCEL.has(row.status) ? (
                        <Button
                          variant="secondary"
                          disabled={busyId === row.id}
                          onClick={() => void cancel(row.id)}
                        >
                          {busyId === row.id ? 'Cancelling…' : 'Cancel'}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </section>
  );
}
