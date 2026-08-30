import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { StoreHome } from './store-home';

const mockFetchDiscoverySearch = jest.fn();

jest.mock('@world-pharma/shell-web', () => ({
  useCountries: () => ({ countries: [{ iso_alpha2: 'XX' }], error: false }),
}));

jest.mock('./store-api', () => ({
  fetchCatalog: async () => ({ country_enabled: true, data: [] }),
  fetchCategories: async () => [],
}));

jest.mock('./discovery-api', () => ({
  fetchDiscoverySearch: (...args: unknown[]) => mockFetchDiscoverySearch(...args),
  DiscoveryApiError: class DiscoveryApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  DISCOVERY_TYPE_LABELS: {
    commerce: 'Products',
    help: 'Help',
    doctor: 'Doctors',
    lab: 'Labs',
    test: 'Tests',
    pharmacy: 'Pharmacies',
  },
}));

describe('StoreHome', () => {
  beforeEach(() => {
    mockFetchDiscoverySearch.mockReset();
    mockFetchDiscoverySearch.mockResolvedValue({
      country_enabled: true,
      discovery_enabled: true,
      country: 'XX',
      locale: 'en',
      query: '',
      types: ['commerce', 'help'],
      data: [],
      meta: { limit: 20, total: 0, next_cursor: null },
    });
  });

  it('renders store catalog without cart or checkout', async () => {
    render(
      <ThemeProvider defaultTheme="light">
        <StoreHome />
      </ThemeProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Store' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cart/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /checkout/i })).not.toBeInTheDocument();
  });

  it('retries discovery search from network error state', async () => {
    const { DiscoveryApiError } = jest.requireMock<{ DiscoveryApiError: new (message: string, status: number) => Error & { status: number } }>('./discovery-api');
    mockFetchDiscoverySearch
      .mockRejectedValueOnce(new DiscoveryApiError('offline', 0))
      .mockResolvedValueOnce({
        country_enabled: true,
        discovery_enabled: true,
        country: 'XX',
        locale: 'en',
        query: 'aspirin',
        types: ['commerce'],
        data: [{ type: 'commerce', id: '1', title: 'Aspirin', subtitle: null, slug: 'aspirin', href: '/p/aspirin' }],
        meta: { limit: 20, total: 1, next_cursor: null },
      });

    render(
      <ThemeProvider defaultTheme="light">
        <StoreHome />
      </ThemeProvider>,
    );

    fireEvent.change(screen.getByRole('textbox', { name: /search catalog/i }), {
      target: { value: 'aspirin' },
    });

    expect(await screen.findByRole('heading', { name: 'Connection problem' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(mockFetchDiscoverySearch).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByRole('heading', { name: 'Products' })).toBeInTheDocument();
  });
});
