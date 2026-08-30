import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { VendorCatalogPanel } from './vendor-catalog';

describe('VendorCatalogPanel', () => {
  it('does not include orders or settlement', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <VendorCatalogPanel />
      </ThemeProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Vendor catalog' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /orders|payouts/i })).not.toBeInTheDocument();
  });
});
