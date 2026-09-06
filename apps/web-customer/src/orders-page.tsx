'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  EmptyState,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
} from '@world-pharma/ui-kit/web';
import { fetchOrders } from './commerce-api';
import { formatMoney } from './format-money';
import { orderStatusLabel } from './order-status-labels';
import { AccountHubNav } from './ui/account-hub-nav';
import { MgBtn, MgCard, Page, ServiceHero } from './ui/mg-ui';

export function OrdersScreen() {
  const { session, getAccessToken, signOut, expire } = useSession();
  const [rows, setRows] = useState<
    Array<{
      id: string;
      order_number: string;
      status: string;
      total_minor: string;
      currency: string;
      payment_status?: string;
      delivery_status?: string | null;
      reorder_eligible?: boolean;
    }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | null>(null);

  const load = useCallback(() => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated') return;
    setLoading(true);
    void fetchOrders(token)
      .then((body) => {
        setRows(((body as { data?: typeof rows }).data ?? []) as typeof rows);
        setError(null);
      })
      .catch((err: { status?: number }) => {
        if (err.status === 403) setError('forbidden');
        else if (err.status === 401) expire();
        else setError('network');
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
    return (
      <Page>
        <AccountHubNav />
        <ServiceHero
          kicker="Medicine orders"
          title="My Orders"
          subtitle="Track status and reorder easily."
          compact
        />
        <EmptyState
          title="Sign in required"
          description="Sign in to view medicine orders, tracking, and reorder options."
          action={{ label: 'Sign in', onClick: () => (window.location.href = '/login') }}
        />
      </Page>
    );
  }
  if (session.audience !== 'customer') {
    return (
      <PermissionDeniedState
        description="Orders are available on the customer account only."
        action={{ label: 'Go to home', onClick: () => (window.location.href = '/') }}
      />
    );
  }
  if (loading) {
    return (
      <Page>
        <AccountHubNav />
        <ServiceHero
          kicker="Medicine orders"
          title="My Orders"
          subtitle="Track status and reorder easily."
          compact
        />
        <LoadingState label="Loading orders" />
      </Page>
    );
  }
  if (error === 'forbidden') {
    return (
      <Page>
        <AccountHubNav />
        <PermissionDeniedState
          description="You do not have permission to view these orders."
          action={{ label: 'Go to account', onClick: () => (window.location.href = '/account') }}
        />
      </Page>
    );
  }
  if (error === 'network') {
    return (
      <Page>
        <AccountHubNav />
        <NetworkErrorState action={{ label: 'Retry', onClick: load }} />
      </Page>
    );
  }
  if (!rows.length) {
    return (
      <Page>
        <AccountHubNav />
        <ServiceHero
          kicker="Medicine orders"
          title="My Orders"
          subtitle="Your medicine orders appear here."
          compact
        />
        <EmptyState
          title="No orders yet"
          description="Browse medicines, add to cart, and checkout. After payment, orders and tracking show here — including buy-again when eligible."
          action={{ label: 'Shop medicines', onClick: () => (window.location.href = '/') }}
        />
        <div className="mg-toolbar" style={{ marginTop: '1rem' }}>
          <MgBtn variant="secondary" href="/buy-again">
            Buy again
          </MgBtn>
          <MgBtn variant="ghost" href="/deals">
            View offers
          </MgBtn>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <AccountHubNav />
      <ServiceHero
        kicker="Medicine orders"
        title="My Orders"
        subtitle="Track status and reorder easily."
        compact
      />
      <ul className="mg-order-list">
        {rows.map((row) => (
          <li key={row.id}>
            <MgCard className="mg-order-card">
              <div className="mg-order-card-top">
                <div>
                  <p className="mg-list-title">#{row.order_number}</p>
                  <p className="mg-list-meta">
                    {formatMoney(row.total_minor, row.currency)}
                    {row.payment_status ? ` · Payment ${row.payment_status.replaceAll('_', ' ').toLowerCase()}` : ''}
                  </p>
                </div>
                <span className="mg-status">{orderStatusLabel(row.status)}</span>
              </div>
              {row.delivery_status ? (
                <p className="mg-order-track-hint">Delivery {row.delivery_status.replaceAll('_', ' ').toLowerCase()}</p>
              ) : null}
              <div className="mg-list-actions">
                <MgBtn size="sm" href={`/orders/${row.order_number}`}>
                  Track order
                </MgBtn>
                {row.reorder_eligible ? (
                  <MgBtn size="sm" variant="secondary" href={`/orders/${row.order_number}`}>
                    Reorder
                  </MgBtn>
                ) : (
                  <MgBtn size="sm" href="/buy-again" variant="ghost">
                    Buy again
                  </MgBtn>
                )}
              </div>
            </MgCard>
          </li>
        ))}
      </ul>
    </Page>
  );
}
