'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { CatalogBrand, CatalogCard } from './store-api';
import { fetchPopularHealthPackages, formatPackageRupees, type HealthPackageCard } from './health-packages-api';
import { useSelectedCountry } from './use-selected-country';
import { ProductCard } from './product-card';
import { ProductRow } from './product-row';
import { formatMoney } from './format-money';
import { healthConcernForCategory, itemDiscountPercent, TRENDING_SEARCHES } from './store-catalog-utils';
import { fetchHelpBanners } from './help-api';
import { MgBtn, Section } from './ui/mg-ui';
import { DEFAULT_SITE_HERO, type SiteHeroDocument } from '@world-pharma/shared/site-chrome';

export function HealthConcernsSection({ categories }: { categories: { slug: string; name: string }[] }) {
  if (!categories.length) return null;
  const tiles = categories.slice(0, 8);
  return (
    <Section title="Shop by health concerns" seeAllHref="/categories">
      <ul className="mg-health-concerns">
        {tiles.map((c) => {
          const meta = healthConcernForCategory(c.slug, c.name);
          return (
            <li key={c.slug}>
              <Link href={`/c/${c.slug}`} className="mg-health-concern">
                <span className="mg-health-concern-icon" aria-hidden>
                  {meta.icon}
                </span>
                <span>{meta.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function FullBodyPackagesSection({ packages }: { packages: CatalogCard[] }) {
  const { country } = useSelectedCountry();
  const [hub, setHub] = useState<HealthPackageCard[]>([]);

  useEffect(() => {
    if (!country.trim()) {
      setHub([]);
      return;
    }
    void fetchPopularHealthPackages(country)
      .then(setHub)
      .catch(() => setHub([]));
  }, [country]);

  if (hub.length) {
    return (
      <Section title="Full body health checkups" seeAllHref="/lab/packages">
        <ul className="mg-package-grid">
          {hub.slice(0, 6).map((item) => (
            <li key={item.id}>
              <Link href={`/lab/packages/${item.id}`} className="mg-package-card">
                <span className="mg-package-badge">NABL</span>
                <strong>{item.name}</strong>
                <div className="mg-package-prices">
                  <span className="mg-package-sell">{formatPackageRupees(item.price)}</span>
                  <span className="mg-package-list">{formatPackageRupees(item.original_price)}</span>
                  {item.discount ? <span className="mg-package-off">{item.discount}% off</span> : null}
                </div>
                <span className="mg-lab-home-meta">Home sample collection</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    );
  }

  if (!packages.length) return null;
  return (
    <Section title="Full body health checkups" seeAllHref="/lab/packages">
      <ul className="mg-package-grid">
        {packages.slice(0, 6).map((item) => {
          const offer = item.offers?.[0];
          const discount = itemDiscountPercent(item);
          return (
            <li key={item.id}>
              <Link href={`/lab/${item.slug}`} className="mg-package-card">
                  <span className="mg-package-badge">NABL</span>
                <strong>{item.title}</strong>
                <div className="mg-package-prices">
                  {offer?.price?.sell_minor ? (
                    <span className="mg-package-sell">{formatMoney(offer.price.sell_minor, offer.currency)}</span>
                  ) : null}
                  {offer?.price?.list_minor ? (
                    <span className="mg-package-list">{formatMoney(offer.price.list_minor, offer.currency)}</span>
                  ) : null}
                  {discount ? <span className="mg-package-off">{discount}% off</span> : null}
                </div>
                <span className="mg-lab-home-meta">Home sample collection</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function PetCareHomeSection({ petProducts }: { petProducts: CatalogCard[] }) {
  if (!petProducts.length) return null;
  return (
    <Section title="Pet care essentials" seeAllHref="/pet-care">
      <ul className="mg-product-grid">
        {petProducts.slice(0, 4).map((item) => (
          <li key={item.id}>
            <ProductCard item={item} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function CancerCareHomeSection({ cancerProducts }: { cancerProducts: CatalogCard[] }) {
  if (!cancerProducts.length) return null;
  return (
    <Section title="Cancer care support" seeAllHref="/cancer-care">
      <p className="mg-section-lead">
        Supportive nutrition, nausea relief, and comfort products — plus oncologist consults and lab tests.
      </p>
      <ul className="mg-product-grid">
        {cancerProducts.slice(0, 4).map((item) => (
          <li key={item.id}>
            <ProductCard item={item} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function AyurvedaHomeSection({ ayurvedaProducts }: { ayurvedaProducts: CatalogCard[] }) {
  if (!ayurvedaProducts.length) return null;
  return (
    <Section title="Ayurveda & homeopathy" seeAllHref="/ayurveda">
      <p className="mg-section-lead">Classical herbs, immunity pastes, and homeopathic remedies — delivered nationwide.</p>
      <ul className="mg-product-grid">
        {ayurvedaProducts.slice(0, 4).map((item) => (
          <li key={item.id}>
            <ProductCard item={item} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function LabTestsHomeSection({ labTests }: { labTests: CatalogCard[] }) {
  if (!labTests.length) return null;
  return (
    <Section title="Pathology tests" seeAllHref="/lab">
      <ul className="mg-lab-home-grid">
        {labTests.slice(0, 6).map((item) => {
          const offer = item.offers?.[0];
          const discount = itemDiscountPercent(item);
          return (
            <li key={item.id}>
              <Link href={`/lab/${item.slug}`} className="mg-lab-home-card">
                <strong>{item.title}</strong>
                {offer?.price?.sell_minor ? (
                  <span className="mg-lab-home-price">{formatMoney(offer.price.sell_minor, offer.currency)}</span>
                ) : null}
                {discount ? <span className="mg-lab-home-off">{discount}% off</span> : null}
                <span className="mg-lab-home-meta">Home sample collection</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function FeaturedBrandsSection({ brands }: { brands: CatalogBrand[] }) {
  if (!brands.length) return null;
  return (
    <Section title="Featured brands" seeAllHref="/brands">
      <ul className="mg-brand-chips">
        {brands.slice(0, 10).map((b) => (
          <li key={b.id}>
            <Link href={`/search?q=${encodeURIComponent(b.name)}&brand=${encodeURIComponent(b.name)}`} className="mg-brand-chip">
              {b.name}
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function ComboPacksHomeSection({ combos }: { combos: CatalogCard[] }) {
  if (!combos.length) return null;
  return (
    <Section title="Combo packs" seeAllHref="/deals">
      <p className="mg-section-lead">Save more with bundled medicines and wellness kits.</p>
      <ul className="mg-product-grid">
        {combos.slice(0, 4).map((item) => (
          <li key={item.id}>
            <ProductCard item={item} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function SuperDealsSection({ deals }: { deals: CatalogCard[] }) {
  if (!deals.length) return null;
  return <ProductRow title="Super saving deals" items={deals.slice(0, 12)} />;
}

export function TrendingSearchesSection() {
  return (
    <section className="mg-section mg-popular-searches">
      <h2 className="mg-section-title">Trending searches</h2>
      <ul className="mg-chips">
        {TRENDING_SEARCHES.map((term) => (
          <li key={term}>
            <Link href={`/search?q=${encodeURIComponent(term)}`} className="mg-chip">
              {term}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function QuickOrderSection() {
  return (
    <section className="mg-quick-order">
      <div>
        <h2 className="mg-section-title">Quick order</h2>
        <p className="mg-text-muted">Upload your medicine list or prescription — we&apos;ll place the order for you.</p>
      </div>
      <div className="mg-toolbar">
        <MgBtn href="/prescriptions">Upload prescription</MgBtn>
        <MgBtn href="/buy-again" variant="secondary">
          Buy again
        </MgBtn>
        <MgBtn href="/contact?intent=callback" variant="ghost">
          Get a callback
        </MgBtn>
        <MgBtn href="/pharmacist" variant="ghost">
          Ask a pharmacist
        </MgBtn>
      </div>
    </section>
  );
}

export function OffersBanner() {
  const { country } = useSelectedCountry();
  const [banner, setBanner] = useState<{
    title: string;
    body: string;
    slug: string;
    image_url: string | null;
  } | null>(null);

  useEffect(() => {
    if (!country.trim()) {
      setBanner(null);
      return;
    }
    void fetchHelpBanners(country)
      .then((body) => {
        const first = body.data?.[0];
        setBanner(
          first
            ? { title: first.title, body: first.body, slug: first.slug, image_url: first.image_url }
            : null,
        );
      })
      .catch(() => setBanner(null));
  }, [country]);

  if (banner) {
    return (
      <Link href={`/help/a/${encodeURIComponent(banner.slug)}?country=${country}`} className="mg-offers-banner">
        {banner.image_url ? (
          // merchandising CMS image only — not KYC/health artifacts
          <img src={banner.image_url} alt="" className="mg-offers-banner-img" />
        ) : null}
        <div>
          <strong>{banner.title}</strong>
          <span>{banner.body}</span>
        </div>
        <span className="mg-rx-cta">Open →</span>
      </Link>
    );
  }

  return (
    <Link href="/deals" className="mg-offers-banner">
      <div>
        <strong>Quick Buy!</strong>
        <span>Get up to 50% off on medicines, lab tests &amp; more</span>
      </div>
      <span className="mg-rx-cta">View offers →</span>
    </Link>
  );
}

export function ConsultCtaBanner({ hero }: { hero?: SiteHeroDocument }) {
  const copy = hero ?? DEFAULT_SITE_HERO;
  return (
    <div className="mg-consult-banner">
      <div>
        <p className="mg-promo-kicker">{copy.consultKicker}</p>
        <h2 className="mg-consult-banner-title">{copy.consultTitle}</h2>
        <p className="mg-text-muted">{copy.consultBody}</p>
      </div>
      <div className="mg-toolbar">
        {copy.consultLinks.map((link, index) => (
          <MgBtn key={link.href + link.label} href={link.href} variant={index === 0 ? undefined : index === 1 ? 'secondary' : 'ghost'}>
            {link.label}
          </MgBtn>
        ))}
      </div>
    </div>
  );
}

type HomeDoctor = {
  profile_id: string;
  display_name: string;
  specialties?: string[];
  online_capable?: boolean;
};

export function DoctorsHomeSection({ doctors }: { doctors: HomeDoctor[] }) {
  if (!doctors.length) return null;
  return (
    <Section title="Our doctors" seeAllHref="/doctors" description="Verified doctors — video consult from home">
      <ul className="mg-home-doctor-grid">
        {doctors.slice(0, 6).map((doc) => (
          <li key={doc.profile_id}>
            <Link href={`/doctors/${doc.profile_id}`} className="mg-home-doctor-card">
              <span className="mg-home-doctor-avatar" aria-hidden>
                {(doc.display_name || 'Dr').slice(0, 1)}
              </span>
              <strong>{doc.display_name}</strong>
              <span>{doc.specialties?.slice(0, 2).join(', ') || 'General physician'}</span>
              {doc.online_capable ? <em>Available online</em> : <em>Book a slot</em>}
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
