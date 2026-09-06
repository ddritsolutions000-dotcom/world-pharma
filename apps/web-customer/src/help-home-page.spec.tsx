import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { HelpHomeScreen } from './help-home-page';
import * as helpApi from './help-api';

jest.mock('@world-pharma/shell-web', () => ({
  useCountries: () => ({ countries: [{ iso_alpha2: 'XX' }], error: null }),
}));

jest.mock('./help-api', () => ({
  ...jest.requireActual('./help-api'),
  fetchHelpCategories: jest.fn(),
  fetchHelpArticles: jest.fn(),
  fetchHelpBanners: jest.fn(),
  fetchHelpArticle: jest.fn(),
  fetchHelpSearch: jest.fn(),
}));

const mockCategories = helpApi.fetchHelpCategories as jest.MockedFunction<typeof helpApi.fetchHelpCategories>;
const mockArticles = helpApi.fetchHelpArticles as jest.MockedFunction<typeof helpApi.fetchHelpArticles>;
const mockBanners = helpApi.fetchHelpBanners as jest.MockedFunction<typeof helpApi.fetchHelpBanners>;
const mockArticle = helpApi.fetchHelpArticle as jest.MockedFunction<typeof helpApi.fetchHelpArticle>;

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider defaultTheme="light">{ui}</ThemeProvider>);
}

describe('HelpHomeScreen', () => {
  beforeEach(() => {
    mockCategories.mockResolvedValue({ data: ['getting-started'] });
    mockArticles.mockResolvedValue({
      data: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          slug: 'welcome',
          title: 'Welcome guide',
          content_type: 'ARTICLE',
          category_slug: 'getting-started',
          published_at: '2026-08-29T10:00:00.000Z',
        },
      ],
    });
    mockBanners.mockResolvedValue({ data: [] });
  });

  it('renders help home with categories and articles', async () => {
    wrap(<HelpHomeScreen />);
    expect(await screen.findByRole('heading', { name: 'Help Center' })).toBeInTheDocument();
    expect((await screen.findAllByText(/getting started/i)).length).toBeGreaterThan(0);
    expect(await screen.findByText('Welcome guide')).toBeInTheDocument();
  });

  it('shows empty state when no categories', async () => {
    mockCategories.mockResolvedValueOnce({ data: [] });
    mockArticles.mockResolvedValueOnce({ data: [] });
    wrap(<HelpHomeScreen />);
    expect(await screen.findByText('No categories yet')).toBeInTheDocument();
  });

  it('shows network error and retry', async () => {
    mockCategories.mockRejectedValueOnce(new helpApi.HelpApiError('network_failure', 0));
    wrap(<HelpHomeScreen />);
    expect(await screen.findByText(/Connection problem/i)).toBeInTheDocument();
  });
});

describe('HelpArticleScreen', () => {
  it('shows not found for unpublished article', async () => {
    mockArticle.mockResolvedValueOnce(null);
    const { HelpArticleScreen } = await import('./help-article-page');
    wrap(<HelpArticleScreen articleSlug="missing" />);
    expect(await screen.findByText('Article not found')).toBeInTheDocument();
  });
});
