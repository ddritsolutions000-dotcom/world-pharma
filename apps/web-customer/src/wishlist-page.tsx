'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  EmptyState,
  LoadingState,
  NetworkErrorState,
  SessionExpiredState,
} from '@world-pharma/ui-kit/web';
import {
  addCartItem,
  fetchWishlist,
  removeWishlistItem,
  type WishlistItem,
} from './commerce-api';
import { formatMoney } from './format-money';
import { useSelectedCountry } from './use-selected-country';
import { AccountPage } from './ui/account-hub-nav';
import { MgBtn, MgCard, PageIntro } from './ui/mg-ui';

export function WishlistPage() {
  const { country } = useSelectedCountry();
  const { session, getAccessToken, signOut } = useSession();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated') {
      return;
    }
    setLoading(true);
    setError(false);
    void fetchWishlist(token, country)
      .then((body) => {
        setItems(body.data ?? []);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [country, getAccessToken, session.status]);

  useEffect(() => {
    load();
  }, [load]);

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (session.status !== 'authenticated') {
    return (
      <AccountPage title="Wishlist" subtitle="Products you saved for later.">
        <PageIntro>
          <p>Save medicines while browsing and add them to cart when you are ready to checkout.</p>
        </PageIntro>
        <EmptyState
          title="Sign in required"
          description="Sign in to view your wishlist."
          action={{ label: 'Sign in', onClick: () => (window.location.href = '/login') }}
        />
      </AccountPage>
    );
  }

  if (loading) {
    return (
      <AccountPage title="Wishlist" subtitle="Products you saved for later.">
        <LoadingState label="Loading wishlist" />
      </AccountPage>
    );
  }

  if (error) {
    return (
      <AccountPage title="Wishlist" subtitle="Products you saved for later.">
        <NetworkErrorState action={{ label: 'Retry', onClick: load }} />
      </AccountPage>
    );
  }

  async function handleRemove(offerId: string) {
    const token = getAccessToken();
    if (!token) return;
    setActionMessage(null);
    try {
      await removeWishlistItem(token, country, offerId);
      load();
    } catch {
      setActionMessage('Could not remove item.');
    }
  }

  async function handleAddToCart(offerId: string) {
    const token = getAccessToken();
    if (!token) return;
    setActionMessage(null);
    try {
      await addCartItem(token, country, offerId, 1, `wishlist-cart-${offerId}-${Date.now()}`);
      setActionMessage('Added to cart — view cart to checkout.');
    } catch (err: unknown) {
      setActionMessage(err instanceof Error ? err.message : 'Could not add to cart.');
    }
  }

  return (
    <AccountPage title="Wishlist" subtitle={`${items.length} saved product${items.length === 1 ? '' : 's'}.`}>
      {actionMessage ? (
        <p className="mg-page-subtitle">
          {actionMessage}
          {actionMessage.includes('Added to cart') ? (
            <>
              {' '}
              <Link href="/cart">Go to cart</Link>
            </>
          ) : null}
        </p>
      ) : null}
      {!items.length ? (
        <>
          <EmptyState
            title="Your wishlist is empty"
            description="Browse medicines and tap Save for later on any product page. Saved items appear here for quick add-to-cart."
            action={{ label: 'Browse medicines', onClick: () => window.location.assign('/search') }}
          />
          <div className="mg-toolbar" style={{ marginTop: '1rem' }}>
            <MgBtn variant="secondary" href="/deals">
              View offers
            </MgBtn>
          </div>
        </>
      ) : (
        <ul className="mg-order-list">
          {items.map((item) => (
            <li key={item.id}>
              <MgCard className="mg-order-card">
                <div className="mg-order-card-top">
                  <div>
                    <p className="mg-list-title">{item.product_title}</p>
                    <p className="mg-list-meta">
                      {item.available ? formatMoney(item.sell_minor ?? '0', item.currency) : 'Currently unavailable'}
                    </p>
                  </div>
                </div>
                <div className="mg-list-actions">
                  {item.available ? (
                    <MgBtn size="sm" onClick={() => void handleAddToCart(item.catalog_offer_id)}>
                      Add to cart
                    </MgBtn>
                  ) : null}
                  <MgBtn size="sm" variant="secondary" href={`/p/${item.product_slug}`}>
                    View product
                  </MgBtn>
                  <MgBtn size="sm" variant="ghost" onClick={() => void handleRemove(item.catalog_offer_id)}>
                    Remove
                  </MgBtn>
                </div>
              </MgCard>
            </li>
          ))}
        </ul>
      )}
    </AccountPage>
  );
}
