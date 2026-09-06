'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSelectedCountry } from './use-selected-country';
import { EmptyState, LoadingState, NetworkErrorState } from '@world-pharma/ui-kit/web';
import { fetchHelpArticles, HelpApiError, type HelpArticleSummary } from './help-api';
import { HelpShell } from './help-shell';

type ViewState = 'idle' | 'loading' | 'network' | 'error';

export function HelpCategoryScreen({ categorySlug }: { categorySlug: string }) {
  const { country } = useSelectedCountry();
  const locale = 'en';
  const [articles, setArticles] = useState<HelpArticleSummary[]>([]);
  const [viewState, setViewState] = useState<ViewState>('loading');
  const label = categorySlug.replace(/-/g, ' ');

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
    <HelpShell title={label} subtitle="Articles in this help topic.">
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
        <ul className="mg-discovery-grid" aria-label="Articles">
          {articles.map((article) => (
            <li key={article.id}>
              <Link
                href={`/help/a/${encodeURIComponent(article.slug)}?country=${country}&locale=${locale}`}
                className="mg-discovery-link"
              >
                <article className="mg-discovery-card">
                  <span className="mg-discovery-type">{article.content_type}</span>
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
