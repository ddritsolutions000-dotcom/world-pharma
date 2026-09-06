'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, EmptyState, Heading, LoadingState, NetworkErrorState } from '@world-pharma/ui-kit/web';
import { DiscoveryApiError, fetchDiscoverySearch, type DiscoveryResultItem, type DiscoveryType } from './discovery-api';
import { ProductCard } from './product-card';
import { fetchCatalog, type CatalogCard } from './store-api';
import { isAyurvedaProduct, isCancerCareProduct, isMedicine, isPetProduct, isVaccineProduct, applyCatalogSort, filterByRx } from './store-catalog-utils';
import { CatalogFilterBar, type CatalogSort, type RxFilter } from './catalog-filter-bar';
import { StoreSearchBox } from './store-search-box';
import { parseSearchScope } from './search-scope';
import { useSelectedCountry } from './use-selected-country';
import { Page, Section } from './ui/mg-ui';

type Tab = 'all' | DiscoveryType | 'pet' | 'cancer' | 'ayurveda' | 'vaccines';
type Sort = CatalogSort | 'relevance';

const TABS: { id: Tab; label: string; types?: DiscoveryType[] }[] = [
  { id: 'all', label: 'All' },
  { id: 'commerce', label: 'Medicines', types: ['commerce'] },
  { id: 'pet', label: 'Pet Care' },
  { id: 'cancer', label: 'Cancer Care' },
  { id: 'ayurveda', label: 'Ayurveda' },
  { id: 'vaccines', label: 'Vaccines' },
  { id: 'doctor', label: 'Doctors', types: ['doctor'] },
  { id: 'test', label: 'Lab tests', types: ['test', 'lab'] },
  { id: 'help', label: 'Help', types: ['help'] },
];

