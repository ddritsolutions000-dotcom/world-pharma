'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
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
import {
  fetchHelpArticles,
  fetchHelpBanners,
  fetchHelpCategories,
  HelpApiError,
  type HelpArticleSummary,
  type HelpBanner,
} from './help-api';
import { HelpShell } from './help-shell';

type ViewState = 'idle' | 'loading' | 'network' | 'error';

export function HelpHomeScreen() {
  const { countries } = useCountries();
  const country = countries[0]?.iso_alpha2 ?? 'XX';
  const locale = 'en';
  const [categories, setCategories] = useState<string[]>([]);
  const [articles, setArticles] = useState<HelpArticleSummary[]>([]);
  const [banners, setBanners] = useState<HelpBanner[]>([]);
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [searchQ, setSearchQ] = useState('');

  const load = useCallback(async () => {
    setViewState('loading');
    try {
      const [cats, arts, bns] = await Promise.all([
        fetchHelpCategories(country, locale),
        fetchHelpArticles(country, locale),
        fetchHelpBanners(country, locale),
      ]);
      setCategories(cats.data ?? []);
      setArticles((arts.data ?? []).slice(0, 8));
      setBanners(bns.data ?? []);
      setViewState('idle');
    } catch (err) {
      if (err instanceof HelpApiError && err.status === 0) {
        setViewState('network');
        return;
      }
      setViewState('error');
    }
  }, [country, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSearch = () => {
    const q = searchQ.trim();
    if (!q) {
      return;
    }
    window.location.href = `/help/search?q=${encodeURIComponent(q)}&country=${country}&locale=${locale}`;
  };

  return (
    <HelpShell title="Help Center">
      <Text tone="secondary">
        Browse published help articles and FAQs. Content is operational only — not medical advice.
      </Text>

      <Card>
        <div className="wp-stack">
          <Heading level={2}>Search help</Heading>
          <FormField label="Search">
            {({ id }) => (
              <Input
                id={id}
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search articles"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onSearch();
                  }
                }}
              />
            )}
          </FormField>
          <Button onClick={onSearch}>Search</Button>
        </div>
      </Card>

      {viewState === 'loading' ? <LoadingState label="Loading help content" /> : null}
      {viewState === 'network' ? (
        <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />
      ) : null}
      {viewState === 'error' ? (
        <EmptyState title="Could not load help" description="Try again shortly." action={{ label: 'Retry', onClick: () => void load() }} />
      ) : null}

      {viewState === 'idle' && banners.length > 0 ? (
        <section className="wp-stack" aria-label="Announcements">
          <Heading level={2}>Announcements</Heading>
          {banners.map((banner) => (
            <Card key={banner.id}>
              <Heading level={3}>{banner.title}</Heading>
              <Text tone="secondary">{banner.body}</Text>
            </Card>
          ))}
        </section>
      ) : null}

      {viewState === 'idle' ? (
        <section className="wp-stack" aria-label="Categories">
          <Heading level={2}>Categories</Heading>
          {categories.length === 0 ? (
            <EmptyState title="No categories yet" description="Published help categories will appear here." />
          ) : (
            <ul className="wp-stack">
              {categories.map((slug) => (
                <li key={slug}>
                  <Link href={`/help/c/${encodeURIComponent(slug)}?country=${country}&locale=${locale}`}>
                    <Button variant="secondary">{slug}</Button>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {viewState === 'idle' ? (
        <section className="wp-stack" aria-label="Featured articles">
          <Heading level={2}>Featured articles</Heading>
          {articles.length === 0 ? (
            <EmptyState title="No articles yet" description="Published help articles will appear here." />
          ) : (
            <ul className="wp-stack">
              {articles.map((article) => (
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
          )}
        </section>
      ) : null}
    </HelpShell>
  );
}
