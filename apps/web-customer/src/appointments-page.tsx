'use client';

import { useEffect, useState } from 'react';
import { Button, Card, EmptyState, Heading, Text } from '@world-pharma/ui-kit/web';
import { useSession } from '@world-pharma/shell-web';
import { cancelAppointment, fetchAppointments } from './care-api';
import { CustomerShell } from './customer-shell';

export function AppointmentsScreen() {
  const { session, getAccessToken } = useSession();
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    try {
      const body = (await fetchAppointments(token)) as { appointments?: Array<Record<string, unknown>> };
      setRows(body.appointments ?? []);
    } catch {
      setError('Appointments could not be loaded.');
    }
  }

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [session.status]);

  return (
    <CustomerShell apiReachable={true} countryLabel="session">
      <Heading level={2}>Appointments</Heading>
      <Text tone="secondary">Your bookings only. Video is not included in this slice.</Text>
      <Button onClick={() => (window.location.href = '/doctors')}>Find a doctor</Button>
      {error ? <Text>{error}</Text> : null}
      {rows.length === 0 ? (
        <EmptyState title="No appointments" description="Book a doctor to see upcoming visits here." />
      ) : (
        rows.map((row) => (
          <Card key={String(row.id)}>
            <Text>{String(row.doctor_display_name ?? 'Doctor')}</Text>
            <Text>{String(row.starts_at)} · {String(row.status)}</Text>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => (window.location.href = `/appointments/${String(row.id)}`)}
            >
              Details
            </Button>
            <Button
              variant="tertiary"
              size="sm"
              onClick={() => void cancelAppointment(getAccessToken() ?? '', String(row.id)).then(load)}
            >
              Cancel
            </Button>
          </Card>
        ))
      )}
    </CustomerShell>
  );
}