export function SearchResultsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { country, ready } = useSelectedCountry();
  const query = searchParams?.get('q')?.trim() ?? '';
  const brand = searchParams?.get('brand')?.trim() ?? '';
  const tabParam = searchParams?.get('tab');
  const [tab, setTab] = useState<Tab>(() => {
    if (tabParam && TABS.some((t) => t.id === tabParam)) return tabParam as Tab;
    return parseSearchScope(tabParam);
  });
  const [sort, setSort] = useState<Sort>('relevance');
  const [rxFilter, setRxFilter] = useState<RxFilter>('all');
  const [localQ, setLocalQ] = useState(query);
  const [commerceItems, setCommerceItems] = useState<CatalogCard[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogCard[]>([]);
  const [discoveryItems, setDiscoveryItems] = useState<DiscoveryResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'network' | 'generic' | null>(null);

  useEffect(() => {
    if (tabParam && TABS.some((t) => t.id === tabParam)) {
      setTab(tabParam as Tab);
      return;
    }
    setTab(parseSearchScope(tabParam));
  }, [tabParam]);

  function selectTab(next: Tab) {
    setTab(next);
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (brand) params.set('brand', brand);
    if (next !== 'all') params.set('tab', next);
    router.replace(`/search?${params.toString()}`);
  }

  useEffect(() => {
    setLocalQ(query);
  }, [query]);

  const runSearch = useCallback(async () => {
    const q = query || brand;
    if (!ready || !country) {
      return;
    }
    if (!q) {
      setCommerceItems([]);
      setCatalogItems([]);
      setDiscoveryItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [catalog, discovery] = await Promise.all([
        fetchCatalog(country, q).catch(() => ({ country_enabled: true, data: [] as CatalogCard[] })),
        fetchDiscoverySearch({
          country,
          q,
          brand: brand || undefined,
          types: ['commerce', 'doctor', 'lab', 'test', 'help'],
        }),
      ]);
      setCatalogItems(catalog.data);
      setCommerceItems(catalog.data.filter(isMedicine));
      setDiscoveryItems(discovery.data);
    } catch (err) {
      if (err instanceof DiscoveryApiError && err.status === 0) {
        setError('network');
      } else {
        setError('generic');
      }
    } finally {
      setLoading(false);
    }
  }, [brand, country, query, ready]);

  useEffect(() => {
    void runSearch();
  }, [runSearch]);

  const activeTypes = TABS.find((t) => t.id === tab)?.types;
  const filteredDiscovery = activeTypes
    ? discoveryItems.filter((r) => activeTypes.includes(r.type))
    : discoveryItems;

  function mapDiscoveryToCard(row: DiscoveryResultItem): CatalogCard {
    return {
      id: row.id,
      slug: row.slug ?? row.id,
      title: row.title,
      brand: row.subtitle,
      category: row.category_slug ?? null,
      assets: [],
      offers: [],
    };
  }

  const rawMedicines =
    commerceItems.length > 0
      ? commerceItems
      : discoveryItems.filter((r) => r.type === 'commerce').map(mapDiscoveryToCard);

  const medicineResults =
    tab === 'all' || tab === 'commerce'
      ? applyCatalogSort(filterByRx(rawMedicines, rxFilter), sort === 'relevance' ? 'featured' : sort)
      : [];

  const petResults = tab === 'all' || tab === 'pet' ? catalogItems.filter(isPetProduct) : [];
  const cancerResults = tab === 'all' || tab === 'cancer' ? catalogItems.filter(isCancerCareProduct) : [];
  const ayurvedaResults = tab === 'all' || tab === 'ayurveda' ? catalogItems.filter(isAyurvedaProduct) : [];
  const vaccineResults = tab === 'all' || tab === 'vaccines' ? catalogItems.filter(isVaccineProduct) : [];

  function renderDiscovery(title: string, items: DiscoveryResultItem[]) {
    if (!items.length) return null;
    return (
      <Section title={title}>
        <ul className="mg-discovery-grid">
          {items.map((item) => (
            <li key={`${item.type}-${item.id}`}>
              <Link href={item.href ?? '#'} className="mg-discovery-link">
                <article className="mg-discovery-card">
                  <span className="mg-discovery-type">{item.type}</span>
                  <h3>{item.title}</h3>
                  <p>{item.subtitle ?? title.slice(0, -1)}</p>
                </article>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    );
  }

  return (
    <Page>
      <section className="mg-service-hero" aria-label="Search">
        <p className="mg-service-kicker">Medicines · Doctors · Labs · Help</p>
        <h1 className="mg-service-title">
          {query ? `Results for “${query}”` : brand ? `Brand: ${brand}` : 'Search'}
        </h1>
        <p className="mg-service-sub">Medicines, doctors, lab tests, and help articles</p>
      </section>

      <div className="mg-search-page-bar">
        <StoreSearchBox country={country} initialQuery={localQ} initialScope={parseSearchScope(tabParam)} className="mg-search-form mg-search-form--wide" />
      </div>

      {!query && !brand ? (
        <ul className="mg-services-list mg-search-browse" aria-label="Browse">
          {[
            { href: '/', label: 'Medicines', icon: '💊' },
            { href: '/lab', label: 'Lab tests', icon: '🧪' },
            { href: '/doctors', label: 'Doctors', icon: '🩺' },
            { href: '/radiology', label: 'Imaging', icon: '🩻' },
            { href: '/care-plan', label: 'Care plans', icon: '💚' },
            { href: '/categories', label: 'Categories', icon: '🗂️' },
            { href: '/deals', label: 'Deals', icon: '🏷️' },
            { href: '/blog', label: 'Health tips', icon: '📰' },
          ].map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="mg-service-item">
                <span className="mg-service-icon" aria-hidden>
                  {item.icon}
                </span>
                <span className="mg-service-label">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mg-search-filters">
        <div className="mg-search-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className={tab === t.id ? 'mg-search-tab is-active' : 'mg-search-tab'}
              onClick={() => selectTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? <LoadingState label="Searching…" /> : null}
      {error === 'network' ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void runSearch() }} /> : null}
      {error === 'generic' ? (
        <EmptyState title="Search unavailable" description="Please try again." action={{ label: 'Retry', onClick: () => void runSearch() }} />
      ) : null}

      {!loading && !error ? (
        <div className="wp-plp">
          {(tab === 'all' || tab === 'commerce') && rawMedicines.length > 0 ? (
            <CatalogFilterBar
              layout="sidebar"
              rxFilter={rxFilter}
              onRxFilter={setRxFilter}
              sort={sort === 'relevance' ? 'featured' : sort}
              onSort={(value) => setSort(value)}
            />
          ) : null}
          <div className="wp-plp-main">
          {medicineResults.length > 0 && (tab === 'all' || tab === 'commerce') ? (
            <Section title="Medicines">
              <ul className="mg-product-grid">
                {medicineResults.map((item) => (
                  <li key={item.id}>
                    {item.offers?.length ? (
                      <ProductCard item={item} />
                    ) : (
                      <Link href={`/p/${item.slug}`} className="mg-discovery-link">
                        <Card raised>
                          <Heading level={3}>{item.title}</Heading>
                        </Card>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {petResults.length > 0 && (tab === 'all' || tab === 'pet') ? (
            <Section title="Pet care">
              <ul className="mg-product-grid">
                {petResults.map((item) => (
                  <li key={item.id}>
                    <ProductCard item={item} />
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {cancerResults.length > 0 && (tab === 'all' || tab === 'cancer') ? (
            <Section title="Cancer care">
              <ul className="mg-product-grid">
                {cancerResults.map((item) => (
                  <li key={item.id}>
                    <ProductCard item={item} />
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {ayurvedaResults.length > 0 && (tab === 'all' || tab === 'ayurveda') ? (
            <Section title="Ayurveda & homeopathy">
              <ul className="mg-product-grid">
                {ayurvedaResults.map((item) => (
                  <li key={item.id}>
                    <ProductCard item={item} />
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {vaccineResults.length > 0 && (tab === 'all' || tab === 'vaccines') ? (
            <Section title="Adult vaccines">
              <ul className="mg-product-grid">
                {vaccineResults.map((item) => (
                  <li key={item.id}>
                    <ProductCard item={item} />
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {tab === 'all' || tab === 'doctor'
            ? renderDiscovery('Doctors', filteredDiscovery.filter((r) => r.type === 'doctor'))
            : null}
          {tab === 'all' || tab === 'test'
            ? renderDiscovery('Lab tests', filteredDiscovery.filter((r) => r.type === 'test' || r.type === 'lab'))
            : null}
          {tab === 'all' || tab === 'help'
            ? renderDiscovery('Help articles', filteredDiscovery.filter((r) => r.type === 'help'))
            : null}

          {!query && !brand ? (
            <EmptyState
              title="Search medicines, doctors, and lab tests"
              description="Enter a query above. Results stay on this page — pick a market in the header if prompted."
            />
          ) : medicineResults.length === 0 && filteredDiscovery.length === 0 ? (
            <EmptyState
              title="No results found"
              description="Try another medicine name, salt, brand, or lab test."
              action={{ label: 'Browse categories', onClick: () => (window.location.href = '/categories') }}
            />
          ) : null}
          </div>
        </div>
      ) : null}
    </Page>
  );
}
