'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ConsultVideoPanel, useSession } from '@world-pharma/shell-web';
import { EmptyState, LoadingState } from '@world-pharma/ui-kit/web';
import { cancelAppointment, fetchAppointment, rescheduleAppointment } from './care-api';
import { appointmentLifecycleSummary, appointmentStatusLabel } from './appointment-status-labels';
import { MgBtn, MgCard, MgBackLink, Page, ServiceHero } from './ui/mg-ui';

type AppointmentDetail = {
  id: string;
  status: string;
  starts_at?: string;
  ends_at?: string;
  type?: string;
  doctor_display_name?: string;
  encounter?: { id: string; status: string } | null;
};

export function AppointmentDetailScreen({ appointmentId }: { appointmentId: string }) {
  const { getAccessToken, session, expire } = useSession();
  const [row, setRow] = useState<AppointmentDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    setLoading(true);
    try {
      setRow((await fetchAppointment(token, appointmentId)) as AppointmentDetail);
    } finally {
      setLoading(false);
    }
  }, [appointmentId, getAccessToken]);

  useEffect(() => {
    if (session.status === 'authenticated') void load();
    else setLoading(false);
  }, [load, session.status, appointmentId]);

  const lifecycle = row
    ? appointmentLifecycleSummary({
        status: row.status,
        starts_at: row.starts_at,
        encounter_status: row.encounter?.status,
      })
    : null;

  if (session.status !== 'authenticated') {
    return (
      <Page>
        <MgBackLink href="/appointments">← All appointments</MgBackLink>
        <EmptyState
          title="Sign in required"
          description="Login to view this appointment."
          action={{ label: 'Sign in', onClick: () => (window.location.href = '/login') }}
        />
      </Page>
    );
  }

  return (
    <Page>
      <MgBackLink href="/appointments">← All appointments</MgBackLink>
      <ServiceHero
        kicker="Consult"
        title="Appointment details"
        subtitle={row?.doctor_display_name ?? 'Loading…'}
        compact
      />
      {loading ? <LoadingState label="Loading appointment" /> : null}
      {row ? (
        <>
          <MgCard className="mg-order-hero">
            <p className="mg-list-title">{lifecycle?.headline ?? appointmentStatusLabel(row.status)}</p>
            {lifecycle?.detail ? <p className="mg-list-meta">{lifecycle.detail}</p> : null}
            <span className="mg-status">{appointmentStatusLabel(row.status)}</span>
            <p className="mg-detail-datetime">
              {row.starts_at ? new Date(row.starts_at).toLocaleString() : '—'}
              {row.ends_at ? ` – ${new Date(row.ends_at).toLocaleString()}` : ''}
            </p>
            {row.type ? <p className="mg-text-muted">{row.type === 'ONLINE' ? 'Online video consultation' : 'In-person clinic visit'}</p> : null}
          </MgCard>

          {row.type === 'ONLINE' ? (
            <MgCard>
              <h2 className="mg-section-title">Video consult</h2>
              <p className="mg-text-muted">Join when your appointment time arrives. Keep your camera and microphone ready.</p>
              <ConsultVideoPanel
                appointmentId={appointmentId}
                appointmentType={row.type}
                role="customer"
                token={getAccessToken()}
                onUnauthorized={() => expire()}
              />
            </MgCard>
          ) : null}

          <MgCard flat>
            <h2 className="mg-section-title">After your visit</h2>
            <p className="mg-text-muted">
              Digital prescriptions appear under <Link href="/prescriptions">Upload Rx</Link> and in your{' '}
              <Link href="/health">health timeline</Link>.
            </p>
          </MgCard>

          <div className="mg-toolbar mg-toolbar--spaced">
            <MgBtn variant="secondary" onClick={() => void cancelAppointment(getAccessToken() ?? '', appointmentId).then(load)}>
              Cancel appointment
            </MgBtn>
            <MgBtn
              variant="ghost"
              onClick={() => {
                const next = prompt('New date & time (ISO format, e.g. 2026-09-01T10:00:00Z)');
                if (next) void rescheduleAppointment(getAccessToken() ?? '', appointmentId, next).then(load);
              }}
            >
              Reschedule
            </MgBtn>
          </div>
        </>
      ) : !loading ? (
        <EmptyState title="Appointment unavailable" description="Could not load this appointment." action={{ label: 'Retry', onClick: () => void load() }} />
      ) : null}
    </Page>
  );
}
