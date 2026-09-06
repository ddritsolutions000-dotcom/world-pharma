'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { EmptyState, LoadingState } from '@world-pharma/ui-kit/web';
import { useSelectedCountry } from './use-selected-country';
import {
  enrollSpecialityProgram,
  fetchPublicSpecialityProgram,
  type SpecialityProgramDetail,
} from './speciality-care-api';
import { MgBackLink, MgBtn, MgCard, Page, PageIntro, ServiceHero } from './ui/mg-ui';

export function SpecialityProgramDetailPage({ programId }: { programId: string }) {
  const { session, getAccessToken, expire } = useSession();
  const { country } = useSelectedCountry();
  const [program, setProgram] = useState<SpecialityProgramDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    void fetchPublicSpecialityProgram(programId, country)
      .then(setProgram)
      .catch(() => setProgram(null))
      .finally(() => setLoading(false));
  }, [country, programId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function enroll() {
    if (session.status !== 'authenticated') {
      window.location.href = `/login?next=/programs/${encodeURIComponent(programId)}`;
      return;
    }
    const token = getAccessToken();
    if (!token) {
      window.location.href = `/login?next=/programs/${encodeURIComponent(programId)}`;
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await enrollSpecialityProgram(token, programId, country, expire);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setMessage(result.data.message);
  }

  return (
    <Page>
      <MgBackLink href="/programs">← All programs</MgBackLink>
      {loading ? <LoadingState label="Loading program" /> : null}
      {!loading && !program ? (
        <EmptyState
          title="Program not found"
          description="This speciality program is not listed for your country."
          action={{ label: 'Browse programs', onClick: () => (window.location.href = '/programs') }}
        />
      ) : null}
      {program ? (
        <>
          <ServiceHero
            kicker="Speciality program"
            title={program.name}
            subtitle={
              program.requires_prescription
                ? 'Prescription may be required · Sandbox enrolment'
                : 'Preventive / no Rx required · Sandbox enrolment'
            }
            tone="care"
            actions={
              <MgBtn onClick={() => void enroll()} disabled={busy}>
                {session.status === 'authenticated' ? (busy ? 'Enrolling…' : 'Enrol in sandbox') : 'Sign in to enrol'}
              </MgBtn>
            }
          />
          <PageIntro>
            <p>{program.long_description ?? program.description}</p>
            <p className="mg-text-muted">
              Enrolment creates a sandbox care request for market {country}. It is not a live hospital admission, and we do
              not advertise provider counts or outcome rates.
            </p>
            {program.pricing?.monthly_program_fee || program.pricing?.consultation_fee ? (
              <p className="mg-text-muted">
                Demo fee references may appear in sandbox catalogs. Final charges (if any) follow checkout and country
                policy — not a guaranteed clinical price.
              </p>
            ) : null}
          </PageIntro>
          {message ? <p className="mg-list-meta">{message}</p> : null}
          <MgCard>
            <h2 className="mg-list-title">What is included</h2>
            <ul className="mg-care-plan-perks">
              {(program.features ?? []).map((feat) => (
                <li key={feat}>{feat}</li>
              ))}
            </ul>
          </MgCard>
          <MgCard>
            <h2 className="mg-list-title">What happens next</h2>
            <p className="mg-list-meta">
              After you enrol, check account messages for sandbox status. Related next steps: browse supportive products,
              book a doctor consult, or open Help if you need support.
            </p>
            <div className="mg-toolbar">
              <MgBtn href="/cancer-care" variant="secondary">
                Cancer Care shop
              </MgBtn>
              <MgBtn href="/doctors" variant="secondary">
                Find a doctor
              </MgBtn>
              <MgBtn href="/help" variant="ghost">
                Help
              </MgBtn>
            </div>
          </MgCard>
        </>
      ) : null}
    </Page>
  );
}
