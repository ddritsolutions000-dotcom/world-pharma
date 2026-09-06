'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiBaseUrl } from '@world-pharma/shell-core';
import { EmptyState, LoadingState, NetworkErrorState } from '@world-pharma/ui-kit/web';
import { newClickId, writeAffiliateAttribution } from './affiliate-attribution';
import { useSelectedCountry } from './use-selected-country';
import { MgBtn, MgCard, Page, ServiceHero } from './ui/mg-ui';

export function ReferralLandingScreen({ code }: { code: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { country: selectedCountry } = useSelectedCountry();
  const linkId = searchParams.get('lid');
  const country = searchParams.get('country') ?? selectedCountry;

  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const clickId = newClickId();
    const base = apiBaseUrl(typeof process === 'undefined' ? {} : process.env);
    void fetch(`${base}/api/v1/public/affiliate/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        click_id: clickId,
        country_code: country,
        referral_code: code,
        link_id: linkId ?? undefined,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { detail?: string };
          throw new Error(body.detail ?? 'click_failed');
        }
        writeAffiliateAttribution({
          referral_code: code.toUpperCase(),
          click_id: clickId,
          link_id: linkId,
          country_code: country,
          recorded_at: new Date().toISOString(),
        });
        setMessage('Welcome! Your referral is applied — shop medicines, lab tests, and more.');
        setState('ready');
      })
      .catch(() => setState('error'));
  }, [code, country, linkId]);

  return (
    <Page>
      <ServiceHero
        kicker="Partner referral"
        title="Welcome to World Pharma"
        subtitle="You arrived through a partner referral. Shop healthcare essentials with trusted delivery."
      />
      {state === 'loading' ? (
        <>
          <LoadingState label="Setting up your session" />
          <EmptyState title="One moment" description="Applying your referral benefits." />
        </>
      ) : null}
      {state === 'error' ? (
        <NetworkErrorState
          action={{
            label: 'Continue shopping',
            onClick: () => {
              writeAffiliateAttribution({
                referral_code: code.toUpperCase(),
                click_id: newClickId(),
                link_id: linkId,
                country_code: country,
                recorded_at: new Date().toISOString(),
              });
              router.push('/');
            },
          }}
        />
      ) : null}
      {state === 'ready' ? (
        <MgCard>
          <p>{message}</p>
          <div className="mg-toolbar">
            <MgBtn onClick={() => router.push('/')}>Shop medicines</MgBtn>
            <MgBtn variant="secondary" onClick={() => router.push('/lab')}>
              Book lab test
            </MgBtn>
            <MgBtn variant="ghost" onClick={() => router.push('/doctors')}>
              Find a doctor
            </MgBtn>
          </div>
        </MgCard>
      ) : null}
    </Page>
  );
}
