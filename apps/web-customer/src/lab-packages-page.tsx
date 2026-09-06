'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState, LoadingState } from '@world-pharma/ui-kit/web';
import { useSelectedCountry } from './use-selected-country';
import { fetchPublicHealthPackages, formatPackageRupees, type HealthPackageCard } from './health-packages-api';
import { Page, PageIntro, ServiceHero } from './ui/mg-ui';

const CATEGORIES = [
  { id: '', label: 'All packages' },
  { id: 'full-body', label: 'Full body' },
  { id: 'diabetes', label: 'Diabetes' },
  { id: 'heart', label: 'Heart' },
  { id: 'thyroid', label: 'Thyroid' },
  { id: 'women-health', label: 'Women' },
  { id: 'senior-citizen', label: 'Senior' },
] as const;

export function LabPackagesPage() {
  const { country } = useSelectedCountry();
  const [packages, setPackages] = useState<HealthPackageCard[]>([]);
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void fetchPublicHealthPackages(country, category || undefined)
      .then(setPackages)
      .catch(() => setPackages([]))
      .finally(() => setLoading(false));
  }, [country, category]);

  return (
    <Page>
      <ServiceHero
        kicker="Partner labs"
        title="Full body health checkups"
        subtitle="Browse packages without signing in. Home collection booking needs an account — sandbox only, not live NABL ops."
        tone="lab"
      />
      <PageIntro>
        <p>
          Checkup hub: full body, diabetes, heart, thyroid, women, and senior packages from partner labs. Prices
          are rupees, not wallet credits.
        </p>
      </PageIntro>
      <ul className="mg-chips">
        {CATEGORIES.map((chip) => (
          <li key={chip.id || 'all'}>
            <button
              type="button"
              className={category === chip.id ? 'mg-chip is-active' : 'mg-chip'}
              onClick={() => setCategory(chip.id)}
            >
              {chip.label}
            </button>
          </li>
        ))}
      </ul>
      {loading ? <LoadingState label="Loading packages" /> : null}
      {!loading && packages.length === 0 ? (
        <EmptyState
          title="No packages listed yet"
          description="Restart the API if this country is missing, or browse individual lab tests."
          action={{ label: 'Browse lab tests', onClick: () => (window.location.href = '/lab') }}
        />
      ) : null}
      {!loading && packages.length > 0 ? (
        <ul className="mg-package-grid mg-package-grid--page">
          {packages.map((item) => (
            <li key={item.id}>
              <Link href={`/lab/packages/${item.id}`} className="mg-package-card">
                <span className="mg-package-badge">{item.is_popular ? 'Popular' : 'NABL'}</span>
                <strong>{item.name}</strong>
                <p className="mg-list-meta">{item.tests_count} tests · {item.report_turnaround}</p>
                <div className="mg-package-prices">
                  <span className="mg-package-sell">{formatPackageRupees(item.price)}</span>
                  <span className="mg-package-list">{formatPackageRupees(item.original_price)}</span>
                  {item.discount ? <span className="mg-package-off">{item.discount}% off</span> : null}
                </div>
                <span className="mg-lab-home-meta">Book home collection →</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </Page>
  );
}
