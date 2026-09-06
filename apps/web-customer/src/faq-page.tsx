'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState, LoadingState, NetworkErrorState } from '@world-pharma/ui-kit/web';
import { fetchHelpArticles, HelpApiError, type HelpArticleSummary } from './help-api';
import { HelpShell } from './help-shell';
import { useSelectedCountry } from './use-selected-country';
import { PageIntro, Section } from './ui/mg-ui';

export function FaqPage() {
  const { country } = useSelectedCountry();
  const [rows, setRows] = useState<HelpArticleSummary[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const body = await fetchHelpArticles(country, 'en', { content_type: 'FAQ' });
      setRows(body.data ?? []);
    } catch (err) {
      setError(err instanceof HelpApiError);
    } finally {
      setLoading(false);
    }
  }, [country]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <HelpShell title="FAQs" subtitle="Published from Main Admin CMS (FAQ type).">
      <PageIntro>
        <p>
          Operators edit these in Main Admin → CMS. <Link href="/help">Help center</Link> has the full knowledge base.
        </p>
      </PageIntro>
      {loading ? <LoadingState label="Loading FAQs" /> : null}
      {error ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} /> : null}
      {!loading && !error && rows.length === 0 ? (
        <EmptyState title="No FAQs published yet" description="Publish a FAQ document in Main Admin CMS." />
      ) : null}
      {!loading && rows.length > 0 ? (
        <Section title="Questions">
          <ul className="mg-discovery-grid">
            {rows.map((row) => (
              <li key={row.id}>
                <Link href={`/help/a/${encodeURIComponent(row.slug)}?country=${country}&locale=en`} className="mg-discovery-link">
                  <article className="mg-discovery-card">
                    <span className="mg-discovery-type">FAQ</span>
                    <h3>{row.title}</h3>
                  </article>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </HelpShell>
  );
}
