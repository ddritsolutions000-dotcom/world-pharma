'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useCountries } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  NetworkErrorState,
  Text,
} from '@world-pharma/ui-kit/web';
import { fetchHelpSearch, HelpApiError, type HelpArticleSummary } from './help-api';
import { HelpShell } from './help-shell';

type ViewState = 'idle' | 'loading' | 'network' | 'validation' | 'error';

export function HelpSearchScreen() {
  const searchParams = useSearchParams();
  const { countries } = useCountries();
  const country = searchParams.get('country') ?? countries[0]?.iso_alpha2 ?? 'XX';
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
    <HelpShell title="Search help">
      <Card>
        <div className="wp-stack">
          <FormField label="Search query">
            {({ id }) => (
              <Input
                id={id}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search help articles"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onSubmit();
                  }
                }}
              />
            )}
          </FormField>
          <Button onClick={onSubmit}>Search</Button>
        </div>
      </Card>

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
        <ul className="wp-stack" aria-label="Search results">
          {results.map((article) => (
            <li key={article.id}>
              <Card>
                <Heading level={3}>
                  <Link href={`/help/a/${encodeURIComponent(article.slug)}?country=${country}&locale=${locale}`}>
                    {article.title}
                  </Link>
                </Heading>
                {article.category_slug ? (
                  <Text size="caption" tone="secondary">
                    {article.category_slug}
                  </Text>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
    </HelpShell>
  );
}
