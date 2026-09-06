'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSelectedCountry } from './use-selected-country';
import { EmptyState, LoadingState, NetworkErrorState } from '@world-pharma/ui-kit/web';
import { fetchHelpSearch, HelpApiError, type HelpArticleSummary } from './help-api';
import { HelpShell } from './help-shell';
import { MgBtn, MgCard, MgInput } from './ui/mg-ui';

type ViewState = 'idle' | 'loading' | 'network' | 'validation' | 'error';

export function HelpSearchScreen() {
  const searchParams = useSearchParams();
  const { country: selectedCountry } = useSelectedCountry();
  const country = searchParams.get('country') ?? selectedCountry;
  const locale = searchParams.get('locale') ?? 'en';
  const initialQ = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(initialQ);
  const [results, setResults] = useState<HelpArticleSummary[]>([]);
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [message, setMessage] = useState('');

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) {
        setResults([]);
        setMessage('');
        setViewState('idle');
        return;
      }
      setViewState('loading');
      setMessage('');
      try {
        const body = await fetchHelpSearch(country, trimmed, locale);
        setResults(body.data ?? []);
        setViewState('idle');
      } catch (err) {
        if (err instanceof HelpApiError) {
          if (err.status === 0) {
            setViewState('network');
            return;
          }
          if (err.status === 400) {
            setViewState('validation');
            setMessage(err.message);
            return;
          }
        }
        setViewState('error');
      }
    },
    [country, locale],
  );

  useEffect(() => {
    if (initialQ.trim()) {
      void runSearch(initialQ);
    }
  }, [initialQ, runSearch]);

  const onSubmit = () => {
    const q = query.trim();
    window.history.replaceState(
      null,
      '',
      `/help/search?q=${encodeURIComponent(q)}&country=${country}&locale=${locale}`,
    );
    void runSearch(q);
  };

  return (
    <HelpShell title="Search help" subtitle="Find answers about orders, refunds, and deliveries.">
      <MgCard className="mg-help-search">
        <div className="mg-toolbar">
          <MgInput
            value={query}
            onChange={setQuery}
            placeholder="Search help articles"
            label="Search query"
          />
          <MgBtn onClick={onSubmit}>Search</MgBtn>
        </div>
      </MgCard>

      {viewState === 'loading' ? <LoadingState label="Searching help articles" /> : null}
      {viewState === 'network' ? (
        <NetworkErrorState action={{ label: 'Retry', onClick: () => void runSearch(query) }} />
      ) : null}
      {viewState === 'validation' ? (
        <EmptyState title="Invalid search" description={message || 'Check your query and try again.'} />
      ) : null}
      {viewState === 'error' ? (
        <EmptyState title="Search unavailable" description="Try again shortly." action={{ label: 'Retry', onClick: () => void runSearch(query) }} />
      ) : null}

      {viewState === 'idle' && query.trim() && results.length === 0 ? (
        <EmptyState title="No results" description={`No published articles match "${query.trim()}".`} />
      ) : null}

      {viewState === 'idle' && results.length > 0 ? (
        <ul className="mg-discovery-grid" aria-label="Search results">
          {results.map((article) => (
            <li key={article.id}>
              <Link
                href={`/help/a/${encodeURIComponent(article.slug)}?country=${country}&locale=${locale}`}
                className="mg-discovery-link"
              >
                <article className="mg-discovery-card">
                  <span className="mg-discovery-type">{article.category_slug?.replace(/-/g, ' ') ?? 'Help'}</span>
                  <h3>{article.title}</h3>
                </article>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </HelpShell>
  );
}
