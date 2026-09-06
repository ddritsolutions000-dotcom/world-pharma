'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminRequestError } from './admin-request-error';
import { adminApiRoot, adminAuthHeaders } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  PermissionDeniedState,
  Text,
} from '@world-pharma/ui-kit/web';
import { dispensingCaseStatusLabel, prescriptionStatusLabel } from './prescription-status-labels';

type PrescriptionAdminRow = {
  id: string;
  status: string;
  country_id?: string;
  encounter_id?: string | null;
  doctor_profile_id?: string;
  origin?: string;
  created_at?: string;
  note?: string;
};

type PrescriptionAdminDetail = PrescriptionAdminRow & {
  current_version_id?: string | null;
  versions?: Array<{ id: string; version_number: number; sealed_at?: string | null; created_at?: string }>;
  status_history?: Array<{
    from_status: string | null;
    to_status: string;
    reason_code?: string | null;
    created_at: string;
  }>;
};

type DispensingAdminCase = {
  id: string;
  status: string;
  prescription_id: string;
  prescription_version_id?: string;
  country_id?: string;
  organization_id?: string | null;
  location_id?: string | null;
  order_id?: string | null;
  created_at?: string;
  updated_at?: string;
  note?: string;
};

type AdminRefillRequestRow = {
  id: string;
  prescription_id: string;
  status: string;
  customer_person_id?: string;
  dispensing_case_id?: string | null;
  created_at?: string;
};

