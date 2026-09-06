'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  EmptyState,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
} from '@world-pharma/ui-kit/web';
import { addCartItem } from './commerce-api';
import { fetchBuyAgain, type BuyAgainItem } from './buy-again-api';
import { formatMoney } from './format-money';
import { useSelectedCountry } from './use-selected-country';
import { AccountPage } from './ui/account-hub-nav';
import { MgBtn, MgCard } from './ui/mg-ui';

export function BuyAgainScreen() {
  const { session, getAccessToken, expire } = useSession();
  const { country } = useSelectedCountry();
  const [rows, setRows] = useState<BuyAgainItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated') {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body = await fetchBuyAgain(token);
      setRows(body.data ?? []);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 403) setError('forbidden');
      else if (status === 401) expire();
      else setError('network');
    } finally {
      setLoading(false);
    }
  }, [expire, getAccessToken, session.status]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [load, session.status]);

  async function addAgain(item: BuyAgainItem) {
    const token = getAccessToken();
    if (!token || !item.available) {
      return;
    }
    setBusyId(item.offer_id);
    setMessage(null);
    try {
      await addCartItem(token, country, item.offer_id, item.last_qty || 1, crypto.randomUUID());
      setMessage(`${item.product_title ?? item.title} added to cart.`);
    } catch (err: unknown) {
      setMessage((err as Error).message ?? 'Could not add to cart.');
    } finally {
      setBusyId(null);
    }
  }

  if (session.status !== 'authenticated') {
    return (
      <AccountPage title="Buy again" subtitle="Sign in to reorder medicines from past orders.">
        <EmptyState
          title="Sign in required"
          description="Your previous medicine orders appear here after login."
          action={{ label: 'Sign in', onClick: () => (window.location.href = '/login') }}
        />
      </AccountPage>
    );
  }
  if (session.audience !== 'customer') {
    return <PermissionDeniedState />;
  }
  if (error === 'forbidden') {
    return <PermissionDeniedState />;
  }
  if (error === 'network') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />;
  }

  return (
    <AccountPage title="Buy again" subtitle="Reorder medicines from past World-Pharma orders in one tap.">
      {loading ? <LoadingState label="Loading previous medicines…" /> : null}
      {!loading && !rows.length ? (
        <EmptyState
          title="No previous medicines"
          description="Place an order, then come back here to reorder quickly."
          action={{ label: 'Shop medicines', onClick: () => (window.location.href = '/') }}
        />
      ) : null}
      {message ? <p className="mg-text-muted">{message}</p> : null}
      <ul className="mg-order-list">
        {rows.map((item) => (
          <li key={item.offer_id}>
            <MgCard className="mg-order-card">
              <div className="mg-order-card-top">
                <div>
                  <p className="mg-list-title">{item.product_title ?? item.title}</p>
                  <p className="mg-list-meta">
                    {item.sku} · ordered {item.times_ordered} time{item.times_ordered === 1 ? '' : 's'}
                    {item.sell_minor && item.currency ? ` · ${formatMoney(item.sell_minor, item.currency)}` : ''}
                  </p>
                </div>
              </div>
              <div className="mg-list-actions">
                {item.product_slug ? (
                  <MgBtn size="sm" variant="ghost" href={`/p/${item.product_slug}`}>
                    View
                  </MgBtn>
                ) : null}
                <MgBtn
                  size="sm"
                  disabled={!item.available || busyId === item.offer_id}
                  onClick={() => void addAgain(item)}
                >
                  {item.available ? 'Add to cart' : 'Unavailable'}
                </MgBtn>
              </div>
            </MgCard>
          </li>
        ))}
      </ul>
    </AccountPage>
  );
}
