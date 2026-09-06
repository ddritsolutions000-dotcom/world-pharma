'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { EmptyState, LoadingState, Text } from '@world-pharma/ui-kit/web';
import { cancelAppointment, fetchAppointments } from './care-api';
import { appointmentLifecycleSummary, appointmentStatusLabel } from './appointment-status-labels';
import { AccountHubNav } from './ui/account-hub-nav';
import { MgBtn, MgCard, MgBackLink, Page, PageIntro } from './ui/mg-ui';

type AppointmentRow = {
  id: string;
  status: string;
  starts_at?: string;
  doctor_display_name?: string;
};

export function AppointmentsScreen() {
  const { session, getAccessToken } = useSession();
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const token = getAccessToken();
    if (!token) return;
    setLoading(true);
    try {
      const body = (await fetchAppointments(token)) as { appointments?: AppointmentRow[] };
      setRows(body.appointments ?? []);
      setError(null);
    } catch {
      setError('Appointments could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session.status === 'authenticated') void load();
  }, [session.status]);

  if (session.status !== 'authenticated') {
    return (
      <Page>
        <section className="mg-service-hero" aria-label="Appointments">
          <p className="mg-service-kicker">Video & clinic</p>
          <h1 className="mg-service-title">My Appointments</h1>
          <p className="mg-service-sub">Online and in-clinic doctor consultations.</p>
        </section>
        <PageIntro>
          <p>Sign in to view upcoming visits, join video consults, and manage reschedules or cancellations.</p>
        </PageIntro>
        <EmptyState
          title="Sign in required"
          description="Login to view your appointments."
          action={{ label: 'Sign in', onClick: () => (window.location.href = '/login') }}
        />
        <div className="mg-toolbar">
          <MgBtn href="/doctors">Browse doctors</MgBtn>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <AccountHubNav />
      <MgBackLink href="/doctors">← Find doctors</MgBackLink>
      <section className="mg-service-hero" aria-label="Appointments">
        <p className="mg-service-kicker">Video & clinic</p>
        <h1 className="mg-service-title">My Appointments</h1>
        <p className="mg-service-sub">Upcoming and past doctor consultations.</p>
        <div className="mg-service-actions">
          <MgBtn href="/doctors">Book new</MgBtn>
        </div>
      </section>
      {loading ? <LoadingState label="Loading appointments" /> : null}
      {error ? <Text tone="secondary">{error}</Text> : null}
      {!loading && rows.length === 0 ? (
        <EmptyState
          title="No appointments yet"
          description="Book a verified doctor for online video consult or clinic visit."
          action={{ label: 'Find a doctor', onClick: () => (window.location.href = '/doctors') }}
        />
      ) : (
        <ul className="mg-order-list">
          {rows.map((row) => {
            const lifecycle = appointmentLifecycleSummary({ status: row.status, starts_at: row.starts_at });
            return (
              <li key={row.id}>
                <MgCard className="mg-order-card">
                  <div className="mg-order-card-top">
                    <div>
                      <p className="mg-list-title">{row.doctor_display_name ?? 'Doctor'}</p>
                      <p className="mg-list-meta">{lifecycle.headline}</p>
                      {lifecycle.detail ? <p className="mg-list-meta">{lifecycle.detail}</p> : null}
                      {row.starts_at ? (
                        <p className="mg-order-track-hint">{new Date(row.starts_at).toLocaleString()}</p>
                      ) : null}
                    </div>
                    <span className="mg-status">{appointmentStatusLabel(row.status)}</span>
                  </div>
                  <div className="mg-list-actions">
                    <MgBtn size="sm" href={`/appointments/${row.id}`}>
                      Details
                    </MgBtn>
                    <MgBtn size="sm" variant="ghost" onClick={() => void cancelAppointment(getAccessToken() ?? '', row.id).then(load)}>
                      Cancel
                    </MgBtn>
                  </div>
                </MgCard>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mg-auth-alt">
        Need a prescription? <Link href="/prescriptions">View prescriptions</Link>
      </p>
    </Page>
  );
}
