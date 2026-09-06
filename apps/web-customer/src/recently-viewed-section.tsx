'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { EmptyState, LoadingState, Text } from '@world-pharma/ui-kit/web';
import type { CatalogCard } from './store-api';
import { ProductRow } from './product-row';
import { fetchRecentlyViewed, type RecentlyViewedProduct } from './recently-viewed-api';
import { formatMoney } from './format-money';
import { useSelectedCountry } from './use-selected-country';
import { MgCard, Section } from './ui/mg-ui';

export const RECENT_PRODUCT_SLUGS_KEY = 'wp_recent_product_slugs';

export function rememberProductSlug(slug: string) {
  if (typeof window === 'undefined' || !slug) return;
  try {
    const prev = JSON.parse(window.localStorage.getItem(RECENT_PRODUCT_SLUGS_KEY) || '[]') as unknown;
    const list = Array.isArray(prev) ? prev.filter((row): row is string => typeof row === 'string') : [];
    const next = [slug, ...list.filter((row) => row !== slug)].slice(0, 12);
    window.localStorage.setItem(RECENT_PRODUCT_SLUGS_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}

function GuestRecentlyViewed({ items }: { items: CatalogCard[] }) {
  const [slugs, setSlugs] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = JSON.parse(window.localStorage.getItem(RECENT_PRODUCT_SLUGS_KEY) || '[]') as unknown;
      setSlugs(Array.isArray(raw) ? raw.filter((row): row is string => typeof row === 'string') : []);
    } catch {
      setSlugs([]);
    }
  }, [items.length]);

  const rows = slugs
    .map((slug) => items.find((item) => item.slug === slug))
    .filter((item): item is CatalogCard => Boolean(item))
    .slice(0, 8);

  if (!rows.length) return null;
  return <ProductRow title="Recently viewed" items={rows} />;
}

function ServerRecentlyViewedList({ rows }: { rows: RecentlyViewedProduct[] }) {
  if (!rows.length) {
    return (
      <Section title="Recently viewed">
        <EmptyState title="No recent products" description="Products you view will appear here." />
      </Section>
    );
  }

  return (
    <Section title="Recently viewed">
      <ul className="mg-product-grid">
        {rows.map((item) => (
          <li key={item.item_id}>
            <MgCard className="mg-product-card">
              <Link href={`/p/${encodeURIComponent(item.slug)}`} className="mg-product-link">
                <div className="mg-product-body">
                  <p className="mg-product-brand">{item.brand_name || item.category_name}</p>
                  <p className="mg-product-name">{item.title}</p>
                  {item.sell_minor ? (
                    <Text tone="secondary">{formatMoney(item.sell_minor, item.currency)}</Text>
                  ) : null}
                  {!item.available ? (
                    <Text tone="secondary">{item.unavailable_reason ?? 'Unavailable'}</Text>
                  ) : item.rx_required ? (
                    <Text tone="secondary">Prescription required</Text>
                  ) : !item.in_stock ? (
                    <Text tone="secondary">Out of stock</Text>
                  ) : null}
                </div>
              </Link>
            </MgCard>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function RecentlyViewedSection({ items }: { items: CatalogCard[] }) {
  const { session, getAccessToken } = useSession();
  const { country } = useSelectedCountry();
  const [rows, setRows] = useState<RecentlyViewedProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [useServer, setUseServer] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    if (session.status !== 'authenticated' || !token) {
      setUseServer(false);
      return;
    }
    setLoading(true);
    void fetchRecentlyViewed(token, country)
      .then((body) => {
        setRows(body.data ?? []);
        setUseServer(true);
      })
      .catch(() => {
        setUseServer(false);
      })
      .finally(() => setLoading(false));
  }, [country, getAccessToken, session.status]);

  if (session.status === 'authenticated' && loading) {
    return <LoadingState label="Loading recently viewed" />;
  }
  if (useServer) {
    return <ServerRecentlyViewedList rows={rows} />;
  }
  return <GuestRecentlyViewed items={items} />;
}
