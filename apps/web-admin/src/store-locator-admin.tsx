'use client';

import Link from 'next/link';
import { AdminRequestError } from './admin-request-error';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { Button, Card, EmptyState, Heading, LoadingState, Text } from '@world-pharma/ui-kit/web';
import { adminApiRoot, adminAuthHeaders } from './admin-http';
import { customerSiteUrl } from './site-url';
import { workingCountry } from './working-country';

type StoreRow = {
  id: string;
  name: string;
  city: string;
  pincode: string;
  store_type: string;
  address: string;
};

export function StoreLocatorAdminPanel() {
  const { getAccessToken, session } = useSession();
  const country = workingCountry(session.countryCode);
  const [rows, setRows] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        `${adminApiRoot()}/api/v1/admin/store-locator/locations?country_code=${encodeURIComponent(country)}`,
        { headers: adminAuthHeaders(token) },
      );
      if (!res.ok) {
        setError(true);
        setRows([]);
        return;
      }
      const body = (await res.json()) as { stores?: StoreRow[] };
      setRows(body.stores ?? []);
    } catch {
      setError(true);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [country, getAccessToken]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [load, session.status]);

  if (loading && rows.length === 0) {
    return <LoadingState label="Loading store locations" />;
  }

  return (
    <div className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Store locator</Heading>
        <p className="wp-page-intro">
          Physical stores shown on customer store finder. Locations come from inventory STORE / COLLECTION_POINT
          records. Add or edit locations in{' '}
          <Link href="/inventory">Inventory</Link> — mock stores appear when none are seeded.
        </p>
      </header>
      <div className="wp-toolbar">
        <Link href="/inventory">
          <Button>Manage inventory locations</Button>
        </Link>
        <a href={`${customerSiteUrl()}/stores`} target="_blank" rel="noreferrer">
          <Button variant="secondary">Open customer store finder</Button>
        </a>
      </div>
      {error ? <AdminRequestError error={error} onRetry={() => void load()} /> : null}
      {rows.length === 0 ? (
        <EmptyState
          title="No store locations"
          description="Create a STORE or COLLECTION_POINT location under Inventory for this country, or rely on sandbox mock data on the customer site."
        />
      ) : (
        <Card>
          <table className="wp-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>City</th>
                <th>Pincode</th>
                <th>Address</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.store_type}</td>
                  <td>{row.city}</td>
                  <td>{row.pincode}</td>
                  <td>{row.address}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Text tone="secondary">Country: {country} · {rows.length} location(s)</Text>
    </div>
  );
}
