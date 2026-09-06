'use client';

import { useEffect, useMemo, useState } from 'react';
import { EmptyState, LoadingState } from '@world-pharma/ui-kit/web';
import { fetchCatalog, type CatalogCard } from './store-api';
import { compositionSlug } from './composition-index';
import { isMedicine } from './store-catalog-utils';
import { ProductCard } from './product-card';
import { useSelectedCountry } from './use-selected-country';
import { Page } from './ui/mg-ui';

export function SaltIndexPage({ slug }: { slug: string }) {
  const { country } = useSelectedCountry();
  const [items, setItems] = useState<CatalogCard[]>([]);
  const [loading, setLoading] = useState(true);
  const decoded = decodeURIComponent(slug);

  useEffect(() => {
    setLoading(true);
    void fetchCatalog(country)
      .then((body) => setItems(body.data.filter(isMedicine)))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [country]);

  const matches = useMemo(() => {
    return items.filter((item) => {
      const composition = item.attributes?.composition;
      if (!composition) {
        return compositionSlug(item.title) === decoded || item.slug.includes(decoded);
      }
      return compositionSlug(composition) === decoded;
    });
  }, [decoded, items]);

  const heading = matches[0]?.attributes?.composition ?? decoded.replace(/-/g, ' ');

  return (
    <Page>
      <section className="mg-service-hero mg-service-hero--compact" aria-label="Salt">
        <p className="mg-service-kicker">Composition</p>
        <h1 className="mg-service-title">{heading}</h1>
        <p className="mg-service-sub">All listed medicines with this salt / composition.</p>
      </section>
      {loading ? <LoadingState label="Loading salt index…" /> : null}
      {!loading && !matches.length ? (
        <EmptyState
          title="No medicines for this salt yet"
          description="Try search or browse the full catalog."
          action={{ label: 'Search medicines', onClick: () => (window.location.href = `/search?q=${encodeURIComponent(heading)}`) }}
        />
      ) : null}
      {!loading && matches.length ? (
        <ul className="mg-product-grid">
          {matches.map((item) => (
            <li key={item.id}>
              <ProductCard item={item} />
            </li>
          ))}
        </ul>
      ) : null}
    </Page>
  );
}
