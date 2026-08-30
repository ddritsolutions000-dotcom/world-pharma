import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { OrdersScreen } from './orders-page';

jest.mock('./commerce-api', () => ({
  fetchOrders: async () => ({ data: [] }),
}));

describe('OrdersScreen', () => {
  it('does not claim carrier tracking', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <SessionProvider>
          <OrdersScreen />
        </SessionProvider>
      </ThemeProvider>,
    );
    expect(screen.queryByText(/dhl/i)).not.toBeInTheDocument();
  });
});
