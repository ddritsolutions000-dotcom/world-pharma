'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useCountries, useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  NetworkErrorState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  addWishlistItem,
  addCartItem,
  fetchWishlist,
  removeWishlistItem,
  type WishlistItem,
} from './commerce-api';

export function WishlistPage() {
  const { countries } = useCountries();
  const country = countries[0]?.iso_alpha2 ?? 'XX';
  const { session, getAccessToken, signOut, expire } = useSession();
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
    return <EmptyState title="Sign in required" description="Sign in to view your wishlist." />;
  }

  if (loading) {
    return <LoadingState label="Loading wishlist" />;
  }

  if (error) {
    return <NetworkErrorState action={{ label: 'Retry', onClick: load }} />;
  }

  async function handleRemove(offerId: string) {
    const token = getAccessToken();
    if (!token) {
      return;
    }
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
    if (!token) {
      return;
    }
    setActionMessage(null);
    try {
      await addCartItem(token, country, offerId, 1, `wishlist-cart-${offerId}-${Date.now()}`);
      setActionMessage('Added to cart.');
    } catch (err: unknown) {
      setActionMessage(err instanceof Error ? err.message : 'Could not add to cart.');
    }
  }

  return (
    <section>
      <Heading level={1}>Wishlist</Heading>
      <Text tone="secondary">Saved products for {country}. Add to cart when ready.</Text>
      {actionMessage ? <Text size="caption">{actionMessage}</Text> : null}
      {!items.length ? (
        <EmptyState
          title="Your wishlist is empty"
          description="Browse the store and save items you want to buy later."
          action={{ label: 'Browse store', onClick: () => window.location.assign('/') }}
        />
      ) : (
        <ul className="wp-stack">
          {items.map((item) => (
            <li key={item.id}>
              <Card>
                <Text>{item.product_title}</Text>
                <Text size="caption">
                  {item.available
                    ? `${item.currency} ${item.sell_minor ?? '—'}`
                    : 'Currently unavailable'}
                </Text>
                <div className="wp-inline-actions">
                  {item.available ? (
                    <Button variant="secondary" onClick={() => void handleAddToCart(item.catalog_offer_id)}>
                      Add to cart
                    </Button>
                  ) : null}
                  <Link href={`/p/${item.product_slug}`}>
                    <Button variant="tertiary">View product</Button>
                  </Link>
                  <Button variant="tertiary" onClick={() => void handleRemove(item.catalog_offer_id)}>
                    Remove
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
