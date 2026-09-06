'use client';

import { useCallback, useEffect, useState } from 'react';
import { landingIsLive, parseLandingDocument } from '@world-pharma/shared/site-page-blocks';
import { LoadingState } from '@world-pharma/ui-kit/web';
import { useSelectedCountry } from './use-selected-country';
import { fetchHelpArticle, type HelpArticleDetail } from './help-api';
import { LandingBlocks } from './landing-blocks';
import { MgCard, Page, ServiceHero } from './ui/mg-ui';
import { pageHeroImage } from './page-hero-media';

export type CmsFallback = {
  title: string;
  summary?: string;
  body: string;
};

function renderBody(body: string) {
  const blocks = body.split(/\n\n+/).filter(Boolean);
  return (
    <div className="mg-prose">
      {blocks.map((block, index) => {
        if (block.startsWith('## ')) {
          return <h3 key={index}>{block.slice(3).trim()}</h3>;
        }
        if (block.startsWith('- ')) {
          const items = block.split('\n').map((line) => line.replace(/^- /, '').trim());
          return (
            <ul key={index}>
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{block}</p>;
      })}
    </div>
  );
}

export function CmsPage({
  slug,
  title,
  subtitle,
  fallback,
  gallery,
}: {
  slug: string;
  title: string;
  subtitle?: string;
  fallback: CmsFallback;
  gallery?: ReadonlyArray<{ src: string; label: string }>;
}) {
  const { country } = useSelectedCountry();
  const [article, setArticle] = useState<HelpArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const row = await fetchHelpArticle(country, slug);
      setArticle(row);
    } catch {
      setError(true);
      setArticle(null);
    } finally {
      setLoading(false);
    }
  }, [country, slug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const parsed = parseLandingDocument(article?.body);
    if (!parsed || !landingIsLive(parsed)) {
      return;
    }
    const { seo } = parsed;
    if (seo.title) {
      document.title = seo.title;
    }
    const desc = seo.description;
    if (desc) {
      let meta = document.querySelector('meta[name="description"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'description');
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', desc);
    }
    const robots = document.querySelector('meta[name="robots"]') ?? document.createElement('meta');
    robots.setAttribute('name', 'robots');
    robots.setAttribute('content', seo.noindex ? 'noindex,nofollow' : 'index,follow');
    if (!robots.parentNode) {
      document.head.appendChild(robots);
    }
  }, [article]);

  if (loading) {
    return (
      <Page>
        <LoadingState label="Loading page" />
      </Page>
    );
  }

  if (error) {
    return (
      <Page>
        <ServiceHero title={fallback.title} subtitle={fallback.summary ?? subtitle} compact />
        {pageHeroImage(slug) ? <img src={pageHeroImage(slug)!} alt="" className="mg-article-hero" /> : null}
        <MgCard flat>{renderBody(fallback.body)}</MgCard>
      </Page>
    );
  }

  const parsedLanding = parseLandingDocument(article?.body);
  if (parsedLanding && !landingIsLive(parsedLanding)) {
    return (
      <Page>
        <ServiceHero title={fallback.title} subtitle={fallback.summary ?? subtitle} compact />
        <MgCard flat>{renderBody(fallback.body)}</MgCard>
      </Page>
    );
  }

  const heading = parsedLanding?.seo.title || article?.title || title || fallback.title;
  const summary = parsedLanding?.seo.description || article?.summary || fallback.summary || subtitle;
  const body = article?.body ?? fallback.body;
  const hero = pageHeroImage(slug);

  return (
    <Page>
      <ServiceHero kicker="World-Pharma™" title={heading} subtitle={summary} compact />
      {hero ? <img src={hero} alt="" className="mg-article-hero" /> : null}
      {gallery?.length ? (
        <ul className="mg-cms-gallery">
          {gallery.map((shot) => (
            <li key={shot.src}>
              <img src={shot.src} alt="" className="mg-cms-gallery-img" />
              <p className="mg-cms-gallery-label">{shot.label}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {parsedLanding ? <LandingBlocks document={parsedLanding} /> : <MgCard flat>{renderBody(body)}</MgCard>}
    </Page>
  );
}
