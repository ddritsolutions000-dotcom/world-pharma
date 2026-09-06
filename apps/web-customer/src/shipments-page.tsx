'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  EmptyState,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
} from '@world-pharma/ui-kit/web';
import { fetchShipments } from './commerce-api';
import { shipmentLifecycleSummary, shipmentStatusLabel } from './shipment-status-labels';
import { MgBtn, MgCard, Page, PageIntro } from './ui/mg-ui';

type ShipmentRow = { id: string; status: string; tracking_number?: string };

export function ShipmentsScreen() {
  const { session, getAccessToken, signOut } = useSession();
  const [rows, setRows] = useState<ShipmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated') return;
    setLoading(true);
    void fetchShipments(token)
      .then((body) => {
        setRows((body as { data?: ShipmentRow[] }).data ?? []);
        setError(null);
      })
      .catch((err: { status?: number }) => {
        if (err.status === 403) setError('forbidden');
        else setError('network');
      })
      .finally(() => setLoading(false));
  }, [getAccessToken, session.status]);

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }
  if (session.status !== 'authenticated') {
    return (
      <Page>
        <EmptyState title="Sign in required" description="Login to track your deliveries." action={{ label: 'Sign in', onClick: () => (window.location.href = '/login') }} />
      </Page>
    );
  }
  if (session.audience !== 'customer') return <PermissionDeniedState />;

  return (
    <Page>
      <section className="mg-service-hero mg-service-hero--compact" aria-label="Track delivery">
        <p className="mg-service-kicker">Live fulfilment</p>
        <h1 className="mg-service-title">Track Delivery</h1>
        <p className="mg-service-sub">Live status for your medicine orders.</p>
      </section>
      <PageIntro>
        <p>Shipments are created after your pharmacy partner dispatches the order. Tap Track for timeline details and courier updates.</p>
      </PageIntro>
      {loading ? <LoadingState label="Loading shipments" /> : null}
      {error === 'forbidden' ? <PermissionDeniedState /> : null}
      {error === 'network' ? <NetworkErrorState action={{ label: 'Retry', onClick: () => window.location.reload() }} /> : null}
      {!loading && !error && rows.length === 0 ? (
        <EmptyState
          title="No shipments yet"
          description="Shipments appear after your order is fulfilled. Open Orders to check fulfillment status."
          action={{ label: 'View orders', onClick: () => (window.location.href = '/orders') }}
        />
      ) : null}
      <ul className="mg-order-list">
        {rows.map((row) => {
          const lifecycle = shipmentLifecycleSummary(row.status);
          return (
            <li key={row.id}>
              <MgCard className="mg-order-card">
                <div className="mg-order-card-top">
                  <div>
                    <p className="mg-list-title">{lifecycle.headline}</p>
                    {lifecycle.detail ? <p className="mg-list-meta">{lifecycle.detail}</p> : null}
                    <p className="mg-order-track-hint">
                      {shipmentStatusLabel(row.status)} · Tracking {row.tracking_number ?? 'pending'}
                    </p>
                  </div>
                  <span className="mg-status">{shipmentStatusLabel(row.status)}</span>
                </div>
                <div className="mg-list-actions">
                  <MgBtn size="sm" href={`/shipments/${row.id}`}>
                    Track
                  </MgBtn>
                </div>
              </MgCard>
            </li>
          );
        })}
      </ul>
    </Page>
  );
}
