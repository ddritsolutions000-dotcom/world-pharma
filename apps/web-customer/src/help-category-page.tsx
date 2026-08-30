'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useCountries } from '@world-pharma/shell-web';
import {
  Card,
  EmptyState,
  Heading,
  LoadingState,
  NetworkErrorState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  fetchHelpArticles,
  HelpApiError,
  type HelpArticleSummary,
} from './help-api';
import { HelpShell } from './help-shell';

type ViewState = 'idle' | 'loading' | 'network' | 'error';

export function HelpCategoryScreen({ categorySlug }: { categorySlug: string }) {
  const { countries } = useCountries();
  const country = countries[0]?.iso_alpha2 ?? 'XX';
  const locale = 'en';
  const [articles, setArticles] = useState<HelpArticleSummary[]>([]);
  const [viewState, setViewState] = useState<ViewState>('loading');

  const load = useCallback(async () => {
    setViewState('loading');
    try {
      const body = await fetchHelpArticles(country, locale, { category_slug: categorySlug });
      setArticles(body.data ?? []);
      setViewState('idle');
    } catch (err) {
      if (err instanceof HelpApiError && err.status === 0) {
        setViewState('network');
        return;
      }
      setViewState('error');
    }
  }, [categorySlug, country, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <HelpShell title={`Category: ${categorySlug}`}>
      {viewState === 'loading' ? <LoadingState label="Loading category articles" /> : null}
      {viewState === 'network' ? (
        <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />
      ) : null}
      {viewState === 'error' ? (
        <EmptyState title="Category unavailable" description="Could not load this category." action={{ label: 'Retry', onClick: () => void load() }} />
      ) : null}
      {viewState === 'idle' && articles.length === 0 ? (
        <EmptyState title="No articles in this category" description="Try another category or search help." />
      ) : null}
      {viewState === 'idle' && articles.length > 0 ? (
        <ul className="wp-stack" aria-label="Articles">
          {articles.map((article) => (
            <li key={article.id}>
              <Card>
                <Heading level={3}>
                  <Link href={`/help/a/${encodeURIComponent(article.slug)}?country=${country}&locale=${locale}`}>
                    {article.title}
                  </Link>
                </Heading>
                <Text size="caption" tone="secondary">
                  {article.content_type}
                </Text>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
    </HelpShell>
  );
}
