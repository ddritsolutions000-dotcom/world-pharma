import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { CustomerLayout } from './customer-layout';

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('./use-selected-country', () => ({
  useSelectedCountry: () => ({
    country: 'XX',
    countries: [{ iso_alpha2: 'XX', name: 'Sandbox' }],
    setCountry: jest.fn(),
    countryName: 'Sandbox',
    loading: false,
    needsSelection: false,
    hydrated: true,
  }),
  countryDisplayName: (c: { iso_alpha2: string }) => c.iso_alpha2,
}));

jest.mock('./use-serviceability', () => ({
  useServiceability: () => ({
    postalCode: '',
    setPostalCode: jest.fn(),
    serviceability: null,
    loading: false,
    refresh: jest.fn(),
  }),
}));

jest.mock('./store-api', () => ({
  fetchCategories: async () => [{ slug: 'vitamins', name: 'Vitamins' }],
}));

jest.mock('./account-api', () => ({
  fetchNotificationInbox: async () => ({ ok: true, data: { data: [] } }),
}));

jest.mock('./commerce-api', () => ({
  fetchCart: async () => ({ items: [] }),
}));

function wrap(ui: React.ReactElement, authenticated = false) {
  return render(
    <ThemeProvider defaultTheme="light">
      <SessionProvider initialAudience={authenticated ? 'customer' : undefined}>{ui}</SessionProvider>
    </ThemeProvider>,
  );
}

describe('CustomerLayout', () => {
  it('renders primary navigation links', () => {
    wrap(
      <CustomerLayout>
        <p>Page content</p>
      </CustomerLayout>,
    );
    expect(screen.getAllByText('Medicines').length).toBeGreaterThan(0);
    expect(screen.getByText('Lab & doctors')).toBeInTheDocument();
    expect(screen.getByText('Lab Tests')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Cart' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Need Help' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Login' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign up' })).toBeInTheDocument();
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  it('shows sign out when authenticated', () => {
    wrap(
      <CustomerLayout>
        <p>Dashboard</p>
      </CustomerLayout>,
      true,
    );
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Inbox' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My account' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });
});
