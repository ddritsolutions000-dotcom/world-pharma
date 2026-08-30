import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { CartScreen } from './cart-page';

jest.mock('./commerce-api', () => ({
  fetchCart: async () => ({ items: [] }),
}));

describe('CartScreen', () => {
  it('asks unauthenticated users to sign in', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <SessionProvider>
          <CartScreen />
        </SessionProvider>
      </ThemeProvider>,
    );
    expect(screen.getByRole('heading', { name: /sign in required/i })).toBeInTheDocument();
  });
});
