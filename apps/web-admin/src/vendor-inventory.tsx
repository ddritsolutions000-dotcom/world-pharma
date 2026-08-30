'use client';

import { useState } from 'react';
import { Button, Card, EmptyState, Heading, Input, Text } from '@world-pharma/ui-kit/web';
import { apiBaseUrl } from '@world-pharma/shell-core';
import { useSession } from '@world-pharma/shell-web';

export function VendorInventoryPanel() {
  const { getAccessToken } = useSession();
  const [orgId, setOrgId] = useState('');
  const [lots, setLots] = useState<Array<{ id: string; sku?: string; available: number; lot_code: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const token = getAccessToken();
    if (!token || !orgId) {
      return;
    }
    const res = await fetch(`${apiBaseUrl()}/api/v1/vendor/inventory/lots?owner_org_id=${orgId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 403) {
      setError('You can only view your own inventory.');
      setLots([]);
      return;
    }
    if (!res.ok) {
      setError('Could not load inventory.');
      return;
    }
    const body = (await res.json()) as { data?: typeof lots };
    setLots(body.data ?? []);
    setError(null);
  }

  return (
    <section>
      <Heading level={2}>Vendor inventory</Heading>
      <Text tone="secondary">Your lots, receipts, and permitted transfers. Orders and settlement are not in this release.</Text>
      <Input
        aria-label="Your organization id"
        value={orgId}
        onChange={(event) => setOrgId(event.target.value)}
        placeholder="Your organization id"
      />
      <Button onClick={() => void load()}>Load my stock</Button>
      {error ? <Text>{error}</Text> : null}
      {lots.length === 0 ? (
        <EmptyState title="No stock yet" description="Post a goods receipt against your warehouse. Another vendor cannot see this list." />
      ) : (
        <Card>
          {lots.map((lot) => (
            <Text key={lot.id}>
              {lot.sku} / {lot.lot_code || 'no-lot'} — available {lot.available}
            </Text>
          ))}
        </Card>
      )}
    </section>
  );
}
