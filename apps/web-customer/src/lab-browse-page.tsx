'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { EmptyState, LoadingState, NetworkErrorState } from '@world-pharma/ui-kit/web';
import { fetchCatalog, type CatalogCard } from './store-api';
import { fetchLabCatalog, LabCustomerApiError, type LabCatalogItem } from './lab-api';
import { formatMoney } from './format-money';
import { LAB_BROWSE_FILTERS, matchesLabBrowseFilter, type LabBrowseFilterId } from './store-catalog-utils';
import { useSelectedCountry } from './use-selected-country';
import { MgBtn, MgCard, MgInput, Page } from './ui/mg-ui';

function mapCatalogToLab(item: CatalogCard): LabCatalogItem {
  const offer = item.offers?.[0];
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    description: '',
    offers: offer
      ? [
          {
            id: offer.id,
            seller_org_id: offer.seller_org_id ?? '',
            seller_display_name: offer.seller_display_name ?? 'Partner lab',
            currency: offer.currency,
            price: offer.price
              ? { sell_minor: offer.price.sell_minor, list_minor: offer.price.list_minor ?? null, version: 1 }
              : null,
          },
        ]
      : [],
  };
}

export function LabBrowseScreen() {
  const { session, getAccessToken, expire } = useSession();
  const { country } = useSelectedCountry();
  const [rows, setRows] = useState<LabCatalogItem[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<LabBrowseFilterId>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'network' | 'generic' | null>(null);

  const loadPublic = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const catalog = await fetchCatalog(country);
      setEnabled(catalog.country_enabled);
      setRows(
        catalog.data
          .filter((item) => item.kind === 'LAB_TEST')
          .filter((item) => !q.trim() || item.title.toLowerCase().includes(q.trim().toLowerCase()))
          .map(mapCatalogToLab),
      );
    } catch {
      setError('network');
    } finally {
      setLoading(false);
    }
  }, [country, q]);

  const loadAuthenticated = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return loadPublic();
    setLoading(true);
    setError(null);
    try {
      const body = await fetchLabCatalog(token, country, q.trim() || undefined);
      setEnabled(body.country_enabled);
      setRows(body.data);
    } catch (err) {
      if (err instanceof LabCustomerApiError && err.status === 401) {
        expire();
        return;
      }
      await loadPublic();
    } finally {
      setLoading(false);
    }
  }, [country, expire, getAccessToken, loadPublic, q]);

  useEffect(() => {
    void loadAuthenticated();
  }, [loadAuthenticated]);

  const visibleRows = useMemo(
    () => rows.filter((row) => matchesLabBrowseFilter(row.title, row.description ?? '', filter)),
    [filter, rows],
  );

  return (
    <Page>
      <section className="mg-service-hero mg-service-hero--lab" aria-label="Lab tests">
        <p className="mg-service-kicker">Pathology · Home collection</p>
        <h1 className="mg-service-title">Book a lab test</h1>
        <p className="mg-service-sub">
          Accredited partner labs. Home sample collection on eligible tests. Digital reports in your health timeline.
        </p>
        <div className="mg-service-actions">
          {session.status === 'authenticated' ? (
            <MgBtn variant="secondary" href="/lab/bookings">
              My bookings
            </MgBtn>
          ) : (
            <MgBtn variant="secondary" href="/login">
              Sign in
            </MgBtn>
          )}
        </div>
      </section>

      <div className="mg-section">
        <h2 className="mg-section-title">Full body checkups</h2>
        <p className="mg-section-desc">
          Browse packages without signing in. <a href="/lab/packages">See all health checkups</a>
        </p>
      </div>

      <div className="mg-toolbar">
        <MgInput value={q} onChange={setQ} placeholder="Search tests (lipid, thyroid…)" label="Search lab tests" />
        <MgBtn onClick={() => void loadAuthenticated()}>Search</MgBtn>
      </div>

      <div className="mg-section">
        <h2 className="mg-section-title">Browse by condition</h2>
        <ul className="mg-chips">
          {LAB_BROWSE_FILTERS.map((chip) => (
            <li key={chip.id}>
              <button
                type="button"
                className={filter === chip.id ? 'mg-chip is-active' : 'mg-chip'}
                onClick={() => setFilter(chip.id)}
              >
                {chip.label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {loading ? <LoadingState label="Loading lab tests" /> : null}
      {error === 'network' ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void loadAuthenticated() }} /> : null}
      {!loading && !enabled ? (
        <EmptyState title="Lab booking unavailable" description="Lab tests are not available in your area yet." />
      ) : null}
      {!loading && enabled && visibleRows.length === 0 ? (
        <EmptyState title="No tests found" description="Try a different search or condition filter." />
      ) : null}

      <ul className="mg-lab-grid">
        {visibleRows.map((row) => {
          const offer = row.offers[0];
          return (
            <li key={row.id}>
              <MgCard>
                <div className="mg-lab-card">
                  <span className="mg-discovery-type">Lab test</span>
                  <span className="mg-lab-icon" aria-hidden>
                    🧪
                  </span>
                  <p className="mg-lab-name">{row.title}</p>
                  <p className="mg-text-muted">{row.description || 'Includes sample collection where available.'}</p>
                  <p className="mg-text-muted">{offer?.seller_display_name ?? 'Partner lab'}</p>
                  <p className="mg-lab-price">
                    {offer?.price ? formatMoney(offer.price.sell_minor, offer.currency) : 'Price on request'}
                  </p>
                  <p className="mg-lab-badge">NABL partner · Home collection · Reports digital</p>
                  <MgBtn size="sm" href={`/lab/${encodeURIComponent(row.slug)}?country=${country}`}>
                    Book now
                  </MgBtn>
                </div>
              </MgCard>
            </li>
          );
        })}
      </ul>
    </Page>
  );
}
