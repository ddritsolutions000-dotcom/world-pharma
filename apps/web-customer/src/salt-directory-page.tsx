'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { EmptyState, LoadingState } from '@world-pharma/ui-kit/web';
import { fetchCatalog, type CatalogCard } from './store-api';
import { compositionHref, compositionSlug } from './composition-index';
import { isMedicine } from './store-catalog-utils';
import { useSelectedCountry } from './use-selected-country';
import { Page } from './ui/mg-ui';

export function SaltDirectoryPage() {
  const { country } = useSelectedCountry();
  const [items, setItems] = useState<CatalogCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void fetchCatalog(country)
      .then((body) => setItems(body.data.filter(isMedicine)))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [country]);

  const salts = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const item of items) {
      const composition = item.attributes?.composition?.trim();
      if (!composition) continue;
      const slug = compositionSlug(composition);
      if (!slug) continue;
      const prev = map.get(slug);
      map.set(slug, { label: composition, count: (prev?.count ?? 0) + 1 });
    }
    return [...map.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label));
  }, [items]);

  return (
    <Page>
      <section className="mg-service-hero mg-service-hero--compact" aria-label="Salt index">
        <p className="mg-service-kicker">Active ingredients</p>
        <h1 className="mg-service-title">Salt / composition index</h1>
        <p className="mg-service-sub">Browse medicines grouped by active ingredient.</p>
      </section>
      {loading ? <LoadingState label="Loading salts…" /> : null}
      {!loading && salts.length === 0 ? (
        <EmptyState
          title="No composition data yet"
          description="Open a medicine and follow the composition link, or search the catalog."
          action={{ label: 'Search medicines', onClick: () => (window.location.href = '/search') }}
        />
      ) : null}
      {!loading && salts.length ? (
        <ul className="mg-chips">
          {salts.map(([slug, row]) => (
            <li key={slug}>
              <Link href={compositionHref(row.label)} className="mg-chip">
                {row.label} ({row.count})
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </Page>
  );
}
