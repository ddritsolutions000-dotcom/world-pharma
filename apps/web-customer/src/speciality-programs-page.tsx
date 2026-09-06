'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState, LoadingState, Text } from '@world-pharma/ui-kit/web';
import { useSelectedCountry } from './use-selected-country';
import { fetchPublicSpecialityPrograms, type SpecialityProgramCard } from './speciality-care-api';
import { SpecialtyLandingGuide } from './specialty-landing-guide';
import { MgCard, Page, PageIntro } from './ui/mg-ui';

export function SpecialityProgramsPage() {
  const { country } = useSelectedCountry();
  const [programs, setPrograms] = useState<SpecialityProgramCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void fetchPublicSpecialityPrograms(country)
      .then(setPrograms)
      .catch(() => setPrograms([]))
      .finally(() => setLoading(false));
  }, [country]);

  return (
    <Page>
      <section className="mg-service-hero mg-service-hero--care" aria-label="Speciality programs">
        <p className="mg-service-kicker">Coordinated care</p>
        <h1 className="mg-service-title">Speciality care programs</h1>
        <p className="mg-service-sub">
          Browse coordinated care themes for your country. Enrolment is a sandbox request — not a hospital admission.
        </p>
      </section>
      <PageIntro>
        <p>
          These pages explain what each program covers and what you can do next (consult, shop supportive products, or
          request sandbox enrolment). We do not publish provider counts, success rates, or accreditation claims here.
        </p>
      </PageIntro>
      <SpecialtyLandingGuide
        items={[
          {
            title: 'What is this?',
            body: 'Public listings of speciality care themes (cancer support, chronic care, vaccination, and similar) configured for your market.',
          },
          {
            title: 'Who is it for?',
            body: 'Customers exploring coordinated care options alongside medicines, lab tests, and doctor consults.',
          },
          {
            title: 'What can you do?',
            body: 'Open a program, read what is included, then sign in to request sandbox enrolment or jump to related shop/consult pages.',
          },
          {
            title: 'What happens next?',
            body: 'After enrolment, follow in-app messages. Clinical care remains with your treating clinician.',
          },
          {
            title: 'What is not available?',
            body: 'Live hospital beds, guaranteed specialist assignment, and production clinical outcomes are not offered in sandbox.',
          },
        ]}
      />
      {loading ? <LoadingState label="Loading programs" /> : null}
      {!loading && programs.length === 0 ? (
        <EmptyState
          title="Programs unavailable"
          description="No programs are published for this country yet. You can still browse Cancer Care products."
          action={{ label: 'Cancer Care shop', onClick: () => (window.location.href = '/cancer-care') }}
        />
      ) : null}
      <ul className="mg-care-plan-grid">
        {programs.map((program) => (
          <li key={program.id}>
            <Link href={`/programs/${program.id}`}>
              <MgCard>
                <p className="mg-text-muted">{program.category}</p>
                <h2 className="mg-list-title">{program.name}</h2>
                <p className="mg-list-meta">{program.description}</p>
                <Text size="caption" tone="secondary">
                  {program.requires_prescription ? 'Prescription may be required' : 'Preventive / no Rx required'} · Sandbox
                </Text>
                <ul className="mg-care-plan-perks">
                  {program.features.slice(0, 4).map((feat) => (
                    <li key={feat}>{feat}</li>
                  ))}
                </ul>
              </MgCard>
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}
