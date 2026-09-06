'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, EmptyState, FormField, Heading, Select, Text } from '@world-pharma/ui-kit/web';
import { adminApiRoot, adminAuthHeaders } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import { presentOrgPicks, type OrgPickRow } from './eligibility-admin-present';

export function VendorInventoryPanel() {
  const { getAccessToken, session } = useSession();
  const [orgs, setOrgs] = useState<OrgPickRow[]>([]);
  const [orgId, setOrgId] = useState('');
  const [lots, setLots] = useState<Array<{ id: string; sku?: string; available: number; lot_code: string }>>([]);
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
    const rows = presentOrgPicks(await res.json(), ['VENDOR']);
    setOrgs(rows);
    setOrgId((current) => current || rows[0]?.id || '');
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
    const res = await fetch(`${adminApiRoot()}/api/v1/vendor/inventory/lots?owner_org_id=${orgId}`, {
      headers: adminAuthHeaders(token),
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
    <section className="wp-stack">
      <Heading level={2}>Vendor inventory</Heading>
      <Text tone="secondary">
        Your lots, receipts, and permitted transfers. Orders and settlement are not in this release.
      </Text>
      <div className="wp-toolbar">
        <FormField label="Organization">
          {({ id }) => (
            <Select
              id={id}
              aria-label="Your organization id"
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
          Load my stock
        </Button>
      </div>
      {error ? <Text>{error}</Text> : null}
      {lots.length === 0 ? (
        <EmptyState
          title="No stock yet"
          description="Post a goods receipt against your warehouse. Another vendor cannot see this list."
        />
      ) : (
        <div className="wp-admin-table-wrap">
          <table className="wp-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Lot</th>
                <th>Available</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => (
                <tr key={lot.id}>
                  <td>{lot.sku || '—'}</td>
                  <td>{lot.lot_code || 'no-lot'}</td>
                  <td>{lot.available}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
