'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { EmptyState, LoadingState, NetworkErrorState } from '@world-pharma/ui-kit/web';
import {
  fetchImagingCatalog,
  ImagingCustomerApiError,
  type ImagingCatalogItem,
} from './imaging-api';
import { fetchCatalog, type CatalogCard } from './store-api';
import { formatMoney } from './format-money';
import { useSelectedCountry } from './use-selected-country';
import { MgBtn, MgCard, MgInput, Page } from './ui/mg-ui';

function mapCatalogToImaging(item: CatalogCard): ImagingCatalogItem {
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
            seller_display_name: offer.seller_display_name ?? 'Imaging center',
            currency: offer.currency,
            price: offer.price
              ? { sell_minor: offer.price.sell_minor, list_minor: offer.price.list_minor ?? null, version: 1 }
              : null,
          },
        ]
      : [],
  };
}

export function ImagingBrowseScreen() {
  const { session, getAccessToken, expire } = useSession();
  const { country } = useSelectedCountry();
  const [rows, setRows] = useState<ImagingCatalogItem[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'network' | 'generic' | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const loadPublic = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const catalog = await fetchCatalog(country);
      setEnabled(catalog.country_enabled);
      const needle = q.trim().toLowerCase();
      setRows(
        catalog.data
          .filter((item) => item.kind === 'IMAGING_STUDY')
          .filter((item) => !needle || item.title.toLowerCase().includes(needle))
          .map(mapCatalogToImaging),
      );
      setNote(null);
    } catch {
      setError('network');
    } finally {
      setLoading(false);
    }
  }, [country, q]);

  const loadAuthenticated = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return loadPublic();
    }
    setLoading(true);
    setError(null);
    try {
      const body = await fetchImagingCatalog(token, country, q.trim() || undefined);
      setEnabled(body.country_enabled);
      setRows(body.data);
      setNote(body.note ?? body.sandbox_note ?? null);
    } catch (err) {
      if (err instanceof ImagingCustomerApiError && err.status === 401) {
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

  return (
    <Page>
      <section className="mg-service-hero mg-service-hero--scan" aria-label="Imaging">
        <p className="mg-service-kicker">X-Ray · CT · MRI · Ultrasound</p>
        <h1 className="mg-service-title">Book scans &amp; imaging</h1>
        <p className="mg-service-sub">
          Partner imaging centers. Commercial listings only — follow your physician&apos;s advice before you book.
        </p>
        <div className="mg-service-actions">
          {session.status === 'authenticated' ? (
            <MgBtn variant="secondary" href="/radiology/bookings">
              My bookings
            </MgBtn>
          ) : (
            <MgBtn variant="secondary" href="/login">
              Sign in to book
            </MgBtn>
          )}
        </div>
      </section>
      <p className="mg-sandbox-banner" role="status">
        Sandbox imaging listings — not a live PACS network. Production DICOM viewers remain EXTERNAL_GATED. Reports shown
        here are demo workflow outputs only.
      </p>

      <div className="mg-toolbar">
        <MgInput value={q} onChange={setQ} placeholder="Search studies (X-ray, MRI, CT…)" label="Search imaging" />
        <MgBtn onClick={() => void loadAuthenticated()}>Search</MgBtn>
      </div>

      {loading ? <LoadingState label="Loading imaging catalog" /> : null}
      {error === 'network' ? (
        <NetworkErrorState action={{ label: 'Retry', onClick: () => void loadAuthenticated() }} />
      ) : null}
      {!loading && !enabled ? (
        <EmptyState title="Imaging unavailable" description={note ?? 'Imaging is not enabled for your country yet.'} />
      ) : null}
      {!loading && enabled && rows.length === 0 ? (
        <EmptyState
          title="No imaging studies"
        description="Published studies from partner imaging centers will appear here when your market catalog includes them."
        action={{ label: 'Browse medicines', onClick: () => (window.location.href = '/') }}
      />
      ) : null}
      {note && enabled && rows.length > 0 ? <p className="mg-list-meta">{note}</p> : null}

      <ul className="mg-lab-grid">
        {rows.map((row) => {
          const offer = row.offers[0];
          return (
            <li key={row.id}>
              <MgCard>
                <div className="mg-lab-card">
                  <span className="mg-discovery-type">Imaging</span>
                  <span className="mg-lab-icon" aria-hidden>
                    🩻
                  </span>
                  <p className="mg-lab-name">{row.title}</p>
                  <p className="mg-text-muted">{row.description || 'Commercial imaging listing — consult your physician.'}</p>
                  <p className="mg-text-muted">{offer?.seller_display_name ?? 'Partner imaging center'}</p>
                  <p className="mg-lab-price">
                    {offer?.price ? formatMoney(offer.price.sell_minor, offer.currency) : 'Price on request'}
                  </p>
                  <p className="mg-lab-badge">Center visit · Digital report when ready</p>
                  <MgBtn size="sm" href={`/radiology/${encodeURIComponent(row.slug)}?country=${country}`}>
                    View & book
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
