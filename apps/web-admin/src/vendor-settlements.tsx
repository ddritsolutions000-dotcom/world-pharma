'use client';

import { useState } from 'react';
import { Button, Card, EmptyState, Heading, Input, Text } from '@world-pharma/ui-kit/web';
import { apiBaseUrl } from '@world-pharma/shell-core';
import { useSession } from '@world-pharma/shell-web';

type SettlementLine = {
  id: string;
  status: string;
  net_minor: string;
  seller_org_id?: string;
  order_id?: string;
  sandbox?: boolean;
  live_payout?: boolean;
};

export function VendorSettlementsPanel() {
  const { getAccessToken } = useSession();
  const [orgId, setOrgId] = useState('');
  const [rows, setRows] = useState<SettlementLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  async function load() {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setDenied(false);
    setError(null);
    const qs = orgId.trim() ? `?seller_org_id=${encodeURIComponent(orgId.trim())}` : '';
    const res = await fetch(`${apiBaseUrl()}/api/v1/admin/finance/settlement-lines${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 403) {
      setDenied(true);
      setRows([]);
      return;
    }
    if (!res.ok) {
      setError('Could not load settlement lines.');
      return;
    }
    const body = (await res.json()) as { data?: SettlementLine[] };
    setRows(body.data ?? []);
  }

  return (
    <section>
      <Heading level={2}>Vendor settlements</Heading>
      <Text tone="secondary">
        Admin sandbox oversight of settlement lines. Filter by seller organization. Mock payout only — real
        bank transfer remains OFF.
      </Text>
      <Input
        aria-label="Seller organization id"
        value={orgId}
        onChange={(event) => setOrgId(event.target.value)}
        placeholder="Optional seller_org_id"
      />
      <Button onClick={() => void load()}>Load settlement lines</Button>
      {denied ? <EmptyState title="Permission denied" description="Requires finance:read." /> : null}
      {error ? <Text>{error}</Text> : null}
      {!denied && !error && !rows.length ? (
        <EmptyState title="No settlements" description="No sandbox settlement lines for this filter." />
      ) : null}
      {rows.length ? (
        <Card>
          <ul>
            {rows.map((row) => (
              <li key={row.id}>
                {row.status} · net {row.net_minor}
                {row.seller_org_id ? ` · seller ${row.seller_org_id.slice(0, 8)}…` : ''}
                {row.order_id ? ` · order ${row.order_id.slice(0, 8)}…` : ''}
                {row.live_payout === false ? ' · live_payout=OFF' : ''}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </section>
  );
}
