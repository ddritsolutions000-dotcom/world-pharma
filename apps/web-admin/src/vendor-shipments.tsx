'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, EmptyState, FormField, Heading, Select, Text } from '@world-pharma/ui-kit/web';
import { adminApiRoot, adminAuthHeaders } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import { presentOrgPicks, type OrgPickRow } from './eligibility-admin-present';

export function VendorShipmentsPanel() {
  const { getAccessToken, session } = useSession();
  const [orgs, setOrgs] = useState<OrgPickRow[]>([]);
  const [orgId, setOrgId] = useState('');
  const [rows, setRows] = useState<Array<{ id: string; status: string; tracking_number?: string }>>([]);
  const [error, setError] = useState<string | null>(null);

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
    const next = presentOrgPicks(await res.json(), ['VENDOR']);
    setOrgs(next);
    setOrgId((current) => current || next[0]?.id || '');
  }, [getAccessToken]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void loadOrgs();
    }
  }, [loadOrgs, session.status]);

  async function load() {
    const token = getAccessToken();
    if (!token || !orgId) {
      return;
    }
    const res = await fetch(`${adminApiRoot()}/api/v1/vendor/shipments?seller_org_id=${orgId}`, {
      headers: adminAuthHeaders(token),
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
    <section className="wp-stack">
      <Heading level={2}>Vendor shipments</Heading>
      <Text tone="secondary">Your seller shipments only. Mock tracking. No other vendors. No live DHL.</Text>
      <div className="wp-toolbar">
        <FormField label="Seller organization">
          {({ id }) => (
            <Select
              id={id}
              aria-label="Seller organization id"
              value={orgId}
              onChange={(event) => setOrgId(event.target.value)}
            >
              {orgs.length === 0 ? <option value="">No vendor orgs loaded</option> : null}
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <Button onClick={() => void load()} disabled={!orgId}>
          Load shipments
        </Button>
      </div>
      {error ? <Text>{error}</Text> : null}
      {!rows.length ? <EmptyState title="No shipments" description="No sandbox shipments for this seller." /> : null}
      {rows.length ? (
        <Card>
          <ul>
            {rows.map((row) => (
              <li key={row.id}>
                {row.status} {row.tracking_number ?? 'pending'}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </section>
  );
}
