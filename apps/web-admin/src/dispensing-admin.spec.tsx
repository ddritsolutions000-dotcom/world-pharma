import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { DispensingAdminPanel } from './dispensing-admin';

describe('DispensingAdminPanel', () => {
  it('shows dispensing workspace without medication lines', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <SessionProvider initialAudience="admin">
          <DispensingAdminPanel />
        </SessionProvider>
      </ThemeProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Dispensing cases' })).toBeInTheDocument();
    expect(screen.queryByText(/dispense this SKU/i)).not.toBeInTheDocument();
  });
});
