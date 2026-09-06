'use client';

import Link from 'next/link';
import { useState, type MouseEvent } from 'react';
import { useSession } from '@world-pharma/shell-web';
import type { CatalogCard } from './store-api';
import { addCartItem, notifyCartChanged } from './commerce-api';
import { discountPercent, formatMoney } from './format-money';
import { addGuestCartLine } from './guest-cart';
import { cheapestInStockOffer, cheapestOffer, distinctSellerCount } from './marketplace-offers';
import { deliveryEtaLabel } from './store-catalog-utils';
import { useSelectedCountry } from './use-selected-country';

const PLACEHOLDER = 'https://placehold.co/200x200/F7FAFC/1A365D/png?text=Medicine';

export function ProductCard({ item, compact = false }: { item: CatalogCard; compact?: boolean }) {
  const { session, getAccessToken } = useSession();
  const { country } = useSelectedCountry();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'idle' | 'added' | 'error'>('idle');
  const offers = item.offers ?? [];
  const assets = item.assets ?? [];
  const offer = cheapestInStockOffer(offers) ?? cheapestOffer(offers) ?? offers[0];
  const sellers = distinctSellerCount(offers);
  const image = assets[0]?.url ?? PLACEHOLDER;
  const sellMinor = offer?.price?.sell_minor;
  const listMinor = offer?.price?.list_minor;
  const discount = sellMinor && listMinor ? discountPercent(sellMinor, listMinor) : null;
  const postal = typeof window !== 'undefined' ? window.localStorage.getItem('wp_postal_code') : null;
  const canAdd = Boolean(offer?.id);

  async function handleAdd(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!offer?.id || busy) return;
    setBusy(true);
    setStatus('idle');
    try {
      const token = getAccessToken();
      if (token && session.status === 'authenticated') {
        await addCartItem(token, country, offer.id, 1, `plp-${offer.id}-${Date.now()}`);
      } else {
        addGuestCartLine({
          offer_id: offer.id,
          qty: 1,
          title: item.title,
          currency: offer.currency,
          sell_minor: String(offer.price?.sell_minor ?? '0'),
          country,
          seller_org_id: offer.seller_org_id,
          image_url: assets[0]?.url,
        });
        notifyCartChanged();
      }
      setStatus('added');
      window.setTimeout(() => setStatus('idle'), 1600);
    } catch {
      setStatus('error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={compact ? 'mg-product-card mg-product-card--compact' : 'mg-product-card'}>
      <Link href={`/p/${item.slug}`} className="mg-product-link">
        <div className="mg-product-img-wrap">
          <img src={image} alt={assets[0]?.alt || item.title} className="mg-product-img" loading="lazy" />
          {discount ? <span className="mg-product-off">{discount}% OFF</span> : null}
          {item.rx_required ? <span className="mg-product-rx">Rx</span> : null}
        </div>
        <div className="mg-product-body">
          <p className="mg-product-name">{item.title}</p>
          {offer?.strength ? <p className="mg-product-pack">{offer.strength}</p> : null}
          {offer?.pack_size ? <p className="mg-product-pack">{offer.pack_size}</p> : null}
          {item.brand ? <p className="mg-product-brand">{item.brand}</p> : null}
          {sellMinor ? (
            <p className="mg-product-price">{formatMoney(sellMinor, offer?.currency)}</p>
          ) : (
            <p className="mg-product-eta">Price unavailable</p>
          )}
          {sellers > 1 ? (
            <p className="mg-product-brand">{sellers} sellers</p>
          ) : offer?.seller_display_name ? (
            <p className="mg-product-brand">{offer.seller_display_name}</p>
          ) : null}
          {listMinor && sellMinor && listMinor !== sellMinor ? (
            <p className="mg-product-mrp">MRP {formatMoney(listMinor, offer?.currency)}</p>
          ) : null}
          <p className="mg-product-stock">In stock</p>
          <p className="mg-product-eta">{deliveryEtaLabel(!!item.rx_required, postal)}</p>
        </div>
      </Link>
      <div className="mg-product-actions">
        <button
          type="button"
          className="mg-add-btn"
          disabled={!canAdd || busy}
          onClick={(event) => void handleAdd(event)}
        >
          {busy ? 'Adding…' : status === 'added' ? 'Added' : status === 'error' ? 'Retry' : 'Add'}
        </button>
      </div>
    </article>
  );
}
