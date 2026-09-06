'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState, LoadingState, NetworkErrorState } from '@world-pharma/ui-kit/web';
import { fetchCatalog, fetchCategories, type CatalogCard } from './store-api';
import { applyCatalogSort, filterByRx, isMedicine } from './store-catalog-utils';
import { CatalogFilterBar, type CatalogSort, type RxFilter } from './catalog-filter-bar';
import { useSelectedCountry } from './use-selected-country';
import { ProductCard } from './product-card';
import { MgBtn, Page, PageIntro, Section } from './ui/mg-ui';

export function CategoryBrowse({ slug }: { slug: string }) {
  const { country, hydrated } = useSelectedCountry();
  const [items, setItems] = useState<CatalogCard[]>([]);
  const [title, setTitle] = useState(slug.replace(/-/g, ' '));
  const [sort, setSort] = useState<CatalogSort>('featured');
  const [rxFilter, setRxFilter] = useState<RxFilter>('all');
  const [brand, setBrand] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!hydrated || !country) {
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const [catalog, cats] = await Promise.all([
        fetchCatalog(country, undefined, slug),
        fetchCategories(country),
      ]);
      const cat = cats.find((c) => c.slug === slug);
      if (cat) {
        setTitle(cat.name);
      }
      setItems((catalog.data ?? []).filter(isMedicine));
    } catch {
      setError(true);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [country, slug, hydrated]);

  useEffect(() => {
    void load();
  }, [load]);

  const brands = useMemo(
    () => [...new Set(items.map((item) => item.brand).filter((name): name is string => !!name))].sort(),
    [items],
  );

  const displayItems = useMemo(() => {
    let rows = filterByRx(items, rxFilter);
    if (brand) rows = rows.filter((item) => item.brand === brand);
    return applyCatalogSort(rows, sort);
  }, [brand, items, rxFilter, sort]);

  return (
    <Page>
      <section className="mg-service-hero mg-service-hero--compact" aria-label={title}>
        <p className="mg-service-kicker">Shop by category</p>
        <h1 className="mg-service-title">{title}</h1>
        <p className="mg-service-sub">Browse {title.toLowerCase()} and related medicines in your country.</p>
      </section>
      <PageIntro>
        <p>All products are sourced from licensed pharmacy partners. Rx-required items need a valid prescription at checkout.</p>
      </PageIntro>
      {items.length > 0 ? (
        <div className="wp-plp">
          <CatalogFilterBar
            layout="sidebar"
            rxFilter={rxFilter}
            onRxFilter={setRxFilter}
            sort={sort}
            onSort={setSort}
            brands={brands}
            brand={brand}
            onBrand={setBrand}
          />
          <div className="wp-plp-main">
            {loading ? <LoadingState label="Loading products" /> : null}
            {error ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} /> : null}
            {!loading && displayItems.length > 0 ? (
              <Section title={`${displayItems.length} products`}>
                <ul className="mg-product-grid">
                  {displayItems.map((item) => (
                    <li key={item.id}>
                      <ProductCard item={item} />
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
            {!loading && items.length > 0 && displayItems.length === 0 ? (
              <EmptyState title="No products match these filters" description="Clear brand or Rx filter to see more." />
            ) : null}
          </div>
        </div>
      ) : null}
      {loading && items.length === 0 ? <LoadingState label="Loading products" /> : null}
      {error && items.length === 0 ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="No products in this category"
          description="Try another category or browse all medicines."
          action={{ label: 'Shop all medicines', onClick: () => (window.location.href = '/') }}
        />
      ) : null}
      {!loading && items.length > 0 ? (
        <div className="mg-toolbar">
          <MgBtn href="/" variant="ghost" size="sm">
            ← Continue shopping
          </MgBtn>
        </div>
      ) : null}
    </Page>
  );
}
