'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState, LoadingState, NetworkErrorState, Text } from '@world-pharma/ui-kit/web';
import { ProductCard } from './product-card';
import { fetchCatalog, type CatalogCard } from './store-api';
import {
  AYURVEDA_QUICK_LINKS,
  filterAyurvedaProducts,
  type AyurvedaTraditionFilter,
} from './store-catalog-utils';
import { useSelectedCountry } from './use-selected-country';
import { SpecialtyLandingGuide } from './specialty-landing-guide';
import { MgBtn, MgCard, MgInput, Page, PageIntro, Section } from './ui/mg-ui';

const WELLNESS_SERVICES = [
  { href: '/doctors', label: 'Consult Ayurvedic doctor', sub: 'Online appointments' },
  { href: '/help/search?q=ayurveda', label: 'Wellness guides', sub: 'Articles & FAQs' },
  { href: '/deals', label: 'Offers on wellness', sub: 'Seasonal discounts' },
  { href: '/prescriptions', label: 'Upload prescription', sub: 'Custom formulations' },
] as const;

const AYURVEDA_GUIDE = [
  {
    title: 'What is this?',
    body: 'Traditional wellness catalog — Ayurveda and homeopathy products from marketplace partners.',
  },
  {
    title: 'Who is it for?',
    body: 'Shoppers exploring herbal and homeopathic remedies alongside doctor consult and help content.',
  },
  {
    title: 'What can you do?',
    body: 'Filter by tradition, search products, open wellness guides, or consult a listed practitioner.',
  },
  {
    title: 'What happens next?',
    body: 'Add products to cart and checkout normally. Ask a qualified practitioner before combining with other medicines.',
  },
  {
    title: 'What is not available?',
    body: 'Not a substitute for professional medical advice. Sandbox listings are demo catalog samples.',
  },
] as const;

export function AyurvedaBrowseScreen() {
  const { country } = useSelectedCountry();
  const [items, setItems] = useState<CatalogCard[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [q, setQ] = useState('');
  const [tradition, setTradition] = useState<AyurvedaTraditionFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const catalog = await fetchCatalog(country, q.trim() || undefined, 'ayurveda-homeopathy');
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

  const filtered = useMemo(() => filterAyurvedaProducts(items, tradition), [items, tradition]);

  return (
    <Page>
      <section className="mg-service-hero mg-service-hero--wellness" aria-label="Ayurveda">
        <p className="mg-service-kicker">Traditional wellness</p>
        <h1 className="mg-service-title">Ayurveda & Homeopathy</h1>
        <p className="mg-service-sub">
          Traditional wellness — herbs, immunity boosters, and homeopathic remedies from trusted partners.
        </p>
        <div className="mg-service-actions">
          <MgBtn variant="secondary" href="/categories">
            Browse all categories
          </MgBtn>
        </div>
      </section>

      <PageIntro>
        <p>
          Shop classical formulations and homeopathic remedies. Consult a qualified practitioner before starting new
          regimens, especially if you take other medicines.
        </p>
      </PageIntro>
      <SpecialtyLandingGuide items={[...AYURVEDA_GUIDE]} />

      <Section title="Wellness services">
        <ul className="mg-cancer-services">
          {WELLNESS_SERVICES.map((service) => (
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
          Sandbox demo — traditional medicine products for browsing only. Not a substitute for professional medical advice.
        </Text>
      </MgCard>

      <div className="mg-pet-filters" role="tablist" aria-label="Tradition">
        {AYURVEDA_QUICK_LINKS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            role="tab"
            aria-selected={tradition === chip.id}
            className={`mg-chip${tradition === chip.id ? ' is-active' : ''}`}
            onClick={() => setTradition(chip.id)}
          >
            <span aria-hidden>{chip.icon}</span> {chip.label}
          </button>
        ))}
      </div>

      <div className="mg-toolbar">
        <MgInput value={q} onChange={setQ} placeholder="Search ashwagandha, triphala, arnica…" label="Search" />
        <MgBtn onClick={() => void load()}>Search</MgBtn>
      </div>

      {loading ? <LoadingState label="Loading wellness products" /> : null}
      {error ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} /> : null}
      {!loading && !enabled ? (
        <EmptyState title="Wellness store unavailable" description="Ayurveda & homeopathy is not available in your area yet." />
      ) : null}
      {!loading && enabled && filtered.length === 0 ? (
        <EmptyState title="No products found" description="Try another tradition or search term." />
      ) : null}

      {!loading && enabled && filtered.length > 0 ? (
        <Section title={tradition === 'all' ? 'Traditional wellness' : tradition === 'ayurveda' ? 'Ayurveda' : 'Homeopathy'}>
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
