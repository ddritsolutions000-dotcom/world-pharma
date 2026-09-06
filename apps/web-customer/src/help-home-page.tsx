'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSelectedCountry } from './use-selected-country';
import {
  EmptyState,
  LoadingState,
  NetworkErrorState,
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
import { MgBtn, MgCard, MgInput, PageIntro, Section } from './ui/mg-ui';

type ViewState = 'idle' | 'loading' | 'network' | 'error';

export function HelpHomeScreen() {
  const { country } = useSelectedCountry();
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
    <HelpShell title="Help Center" subtitle="FAQs for orders, refunds, lab tests, and account.">
      <PageIntro>
        <p>
          Search our knowledge base or browse topics below. See <Link href="/faq">published FAQs</Link>. For urgent
          delivery issues, open a support ticket from your account.
        </p>
      </PageIntro>
      <MgCard className="mg-help-search">
        <h2 className="mg-section-title">Search help</h2>
        <div className="mg-toolbar">
          <MgInput
            value={searchQ}
            onChange={setSearchQ}
            placeholder="Search articles — e.g. refund, delivery"
            label="Search help"
          />
          <MgBtn onClick={onSearch}>Search</MgBtn>
        </div>
      </MgCard>

      {viewState === 'loading' ? <LoadingState label="Loading help content" /> : null}
      {viewState === 'network' ? (
        <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />
      ) : null}
      {viewState === 'error' ? (
        <EmptyState title="Could not load help" description="Try again shortly." action={{ label: 'Retry', onClick: () => void load() }} />
      ) : null}

      {viewState === 'idle' && banners.length > 0 ? (
        <Section title="Announcements">
          <ul className="mg-discovery-grid">
            {banners.map((banner) => (
              <li key={banner.id}>
                <article className="mg-discovery-card">
                  <span className="mg-discovery-type">Notice</span>
                  <h3>{banner.title}</h3>
                  <p>{banner.body}</p>
                </article>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {viewState === 'idle' ? (
        <Section title="Browse by topic">
          {categories.length === 0 ? (
            <EmptyState title="No categories yet" description="Published help categories will appear here." />
          ) : (
            <div className="mg-chip-grid">
              {categories.map((slug) => (
                <Link
                  key={slug}
                  href={`/help/c/${encodeURIComponent(slug)}?country=${country}&locale=${locale}`}
                  className="mg-chip"
                >
                  {slug.replace(/-/g, ' ')}
                </Link>
              ))}
            </div>
          )}
        </Section>
      ) : null}

      {viewState === 'idle' ? (
        <Section title="Popular articles">
          {articles.length === 0 ? (
            <EmptyState title="No articles yet" description="Published help articles will appear here." />
          ) : (
            <ul className="mg-discovery-grid">
              {articles.map((article) => (
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
          )}
        </Section>
      ) : null}
    </HelpShell>
  );
}
