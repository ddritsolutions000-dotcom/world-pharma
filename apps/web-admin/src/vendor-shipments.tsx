'use client';

import { useState } from 'react';
import { Button, Card, EmptyState, Heading, Input, Text } from '@world-pharma/ui-kit/web';
import { apiBaseUrl } from '@world-pharma/shell-core';
import { useSession } from '@world-pharma/shell-web';

export function VendorShipmentsPanel() {
  const { getAccessToken } = useSession();
  const [orgId, setOrgId] = useState('');
  const [rows, setRows] = useState<Array<{ id: string; status: string; tracking_number?: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const token = getAccessToken();
    if (!token || !orgId) {
      return;
    }
    const res = await fetch(`${apiBaseUrl()}/api/v1/vendor/shipments?seller_org_id=${orgId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 403) {
      setError('You can only view your own seller shipments.');
      setRows([]);
      return;
    }
    if (!res.ok) {
      setError('Could not load shipments.');
      return;
    }
    const body = (await res.json()) as { data?: typeof rows };
    setRows(body.data ?? []);
    setError(null);
  }

  return (
    <section>
      <Heading level={2}>Vendor shipments</Heading>
      <Text tone="secondary">Your seller shipments only. Mock tracking. No other vendors. No live DHL.</Text>
      <Input aria-label="Seller organization id" value={orgId} onChange={(event) => setOrgId(event.target.value)} />
      <Button onClick={() => void load()}>Load shipments</Button>
      {error ? <Text>{error}</Text> : null}
      {!rows.length ? <EmptyState title="No shipments" description="No sandbox shipments for this seller." /> : null}
      <Card>
        <ul>
          {rows.map((row) => (
            <li key={row.id}>
              {row.status} {row.tracking_number ?? 'pending'}
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
