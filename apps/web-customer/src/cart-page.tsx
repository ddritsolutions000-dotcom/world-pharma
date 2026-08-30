'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useCountries, useSession } from '@world-pharma/shell-web';
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
import { fetchCart, type CustomerCart } from './commerce-api';
import { RxHandoffBanner } from './rx-handoff-ui';

export function CartScreen() {
  const { session, getAccessToken, signOut, expire } = useSession();
  const { countries } = useCountries();
  const country = countries[0]?.iso_alpha2 ?? 'XX';
  const [cart, setCart] = useState<CustomerCart | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | null>(null);

  const load = useCallback(() => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated') {
      return;
    }
    setLoading(true);
    void fetchCart(token, country)
      .then((body) => {
        setCart(body as CustomerCart);
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
  }, [country, expire, getAccessToken, session.status]);

  useEffect(() => {
    load();
  }, [load]);

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (session.status !== 'authenticated') {
    return <EmptyState title="Sign in required" description="Sign in to view your cart." />;
  }

  if (session.audience !== 'customer') {
    return <PermissionDeniedState />;
  }

  if (loading) {
    return <LoadingState label="Loading cart" />;
  }

  if (error === 'forbidden') {
    return <PermissionDeniedState />;
  }

  if (error === 'network') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: load }} />;
  }

  if (!cart?.items?.length) {
    return <EmptyState title="Cart is empty" description="Add a published product from the store." />;
  }

  return (
    <section>
      <Heading level={1}>Cart</Heading>
      <Text tone="secondary">Prices are server quotes. Payment is not available in this phase.</Text>
      <RxHandoffBanner
        skipInventoryHold={cart.skip_inventory_hold}
        dispensingCaseId={cart.dispensing_case_id}
      />
      <Card>
        {cart.items.map((item) => (
          <Text key={item.id}>
            {item.title} × {item.qty} — {item.currency} {item.sell_minor ?? '—'}
          </Text>
        ))}
      </Card>
      <Link href="/checkout">
        <Button>Continue to checkout</Button>
      </Link>
    </section>
  );
}
