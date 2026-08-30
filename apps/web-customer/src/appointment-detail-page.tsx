'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Heading, Text } from '@world-pharma/ui-kit/web';
import { ConsultVideoPanel, useSession } from '@world-pharma/shell-web';
import { cancelAppointment, fetchAppointment, rescheduleAppointment } from './care-api';
import { CustomerShell } from './customer-shell';

type AppointmentDetail = {
  id: string;
  status: string;
  starts_at?: string;
  ends_at?: string;
  type?: string;
  encounter?: { id: string; status: string } | null;
};

export function AppointmentDetailScreen({ appointmentId }: { appointmentId: string }) {
  const { getAccessToken, session, expire } = useSession();
  const [row, setRow] = useState<AppointmentDetail | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setRow((await fetchAppointment(token, appointmentId)) as AppointmentDetail);
  }, [appointmentId, getAccessToken]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [load, session.status, appointmentId]);

  return (
    <CustomerShell apiReachable={true} countryLabel="session">
      <Heading level={2}>Appointment</Heading>
      {row ? (
        <Card>
          <Text>{row.status}</Text>
          <Text>
            {row.starts_at ?? '—'} – {row.ends_at ?? '—'}
          </Text>
          <Text>Encounter: {row.encounter?.status ?? 'none'}</Text>
          <ConsultVideoPanel
            appointmentId={appointmentId}
            appointmentType={row.type}
            role="customer"
            token={getAccessToken()}
            onUnauthorized={() => expire()}
          />
          <Button
            variant="secondary"
            onClick={() => void cancelAppointment(getAccessToken() ?? '', appointmentId).then(load)}
          >
            Cancel
          </Button>
          <Button
            variant="tertiary"
            onClick={() => {
              const next = prompt('New start (ISO)');
              if (next) {
                void rescheduleAppointment(getAccessToken() ?? '', appointmentId, next).then(load);
              }
            }}
          >
            Reschedule
          </Button>
        </Card>
      ) : (
        <Text>Loading or sign in required.</Text>
      )}
    </CustomerShell>
  );
}
