import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { CartScreen } from './cart-page';
import { GUEST_CART_KEY } from './guest-cart';

jest.mock('./commerce-api', () => ({
  fetchCart: async () => ({ items: [] }),
  notifyCartChanged: () => undefined,
  removeCartItem: async () => ({ items: [] }),
  updateCartItem: async () => ({ items: [] }),
}));

jest.mock('./use-selected-country', () => ({
  useSelectedCountry: () => ({
    country: 'IN',
    countries: [],
    setCountry: () => undefined,
    countryName: 'India',
    loading: false,
  }),
}));

describe('CartScreen', () => {
  beforeEach(() => {
    window.localStorage.removeItem(GUEST_CART_KEY);
  });

  it('shows an empty guest cart without forcing sign-in', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <SessionProvider>
          <CartScreen />
        </SessionProvider>
      </ThemeProvider>,
    );
    expect(screen.getByRole('heading', { name: /your cart is empty/i })).toBeInTheDocument();
  });

  it('lists guest cart lines for anonymous shoppers', () => {
    window.localStorage.setItem(
      GUEST_CART_KEY,
      JSON.stringify([
        {
          offer_id: 'off-1',
          qty: 2,
          title: 'Demo syrup',
          currency: 'INR',
          sell_minor: '1000',
          country: 'IN',
        },
      ]),
    );
    render(
      <ThemeProvider defaultTheme="light">
        <SessionProvider>
          <CartScreen />
        </SessionProvider>
      </ThemeProvider>,
    );
    expect(screen.getByText('Demo syrup')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in to checkout/i })).toBeInTheDocument();
  });
});
