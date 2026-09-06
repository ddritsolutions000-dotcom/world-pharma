'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminRequestError } from './admin-request-error';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  Select,
} from '@world-pharma/ui-kit/web';
import { adminApiRoot, adminAuthHeaders } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import { presentPartnerPeople, type PersonPickRow } from './eligibility-admin-present';
import { shipmentStatusLabel } from './shipment-status-labels';

type ShipmentRow = { id: string; status: string; tracking_number?: string | null };
type JobRow = {
  id: string;
  shipment_id?: string | null;
  job_type?: string;
  status?: string;
  assignee_id?: string | null;
  tracking_number?: string | null;
};

export function DeliveryAdminPanel() {
  const { session, getAccessToken } = useSession();
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [riders, setRiders] = useState<PersonPickRow[]>([]);
  const [assigneeId, setAssigneeId] = useState('');
  const [shipmentId, setShipmentId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setDenied(false);
    setError(false);
    const headers = adminAuthHeaders(token);
    const [shipRes, jobRes, partnerRes] = await Promise.all([
      fetch(`${adminApiRoot()}/api/v1/admin/shipments`, { headers }),
      fetch(`${adminApiRoot()}/api/v1/admin/delivery/jobs`, { headers }),
      fetch(`${adminApiRoot()}/api/v1/admin/partners/applications`, { headers }),
    ]);
    setLoading(false);
    if (shipRes.status === 403) {
      setDenied(true);
      return;
    }
    if (!shipRes.ok) {
      setError(true);
      return;
    }
    const shipBody = (await shipRes.json()) as { data?: ShipmentRow[] };
    const nextShipments = shipBody.data ?? [];
    setShipments(nextShipments);
    setShipmentId((current) =>
      current && nextShipments.some((row) => row.id === current) ? current : nextShipments[0]?.id ?? '',
    );
    let nextJobs: JobRow[] = [];
    if (jobRes.ok) {
      const jobBody = (await jobRes.json()) as { data?: JobRow[] };
      nextJobs = jobBody.data ?? [];
      setJobs(nextJobs);
    }
    const fromPartners = partnerRes.ok
      ? presentPartnerPeople(await partnerRes.json(), ['DELIVERY_PARTNER'])
      : [];
    const fromJobs = nextJobs
      .map((job) => job.assignee_id)
      .filter((id): id is string => Boolean(id))
      .map((id) => ({ id, label: `Assigned · ${id.slice(0, 8)}…` }));
    const nextRiders = [...fromPartners];
    for (const row of fromJobs) {
      if (!nextRiders.some((rider) => rider.id === row.id)) {
        nextRiders.push(row);
      }
    }
    setRiders(nextRiders);
    setAssigneeId((current) => current || nextRiders[0]?.id || '');
  }, [getAccessToken]);

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin') {
      void load();
    }
  }, [load, session.audience, session.status]);

  async function assign(id: string) {
    const token = getAccessToken();
    if (!token || !assigneeId.trim()) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await fetch(`${adminApiRoot()}/api/v1/admin/delivery/jobs/assign`, {
      method: 'POST',
      headers: adminAuthHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ shipment_id: id, assignee_id: assigneeId.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { detail?: string };
      setMessage(body.detail ?? 'Assign failed.');
      return;
    }
    setMessage('Job assigned.');
    await load();
  }

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  return (
    <section className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Delivery assign</Heading>
        <p className="wp-page-intro">
          Courier jobs for sandbox shipments. No live GPS, DHL, or production OTP. Book/RTO stay on Logistics.
        </p>
      </header>
      <Card>
        <div className="wp-toolbar">
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
        <FormField label="Rider" hint="Delivery partners from Join, plus people already on jobs.">
          {({ id }) =>
            riders.length ? (
              <Select
                id={id}
                aria-label="Assignee id"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
              >
                {riders.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                id={id}
                aria-label="Assignee id"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
              />
            )
          }
        </FormField>
        <FormField label="Shipment">
          {({ id }) => (
            <Select
              id={id}
              aria-label="Shipment id"
              value={shipmentId}
              onChange={(e) => setShipmentId(e.target.value)}
              disabled={shipments.length === 0}
            >
              {shipments.length === 0 ? <option value="">No shipments loaded</option> : null}
              {shipments.map((row) => (
                <option key={row.id} value={row.id}>
                  {shipmentStatusLabel(row.status)} · {row.tracking_number ?? row.id.slice(0, 8)}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <Button
          onClick={() => void assign(shipmentId.trim())}
          disabled={busy || !shipmentId.trim() || !assigneeId.trim()}
        >
          Assign job
        </Button>
        {message ? <p className="wp-text-muted">{message}</p> : null}
      </Card>
      {loading && shipments.length === 0 ? <LoadingState label="Loading delivery queue" /> : null}
      {denied ? <EmptyState title="Permission denied" description="Requires logistics:read or logistics:manage." /> : null}
      {error ? <AdminRequestError error={error} onRetry={() => void load()} /> : null}
      {jobs.length ? (
        <Card>
          <h2 className="wp-section-title">{jobs.length} job(s)</h2>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Shipment</th>
                  <th>Assignee</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td>{job.job_type ?? '—'}</td>
                    <td>
                      <span className="wp-status">{job.status ?? 'UNKNOWN'}</span>
                    </td>
                    <td>
                      <code>{job.shipment_id ? `${job.shipment_id.slice(0, 8)}…` : '—'}</code>
                    </td>
                    <td>{job.assignee_id ? `${job.assignee_id.slice(0, 8)}…` : 'Unassigned'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
      {!loading && !denied && !error && shipments.length === 0 ? (
        <EmptyState title="No shipments" description="Place a sandbox order to create a shipment job." />
      ) : null}
      {shipments.length ? (
        <Card>
          <h2 className="wp-section-title">{shipments.length} shipment(s)</h2>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Tracking</th>
                  <th>ID</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="wp-status">{shipmentStatusLabel(row.status)}</span>
                    </td>
                    <td>{row.tracking_number ?? '—'}</td>
                    <td>
                      <code>{row.id.slice(0, 8)}…</code>
                    </td>
                    <td>
                      <Button
                        variant="secondary"
                        disabled={busy || !assigneeId.trim()}
                        onClick={() => void assign(row.id)}
                      >
                        Assign
                      </Button>
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
