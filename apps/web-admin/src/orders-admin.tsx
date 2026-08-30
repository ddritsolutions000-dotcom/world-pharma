'use client';

import { useState } from 'react';
import { Button, Card, EmptyState, Heading, Text } from '@world-pharma/ui-kit/web';
import { apiBaseUrl } from '@world-pharma/shell-core';
import { useSession } from '@world-pharma/shell-web';

type OrderRow = { id: string; order_number: string; status: string; total_minor?: string; currency?: string };

export function OrdersAdminPanel() {
  const { session, getAccessToken } = useSession();
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  async function load() {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const res = await fetch(`${apiBaseUrl()}/api/v1/admin/orders`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 403) {
      setDenied(true);
      return;
    }
    if (!res.ok) {
      setError('Orders could not be loaded.');
      return;
    }
    const body = (await res.json()) as { data?: OrderRow[] };
    setRows(body.data ?? []);
  }

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  return (
    <section>
      <Heading level={2}>Orders</Heading>
      <Text tone="secondary">
        Search, fulfillment, and exceptions. No carrier labels. No settlement. Credential values are never shown.
      </Text>
      <Button onClick={() => void load()}>Load orders</Button>
      {denied ? <EmptyState title="Permission denied" description="Requires order:read." /> : null}
      {error ? <Text>{error}</Text> : null}
      {!rows.length && !denied ? <EmptyState title="No orders" description="No sandbox orders yet." /> : null}
      <Card>
        <ul>
          {rows.map((row) => (
            <li key={row.id}>
              {row.order_number} — {row.status} {row.currency} {row.total_minor}
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
