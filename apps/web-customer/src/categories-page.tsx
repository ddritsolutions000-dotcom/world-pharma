'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState, LoadingState } from '@world-pharma/ui-kit/web';
import { fetchCategories } from './store-api';
import { useSelectedCountry } from './use-selected-country';
import { MgBackLink, ServiceHero } from './ui/mg-ui';

export function CategoriesPage() {
  const { country, countryName } = useSelectedCountry();
  const [categories, setCategories] = useState<{ slug: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void fetchCategories(country)
      .then((rows) => setCategories(rows))
      .catch(() => setCategories([]))
      .finally(() => setLoading(false));
  }, [country]);

  return (
    <div className="mg-page">
      <MgBackLink href="/">← Back to store</MgBackLink>
      <ServiceHero
        kicker="Pharmacy catalog"
        title="Shop by category"
        subtitle={`Browse medicines and health products in ${countryName}.`}
      />

      {loading ? <LoadingState label="Loading categories" /> : null}
      {!loading && categories.length === 0 ? (
        <EmptyState
          title="No categories yet"
          description="Our pharmacy partners are adding product categories. Check back soon or search for a medicine."
          action={{ label: 'Search store', onClick: () => (window.location.href = '/') }}
        />
      ) : null}
      {!loading && categories.length > 0 ? (
        <ul className="mg-category-grid">
          {categories.map((c) => (
            <li key={c.slug}>
              <Link href={`/c/${c.slug}`} className="mg-category-card">
                <span className="mg-category-card-icon" aria-hidden>
                  {c.name.slice(0, 1)}
                </span>
                <span className="mg-category-card-name">{c.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
