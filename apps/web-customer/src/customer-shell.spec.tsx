import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { CustomerShell } from './customer-shell';

jest.mock('./store-api', () => ({
  fetchCatalog: async () => ({ country_enabled: false, data: [] }),
  fetchCategories: async () => [],
}));

function wrap(ui: React.ReactElement, authenticated = false) {
  return render(
    <ThemeProvider defaultTheme="light">
      <SessionProvider initialAudience={authenticated ? 'customer' : undefined}>{ui}</SessionProvider>
    </ThemeProvider>,
  );
}

describe('CustomerShell', () => {
  it('renders a public shell without product journeys', () => {
    wrap(<CustomerShell apiReachable={true} countryLabel="not selected" />, true);
    expect(screen.getByRole('heading', { name: 'Customer workspace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cart' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pay now|complete payment/i })).not.toBeInTheDocument();
  });

  it('shows OTP sign-in when anonymous', () => {
    wrap(<CustomerShell apiReachable={true} countryLabel="XX" />);
    expect(screen.getByRole('button', { name: /send otp/i })).toBeInTheDocument();
  });

  it('can simulate session expiry', async () => {
    const user = userEvent.setup();
    wrap(<CustomerShell apiReachable={true} countryLabel="XX" />, true);
    expect(screen.getByText(/Session: authenticated/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Simulate session expiry' }));
    expect(screen.getByText(/Session expired/i)).toBeInTheDocument();
  });

  it('shows a network error without crashing', () => {
    wrap(<CustomerShell apiReachable={false} countryLabel="unavailable" />, true);
    expect(screen.getByText(/Connection problem/i)).toBeInTheDocument();
  });
});
