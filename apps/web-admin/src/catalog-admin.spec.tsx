import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { CatalogAdminPanel } from './catalog-admin';

describe('CatalogAdminPanel', () => {
  it('shows catalog management copy without ERP modules', () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <SessionProvider initialAudience="admin">
          <CatalogAdminPanel />
        </SessionProvider>
      </ThemeProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Catalog' })).toBeInTheDocument();
    expect(screen.getByLabelText('Search catalog')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /warehouse|finance|erp/i })).not.toBeInTheDocument();
  });
});
