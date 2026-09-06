'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { EmptyState, LoadingState, NetworkErrorState, PermissionDeniedState, SessionExpiredState } from '@world-pharma/ui-kit/web';
import { fetchCart, notifyCartChanged, removeCartItem, updateCartItem, type CartItem, type CustomerCart } from './commerce-api';
import { formatMoney } from './format-money';
import { guestLinesAsCartItems, readGuestCart, removeGuestCartLine, updateGuestCartQty } from './guest-cart';
import { RxHandoffBanner } from './rx-handoff-ui';
import { MgBtn, MgCard, Page } from './ui/mg-ui';
import { useSelectedCountry } from './use-selected-country';

function fromGuest(country: string): CustomerCart {
  return { items: guestLinesAsCartItems(readGuestCart(country)) };
}

export function CartScreen() {
  const { session, getAccessToken, signOut, expire } = useSession();
  const { country } = useSelectedCountry();
  const [cart, setCart] = useState<CustomerCart | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const guest = session.status !== 'authenticated';

  const load = useCallback(() => {
    if (session.status !== 'authenticated') {
      setCart(fromGuest(country));
      setError(null);
      setLoading(false);
      return;
    }
    const token = getAccessToken();
    if (!token) return;
    setLoading(true);
    void fetchCart(token, country)
      .then((body) => {
        setCart(body as CustomerCart);
        setError(null);
      })
      .catch((err: { status?: number }) => {
        if (err.status === 403) setError('forbidden');
        else if (err.status === 401) expire();
        else setError('network');
      })
      .finally(() => setLoading(false));
  }, [country, expire, getAccessToken, session.status]);

  useEffect(() => {
    load();
  }, [load]);

  const subtotal = useMemo(() => {
    if (!cart?.items?.length) return 0;
    return cart.items.reduce((sum, item) => sum + Number(item.sell_minor ?? 0) * item.qty, 0);
  }, [cart?.items]);

  async function changeQty(item: CartItem, nextQty: number) {
    if (nextQty < 1) return;
    setUpdatingId(item.id);
    try {
      if (guest) {
        const offerId = item.offer_id ?? item.id.replace(/^guest:/, '');
        setCart({ items: guestLinesAsCartItems(updateGuestCartQty(country, offerId, nextQty)) });
        notifyCartChanged();
      } else {
        const token = getAccessToken();
        if (!token) return;
        const body = (await updateCartItem(token, item.id, nextQty, `cart-qty-${item.id}-${nextQty}`)) as CustomerCart;
        setCart(body);
      }
    } catch {
      load();
    } finally {
      setUpdatingId(null);
    }
  }

  async function removeItem(item: CartItem) {
    setUpdatingId(item.id);
    try {
      if (guest) {
        const offerId = item.offer_id ?? item.id.replace(/^guest:/, '');
        setCart({ items: guestLinesAsCartItems(removeGuestCartLine(country, offerId)) });
        notifyCartChanged();
      } else {
        const token = getAccessToken();
        if (!token) return;
        const body = (await removeCartItem(token, item.id, `cart-rm-${item.id}`)) as CustomerCart;
        setCart(body);
      }
    } catch {
      load();
    } finally {
      setUpdatingId(null);
    }
  }

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }
  if (session.audience && session.audience !== 'customer') return <PermissionDeniedState />;
  if (loading) return <LoadingState label="Loading your cart" />;
  if (error === 'forbidden') return <PermissionDeniedState />;
  if (error === 'network') {
    return (
      <NetworkErrorState
        description="Check your network and retry. Nothing was charged."
        action={{ label: 'Retry', onClick: load }}
      />
    );
  }
  if (!cart?.items?.length) {
    return (
      <Page>
        <section className="mg-service-hero mg-service-hero--compact" aria-label="Cart">
          <p className="mg-service-kicker">Checkout when ready</p>
          <h1 className="mg-service-title">My Cart</h1>
          <p className="mg-service-sub">Your cart is empty</p>
        </section>
        <EmptyState
          title="Your cart is empty"
          description="Add medicines from the store to get started."
        />
        <MgBtn href="/">Continue shopping</MgBtn>
      </Page>
    );
  }

  const currency = cart.items[0]?.currency ?? 'XXX';
  const itemCount = cart.items.reduce((sum, item) => sum + item.qty, 0);

  return (
    <Page>
      <section className="mg-service-hero mg-service-hero--compact" aria-label="Cart">
        <p className="mg-service-kicker">One pharmacy per checkout</p>
        <h1 className="mg-service-title">My Cart</h1>
        <p className="mg-service-sub">
          {itemCount} item{itemCount === 1 ? '' : 's'} · review quantities, then pay securely
        </p>
      </section>
      <RxHandoffBanner skipInventoryHold={cart.skip_inventory_hold} dispensingCaseId={cart.dispensing_case_id} />
      {cart.seller_display_name ? (
        <MgCard flat>
          <p className="mg-text-muted">
            Fulfilled by <strong>{cart.seller_display_name}</strong>
          </p>
          <p className="mg-text-muted">
            Orders checkout with one pharmacy at a time. To buy from another seller, complete or clear this cart first.
          </p>
        </MgCard>
      ) : null}

      <div className="mg-split">
        <ul className="mg-order-list">
          {cart.items.map((item) => {
            const busy = updatingId === item.id;
            return (
              <li key={item.id}>
              <MgCard className="mg-order-card">
                <div className="mg-cart-line">
                  <img
                    src={item.image_url || 'https://placehold.co/80x80/F7FAFC/1A365D/png?text=Rx'}
                    alt=""
                    className="mg-cart-thumb"
                  />
                  <div className="mg-cart-line-main">
                    <p className="mg-cart-line-name">{item.title}</p>
                    {item.rx_required ? <span className="mg-rx-badge">Rx required</span> : null}
                    {item.seller_display_name ? (
                      <p className="mg-text-muted">Sold by {item.seller_display_name}</p>
                    ) : null}
                    <div className="mg-cart-qty" aria-label={`Quantity for ${item.title}`}>
                      <button
                        type="button"
                        className="mg-cart-qty-btn"
                        disabled={busy || item.qty <= 1}
                        aria-label="Decrease quantity"
                        onClick={() => void changeQty(item, item.qty - 1)}
                      >
                        −
                      </button>
                      <span className="mg-cart-qty-value">{item.qty}</span>
                      <button
                        type="button"
                        className="mg-cart-qty-btn"
                        disabled={busy}
                        aria-label="Increase quantity"
                        onClick={() => void changeQty(item, item.qty + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="mg-cart-line-actions">
                    <span className="mg-cart-line-price">
                      {formatMoney(Number(item.sell_minor ?? 0) * item.qty, item.currency)}
                    </span>
                    <button
                      type="button"
                      className="mg-cart-remove"
                      disabled={busy}
                      onClick={() => void removeItem(item)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </MgCard>
              </li>
            );
          })}
        </ul>

        <div className="mg-summary-sticky">
          <MgCard>
            <h2 className="mg-section-title">Order summary</h2>
            <div className="mg-summary-row">
              <span>Subtotal ({itemCount} items)</span>
              <span>{formatMoney(subtotal, currency)}</span>
            </div>
            <p className="mg-summary-note">Delivery fee &amp; taxes calculated at checkout</p>
            {guest ? (
              <>
                <p className="mg-summary-note">Sign in to apply Care Plan, promos, and pay.</p>
                <MgBtn href="/login?next=/checkout" block>
                  Sign in to checkout
                </MgBtn>
              </>
            ) : (
              <MgBtn href="/checkout" block>
                Proceed to checkout
              </MgBtn>
            )}
            <div className="mg-summary-secondary">
              <MgBtn href="/" variant="ghost" block>
                Continue shopping
              </MgBtn>
            </div>
          </MgCard>
        </div>
      </div>
    </Page>
  );
}
