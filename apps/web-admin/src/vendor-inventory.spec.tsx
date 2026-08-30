import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { VendorInventoryPanel } from './vendor-inventory';

describe('VendorInventoryPanel', () => {
  it('shows vendor-owned inventory workspace only', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <SessionProvider initialAudience="admin">
          <VendorInventoryPanel />
        </SessionProvider>
      </ThemeProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Vendor inventory' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /settlement|payout/i })).not.toBeInTheDocument();
  });
});
