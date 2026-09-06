'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState, LoadingState, NetworkErrorState, Text } from '@world-pharma/ui-kit/web';
import { ProductCard } from './product-card';
import { fetchCatalog, type CatalogCard } from './store-api';
import {
  filterPetProducts,
  PET_CARE_QUICK_LINKS,
  type PetTypeFilter,
} from './store-catalog-utils';
import { useSelectedCountry } from './use-selected-country';
import { SpecialtyLandingGuide } from './specialty-landing-guide';
import { MgBtn, MgCard, MgInput, Page, PageIntro, Section } from './ui/mg-ui';

const PET_GUIDE = [
  {
    title: 'What is this?',
    body: 'A pet pharmacy catalog for dogs and cats — medicines, supplements, food, and grooming essentials.',
  },
  {
    title: 'Who is it for?',
    body: 'Pet owners shopping OTC essentials. Prescription pet medicines still need a valid veterinary Rx where required.',
  },
  {
    title: 'What can you do?',
    body: 'Filter by pet type, search products, add to cart, or open prescription upload if your vet issued an Rx.',
  },
  {
    title: 'What happens next?',
    body: 'Checkout and delivery follow normal pharmacy fulfilment for your selected country.',
  },
  {
    title: 'What is not available?',
    body: 'Live veterinary diagnosis and emergency care are not provided here. Always consult your veterinarian.',
  },
] as const;

export function PetCareBrowseScreen() {
  const { country } = useSelectedCountry();
  const [items, setItems] = useState<CatalogCard[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [q, setQ] = useState('');
  const [petType, setPetType] = useState<PetTypeFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const catalog = await fetchCatalog(country, q.trim() || undefined, 'pet-care');
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

  const filtered = useMemo(() => filterPetProducts(items, petType), [items, petType]);

  return (
    <Page>
      <section className="mg-service-hero mg-service-hero--wellness" aria-label="Pet care">
        <p className="mg-service-kicker">Pet pharmacy</p>
        <h1 className="mg-service-title">Pet Care</h1>
        <p className="mg-service-sub">
          Medicines, supplements, and grooming essentials for dogs and cats — delivered to your door.
        </p>
        <div className="mg-service-actions">
          <MgBtn variant="secondary" href="/prescriptions">
            Need a vet Rx?
          </MgBtn>
        </div>
      </section>

      <PageIntro>
        <p>
          Dewormers, flea control, joint supplements, food, and grooming. Always consult your veterinarian before starting
          new treatments.
        </p>
      </PageIntro>
      <SpecialtyLandingGuide items={[...PET_GUIDE]} />
      <MgCard className="mg-cancer-disclaimer">
        <Text size="caption" tone="secondary">
          Sandbox demo catalog — availability depends on your country pack. Not a substitute for veterinary care.
        </Text>
      </MgCard>

      <div className="mg-pet-filters" role="tablist" aria-label="Pet type">
        {PET_CARE_QUICK_LINKS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            role="tab"
            aria-selected={petType === chip.id}
            className={`mg-chip${petType === chip.id ? ' is-active' : ''}`}
            onClick={() => setPetType(chip.id)}
          >
            <span aria-hidden>{chip.icon}</span> {chip.label}
          </button>
        ))}
      </div>

      <div className="mg-toolbar">
        <MgInput value={q} onChange={setQ} placeholder="Search pet products…" label="Search" />
        <MgBtn onClick={() => void load()}>Search</MgBtn>
      </div>

      {loading ? <LoadingState label="Loading pet care products" /> : null}
      {error ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} /> : null}
      {!loading && !enabled ? (
        <EmptyState title="Pet care unavailable" description="Pet products are not available in your area yet." />
      ) : null}
      {!loading && enabled && filtered.length === 0 ? (
        <EmptyState title="No pet products found" description="Try another filter or check back soon." />
      ) : null}

      {!loading && enabled && filtered.length > 0 ? (
        <Section title={petType === 'all' ? 'All pet essentials' : `For ${petType}s`}>
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
