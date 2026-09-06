import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { InventoryAdminPanel } from './inventory-admin';

describe('InventoryAdminPanel', () => {
  it('shows inventory workspace without checkout or carriers', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <SessionProvider initialAudience="admin">
          <InventoryAdminPanel />
        </SessionProvider>
      </ThemeProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Inventory' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load inventory' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /checkout|pay|dhl/i })).not.toBeInTheDocument();
  });
});
