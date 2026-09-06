'use client';

import { useEffect, useState } from 'react';
import { EmptyState, LoadingState } from '@world-pharma/ui-kit/web';
import { apiBaseUrl } from '@world-pharma/shell-core';
import { useSelectedCountry } from './use-selected-country';
import { healthArticleImage } from './health-article-media';
import { MgBackLink, Page, PageIntro, ServiceHero } from './ui/mg-ui';

export function HealthArticlePage({ slug }: { slug: string }) {
  const { country } = useSelectedCountry();
  const [article, setArticle] = useState<{
    title: string;
    summary: string | null;
    body: string | null;
    category: string | null;
    published_at: string;
    image_url?: string;
    slug?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = apiBaseUrl(typeof process === 'undefined' ? {} : process.env);
    setLoading(true);
    void fetch(
      `${base}/api/v1/public/health-content/articles/${encodeURIComponent(slug)}?country_code=${encodeURIComponent(country)}`,
    )
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('not_found'))))
      .then(setArticle)
      .catch(() => setArticle(null))
      .finally(() => setLoading(false));
  }, [country, slug]);

  return (
    <Page>
      <MgBackLink href="/blog">← Health blog</MgBackLink>
      {loading ? <LoadingState label="Loading article" /> : null}
      {!loading && !article ? (
        <EmptyState
          title="Article not found"
          description="This guide may have moved. Browse the health blog for the latest articles."
          action={{ label: 'Open blog', onClick: () => (window.location.href = '/blog') }}
        />
      ) : null}
      {!loading && article ? (
        <>
          <ServiceHero kicker={article.category ?? 'Wellness'} title={article.title} compact />
          <img
            src={article.image_url ?? healthArticleImage(slug, article.category)}
            alt=""
            className="mg-article-hero"
          />
          <PageIntro>
            <p>{article.summary}</p>
            <p className="mg-text-muted">{new Date(article.published_at).toLocaleDateString()}</p>
          </PageIntro>
          <div className="mg-prose">
            {(article.body ?? '').split('\n').map((para) => (
              <p key={para.slice(0, 24)}>{para}</p>
            ))}
          </div>
        </>
      ) : null}
    </Page>
  );
}
