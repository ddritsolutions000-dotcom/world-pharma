import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { StoreHome } from './store-home';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('./use-selected-country', () => ({
  isStoreMarket: (iso: string) => ['IN', 'AE', 'US'].includes(iso?.trim().toUpperCase()),
  useSelectedCountry: () => ({
    country: 'IN',
    countries: [{ iso_alpha2: 'IN', name: 'India' }],
    setCountry: jest.fn(),
    countryName: 'India',
    loading: false,
    hydrated: true,
    needsSelection: false,
    ready: true,
  }),
}));

jest.mock('./care-api', () => ({
  fetchPublicCareDoctors: async () => ({ doctors: [] }),
}));

jest.mock('./store-api', () => ({
  fetchCatalog: async () => ({
    country_enabled: true,
    data: [
      {
        id: '1',
        slug: 'demo-paracetamol',
        title: 'Paracetamol',
        brand: 'Demo',
        category: null,
        assets: [{ url: 'https://example.com/p.png', alt: 'Paracetamol' }],
        offers: [{ id: 'o1', currency: 'XXX', price: { sell_minor: '8900', list_minor: '12000' }, pack_size: '10 tablets' }],
      },
    ],
  }),
  fetchCategories: async () => [{ slug: 'pain-relief', name: 'Pain Relief' }],
  fetchBrands: async () => [{ id: 'b1', slug: 'demo', name: 'Demo Brand' }],
}));

describe('StoreHome', () => {
  it('renders World-Pharma homepage sections', async () => {
    render(
      <ThemeProvider defaultTheme="light">
        <SessionProvider>
          <StoreHome />
        </SessionProvider>
      </ThemeProvider>,
    );
    expect(await screen.findByText('Popular medicines')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /health for people everywhere/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Order medicines' })).toBeInTheDocument();
  });
});
