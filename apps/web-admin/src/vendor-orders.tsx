'use client';

import { useState } from 'react';
import { Button, Card, EmptyState, Heading, Input, Text } from '@world-pharma/ui-kit/web';
import { apiBaseUrl } from '@world-pharma/shell-core';
import { useSession } from '@world-pharma/shell-web';

export function VendorOrdersPanel() {
  const { getAccessToken } = useSession();
  const [orgId, setOrgId] = useState('');
  const [rows, setRows] = useState<Array<{ id: string; order_number: string; status: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const token = getAccessToken();
    if (!token || !orgId) {
      return;
    }
    const res = await fetch(`${apiBaseUrl()}/api/v1/vendor/orders?seller_org_id=${orgId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 403) {
      setError('You can only view your own seller orders.');
      setRows([]);
      return;
    }
    if (!res.ok) {
      setError('Could not load orders.');
      return;
    }
    const body = (await res.json()) as { data?: typeof rows };
    setRows(body.data ?? []);
    setError(null);
  }

  return (
    <section>
      <Heading level={2}>Vendor orders</Heading>
      <Text tone="secondary">Your seller orders only. No carrier dispatch. No payout.</Text>
      <Input aria-label="Seller organization id" value={orgId} onChange={(event) => setOrgId(event.target.value)} />
      <Button onClick={() => void load()}>Load orders</Button>
      {error ? <Text>{error}</Text> : null}
      {!rows.length ? <EmptyState title="No orders" description="No seller orders in this sandbox." /> : null}
      <Card>
        <ul>
          {rows.map((row) => (
            <li key={row.id}>
              {row.order_number} — {row.status}
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
