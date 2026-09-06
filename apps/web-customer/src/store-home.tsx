'use client';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EmptyState, LoadingState } from '@world-pharma/ui-kit/web';
import { ProductRow } from './product-row';
import { ProductCard } from './product-card';
import { ServiceShortcuts } from './service-shortcuts';
import { fetchBrands, fetchCatalog, fetchCategories, type CatalogBrand, type CatalogCard } from './store-api';
import { fetchPublicCareDoctors } from './care-api';
import { HomeExtraSections } from './home-extra-sections';
import {
  FeaturedBrandsSection,
  FullBodyPackagesSection,
  HealthConcernsSection,
  LabTestsHomeSection,
  OffersBanner,
  PetCareHomeSection,
  CancerCareHomeSection,
  AyurvedaHomeSection,
  ComboPacksHomeSection,
  QuickOrderSection,
  SuperDealsSection,
  TrendingSearchesSection,
  ConsultCtaBanner,
  DoctorsHomeSection,
} from './store-home-sections';
import { RecentlyViewedSection } from './recently-viewed-section';
import { HealthContentSection } from './health-content-section';
import {
  filterAyurvedaProducts,
  filterCancerCareProducts,
  filterComboPacks,
  filterDeals,
  filterLabPackages,
  filterPetProducts,
  isLabTest,
  isMedicine,
  sortByDiscount,
} from './store-catalog-utils';
import { StoreSearchBox } from './store-search-box';
import { Section } from './ui/mg-ui';
import { isStoreMarket, useSelectedCountry } from './use-selected-country';
import { useSiteChrome } from './use-site-chrome';

