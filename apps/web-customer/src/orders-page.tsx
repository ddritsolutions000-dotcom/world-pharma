'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import { fetchOrders } from './commerce-api';

export function OrdersScreen() {
  const { session, getAccessToken, signOut, expire } = useSession();
  const [rows, setRows] = useState<Array<{ id: string; order_number: string; status: string; total_minor: string; currency: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | null>(null);

  const load = useCallback(() => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated') {
      return;
    }
    setLoading(true);
    void fetchOrders(token)
      .then((body) => {
        setRows(((body as { data?: typeof rows }).data ?? []) as typeof rows);
        setError(null);
      })
      .catch((err: { status?: number }) => {
        if (err.status === 403) {
          setError('forbidden');
        } else if (err.status === 401) {
          expire();
        } else {
          setError('network');
        }
      })
      .finally(() => setLoading(false));
  }, [expire, getAccessToken, session.status]);

  useEffect(() => {
    load();
  }, [load]);

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (session.status !== 'authenticated') {
    return <EmptyState title="Sign in required" description="Sign in to view orders." />;
  }

  if (session.audience !== 'customer') {
    return <PermissionDeniedState />;
  }

  if (loading) {
    return <LoadingState label="Loading orders" />;
  }

  if (error === 'forbidden') {
    return <PermissionDeniedState />;
  }

  if (error === 'network') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: load }} />;
  }

  if (!rows.length) {
    return <EmptyState title="No orders" description="Sandbox checkout has not created an order yet." />;
  }

  return (
    <section>
      <Heading level={1}>Orders</Heading>
      <Text tone="secondary">Sandbox orders only. Tracking is a placeholder. No carrier is contacted.</Text>
      {rows.map((row) => (
        <Card key={row.id}>
          <Text>
            {row.order_number} — {row.status} — {row.currency} {row.total_minor}
          </Text>
          <Button variant="tertiary" onClick={() => (window.location.href = `/orders/${row.order_number}`)}>
            Details
          </Button>
        </Card>
      ))}
    </section>
  );
}
