'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { EmptyState, LoadingState, NetworkErrorState, Text } from '@world-pharma/ui-kit/web';
import { fetchCatalog, type CatalogCard } from './store-api';
import { filterVaccineProducts } from './store-catalog-utils';
import { formatMoney } from './format-money';
import { formatPackageRupees } from './health-packages-api';
import {
  bookVaccination,
  fetchPublicVaccinations,
  type PublicVaccination,
} from './speciality-care-api';
import { SpecialtyLandingGuide } from './specialty-landing-guide';
import { useSelectedCountry } from './use-selected-country';
import { MgBtn, MgCard, MgInput, Page, PageIntro, Section } from './ui/mg-ui';

const VACCINE_GUIDE = [
  {
    title: 'What is this?',
    body: 'Adult vaccine product browsing plus sandbox home-service vaccination requests where enabled.',
  },
  {
    title: 'Who is it for?',
    body: 'Adults exploring flu, travel, and routine shots. Follow your clinician’s schedule for multi-dose series.',
  },
  {
    title: 'What can you do?',
    body: 'Search catalog products, review listed vaccinations, and request a sandbox home-service booking after sign-in.',
  },
  {
    title: 'What happens next?',
    body: 'Requests create sandbox bookings only. Carry your vaccination card and confirm timing with your doctor.',
  },
  {
    title: 'What is not available?',
    body: 'Live clinic inventory guarantees, national immunization registry sync, and production home nursing are not claimed here.',
  },
] as const;

export function VaccinesBrowseScreen() {
  const { session, getAccessToken, expire } = useSession();
  const { country } = useSelectedCountry();
  const [items, setItems] = useState<CatalogCard[]>([]);
  const [shots, setShots] = useState<PublicVaccination[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [catalog, vaccinations] = await Promise.all([
        fetchCatalog(country, q.trim() || undefined, 'adult-vaccines'),
        fetchPublicVaccinations(country).catch(() => [] as PublicVaccination[]),
      ]);
      setEnabled(catalog.country_enabled);
      setItems(filterVaccineProducts(catalog.data));
      setShots(vaccinations);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [country, q]);

  useEffect(() => {
    void load();
  }, [load]);

  async function requestShot(vaccinationId: string) {
    if (session.status !== 'authenticated') {
      window.location.href = `/login?next=/vaccines`;
      return;
    }
    const token = getAccessToken();
    if (!token) {
      window.location.href = `/login?next=/vaccines`;
      return;
    }
    setBusyId(vaccinationId);
    setMessage(null);
    const result = await bookVaccination(
      token,
      { vaccination_id: vaccinationId, country_code: country, home_service: true },
      expire,
    );
    setBusyId(null);
    setMessage(result.ok ? result.data.message : result.error);
  }

  const filteredShots = q.trim()
    ? shots.filter((row) => row.name.toLowerCase().includes(q.trim().toLowerCase()))
    : shots;

  return (
    <Page>
      <section className="mg-service-hero mg-service-hero--lab" aria-label="Adult vaccines">
        <p className="mg-service-kicker">Adult immunization</p>
        <h1 className="mg-service-title">Adult Vaccines</h1>
        <p className="mg-service-sub">
          Browse flu, travel, and adult shots without signing in. Home-service request needs an account — sandbox only.
        </p>
        <div className="mg-service-actions">
          <MgBtn variant="secondary" href="/programs/vaccination-program">
            Vaccination program
          </MgBtn>
        </div>
      </section>

      <PageIntro>
        <p>
          Catalog products plus sandbox home-service requests. Carry your vaccination card and follow your doctor&apos;s
          schedule for multi-dose vaccines.
        </p>
      </PageIntro>
      <SpecialtyLandingGuide items={[...VACCINE_GUIDE]} />

      <ul className="mg-cancer-services">
        <li>
          <Link href="/doctors" className="mg-cancer-service-card">
            <strong>Ask a doctor</strong>
            <Text size="caption" tone="secondary">
              Which vaccine do I need?
            </Text>
          </Link>
        </li>
        <li>
          <Link href="/lab" className="mg-cancer-service-card">
            <strong>Other lab tests</strong>
            <Text size="caption" tone="secondary">
              Immunity titres & panels
            </Text>
          </Link>
        </li>
      </ul>

      <div className="mg-toolbar">
        <MgInput value={q} onChange={setQ} placeholder="Search vaccines…" label="Search" />
        <MgBtn onClick={() => void load()}>Search</MgBtn>
      </div>
      {message ? <p className="mg-list-meta">{message}</p> : null}

      {loading ? <LoadingState label="Loading vaccines" /> : null}
      {error ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} /> : null}
      {!loading && !enabled ? (
        <EmptyState title="Vaccines unavailable" description="Adult vaccination is not available in your area yet." />
      ) : null}

      {!loading && enabled && filteredShots.length > 0 ? (
        <Section title="Home vaccination (sandbox)">
          <ul className="mg-lab-grid">
            {filteredShots.map((row) => (
              <li key={row.id}>
                <MgCard>
                  <div className="mg-lab-card">
                    <span className="mg-discovery-type">Vaccine</span>
                    <span className="mg-lab-icon" aria-hidden>
                      💉
                    </span>
                    <p className="mg-lab-name">{row.name}</p>
                    <p className="mg-text-muted">{row.description}</p>
                    <p className="mg-lab-price">
                      {row.price === 0 ? 'No charge listed' : formatPackageRupees(row.price)}
                    </p>
                    <MgBtn
                      size="sm"
                      disabled={busyId === row.id}
                      onClick={() => void requestShot(row.id)}
                    >
                      {session.status === 'authenticated'
                        ? busyId === row.id
                          ? 'Requesting…'
                          : 'Request home service'
                        : 'Sign in to request'}
                    </MgBtn>
                  </div>
                </MgCard>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {!loading && enabled && items.length > 0 ? (
        <Section title="Clinic / catalog vaccines">
          <ul className="mg-lab-grid">
            {items.map((row) => {
              const offer = row.offers?.[0];
              return (
                <li key={row.id}>
                  <MgCard>
                    <div className="mg-lab-card">
                      <span className="mg-discovery-type">Clinic</span>
                      <span className="mg-lab-icon" aria-hidden>
                        💉
                      </span>
                      <p className="mg-lab-name">{row.title}</p>
                      <p className="mg-text-muted">{offer?.seller_display_name ?? 'Partner clinic'}</p>
                      <p className="mg-lab-price">
                        {offer?.price?.sell_minor
                          ? formatMoney(offer.price.sell_minor, offer.currency)
                          : 'Price on request'}
                      </p>
                      <MgBtn href={`/lab/${row.slug}`} size="sm">
                        Book slot
                      </MgBtn>
                    </div>
                  </MgCard>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      {!loading && enabled && items.length === 0 && filteredShots.length === 0 ? (
        <EmptyState title="No vaccines found" description="Try another search or check back soon." />
      ) : null}
    </Page>
  );
}
