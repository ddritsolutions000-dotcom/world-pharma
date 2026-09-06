'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiBaseUrl } from '@world-pharma/shell-core';
import { Section } from './ui/mg-ui';
import { useSelectedCountry } from './use-selected-country';
import { healthArticleImage } from './health-article-media';

interface HealthArticle {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  category: string | null;
  published_at: string;
  image_url?: string;
}

export function HealthContentSection() {
  const { country } = useSelectedCountry();
  const [articles, setArticles] = useState<HealthArticle[]>([]);

  useEffect(() => {
    if (!country.trim()) {
      setArticles([]);
      return;
    }
    if (typeof fetch === 'undefined') {
      return;
    }
    const base = apiBaseUrl(typeof process === 'undefined' ? {} : process.env);
    void fetch(`${base}/api/v1/public/health-content/featured?country_code=${encodeURIComponent(country)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('unavailable'))))
      .then((body: { featured?: HealthArticle[] }) => setArticles((body.featured ?? []).slice(0, 4)))
      .catch(() => setArticles([]));
  }, [country]);

  if (!articles.length) {
    return null;
  }

  return (
    <Section
      title="Health content"
      seeAllHref="/blog"
      description="Articles and tips from our health library"
    >
      <ul className="mg-article-grid">
        {articles.map((article) => (
          <li key={article.id} className="mg-article-card">
            <Link href={`/blog/${encodeURIComponent(article.slug)}`} className="mg-article-link">
              <img
                src={article.image_url ?? healthArticleImage(article.slug, article.category)}
                alt=""
                className="mg-article-cover"
              />
              <div className="mg-article-link-body">
              <div className="mg-article-category">{article.category ?? 'Wellness'}</div>
              <h3 className="mg-article-title">{article.title}</h3>
              <p className="mg-article-summary">{article.summary}</p>
              <div className="mg-article-meta">
                <span className="mg-article-date">
                  {new Date(article.published_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
