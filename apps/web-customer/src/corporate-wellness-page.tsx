'use client';

import { useEffect, useState } from 'react';
import { EmptyState, LoadingState } from '@world-pharma/ui-kit/web';
import { apiBaseUrl } from '@world-pharma/shell-core';
import { useSelectedCountry } from './use-selected-country';
import { MgBtn, MgCard, Page, PageIntro } from './ui/mg-ui';

type CorporateProgram = {
  id: string;
  name: string;
  description: string;
  tier: string;
  features: string[];
  pricing: { per_employee: number; minimum_employees: number; setup_fee: number };
};

export function CorporateWellnessPage() {
  const { country } = useSelectedCountry();
  const [programs, setPrograms] = useState<CorporateProgram[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = apiBaseUrl(typeof process === 'undefined' ? {} : process.env);
    setLoading(true);
    void fetch(`${base}/api/v1/public/corporate/programs?country_code=${encodeURIComponent(country)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('unavailable'))))
      .then((body: { programs?: CorporateProgram[] }) => setPrograms(body.programs ?? []))
      .catch(() => setPrograms([]))
      .finally(() => setLoading(false));
  }, [country]);

  return (
    <Page>
      <section className="mg-service-hero" aria-label="Corporate wellness">
        <p className="mg-service-kicker">For HR & employers</p>
        <h1 className="mg-service-title">Corporate wellness</h1>
        <p className="mg-service-sub">
          Employee health programs — checkups, pharmacy benefits, telemedicine, and mental wellness.
        </p>
      </section>
      <PageIntro>
        <p>
          Partner HR teams can enrol employees on discounted medicines, annual checkups, and 24/7 doctor access. Request a
          callback and our partnerships desk will share a sandbox quote.
        </p>
      </PageIntro>
      {loading ? <LoadingState label="Loading programs" /> : null}
      {!loading && programs.length === 0 ? (
        <EmptyState
          title="Programs unavailable"
          description="Try again shortly or apply via the partner portal."
          action={{ label: 'Partner with us', onClick: () => (window.location.href = '/partners') }}
        />
      ) : null}
      <ul className="mg-care-plan-grid">
        {programs.map((program) => (
          <li key={program.id}>
            <MgCard>
              <p className="mg-text-muted">{program.tier}</p>
              <h2 className="mg-list-title">{program.name}</h2>
              <p className="mg-list-meta">{program.description}</p>
              <p className="mg-care-plan-price">
                ₹{program.pricing.per_employee.toLocaleString()}/employee · min {program.pricing.minimum_employees}
              </p>
              <ul className="mg-care-plan-perks">
                {program.features.slice(0, 5).map((feat) => (
                  <li key={feat}>{feat}</li>
                ))}
              </ul>
              <MgBtn href="/contact?intent=corporate">Request a quote</MgBtn>
            </MgCard>
          </li>
        ))}
      </ul>
      <MgCard>
        <h3>Already a partner?</h3>
        <p className="mg-text-muted">Onboard pharmacy, lab, or doctor credentials through the join portal.</p>
        <MgBtn href="/partners" variant="secondary">
          Open partner hub
        </MgBtn>
      </MgCard>
    </Page>
  );
}
