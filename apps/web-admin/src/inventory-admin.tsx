'use client';

import { useEffect, useState } from 'react';
import { Button, Card, EmptyState, Heading, Input, Text } from '@world-pharma/ui-kit/web';
import { apiBaseUrl } from '@world-pharma/shell-core';
import { useSession } from '@world-pharma/shell-web';

export function InventoryAdminPanel() {
  const { session, getAccessToken } = useSession();
  const [orgId, setOrgId] = useState('');
  const [lots, setLots] = useState<Array<{ id: string; sku?: string; available: number; status: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmAdjust, setConfirmAdjust] = useState(false);

  async function load() {
    const token = getAccessToken();
    if (!token || !orgId) {
      return;
    }
    setLoading(true);
    setError(null);
    setDenied(false);
    const res = await fetch(`${apiBaseUrl()}/api/v1/admin/inventory/lots?owner_org_id=${orgId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setLoading(false);
    if (res.status === 403) {
      setDenied(true);
      return;
    }
    if (!res.ok) {
      setError('Inventory could not be loaded.');
      return;
    }
    const body = (await res.json()) as { data?: Array<{ id: string; sku?: string; available: number; status: string }> };
    setLots(body.data ?? []);
  }

  useEffect(() => {
    void load();
  }, [getAccessToken]);

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  return (
    <section>
      <Heading level={2}>Inventory</Heading>
      <Text tone="secondary">
        Warehouses, lots, goods receipts, and transfers. No checkout, payment, or carrier dispatch.
      </Text>
      <div className="wp-stack">
        <Input
          aria-label="Owner organization id"
          value={orgId}
          onChange={(event) => setOrgId(event.target.value)}
          placeholder="Owner organization id"
        />
        <Button onClick={() => void load()}>Load inventory</Button>
      </div>
      {loading ? <Text>Loading inventory…</Text> : null}
      {denied ? <EmptyState title="Permission denied" description="This operator cannot read inventory." /> : null}
      {error ? <Text>{error}</Text> : null}
      {!loading && !denied && lots.length === 0 ? (
        <EmptyState title="No lots" description="Post a goods receipt to create stock. Quantities stay in PostgreSQL." />
      ) : (
        <Card>
          <Text>{lots.length} lots</Text>
          <ul>
            {lots.map((lot) => (
              <li key={lot.id}>
                {lot.sku ?? lot.id} — available {lot.available} ({lot.status})
              </li>
            ))}
          </ul>
          <Button variant="secondary" onClick={() => setConfirmAdjust(true)}>
            Adjust stock
          </Button>
          {confirmAdjust ? (
            <EmptyState
              title="Confirm adjustment"
              description="Adjustments write an immutable movement. This does not create an order."
            />
          ) : null}
        </Card>
      )}
    </section>
  );
}