function truncateId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export function PrescriptionsAdminPanel() {
  const { session, getAccessToken } = useSession();
  const [rows, setRows] = useState<PrescriptionAdminRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PrescriptionAdminDetail | null>(null);
  const [dispensingCases, setDispensingCases] = useState<DispensingAdminCase[]>([]);
  const [refillRequests, setRefillRequests] = useState<AdminRefillRequestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState(false);

  const loadAll = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setError(false);
    setDenied(false);
    try {
      const [rxRes, casesRes, refillsRes] = await Promise.all([
        fetch(`${adminApiRoot()}/api/v1/admin/prescriptions`, {
          headers: adminAuthHeaders(token),
        }),
        fetch(`${adminApiRoot()}/api/v1/admin/dispensing-cases`, {
          headers: adminAuthHeaders(token),
        }),
        fetch(`${adminApiRoot()}/api/v1/admin/refill-requests`, {
          headers: adminAuthHeaders(token),
        }),
      ]);
      if ([rxRes, casesRes, refillsRes].some((res) => res.status === 403)) {
        setDenied(true);
        return;
      }
      if (!rxRes.ok || !casesRes.ok || !refillsRes.ok) {
        setError(true);
        return;
      }
      const rxBody = (await rxRes.json()) as { prescriptions?: PrescriptionAdminRow[] };
      const casesBody = (await casesRes.json()) as { cases?: DispensingAdminCase[] };
      const refillsBody = (await refillsRes.json()) as { requests?: AdminRefillRequestRow[] };
      setRows(rxBody.prescriptions ?? []);
      setDispensingCases(casesBody.cases ?? []);
      setRefillRequests(refillsBody.requests ?? []);
    } catch {
      setError(true);
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
      setSelectedId(id);
      setDetail(null);
      setDetailLoading(true);
      try {
        const res = await fetch(`${adminApiRoot()}/api/v1/admin/prescriptions/${id}`, {
          headers: adminAuthHeaders(token),
        });
        if (res.status === 403) {
          setDenied(true);
          return;
        }
        if (!res.ok) {
          setError(true);
          return;
        }
        setDetail((await res.json()) as PrescriptionAdminDetail);
      } catch {
        setError(true);
      } finally {
        setDetailLoading(false);
      }
    },
    [getAccessToken],
  );

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin') {
      void loadAll();
    }
  }, [loadAll, session.audience, session.status]);

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  if (denied) {
    return <PermissionDeniedState />;
  }

  return (
    <section className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Prescriptions</Heading>
        <p className="wp-page-intro">
          Clinical ops metadata — prescription lifecycle, dispensing cases, and refill requests. Medication lines are
          not exposed on admin views.
        </p>
      </header>
      <div className="wp-toolbar">
        <Button variant="secondary" onClick={() => void loadAll()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
        {selectedId ? (
          <Button variant="ghost" onClick={() => { setSelectedId(null); setDetail(null); }}>
            Close detail
          </Button>
        ) : null}
      </div>
      {loading && !rows.length ? <LoadingState label="Loading prescriptions" /> : null}
      {error ? <AdminRequestError error={error} onRetry={() => void loadAll()} /> : null}

      <div className="wp-order-layout">
        <div className="wp-stack">
          <h2 className="wp-section-title">{rows.length} prescription(s)</h2>
          {!loading && !rows.length ? (
            <EmptyState title="No prescriptions" description="Issued prescriptions appear after clinical encounters." />
          ) : rows.length ? (
            <div className="wp-admin-table-wrap">
              <table className="wp-table">
                <thead>
                  <tr>
                    <th>Prescription</th>
                    <th>Status</th>
                    <th>Origin</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className={selectedId === row.id ? 'wp-admin-row-active' : undefined}>
                      <td>{truncateId(row.id)}</td>
                      <td>
                        <span className="wp-status">{prescriptionStatusLabel(row.status)}</span>
                      </td>
                      <td>{row.origin ?? '—'}</td>
                      <td>
                        <Button
                          size="sm"
                          variant={selectedId === row.id ? 'primary' : 'secondary'}
                          onClick={() => void loadDetail(row.id)}
                        >
                          View detail
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <h2 className="wp-section-title">Dispensing cases ({dispensingCases.length})</h2>
          {!dispensingCases.length ? (
            <EmptyState title="No dispensing cases" description="Queued pharmacy cases appear here." />
          ) : (
            <div className="wp-admin-table-wrap">
              <table className="wp-table">
                <thead>
                  <tr>
                    <th>Case</th>
                    <th>Status</th>
                    <th>Rx / order</th>
                  </tr>
                </thead>
                <tbody>
                  {dispensingCases.map((row) => (
                    <tr key={row.id}>
                      <td>{truncateId(row.id)}</td>
                      <td>
                        <span className="wp-status">{dispensingCaseStatusLabel(row.status)}</span>
                      </td>
                      <td>
                        Rx {truncateId(row.prescription_id)} · order {row.order_id ? truncateId(row.order_id) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2 className="wp-section-title">Refill requests ({refillRequests.length})</h2>
          {!refillRequests.length ? (
            <EmptyState title="No refill requests" description="Patient refill workflow requests appear here." />
          ) : (
            <div className="wp-admin-table-wrap">
              <table className="wp-table">
                <thead>
                  <tr>
                    <th>Request</th>
                    <th>Status</th>
                    <th>Rx / case</th>
                  </tr>
                </thead>
                <tbody>
                  {refillRequests.map((row) => (
                    <tr key={row.id}>
                      <td>{truncateId(row.id)}</td>
                      <td>
                        <span className="wp-status">{prescriptionStatusLabel(row.status)}</span>
                      </td>
                      <td>
                        Rx {truncateId(row.prescription_id)} · case{' '}
                        {row.dispensing_case_id ? truncateId(row.dispensing_case_id) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selectedId ? (
          <Card className="wp-order-detail">
            {detailLoading ? <LoadingState label="Loading prescription" /> : null}
            {detail && !detailLoading ? (
              <div className="wp-stack">
                <h2 className="wp-section-title">Prescription detail</h2>
                <span className="wp-status">{prescriptionStatusLabel(detail.status)}</span>
                <p className="wp-list-meta">Origin: {detail.origin ?? '—'}</p>
                <p className="wp-text-muted">Versions: {detail.versions?.length ?? 0}</p>
                {detail.status_history?.length ? (
                  <>
                    <h3 className="wp-section-title">Status history</h3>
                    <ul className="wp-event-list">
                      {detail.status_history.map((row, index) => (
                        <li key={`${row.to_status}-${row.created_at}-${index}`}>
                          <Text size="caption">
                            {row.from_status ?? '—'} → {prescriptionStatusLabel(row.to_status)}
                            {row.reason_code ? ` (${row.reason_code})` : ''} ·{' '}
                            {new Date(row.created_at).toLocaleString()}
                          </Text>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {detail.note ? <p className="wp-text-muted">{detail.note}</p> : null}
              </div>
            ) : null}
          </Card>
        ) : null}
      </div>
    </section>
  );
}
