'use client';

import { useState } from 'react';
import { Button, Card, EmptyState, Heading, Text } from '@world-pharma/ui-kit/web';
import { apiBaseUrl } from '@world-pharma/shell-core';
import { useSession } from '@world-pharma/shell-web';

type ShipmentRow = {
  id: string;
  status: string;
  tracking_number?: string;
  quoted_cost_minor?: string | null;
  actual_cost_minor?: string | null;
};

export function LogisticsAdminPanel() {
  const { session, getAccessToken } = useSession();
  const [rows, setRows] = useState<ShipmentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  async function load() {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const res = await fetch(`${apiBaseUrl()}/api/v1/admin/shipments`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 403) {
      setDenied(true);
      return;
    }
    if (!res.ok) {
      setError('Shipments could not be loaded.');
      return;
    }
    const body = (await res.json()) as { data?: ShipmentRow[] };
    setRows(body.data ?? []);
  }

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  return (
    <section>
      <Heading level={2}>Logistics</Heading>
      <Text tone="secondary">
        Sandbox mock carrier only. No live DHL. No settlement. Credential values are never shown.
      </Text>
      <Button onClick={() => void load()}>Load shipments</Button>
      {denied ? <EmptyState title="Permission denied" description="Requires logistics:read." /> : null}
      {error ? <Text>{error}</Text> : null}
      {!rows.length && !denied ? <EmptyState title="No shipments" description="No sandbox shipments yet." /> : null}
      <Card>
        <ul>
          {rows.map((row) => (
            <li key={row.id}>
              {row.id.slice(0, 8)} — {row.status} {row.tracking_number ?? 'no tracking'} quote=
              {row.quoted_cost_minor ?? 'null'} actual={row.actual_cost_minor ?? 'null'}
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
