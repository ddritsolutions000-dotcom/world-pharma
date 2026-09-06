import { parseSiteSeo, SITE_SEO_SLUG, DEFAULT_SITE_SEO } from '@world-pharma/shared/site-chrome';
import { fetchHelpArticle } from '../src/help-api';

const DEFAULT_COUNTRY = process.env.NEXT_PUBLIC_DEFAULT_COUNTRY ?? 'IN';

export async function loadPublishedSeo() {
  try {
    const article = await fetchHelpArticle(DEFAULT_COUNTRY, SITE_SEO_SLUG).catch(() => null);
    return parseSiteSeo(article?.body);
  } catch {
    return DEFAULT_SITE_SEO;
  }
}
