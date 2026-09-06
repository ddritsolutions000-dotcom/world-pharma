'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState, LoadingState } from '@world-pharma/ui-kit/web';
import { ProductRow } from './product-row';
import { fetchCatalog } from './store-api';
import { filterDeals, isLabTest, isMedicine, sortByDiscount } from './store-catalog-utils';
import { useSelectedCountry } from './use-selected-country';
import { LabTestsHomeSection } from './store-home-sections';
import { Page, Section } from './ui/mg-ui';
import { ProductCard } from './product-card';
import type { CatalogCard } from './store-api';

export function DealsPage() {
  const { country, countryName } = useSelectedCountry();
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<CatalogCard[]>([]);
  const [labTests, setLabTests] = useState<CatalogCard[]>([]);

  useEffect(() => {
    setLoading(true);
    void fetchCatalog(country)
      .then((res) => {
        const medicines = res.data.filter(isMedicine);
        const labs = res.data.filter(isLabTest);
        setDeals(filterDeals(sortByDiscount(medicines)));
        setLabTests(labs.filter((t) => filterDeals([t]).length > 0).slice(0, 8));
      })
      .catch(() => {
        setDeals([]);
        setLabTests([]);
      })
      .finally(() => setLoading(false));
  }, [country]);

  return (
    <Page>
      <section className="mg-service-hero" aria-label="Offers">
        <p className="mg-service-kicker">Limited-time savings</p>
        <h1 className="mg-service-title">Offers & deals</h1>
        <p className="mg-service-sub">
          Best discounts on medicines and lab tests in {countryName}. Sandbox promo codes (for example SAVE10SBX) apply at
          checkout when eligible.
        </p>
      </section>
      {!loading ? (
        <p className="mg-text-muted">
          Tip: open a medicine product with multiple pharmacies to compare seller price and stock, then apply a promo code
          on checkout. Live payment gateways remain EXTERNAL_GATED.
        </p>
      ) : null}
      {loading ? <LoadingState label="Loading offers" /> : null}
      {!loading && deals.length === 0 && labTests.length === 0 ? (
        <EmptyState
          title="No active offers right now"
          description="Check back soon — new deals are added regularly."
          action={{ label: 'Browse store', onClick: () => (window.location.href = '/') }}
        />
      ) : null}
      {!loading && deals.length > 0 ? <ProductRow title="Medicine deals" items={deals} /> : null}
      {!loading && labTests.length > 0 ? <LabTestsHomeSection labTests={labTests} /> : null}
      {!loading && deals.length > 0 ? (
        <Section title="All discounted medicines">
          <ul className="mg-product-grid">
            {deals.map((item) => (
              <li key={item.id}>
                <ProductCard item={item} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      <p className="mg-text-muted">
        <Link href="/">← Back to store</Link>
      </p>
    </Page>
  );
}
