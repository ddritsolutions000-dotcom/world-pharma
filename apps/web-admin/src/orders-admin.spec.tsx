import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { OrdersAdminPanel } from './orders-admin';

describe('OrdersAdminPanel', () => {
  it('does not mention DHL or settlement payout', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <SessionProvider initialAudience="admin">
          <OrdersAdminPanel />
        </SessionProvider>
      </ThemeProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Orders' })).toBeInTheDocument();
    expect(screen.queryByText(/dhl|fedex|ups/i)).not.toBeInTheDocument();
  });
});
