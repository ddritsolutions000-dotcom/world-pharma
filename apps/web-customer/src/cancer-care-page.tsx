'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState, LoadingState, NetworkErrorState, Text } from '@world-pharma/ui-kit/web';
import { ProductCard } from './product-card';
import { fetchCatalog, type CatalogCard } from './store-api';
import {
  CANCER_CARE_QUICK_LINKS,
  filterCancerCareProducts,
  type CancerCareFilter,
} from './store-catalog-utils';
import { useSelectedCountry } from './use-selected-country';
import { SpecialtyLandingGuide } from './specialty-landing-guide';
import { MgBtn, MgCard, MgInput, Page, PageIntro, Section } from './ui/mg-ui';

const CANCER_SERVICES = [
  { href: '/programs/cancer-care', label: 'Cancer Care program', sub: 'Coordinated oncology support' },
  { href: '/doctors', label: 'Consult oncologist', sub: 'Online video or chat' },
  { href: '/lab', label: 'Book lab tests', sub: 'Tumour markers & panels' },
  { href: '/prescriptions', label: 'Upload prescription', sub: 'Rx medicines delivered' },
  { href: '/contact?intent=callback', label: 'Talk to care team', sub: 'Callback support' },
] as const;

const CANCER_GUIDE = [
  {
    title: 'What is this?',
    body: 'A supportive-care shop plus shortcuts to doctors, labs, prescriptions, and speciality programs.',
  },
  {
    title: 'Who is it for?',
    body: 'Patients and caregivers shopping comfort, nutrition, and related products while coordinating care elsewhere.',
  },
  {
    title: 'What can you do?',
    body: 'Browse products, filter categories, upload a prescription, or open related clinical booking pages.',
  },
  {
    title: 'What happens next?',
    body: 'Add to cart and checkout like other pharmacy products. Clinical decisions stay with your treating oncologist.',
  },
  {
    title: 'What is not available?',
    body: 'This is not oncology treatment, hospital admission, or medical advice. Sandbox catalogs are demo samples.',
  },
] as const;

export function CancerCareBrowseScreen() {
  const { country } = useSelectedCountry();
  const [items, setItems] = useState<CatalogCard[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [q, setQ] = useState('');
  const [careFilter, setCareFilter] = useState<CancerCareFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const catalog = await fetchCatalog(country, q.trim() || undefined, 'cancer-care');
      setEnabled(catalog.country_enabled);
      setItems(catalog.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [country, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => filterCancerCareProducts(items, careFilter), [items, careFilter]);

  return (
    <Page>
      <section className="mg-service-hero" aria-label="Cancer care">
        <p className="mg-service-kicker">Supportive oncology shop</p>
        <h1 className="mg-service-title">Cancer Care</h1>
        <p className="mg-service-sub">
          Supportive medicines, nutrition, and comfort products — plus access to oncologists and lab tests.
        </p>
        <div className="mg-service-actions">
          <MgBtn variant="secondary" href="/help/search?q=cancer">
            Learn more
          </MgBtn>
        </div>
      </section>

      <PageIntro>
        <p>
          Supportive products, prescription upload, tumour-marker labs, and specialist consult shortcuts — always follow
          your treating oncologist&apos;s advice.
        </p>
      </PageIntro>
      <SpecialtyLandingGuide items={[...CANCER_GUIDE]} />

      <Section title="Care services">
        <ul className="mg-cancer-services">
          {CANCER_SERVICES.map((service) => (
            <li key={service.href}>
              <Link href={service.href} className="mg-cancer-service-card">
                <strong>{service.label}</strong>
                <Text size="caption" tone="secondary">
                  {service.sub}
                </Text>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <MgCard className="mg-cancer-disclaimer">
        <Text size="caption" tone="secondary">
          Sandbox demo — products shown are supportive care samples only. Prescription oncology medicines require valid Rx
          and clinician approval. This is not medical advice.
        </Text>
      </MgCard>

      <div className="mg-pet-filters" role="tablist" aria-label="Cancer care category">
        {CANCER_CARE_QUICK_LINKS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            role="tab"
            aria-selected={careFilter === chip.id}
            className={`mg-chip${careFilter === chip.id ? ' is-active' : ''}`}
            onClick={() => setCareFilter(chip.id)}
          >
            <span aria-hidden>{chip.icon}</span> {chip.label}
          </button>
        ))}
      </div>

      <div className="mg-toolbar">
        <MgInput value={q} onChange={setQ} placeholder="Search cancer care products…" label="Search" />
        <MgBtn onClick={() => void load()}>Search</MgBtn>
      </div>

      {loading ? <LoadingState label="Loading cancer care products" /> : null}
      {error ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} /> : null}
      {!loading && !enabled ? (
        <EmptyState title="Cancer care unavailable" description="This vertical is not available in your area yet." />
      ) : null}
      {!loading && enabled && filtered.length === 0 ? (
        <EmptyState title="No products found" description="Try another category or check back soon." />
      ) : null}

      {!loading && enabled && filtered.length > 0 ? (
        <Section title="Supportive products">
          <ul className="mg-product-grid">
            {filtered.map((item) => (
              <li key={item.id}>
                <ProductCard item={item} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </Page>
  );
}
