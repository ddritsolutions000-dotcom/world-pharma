'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  Card,
  EmptyState,
  Heading,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import { fetchShipments } from './commerce-api';

export function ShipmentsScreen() {
  const { session, getAccessToken, signOut } = useSession();
  const [rows, setRows] = useState<Array<{ id: string; status: string; tracking_number?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated') {
      return;
    }
    setLoading(true);
    void fetchShipments(token)
      .then((body) => {
        setRows((body as { data?: typeof rows }).data ?? []);
        setError(null);
      })
      .catch((err: { status?: number }) => {
        if (err.status === 403) {
          setError('forbidden');
        } else {
          setError('network');
        }
      })
      .finally(() => setLoading(false));
  }, [getAccessToken, session.status]);

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (session.status !== 'authenticated') {
    return <EmptyState title="Sign in required" description="Sign in with OTP to view shipments." />;
  }

  if (session.audience !== 'customer') {
    return <PermissionDeniedState />;
  }

  if (loading) {
    return <LoadingState label="Loading shipments" />;
  }

  if (error === 'forbidden') {
    return <PermissionDeniedState />;
  }

  if (error === 'network') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: () => window.location.reload() }} />;
  }

  return (
    <section>
      <Heading level={1}>Shipments</Heading>
      <Text tone="secondary">Sandbox mock tracking. No live DHL. Internal routing is hidden.</Text>
      {!rows.length ? <EmptyState title="No shipments" description="No sandbox shipments yet." /> : null}
      {rows.map((row) => (
        <Card key={row.id}>
          <Text>{row.status}</Text>
          <Text>Tracking {row.tracking_number ?? 'pending'}</Text>
        </Card>
      ))}
    </section>
  );
}
