'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useCountries } from '@world-pharma/shell-web';
import {
  Card,
  EmptyState,
  LoadingState,
  NetworkErrorState,
  Text,
} from '@world-pharma/ui-kit/web';
import { fetchHelpArticle, HelpApiError } from './help-api';
import { HelpShell } from './help-shell';

type ViewState = 'idle' | 'loading' | 'network' | 'not_found' | 'error';

export function HelpArticleScreen({ articleSlug }: { articleSlug: string }) {
  const { countries } = useCountries();
  const country = countries[0]?.iso_alpha2 ?? 'XX';
  const locale = 'en';
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [body, setBody] = useState('');
  const [categorySlug, setCategorySlug] = useState<string | null>(null);

  const load = useCallback(async () => {
    setViewState('loading');
    try {
      const article = await fetchHelpArticle(country, articleSlug, locale);
      if (!article) {
        setViewState('not_found');
        return;
      }
      setTitle(article.title);
      setSummary(article.summary);
      setBody(article.body);
      setCategorySlug(article.category_slug);
      setViewState('idle');
    } catch (err) {
      if (err instanceof HelpApiError && err.status === 0) {
        setViewState('network');
        return;
      }
      setViewState('error');
    }
  }, [articleSlug, country, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const backHref = categorySlug
    ? `/help/c/${encodeURIComponent(categorySlug)}?country=${country}&locale=${locale}`
    : '/help';

  return (
    <HelpShell title={title || 'Article'} backHref={backHref}>
      {viewState === 'loading' ? <LoadingState label="Loading article" /> : null}
      {viewState === 'network' ? (
        <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />
      ) : null}
      {viewState === 'not_found' ? (
        <EmptyState
          title="Article not found"
          description="This article is not published or does not exist in your country."
        />
      ) : null}
      {viewState === 'error' ? (
        <EmptyState title="Article unavailable" description="Could not load this article." action={{ label: 'Retry', onClick: () => void load() }} />
      ) : null}
      {viewState === 'idle' ? (
        <Card>
          <div className="wp-stack">
            {summary ? <Text tone="secondary">{summary}</Text> : null}
            <Text>{body}</Text>
            {categorySlug ? (
              <Link href={`/help/c/${encodeURIComponent(categorySlug)}?country=${country}&locale=${locale}`}>
                <Text size="caption" tone="secondary">
                  Back to {categorySlug}
                </Text>
              </Link>
            ) : null}
          </div>
        </Card>
      ) : null}
    </HelpShell>
  );
}
