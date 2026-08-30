'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCountries } from '@world-pharma/shell-web';
import {
  Card,
  EmptyState,
  Heading,
  Input,
  LoadingState,
  NetworkErrorState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  DiscoveryApiError,
  DISCOVERY_TYPE_LABELS,
  fetchDiscoverySearch,
  type DiscoveryResultItem,
  type DiscoveryType,
} from './discovery-api';
import { fetchCatalog, fetchCategories, type CatalogCard } from './store-api';

type ViewState = 'idle' | 'loading' | 'network' | 'validation' | 'forbidden' | 'error';

const DEFAULT_SEARCH_TYPES: DiscoveryType[] = ['commerce', 'help', 'doctor', 'lab', 'test', 'pharmacy'];

function formatPrice(minor: string, currency: string): string {
  return `${currency} ${minor}`;
}

export function StoreHome() {
  const { countries } = useCountries();
  const country = countries[0]?.iso_alpha2 ?? 'XX';
  const locale = 'en';
  const [query, setQuery] = useState('');
  const [browseItems, setBrowseItems] = useState<CatalogCard[]>([]);
  const [discoveryItems, setDiscoveryItems] = useState<DiscoveryResultItem[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [discoveryEnabled, setDiscoveryEnabled] = useState(true);
  const [categories, setCategories] = useState<{ slug: string; name: string }[]>([]);
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [message, setMessage] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<DiscoveryType[]>(DEFAULT_SEARCH_TYPES);

  const loadBrowse = useCallback(async () => {
    const result = await fetchCatalog(country, undefined);
    setEnabled(result.country_enabled);
    setBrowseItems(result.data);
  }, [country]);

  const runDiscovery = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) {
        setDiscoveryItems([]);
        setMessage('');
        setViewState('idle');
        await loadBrowse();
        return;
      }
      setViewState('loading');
      setMessage('');
      try {
        const result = await fetchDiscoverySearch({
          country,
          locale,
          q: trimmed,
          types: selectedTypes,
        });
        setEnabled(result.country_enabled);
        setDiscoveryEnabled(result.discovery_enabled);
        setDiscoveryItems(result.data);
        setViewState('idle');
      } catch (err) {
        setDiscoveryItems([]);
        if (err instanceof DiscoveryApiError) {
          if (err.status === 0) {
            setViewState('network');
            return;
          }
          if (err.status === 400) {
            setViewState('validation');
            setMessage(err.message);
            return;
          }
          if (err.status === 403) {
            setViewState('forbidden');
            setMessage(err.message);
            return;
          }
        }
        setViewState('error');
      }
    },
    [country, locale, loadBrowse, selectedTypes],
  );

  useEffect(() => {
    void fetchCategories(country)
      .then((rows) => setCategories(Array.isArray(rows) ? rows : []))
      .catch(() => setCategories([]));
  }, [country]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void runDiscovery(query);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [query, runDiscovery, selectedTypes]);

  function toggleType(type: DiscoveryType) {
    setSelectedTypes((current) =>
      current.includes(type) ? current.filter((entry) => entry !== type) : [...current, type],
    );
  }

  const heading = useMemo(() => {
    if (!enabled) {
      return 'Catalog unavailable';
    }
    if (!discoveryEnabled) {
      return 'Search unavailable';
    }
    return query.trim() ? 'Search results' : 'Store';
  }, [discoveryEnabled, enabled, query]);

  const commerceResults = discoveryItems.filter((row) => row.type === 'commerce');
  const helpResults = discoveryItems.filter((row) => row.type === 'help');
  const doctorResults = discoveryItems.filter((row) => row.type === 'doctor');
  const labResults = discoveryItems.filter((row) => row.type === 'lab');
  const testResults = discoveryItems.filter((row) => row.type === 'test');
  const pharmacyResults = discoveryItems.filter((row) => row.type === 'pharmacy');
  const searching = query.trim().length > 0;

  return (
    <section className="store-home">
      <Heading level={1}>{heading}</Heading>
      <Text tone="secondary">
        {searching
          ? 'Unified commerce, help, and provider discovery powered by the R13 search index.'
          : 'Browse published products. Search uses the discovery API across commerce and providers.'}
      </Text>
      <Input
        aria-label="Search catalog, help, and providers"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search products, doctors, labs, tests, pharmacies, help"
      />
      {searching ? (
        <nav className="store-cats" aria-label="Discovery types">
          {DEFAULT_SEARCH_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={selectedTypes.includes(type) ? 'is-active' : undefined}
              onClick={() => toggleType(type)}
            >
              {DISCOVERY_TYPE_LABELS[type]}
            </button>
          ))}
        </nav>
      ) : null}
      <nav className="store-cats" aria-label="Categories">
        {categories.map((category) => (
          <Link key={category.slug} href={`/c/${category.slug}`}>
            {category.name}
          </Link>
        ))}
      </nav>

      {viewState === 'loading' ? <LoadingState label="Searching…" /> : null}
      {viewState === 'network' ? (
        <NetworkErrorState
          action={{ label: 'Retry', onClick: () => void runDiscovery(query) }}
        />
      ) : null}
      {viewState === 'validation' || viewState === 'forbidden' ? (
        <EmptyState title="Search blocked" description={message || 'This query cannot be processed.'} />
      ) : null}
      {viewState === 'error' ? (
        <EmptyState
          title="Search unavailable"
          description="Try again in a moment."
          action={{ label: 'Retry', onClick: () => void runDiscovery(query) }}
        />
      ) : null}

      {viewState === 'idle' && searching ? (
        <>
          {!enabled || !discoveryEnabled ? (
            <EmptyState
              title={enabled ? 'Search disabled' : 'Not enabled in this country'}
              description="Country policy controls discovery visibility."
            />
          ) : discoveryItems.length === 0 ? (
            <EmptyState title="No results" description="Try a different search term." />
          ) : (
            <>
              {commerceResults.length > 0 ? (
                <section>
                  <Heading level={2}>Products</Heading>
                  <ul className="store-grid">
                    {commerceResults.map((item) => (
                      <li key={`commerce-${item.id}`}>
                        <Link href={item.href ?? '#'}>
                          <Card raised>
                            <Heading level={3}>{item.title}</Heading>
                            <Text size="caption">{item.subtitle ?? 'Product'}</Text>
                          </Card>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {helpResults.length > 0 ? (
                <section>
                  <Heading level={2}>Help articles</Heading>
                  <ul className="store-grid">
                    {helpResults.map((item) => (
                      <li key={`help-${item.id}`}>
                        <Link href={item.href ?? '#'}>
                          <Card>
                            <Heading level={3}>{item.title}</Heading>
                            <Text size="caption">{item.subtitle ?? 'Help'}</Text>
                          </Card>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {doctorResults.length > 0 ? (
                <section>
                  <Heading level={2}>Doctors</Heading>
                  <ul className="store-grid">
                    {doctorResults.map((item) => (
                      <li key={`doctor-${item.id}`}>
                        <Link href={item.href ?? '#'}>
                          <Card>
                            <Heading level={3}>{item.title}</Heading>
                            <Text size="caption">{item.subtitle ?? 'Doctor'}</Text>
                          </Card>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {labResults.length > 0 ? (
                <section>
                  <Heading level={2}>Labs</Heading>
                  <ul className="store-grid">
                    {labResults.map((item) => (
                      <li key={`lab-${item.id}`}>
                        <Link href={item.href ?? '#'}>
                          <Card>
                            <Heading level={3}>{item.title}</Heading>
                            <Text size="caption">{item.subtitle ?? 'Lab'}</Text>
                          </Card>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {testResults.length > 0 ? (
                <section>
                  <Heading level={2}>Lab tests</Heading>
                  <ul className="store-grid">
                    {testResults.map((item) => (
                      <li key={`test-${item.id}`}>
                        <Link href={item.href ?? '#'}>
                          <Card>
                            <Heading level={3}>{item.title}</Heading>
                            <Text size="caption">{item.subtitle ?? 'Test'}</Text>
                          </Card>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {pharmacyResults.length > 0 ? (
                <section>
                  <Heading level={2}>Pharmacies</Heading>
                  <ul className="store-grid">
                    {pharmacyResults.map((item) => (
                      <li key={`pharmacy-${item.id}`}>
                        <Link href={item.href ?? '#'}>
                          <Card>
                            <Heading level={3}>{item.title}</Heading>
                            <Text size="caption">{item.subtitle ?? 'Pharmacy'}</Text>
                          </Card>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </>
      ) : null}

      {viewState === 'idle' && !searching ? (
        !enabled || browseItems.length === 0 ? (
          <EmptyState
            title={enabled ? 'No products yet' : 'Not enabled in this country'}
            description="Country policy controls storefront visibility."
          />
        ) : (
          <ul className="store-grid">
            {browseItems.map((item) => {
              const offer = item.offers[0];
              return (
                <li key={item.id}>
                  <Link href={`/p/${item.slug}`}>
                    <Card raised>
                      <Heading level={3}>{item.title}</Heading>
                      <Text size="caption">{item.brand ?? 'House brand'}</Text>
                      <Text>
                        {offer?.price ? formatPrice(offer.price.sell_minor, offer.currency) : 'Price unavailable'}
                      </Text>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </section>
  );
}
