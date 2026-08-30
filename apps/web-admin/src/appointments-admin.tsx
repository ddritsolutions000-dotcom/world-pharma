'use client';

import { useState } from 'react';
import { Button, Card, EmptyState, Heading, Text } from '@world-pharma/ui-kit/web';
import { apiBaseUrl } from '@world-pharma/shell-core';
import { useSession } from '@world-pharma/shell-web';

export function AppointmentsAdminPanel() {
  const { session, getAccessToken } = useSession();
  const [rows, setRows] = useState<Array<Record<string, unknown>> | null>(null);
  const [denied, setDenied] = useState(false);

  async function load() {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const res = await fetch(`${apiBaseUrl()}/api/v1/admin/appointments`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 403) {
      setDenied(true);
      return;
    }
    if (!res.ok) {
      return;
    }
    const body = (await res.json()) as { appointments?: Array<Record<string, unknown>> };
    setRows(body.appointments ?? []);
  }

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  return (
    <section>
      <Heading level={2}>Appointments</Heading>
      <Text tone="secondary">Operational status only. No clinical notes or records.</Text>
      <Button onClick={() => void load()}>Load appointments</Button>
      {denied ? <EmptyState title="Permission denied" description="Requires appointment:read." /> : null}
      {rows ? (
        <Card>
          <Text>{rows.length} appointment(s)</Text>
        </Card>
      ) : null}
    </section>
  );
}
