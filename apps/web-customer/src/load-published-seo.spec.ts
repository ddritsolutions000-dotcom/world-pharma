import { DEFAULT_SITE_SEO } from '@world-pharma/shared/site-chrome';
import { loadPublishedSeo } from './load-published-seo';

jest.mock('./help-api', () => ({
  fetchHelpArticle: jest.fn(),
}));

const { fetchHelpArticle } = jest.requireMock('./help-api') as {
  fetchHelpArticle: jest.Mock;
};

describe('loadPublishedSeo', () => {
  beforeEach(() => {
    fetchHelpArticle.mockReset();
  });

  it('returns CMS SEO when help article is published', async () => {
    fetchHelpArticle.mockResolvedValue({
      body: JSON.stringify({ siteTitle: 'Custom Store', defaultDescription: 'Desc' }),
    });
    const seo = await loadPublishedSeo();
    expect(seo.siteTitle).toBe('Custom Store');
  });

  it('falls back to defaults when CMS fetch fails', async () => {
    fetchHelpArticle.mockRejectedValue(new Error('network'));
    const seo = await loadPublishedSeo();
    expect(seo.siteTitle).toBe(DEFAULT_SITE_SEO.siteTitle);
  });
});
