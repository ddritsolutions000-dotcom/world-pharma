'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState, LoadingState } from '@world-pharma/ui-kit/web';
import { fetchBrands, type CatalogBrand } from './store-api';
import { useSelectedCountry } from './use-selected-country';
import { MgBackLink, Page } from './ui/mg-ui';

export function BrandsPage() {
  const { country, countryName } = useSelectedCountry();
  const [brands, setBrands] = useState<CatalogBrand[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void fetchBrands(country)
      .then(setBrands)
      .catch(() => setBrands([]))
      .finally(() => setLoading(false));
  }, [country]);

  return (
    <Page>
      <MgBackLink href="/">← Back to store</MgBackLink>
      <section className="mg-service-hero mg-service-hero--compact" aria-label="Brands">
        <p className="mg-service-kicker">Trusted partners</p>
        <h1 className="mg-service-title">Featured brands</h1>
        <p className="mg-service-sub">Shop trusted brands available in {countryName}.</p>
      </section>
      {loading ? <LoadingState label="Loading brands" /> : null}
      {!loading && brands.length === 0 ? (
        <EmptyState title="No brands listed yet" description="Partner brands will appear as catalog grows." />
      ) : null}
      {!loading && brands.length > 0 ? (
        <ul className="mg-brand-grid">
          {brands.map((b) => (
            <li key={b.id}>
              <Link
                href={`/search?q=${encodeURIComponent(b.name)}&brand=${encodeURIComponent(b.name)}`}
                className="mg-brand-card"
              >
                <span className="mg-brand-card-letter" aria-hidden>
                  {b.name.slice(0, 1)}
                </span>
                <span>{b.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </Page>
  );
}
