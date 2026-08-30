'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCountries, useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  Heading,
  Input,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import { CustomerShell } from './customer-shell';
import { fetchLabCatalog, LabCustomerApiError, type LabCatalogItem } from './lab-api';

export function LabBrowseScreen() {
  const { session, getAccessToken, signOut, expire } = useSession();
  const { countries } = useCountries();
  const country = countries[0]?.iso_alpha2 ?? 'XX';
  const [rows, setRows] = useState<LabCatalogItem[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | 'generic' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body = await fetchLabCatalog(token, country, q.trim() || undefined);
      setEnabled(body.country_enabled);
      setRows(body.data);
      setMessage(body.note ?? null);
    } catch (err) {
      if (err instanceof LabCustomerApiError) {
        if (err.status === 401) {
          expire();
          return;
        }
        if (err.status === 403) {
          setError('forbidden');
          return;
        }
        if (err.status === 0) {
          setError('network');
          return;
        }
      }
      setError('generic');
    } finally {
      setLoading(false);
    }
  }, [country, expire, getAccessToken, q]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [load, session.status]);

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  return (
    <CustomerShell apiReachable={true} countryLabel={country}>
      <Heading level={2}>Lab tests</Heading>
      <Text tone="secondary">
        Browse eligible laboratory tests for your country. Catalog copy is commercial only — not a diagnosis or
        recommendation.
      </Text>
      <div className="wp-stack" style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tests" aria-label="Search lab tests" />
        <Button onClick={() => void load()}>Search</Button>
        <Button variant="secondary" onClick={() => (window.location.href = '/lab/bookings')}>
          My bookings
        </Button>
      </div>
      {loading ? <LoadingState label="Preparing lab catalog…" /> : null}
      {error === 'network' ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} /> : null}
      {error === 'forbidden' ? <PermissionDeniedState /> : null}
      {error === 'generic' ? <EmptyState title="Could not load lab catalog" description="Try again shortly." /> : null}
      {!loading && !error && !enabled ? (
        <EmptyState
          title="Lab booking unavailable"
          description={message ?? 'Lab services are disabled for this country pack (fail-closed).'}
        />
      ) : null}
      {!loading && !error && enabled && rows.length === 0 ? (
        <EmptyState title="No lab tests listed" description="No published LAB_TEST offers are bookable yet." />
      ) : null}
      {rows.map((row) => (
        <Card key={row.id}>
          <Heading level={3}>{row.title}</Heading>
          <Text tone="secondary">{row.description || 'Commercial test listing.'}</Text>
          <Text size="caption">{row.offers[0]?.seller_display_name ?? 'Laboratory'}</Text>
          <Text>
            {row.offers[0]?.price
              ? `${row.offers[0].currency} ${row.offers[0].price.sell_minor}`
              : 'Price unavailable'}
          </Text>
          <Button
            size="sm"
            onClick={() => (window.location.href = `/lab/${encodeURIComponent(row.slug)}?country=${country}`)}
          >
            View details
          </Button>
        </Card>
      ))}
    </CustomerShell>
  );
}
