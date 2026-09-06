'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { MgBtn, MgCard, Page, PageIntro } from './ui/mg-ui';
import { SpecialtyLandingGuide } from './specialty-landing-guide';
import { useSelectedCountry } from './use-selected-country';
import {
  cancelCarePlan,
  fetchCarePlanCatalog,
  fetchMyCarePlan,
  subscribeCarePlan,
  type CarePlanDefinition,
  type CarePlanMine,
} from './care-plan-api';

const CARE_PLAN_GUIDE = [
  {
    title: 'What is this?',
    body: 'Optional membership plans that unlock member pricing and delivery benefits where your country pack allows them.',
  },
  {
    title: 'Who is it for?',
    body: 'Frequent pharmacy shoppers who want sandbox membership benefits at checkout — not a clinical insurance policy.',
  },
  {
    title: 'What can you do?',
    body: 'Compare plans, activate a sandbox membership after sign-in, or cancel anytime for this country.',
  },
  {
    title: 'What happens next?',
    body: 'At checkout, eligible carts show Care Plan discount lines. No live payment is charged in sandbox.',
  },
  {
    title: 'What is not available?',
    body: 'Not health insurance, hospital coverage, or guaranteed clinical outcomes. Live billing rails stay EXTERNAL_GATED.',
  },
] as const;

export function CarePlanPage() {
  const { session, getAccessToken, expire } = useSession();
  const { country } = useSelectedCountry();
  const [catalog, setCatalog] = useState<CarePlanDefinition[]>([]);
  const [mine, setMine] = useState<CarePlanMine | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const pub = await fetchCarePlanCatalog().catch(() => ({ data: [] as CarePlanDefinition[] }));
    setCatalog(pub.data ?? []);
    if (session.status !== 'authenticated') {
      setMine(null);
      return;
    }
    const token = getAccessToken();
    if (!token) return;
    const result = await fetchMyCarePlan(token, country, expire);
    if (result.ok) setMine(result.data);
  }, [country, expire, getAccessToken, session.status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function join(planId: string) {
    const token = getAccessToken();
    if (!token) {
      window.location.href = '/login?next=/care-plan';
      return;
    }
    setBusy(planId);
    setMessage(null);
    const result = await subscribeCarePlan(token, country, planId, expire);
    setBusy(null);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setMine(result.data);
    setMessage('Sandbox membership activated. Member pricing applies at checkout — no live payment charged.');
  }

  async function leave() {
    const token = getAccessToken();
    if (!token) return;
    setBusy('cancel');
    const result = await cancelCarePlan(token, country, expire);
    setBusy(null);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setMine(result.data);
    setMessage('Care Plan cancelled for this country.');
  }

  const active = mine?.membership?.active ? mine.plan : null;

  return (
    <Page>
      <section className="mg-service-hero mg-service-hero--care" aria-label="Health plans">
        <p className="mg-service-kicker">Membership</p>
        <h1 className="mg-service-title">Health Plans</h1>
        <p className="mg-service-sub">
          Optional membership for member pricing and delivery benefits where your country pack supports them. Sandbox
          joins do not charge a live payment.
        </p>
      </section>
      <PageIntro>
        <p>
          Activate a plan to see member savings at pharmacy checkout. Benefits follow country policy — not a global UPI or
          India-only promise.
        </p>
      </PageIntro>
      <SpecialtyLandingGuide items={[...CARE_PLAN_GUIDE]} />
      {active ? (
        <MgCard className="mg-care-plan-card is-featured">
          <span className="mg-care-plan-tag">Active</span>
          <h2>{active.name}</h2>
          <p className="mg-text-muted">
            Member savings at checkout until {mine?.membership?.expires_at?.slice(0, 10)}. Sandbox billing waived.
          </p>
          <MgBtn variant="secondary" onClick={() => void leave()} disabled={busy === 'cancel'}>
            {busy === 'cancel' ? 'Cancelling…' : 'Cancel plan'}
          </MgBtn>
        </MgCard>
      ) : null}
      {message ? <p className="mg-text-muted">{message}</p> : null}
      <ul className="mg-care-plan-grid">
        {catalog.map((plan) => (
          <li key={plan.id}>
            <MgCard className={plan.featured ? 'mg-care-plan-card is-featured' : 'mg-care-plan-card'}>
              {plan.featured ? <span className="mg-care-plan-tag">Most popular</span> : null}
              <h2>{plan.name}</h2>
              <p className="mg-care-plan-price">{plan.price_label}</p>
              <ul className="mg-care-plan-perks">
                {plan.perks.map((perk) => (
                  <li key={perk}>{perk}</li>
                ))}
              </ul>
              <MgBtn
                variant={plan.featured ? 'primary' : 'secondary'}
                disabled={busy === plan.id || active?.id === plan.id}
                onClick={() => void join(plan.id)}
              >
                {active?.id === plan.id ? 'Current plan' : session.status === 'authenticated' ? 'Choose plan' : 'Sign in to join'}
              </MgBtn>
            </MgCard>
          </li>
        ))}
      </ul>
      <MgCard>
        <h3>Member checkout</h3>
        <p className="mg-text-muted">
          After activation, pharmacy checkout shows a Care Plan discount line. Family and Senior plans also waive delivery fee.
        </p>
        <div className="mg-toolbar">
          <MgBtn href="/checkout" variant="secondary">
            Go to checkout
          </MgBtn>
          <MgBtn href="/account/loyalty" variant="secondary">
            View rewards
          </MgBtn>
        </div>
      </MgCard>
      <p className="mg-text-muted">
        Corporate wellness? <Link href="/corporate">View employee programs</Link>
      </p>
    </Page>
  );
}
