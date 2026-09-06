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
import { dispensingCaseStatusLabel } from './prescription-status-labels';

type CaseRow = {
  id: string;
  status: string;
  prescription_id: string;
  organization_id?: string | null;
  location_id?: string | null;
  order_id?: string | null;
  created_at?: string;
  note?: string;
};

function truncateId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export function DispensingAdminPanel() {
  const { session, getAccessToken } = useSession();
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setDenied(false);
    setError(false);
    const res = await fetch(`${adminApiRoot()}/api/v1/admin/dispensing-cases`, {
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
    const body = (await res.json()) as { cases?: CaseRow[] };
    setRows(body.cases ?? []);
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

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  return (
    <section className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Dispensing cases</Heading>
        <p className="wp-page-intro">
          Operational metadata from `/admin/dispensing-cases`. Medication lines are not exposed. Store complete/reject
          stays on the pharmacy app.
        </p>
      </header>
      <div className="wp-toolbar">
        <FormField label="Status">
          {({ id }) => (
            <Select
              id={id}
              aria-label="Dispensing status filter"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
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
        <Link href="/refills">Refills</Link>
      </div>
      {loading && rows.length === 0 ? <LoadingState label="Loading dispensing cases" /> : null}
      {denied ? <EmptyState title="Permission denied" description="Requires prescription:read." /> : null}
      {error ? <AdminRequestError error={error} onRetry={() => void load()} /> : null}
      {!loading && !denied && !error && visible.length === 0 ? (
        <EmptyState title="No dispensing cases" description="Queued pharmacy cases appear after issue or refill approval." />
      ) : null}
      {visible.length ? (
        <Card>
          <h2 className="wp-section-title">{visible.length} case(s)</h2>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Rx</th>
                  <th>Order</th>
                  <th>Location</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="wp-status">{dispensingCaseStatusLabel(row.status)}</span>
                    </td>
                    <td>
                      <code>{truncateId(row.prescription_id)}</code>
                    </td>
                    <td>{row.order_id ? <code>{truncateId(row.order_id)}</code> : '—'}</td>
                    <td>{row.location_id ? <code>{truncateId(row.location_id)}</code> : 'Unclaimed'}</td>
                    <td>{row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</td>
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
