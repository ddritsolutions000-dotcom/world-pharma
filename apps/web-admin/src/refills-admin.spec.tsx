import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { RefillsAdminPanel } from './refills-admin';

describe('RefillsAdminPanel', () => {
  it('shows refill queue without medication lines', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <SessionProvider initialAudience="admin">
          <RefillsAdminPanel />
        </SessionProvider>
      </ThemeProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Refill requests' })).toBeInTheDocument();
    expect(screen.queryByText(/medication line/i)).not.toBeInTheDocument();
  });
});
