import type { MetadataRoute } from 'next';
import { fetchHelpArticles } from '../src/help-api';
import { loadPublishedSeo } from '../src/load-published-seo';

const DEFAULT_COUNTRY = process.env.NEXT_PUBLIC_DEFAULT_COUNTRY ?? 'IN';
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

const STATIC_PATHS = [
  '/',
  '/help',
  '/faq',
  '/blog',
  '/doctors',
  '/lab',
  '/about',
  '/contact',
  '/partners',
  '/careers',
  '/legal/privacy',
  '/legal/terms',
  '/legal/returns',
  '/deals',
  '/categories',
  '/services',
];

const LEGAL_PATH: Record<string, string> = {
  'privacy-policy': '/legal/privacy',
  'terms-and-conditions': '/legal/terms',
  'return-policy': '/legal/returns',
  'about-worldpharma': '/about',
  'careers-at-worldpharma': '/careers',
  'contact-worldpharma': '/contact',
  'partners-worldpharma': '/partners',
};

function cmsPath(row: { slug: string; content_type: string; category_slug: string | null }): string | null {
  if (LEGAL_PATH[row.slug]) {
    return LEGAL_PATH[row.slug];
  }
  if (row.content_type === 'LANDING') {
    return `/l/${row.slug}`;
  }
  if (row.content_type === 'ARTICLE' && (row.category_slug === 'blog' || row.category_slug === 'wellness')) {
    return `/blog/${row.slug}`;
  }
  if (row.content_type === 'FAQ' || row.content_type === 'ARTICLE' || row.content_type === 'KB') {
    return `/help/a/${row.slug}`;
  }
  return null;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const seo = await loadPublishedSeo().catch(() => ({ noindexPaths: [] as string[] }));
  const blocked = new Set(seo.noindexPaths ?? []);
  let cms: MetadataRoute.Sitemap = [];
  try {
    const articles = await fetchHelpArticles(DEFAULT_COUNTRY);
    const seen = new Set<string>();
    cms = articles.data
      .map((row) => {
        const path = cmsPath(row);
        if (!path || blocked.has(path) || seen.has(path)) {
          return null;
        }
        seen.add(path);
        return { url: `${SITE}${path}`, lastModified: row.published_at };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
  } catch {
    cms = [];
  }
  return [
    ...STATIC_PATHS.filter((path) => !blocked.has(path)).map((path) => ({ url: `${SITE}${path}` })),
    ...cms,
  ];
}
