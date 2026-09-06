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
} from '@world-pharma/ui-kit/web';
import { adminApiRoot, adminAuthHeaders } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import { appointmentStatusLabel } from './appointment-status-labels';

type AppointmentRow = {
  id?: string;
  status?: string;
  type?: string;
  starts_at?: string;
  doctor_display_name?: string;
  customer_person_id?: string;
  patient_person_id?: string;
};

const CANCELLABLE = new Set([
  'REQUESTED',
  'CONFIRMED',
  'RESCHEDULE_REQUESTED',
  'RESCHEDULED',
  'CHECKED_IN',
]);

export function AppointmentsAdminPanel() {
  const { session, getAccessToken } = useSession();
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reason, setReason] = useState('ops_cancel');
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    setDenied(false);
    const res = await fetch(`${adminApiRoot()}/api/v1/admin/appointments`, {
      headers: adminAuthHeaders(token),
    });
    setLoading(false);
    if (res.status === 403) {
      setDenied(true);
      return;
    }
    if (!res.ok) {
      setError('Appointments could not be loaded.');
      return;
    }
    const body = (await res.json()) as { appointments?: AppointmentRow[]; data?: AppointmentRow[] };
    setRows(body.appointments ?? body.data ?? []);
  }, [getAccessToken]);

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin') {
      void load();
    }
  }, [load, session.audience, session.status]);

  async function cancel(id: string) {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setBusyId(id);
    setMessage(null);
    setError(null);
    const res = await fetch(`${adminApiRoot()}/api/v1/admin/appointments/${id}/cancel`, {
      method: 'POST',
      headers: adminAuthHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ reason_code: reason.trim() || 'ops_cancel' }),
    });
    setBusyId(null);
    if (res.status === 403) {
      setDenied(true);
      return;
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { detail?: string };
      setError(body.detail ?? 'Cancel failed.');
      return;
    }
    setMessage('Appointment cancelled.');
    await load();
  }

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  return (
    <section className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Appointments</Heading>
        <p className="wp-page-intro">
          Operational status only. No clinical notes or records. Use doctor verification for credential review.
        </p>
      </header>
      <div className="wp-toolbar">
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh appointments'}
        </Button>
      </div>
      {message ? <p className="wp-text-muted">{message}</p> : null}
      {loading && rows.length === 0 ? <LoadingState label="Loading appointments" /> : null}
      {denied ? <EmptyState title="Permission denied" description="Requires appointment:read." /> : null}
      {error ? <AdminRequestError error={error} onRetry={() => void load()} /> : null}
      {!loading && !denied && !error && rows.length === 0 ? (
        <EmptyState title="No appointments" description="Sandbox appointments appear after booking." />
      ) : null}
      {rows.length ? (
        <Card>
          <FormField label="Cancel reason code">
            {({ id }) => (
              <Input
                id={id}
                aria-label="Cancel reason code"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            )}
          </FormField>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Doctor</th>
                  <th>When</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const id = row.id;
                  const status = String(row.status ?? 'UNKNOWN');
                  return (
                    <tr key={id ?? `appt-${index}`}>
                      <td>{row.doctor_display_name ?? 'Appointment'}</td>
                      <td>{row.starts_at ? new Date(row.starts_at).toLocaleString() : '—'}</td>
                      <td>{row.type ?? '—'}</td>
                      <td>
                        <span className="wp-status">{appointmentStatusLabel(status)}</span>
                      </td>
                      <td>
                        {id && CANCELLABLE.has(status) ? (
                          <Button
                            variant="secondary"
                            disabled={busyId === id}
                            onClick={() => void cancel(id)}
                          >
                            {busyId === id ? 'Cancelling…' : 'Cancel'}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </section>
  );
}
