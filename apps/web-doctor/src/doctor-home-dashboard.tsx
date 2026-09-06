'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiCall } from '@world-pharma/shell-core';
import { PortalKpiCards, useSession } from '@world-pharma/shell-web';
import { Button, Card, EmptyState, Heading, LoadingState, Text } from '@world-pharma/ui-kit/web';
import { fetchNotificationInbox, fetchDoctorEarningsSummary, fetchDoctorRefillRequests } from './doctor-api';
import { appointmentStatusLabel } from './appointment-status-labels';
import { unreadInboxCount } from './notification-inbox';

type AppointmentRow = {
  id: string;
  status: string;
  starts_at?: string;
};

function settlementStatusLabel(status: string | null | undefined): string {
  const code = (status ?? '').trim().toUpperCase();
  if (!code) return 'Wallet pending';
  if (code === 'WALLET_AVAILABLE') return 'Wallet ready';
  if (code === 'SANDBOX_NOT_SETTLED') return 'Sandbox wallet';
  if (code === 'GATED') return 'Payout gated';
  if (code === 'LIVE') return 'Live payouts';
  return code.replaceAll('_', ' ').toLowerCase();
}

function formatWhen(iso?: string): string {
  if (!iso) {
    return 'Time TBD';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DoctorHomeDashboard() {
  const { session, getAccessToken, expire } = useSession();
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [pendingRefills, setPendingRefills] = useState(0);
  const [earningsHint, setEarningsHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [apptResult, inboxResult, refillResult, earningsResult] = await Promise.all([
      apiCall<{ appointments?: AppointmentRow[] }>('api/v1/doctor/appointments', {
        token,
        baseUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
        onUnauthorized: () => expire(),
      }),
      fetchNotificationInbox({ token, onUnauthorized: expire }),
      fetchDoctorRefillRequests({ token, onUnauthorized: expire }),
      fetchDoctorEarningsSummary({ token, onUnauthorized: expire }),
    ]);
    if (apptResult.ok) {
      setAppointments(apptResult.data.appointments ?? []);
    } else {
      setAppointments([]);
    }
    if (inboxResult.ok) {
      setUnread(unreadInboxCount(inboxResult.data.data ?? []));
    } else {
      setUnread(0);
    }
    if (refillResult.ok) {
      setPendingRefills((refillResult.data.requests ?? []).length);
    } else {
      setPendingRefills(0);
    }
    if (earningsResult.ok) {
      const settlement = settlementStatusLabel(earningsResult.data.settlement_status);
      setEarningsHint(`${earningsResult.data.completed_consult_count} completed · ${settlement}`);
    } else {
      setEarningsHint(null);
    }
    setLoading(false);
  }, [expire, getAccessToken]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [load, session.status]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return appointments
      .filter((row) => row.status !== 'COMPLETED' && row.status !== 'CANCELLED')
      .sort((a, b) => {
        const ta = a.starts_at ? new Date(a.starts_at).getTime() : Number.MAX_SAFE_INTEGER;
        const tb = b.starts_at ? new Date(b.starts_at).getTime() : Number.MAX_SAFE_INTEGER;
        return ta - tb;
      })
      .slice(0, 5);
  }, [appointments]);

  const todayCount = useMemo(() => {
    const today = new Date().toDateString();
    return appointments.filter((row) => row.starts_at && new Date(row.starts_at).toDateString() === today).length;
  }, [appointments]);

  if (loading) {
    return <LoadingState label="Loading your workspace" />;
  }

  return (
    <div className="doctor-dashboard">
      <Card>
        <PortalKpiCards
          items={[
            { label: "Today's visits", value: todayCount },
            { label: 'Upcoming', value: upcoming.length },
            { label: 'Unread inbox', value: unread },
            { label: 'Refill requests', value: pendingRefills },
          ]}
        />
      </Card>

      <div className="doctor-dashboard-grid">
        <Card raised>
          <Heading level={3}>Upcoming appointments</Heading>
          {upcoming.length === 0 ? (
            <EmptyState
              title="No upcoming visits"
              description="Confirmed appointments will show here."
              action={{ label: 'View all', onClick: () => (window.location.href = '/appointments') }}
            />
          ) : (
            <table className="wp-data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((row) => (
                  <tr key={row.id}>
                    <td>{formatWhen(row.starts_at)}</td>
                    <td>
                      <span className="wp-status">{appointmentStatusLabel(row.status)}</span>
                    </td>
                    <td>
                      <Link href={`/appointments?id=${encodeURIComponent(row.id)}`}>
                        <Button size="sm" variant="secondary">
                          Open
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card raised>
          <Heading level={3}>Quick actions</Heading>
          <div className="doctor-quick-actions">
            <Link href="/appointments">
              <Button>Appointments</Button>
            </Link>
            <Link href="/earnings">
              <Button variant="secondary">{earningsHint ? `Earnings (${earningsHint})` : 'Earnings'}</Button>
            </Link>
            <Link href="/refill-requests">
              <Button variant="secondary">
                {pendingRefills ? `Refills (${pendingRefills})` : 'Refill requests'}
              </Button>
            </Link>
            <Link href="/inbox">
              <Button variant="secondary">{unread ? `Inbox (${unread})` : 'Inbox'}</Button>
            </Link>
            <Link href="/settings">
              <Button variant="tertiary">Profile &amp; availability</Button>
            </Link>
            <Link href="/support">
              <Button variant="tertiary">Support</Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
