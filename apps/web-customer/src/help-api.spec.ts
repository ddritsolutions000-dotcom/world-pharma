import { fetchHelpArticle, fetchHelpArticles, fetchHelpCategories, HelpApiError } from './help-api';

describe('help-api', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('maps article list rows to summaries', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            contentItemId: 'abc',
            slug: 'test',
            title: 'Test',
            contentType: 'FAQ',
            categorySlug: 'general',
            publishedAt: '2026-08-29T10:00:00.000Z',
          },
        ],
      }),
    });
    const body = await fetchHelpArticles('XX', 'en');
    expect(body.data[0]?.content_type).toBe('FAQ');
    expect(body.data[0]?.category_slug).toBe('general');
  });

  it('returns null for 404 article', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'not_found' }),
    });
    const article = await fetchHelpArticle('XX', 'missing');
    expect(article).toBeNull();
  });

  it('throws HelpApiError on network failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await expect(fetchHelpCategories('XX')).rejects.toBeInstanceOf(HelpApiError);
  });
});
