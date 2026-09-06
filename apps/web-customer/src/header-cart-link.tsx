'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { fetchCart, type CustomerCart } from './commerce-api';
import { guestCartQty } from './guest-cart';
import { useSelectedCountry } from './use-selected-country';

function CartSvg() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6h15l-1.5 9h-12L6 6zM6 6L5 3H2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="20" r="1.2" fill="currentColor" />
      <circle cx="18" cy="20" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function HeaderCartLink() {
  const { session, getAccessToken, expire } = useSession();
  const { country, ready } = useSelectedCountry();
  const [qty, setQty] = useState(0);

  useEffect(() => {
    function refresh() {
      if (!ready) {
        setQty(0);
        return;
      }
      if (session.status !== 'authenticated') {
        setQty(guestCartQty(country));
        return;
      }
      const token = getAccessToken();
      if (!token) return;
      void fetchCart(token, country)
        .then((body) => {
          const cart = body as CustomerCart;
          const total = (cart.items ?? []).reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
          setQty(total);
        })
        .catch((err: { status?: number }) => {
          if (err.status === 401) expire();
        });
    }
    refresh();
    window.addEventListener('wp-cart-changed', refresh);
    return () => window.removeEventListener('wp-cart-changed', refresh);
  }, [country, expire, getAccessToken, ready, session.status]);

  return (
    <Link href="/cart" className="mg-cart-btn" aria-label={qty > 0 ? `Cart, ${qty} items` : 'Cart'}>
      <CartSvg />
      <span className="mg-cart-label">Cart</span>
      {qty > 0 ? <span className="mg-cart-count">{qty > 99 ? '99+' : qty}</span> : null}
    </Link>
  );
}
