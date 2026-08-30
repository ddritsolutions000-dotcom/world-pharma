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
import {
  fetchImagingCatalog,
  ImagingCustomerApiError,
  type ImagingCatalogItem,
} from './imaging-api';

export function ImagingBrowseScreen() {
  const { session, getAccessToken, signOut, expire } = useSession();
  const { countries } = useCountries();
  const country = countries[0]?.iso_alpha2 ?? 'XX';
  const [rows, setRows] = useState<ImagingCatalogItem[]>([]);
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
      const body = await fetchImagingCatalog(token, country, q.trim() || undefined);
      setEnabled(body.country_enabled);
      setRows(body.data);
      setMessage(body.note ?? body.sandbox_note ?? null);
    } catch (err) {
      if (err instanceof ImagingCustomerApiError) {
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
      <Heading level={2}>Radiology studies</Heading>
      <Text tone="secondary">
        Browse eligible imaging studies for your country. Catalog copy is commercial only — not a diagnosis or
        recommendation.
      </Text>
      <Button variant="tertiary" size="sm" onClick={() => (window.location.href = '/radiology/bookings')}>
        My imaging bookings
      </Button>
      <div className="wp-stack" style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search studies"
          aria-label="Search imaging studies"
        />
        <Button onClick={() => void load()}>Search</Button>
      </div>
      {loading ? <LoadingState label="Loading imaging catalog…" /> : null}
      {error === 'network' ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} /> : null}
      {error === 'forbidden' ? <PermissionDeniedState /> : null}
      {error === 'generic' ? <EmptyState title="Unable to load catalog" description="Try again shortly." /> : null}
      {!loading && !error && !enabled ? (
        <EmptyState title="Imaging unavailable" description={message ?? 'Country pack disables imaging services.'} />
      ) : null}
      {!loading && !error && enabled && rows.length === 0 ? (
        <EmptyState title="No imaging studies" description="No published IMAGING_STUDY offers yet." />
      ) : null}
      {message && enabled ? <Text size="caption">{message}</Text> : null}
      {rows.map((row) => (
        <Card key={row.id}>
          <Text>{row.title}</Text>
          <Text tone="secondary">{row.description || 'Commercial listing.'}</Text>
          <Text size="caption">
            {row.offers[0]?.seller_display_name ?? 'Imaging center'} ·{' '}
            {row.offers[0]?.price
              ? `${row.offers[0].currency} ${row.offers[0].price.sell_minor}`
              : 'Price unavailable'}
          </Text>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => (window.location.href = `/radiology/${encodeURIComponent(row.slug)}?country=${country}`)}
          >
            View & book
          </Button>
        </Card>
      ))}
    </CustomerShell>
  );
}
