'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, EmptyState, FormField, Heading, Select, Text } from '@world-pharma/ui-kit/web';
import { adminApiRoot, adminAuthHeaders } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import { presentOrgPicks, type OrgPickRow } from './eligibility-admin-present';

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
  const { getAccessToken, session } = useSession();
  const [orgs, setOrgs] = useState<OrgPickRow[]>([]);
  const [orgId, setOrgId] = useState('');
  const [rows, setRows] = useState<SettlementLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const loadOrgs = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const res = await fetch(`${adminApiRoot()}/api/v1/admin/governance/organizations`, {
      headers: adminAuthHeaders(token),
    });
    if (!res.ok) {
      return;
    }
    setOrgs(presentOrgPicks(await res.json(), ['VENDOR']));
  }, [getAccessToken]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void loadOrgs();
    }
  }, [loadOrgs, session.status]);

  async function load() {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setDenied(false);
    setError(null);
    const qs = orgId.trim() ? `?seller_org_id=${encodeURIComponent(orgId.trim())}` : '';
    const res = await fetch(`${adminApiRoot()}/api/v1/admin/finance/settlement-lines${qs}`, {
      headers: adminAuthHeaders(token),
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
    <section className="wp-stack">
      <Heading level={2}>Vendor settlements</Heading>
      <Text tone="secondary">
        Admin sandbox oversight of settlement lines. Filter by seller organization. Mock payout only — real
        bank transfer remains OFF.
      </Text>
      <div className="wp-toolbar">
        <FormField label="Seller organization">
          {({ id }) => (
            <Select
              id={id}
              aria-label="Seller organization id"
              value={orgId}
              onChange={(event) => setOrgId(event.target.value)}
            >
              <option value="">All sellers</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <Button onClick={() => void load()}>Load settlement lines</Button>
      </div>
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
