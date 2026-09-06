'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@world-pharma/shell-web';
import { EmptyState, LoadingState, NetworkErrorState, PermissionDeniedState, SessionExpiredState } from '@world-pharma/ui-kit/web';
import { fetchPersonalRecommendations, type RecommendationProduct } from './commerce-api';
import { useSelectedCountry } from './use-selected-country';
import { MgCard, Page, PageIntro, Section } from './ui/mg-ui';

export function RecommendationsScreen() {
  const { session, getAccessToken, signOut, expire } = useSession();
  const { country } = useSelectedCountry();
  const [items, setItems] = useState<RecommendationProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated') {
      return;
    }
    setLoading(true);
    void fetchPersonalRecommendations(token, country)
      .then((body: { sections?: { recently_viewed?: { data?: RecommendationProduct[] }; wishlist_adjacent?: { data?: RecommendationProduct[] } } }) => {
        const recent = body?.sections?.recently_viewed?.data ?? [];
        const adjacent = body?.sections?.wishlist_adjacent?.data ?? [];
        const merged = [...recent, ...adjacent.filter((row) => !recent.some((r) => r.item_id === row.item_id))];
        setItems(merged);
        setError(false);
      })
      .catch(() => {
        expire();
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [country, expire, getAccessToken, session.status]);

  useEffect(() => {
    load();
  }, [load]);

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (session.status !== 'authenticated') {
    return (
      <Page>
        <section className="mg-service-hero mg-service-hero--compact" aria-label="For you">
          <p className="mg-service-kicker">Personalised</p>
          <h1 className="mg-service-title">For you</h1>
          <p className="mg-service-sub">Personal picks based on your browsing.</p>
        </section>
        <EmptyState title="Sign in required" description="Login to see personalized recommendations." action={{ label: 'Sign in', onClick: () => (window.location.href = '/login') }} />
      </Page>
    );
  }

  if (session.audience !== 'customer') {
    return <PermissionDeniedState />;
  }

  return (
    <Page>
      <section className="mg-service-hero mg-service-hero--compact" aria-label="For you">
        <p className="mg-service-kicker">Personalised</p>
        <h1 className="mg-service-title">Recommended for you</h1>
        <p className="mg-service-sub">Personalized picks from your browsing and wishlist activity.</p>
      </section>
      <PageIntro>
        <p>Recommendations respect country policy and catalog availability. Browse more products to improve your feed.</p>
      </PageIntro>
      {loading ? <LoadingState label="Loading recommendations" /> : null}
      {error ? <NetworkErrorState action={{ label: 'Retry', onClick: load }} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState title="No recommendations yet" description="Browse medicines and lab tests — picks appear after activity." action={{ label: 'Browse store', onClick: () => (window.location.href = '/') }} />
      ) : null}
      {!loading && !error && items.length > 0 ? (
        <Section title={`${items.length} picks for you`}>
          <ul className="mg-product-grid">
            {items.map((item) => (
              <li key={item.item_id}>
                <MgCard>
                  <Link href={item.href || `/p/${item.slug}`} className="mg-product-card-link">
                    <strong>{item.title}</strong>
                    <span className="mg-list-meta">{item.category_name}</span>
                  </Link>
                </MgCard>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </Page>
  );
}
