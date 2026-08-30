import { apiBaseUrl } from '@world-pharma/shell-core';

const base = () => apiBaseUrl(typeof process === 'undefined' ? {} : process.env);

export class HelpApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type HelpArticleSummary = {
  id: string;
  slug: string;
  title: string;
  content_type: string;
  category_slug: string | null;
  published_at: string;
};

export type HelpArticleDetail = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  content_type: string;
  category_slug: string | null;
  locale: string;
  version: number;
  published_at: string;
};

export type HelpBanner = {
  id: string;
  slug: string;
  title: string;
  body: string;
};

type SearchRow = {
  contentItemId: string;
  slug: string;
  title: string;
  contentType: string;
  categorySlug: string | null;
  publishedAt: string;
};

function mapSummary(row: SearchRow): HelpArticleSummary {
  return {
    id: row.contentItemId,
    slug: row.slug,
    title: row.title,
    content_type: row.contentType,
    category_slug: row.categorySlug,
    published_at: row.publishedAt,
  };
}

async function helpCall<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, { headers: { Accept: 'application/json' } });
  } catch {
    throw new HelpApiError('network_failure', 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new HelpApiError((body as { detail?: string }).detail ?? 'request_failed', res.status);
  }
  return body as T;
}

function scope(countryCode: string, locale: string) {
  const params = new URLSearchParams({ country_code: countryCode, locale });
  return params.toString();
}

export function fetchHelpCategories(countryCode: string, locale = 'en') {
  return helpCall<{ data: string[] }>(`/api/v1/help/categories?${scope(countryCode, locale)}`);
}

export function fetchHelpArticles(
  countryCode: string,
  locale = 'en',
  filters?: { category_slug?: string; content_type?: string },
) {
  const params = new URLSearchParams({ country_code: countryCode, locale });
  if (filters?.category_slug) {
    params.set('category_slug', filters.category_slug);
  }
  if (filters?.content_type) {
    params.set('content_type', filters.content_type);
  }
  return helpCall<{ data: SearchRow[] }>(`/api/v1/help/articles?${params}`).then((body) => ({
    data: (body.data ?? []).map(mapSummary),
  }));
}

export async function fetchHelpArticle(countryCode: string, slug: string, locale = 'en') {
  try {
    return await helpCall<HelpArticleDetail>(
      `/api/v1/help/articles/${encodeURIComponent(slug)}?${scope(countryCode, locale)}`,
    );
  } catch (err) {
    if (err instanceof HelpApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

export function fetchHelpSearch(countryCode: string, query: string, locale = 'en') {
  const params = new URLSearchParams({ country_code: countryCode, locale, q: query });
  return helpCall<{ data: SearchRow[] }>(`/api/v1/help/search?${params}`).then((body) => ({
    data: (body.data ?? []).map(mapSummary),
  }));
}

export function fetchHelpBanners(countryCode: string, locale = 'en') {
  return helpCall<{ data: Array<{ contentItemId: string; slug: string; title: string; body: string }> }>(
    `/api/v1/help/banners?${scope(countryCode, locale)}`,
  ).then((body) => ({
    data: (body.data ?? []).map((row) => ({
      id: row.contentItemId,
      slug: row.slug,
      title: row.title,
      body: row.body,
    })),
  }));
}
