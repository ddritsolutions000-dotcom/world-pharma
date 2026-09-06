import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { MarketplaceAdminPanel } from './marketplace-admin';

describe('MarketplaceAdminPanel', () => {
  it('shows eligibility workspace without storefront merchandising', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <SessionProvider initialAudience="admin">
          <MarketplaceAdminPanel />
        </SessionProvider>
      </ThemeProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Marketplace eligibility' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load eligibility' })).toBeInTheDocument();
  });
});