export function StoreHome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { country, countryName, hydrated } = useSelectedCountry();
  const { hero } = useSiteChrome(country);
  const [browseItems, setBrowseItems] = useState<CatalogCard[]>([]);
  const [labTests, setLabTests] = useState<CatalogCard[]>([]);
  const [categories, setCategories] = useState<{ slug: string; name: string }[]>([]);
  const [petProducts, setPetProducts] = useState<CatalogCard[]>([]);
  const [cancerProducts, setCancerProducts] = useState<CatalogCard[]>([]);
  const [ayurvedaProducts, setAyurvedaProducts] = useState<CatalogCard[]>([]);
  const [brands, setBrands] = useState<CatalogBrand[]>([]);
  const [doctors, setDoctors] = useState<
    { profile_id: string; display_name: string; specialties?: string[]; online_capable?: boolean }[]
  >([]);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = searchParams?.get('q');
    if (q?.trim()) {
      router.replace(`/search?q=${encodeURIComponent(q.trim())}`);
    }
  }, [router, searchParams]);

  const loadBrowse = useCallback(async () => {
    if (!hydrated || !isStoreMarket(country)) {
      setLoading(!hydrated);
      return;
    }
    setLoading(true);
    try {
      const [catalog, cats, brandRows, doctorBody] = await Promise.all([
        fetchCatalog(country, undefined),
        fetchCategories(country),
        fetchBrands(country),
        fetchPublicCareDoctors(country).catch(() => ({ doctors: [] })),
      ]);
      setEnabled(catalog.country_enabled);
      const medicines = catalog.data.filter(isMedicine);
      setBrowseItems(medicines);
      setLabTests(catalog.data.filter(isLabTest));
      setPetProducts(filterPetProducts(catalog.data));
      setCancerProducts(filterCancerCareProducts(catalog.data));
      setAyurvedaProducts(filterAyurvedaProducts(catalog.data));
      setCategories(cats);
      setBrands(brandRows);
      setDoctors((doctorBody as { doctors?: typeof doctors }).doctors ?? []);
    } catch {
      setBrowseItems([]);
      setLabTests([]);
      setPetProducts([]);
      setCancerProducts([]);
      setAyurvedaProducts([]);
      setCategories([]);
      setBrands([]);
      setDoctors([]);
    } finally {
      setLoading(false);
    }
  }, [country, hydrated]);

  useEffect(() => {
    if (searchParams?.get('q')?.trim()) return;
    void loadBrowse();
  }, [loadBrowse, searchParams]);

  const deals = filterDeals(sortByDiscount(browseItems));
  const labPackages = filterLabPackages(labTests);
  const comboPacks = filterComboPacks(browseItems);

  if (searchParams?.get('q')?.trim()) {
    return <LoadingState label="Opening search…" />;
  }

  function rail(id: string) {
    switch (id) {
      case 'shortcuts':
        return <ServiceShortcuts shortcuts={hero.shortcuts} />;
      case 'consult':
        return <ConsultCtaBanner hero={hero} />;
      case 'offers':
        return <OffersBanner />;
      case 'rx':
        return (
          <Link href={hero.rxHref} className="mg-rx-banner">
            <div>
              <strong>{hero.rxTitle}</strong>
              <span>{hero.rxBody}</span>
            </div>
            <span className="mg-rx-cta">{hero.rxCta}</span>
          </Link>
        );
      case 'promo':
        return (
          <section className="mg-promo" aria-label="World Pharma home">
            <div>
              <p className="mg-promo-kicker">{hero.promoKicker}</p>
              <h1 className="mg-promo-title">{hero.promoTitle}</h1>
              <p className="mg-promo-sub">{hero.promoSub.replace('your country', countryName)}</p>
              <div className="mg-promo-cta">
                <Link href="/" className="mg-promo-btn">
                  Order medicines
                </Link>
                <Link href="/lab" className="mg-promo-btn mg-promo-btn--ghost">
                  Book lab test
                </Link>
                <Link href="/doctors" className="mg-promo-btn mg-promo-btn--ghost">
                  Consult a doctor
                </Link>
              </div>
              <div className="mg-promo-search">
                <StoreSearchBox country={country} className="mg-search-form mg-search-form--hero" />
              </div>
            </div>
          </section>
        );
      case 'stats':
        return (
          <ul className="mg-store-stats" aria-label="Platform highlights">
            {hero.stats.map((stat) => (
              <li key={stat.label} className="mg-store-stat">
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </li>
            ))}
          </ul>
        );
      case 'quickOrder':
        return <QuickOrderSection />;
      case 'trending':
        return <TrendingSearchesSection />;
      case 'health':
        return <HealthContentSection />;
      case 'doctors':
        return loading ? null : <DoctorsHomeSection doctors={doctors} />;
      case 'packages':
        return loading ? null : <FullBodyPackagesSection packages={labPackages} />;
      case 'recently':
        return !loading && enabled ? <RecentlyViewedSection items={browseItems} /> : null;
      case 'concerns':
        return !loading && enabled ? <HealthConcernsSection categories={categories} /> : null;
      case 'pet':
        return !loading && enabled ? <PetCareHomeSection petProducts={petProducts} /> : null;
      case 'cancer':
        return !loading && enabled ? <CancerCareHomeSection cancerProducts={cancerProducts} /> : null;
      case 'ayurveda':
        return !loading && enabled ? <AyurvedaHomeSection ayurvedaProducts={ayurvedaProducts} /> : null;
      case 'combo':
        return !loading && enabled ? <ComboPacksHomeSection combos={comboPacks} /> : null;
      case 'labs':
        return !loading && enabled ? (
          <LabTestsHomeSection labTests={labTests.filter((t) => !labPackages.some((p) => p.id === t.id))} />
        ) : null;
      case 'brands':
        return !loading && enabled ? <FeaturedBrandsSection brands={brands} /> : null;
      case 'deals':
        return !loading && enabled && deals.length > 0 ? <SuperDealsSection deals={deals} /> : null;
      case 'categories':
        return !loading && enabled && categories.length ? (
          <Section title="Popular categories" seeAllHref="/categories">
            <ul className="mg-chips">
              {categories.slice(0, 10).map((c) => (
                <li key={c.slug}>
                  <Link href={`/c/${c.slug}`} className="mg-chip">
                    <span className="mg-chip-icon">{c.name.slice(0, 1)}</span>
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        ) : null;
      case 'medicines':
        if (!enabled) {
          return null;
        }
        if (loading) {
          return (
            <Section title="Popular medicines">
              <LoadingState label="Loading products" />
            </Section>
          );
        }
        return browseItems.length === 0 ? (
          <EmptyState
            title="No medicines listed yet"
            description="Partners are onboarding inventory. Explore lab tests and doctors meanwhile."
            action={{ label: 'Book lab test', onClick: () => (window.location.href = '/lab') }}
          />
        ) : (
          <>
            <Section title="Popular medicines" seeAllHref="/categories">
              <ul className="mg-product-grid">
                {browseItems.slice(0, 24).map((item) => (
                  <li key={item.id}>
                    <ProductCard item={item} />
                  </li>
                ))}
              </ul>
            </Section>
            <ProductRow title="Top picks for you" items={browseItems} seeAllHref="/deals" />
            {categories.slice(0, 5).map((cat) => {
              const aisle = browseItems.filter((item) => {
                const name = (item.category ?? '').toLowerCase();
                const slug = cat.slug.toLowerCase();
                return (
                  name.includes(slug.replace(/-/g, ' ')) ||
                  name.includes(cat.name.toLowerCase()) ||
                  item.slug.includes(slug)
                );
              });
              return <ProductRow key={cat.slug} title={cat.name} items={aisle.slice(0, 12)} seeAllHref={`/c/${cat.slug}`} />;
            })}
          </>
        );
      case 'extra':
        return loading ? null : <HomeExtraSections />;
      default:
        return null;
    }
  }

  return (
    <div className="mg-page mg-page--store">
      {!loading && !enabled ? (
        <EmptyState
          title="Pharmacy catalog is still onboarding here"
          description="You can still consult doctors, book labs, and read health articles while medicines go live in this country."
          action={{ label: 'Consult a doctor', onClick: () => (window.location.href = '/doctors') }}
        />
      ) : null}
      {hero.rails
        .filter((row) => row.enabled)
        .map((row) => (
          <Fragment key={row.id}>{rail(row.id)}</Fragment>
        ))}
    </div>
  );
}
