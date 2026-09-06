import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { CheckoutScreen } from './checkout-page';

jest.mock('./account-api', () => ({
  fetchAddresses: async () => ({
    ok: true,
    data: [{ id: 'addr-1', recipient_name: 'Demo User', line1: '1 Main St', city: 'Demo City', is_default: true }],
  }),
}));

jest.mock('./guest-cart-merge', () => ({
  mergeGuestCartForCountry: async () => ({ merged: 0, skipped: 0, conflict: false }),
}));

jest.mock('./guest-cart', () => ({
  readGuestCart: () => [],
}));

jest.mock('./commerce-api', () => ({
  startCheckout: async () => ({
    id: 's1',
    status: 'READY_FOR_PAYMENT',
    payment_message: 'Payment is not available in this phase.',
    quote: { total_minor: '200', currency: 'XXX', shipping_status: 'UNAVAILABLE', tax_status: 'UNKNOWN' },
  }),
  attachCheckoutAddress: async () => ({
    id: 's1',
    status: 'READY_FOR_PAYMENT',
    address: { id: 'addr-1', recipient_name: 'Demo User', line1: '1 Main St', city: 'Demo City' },
    quote: { total_minor: '200', currency: 'XXX', shipping_status: 'UNAVAILABLE', tax_status: 'UNKNOWN' },
  }),
  quoteCheckout: async () => ({
    id: 's1',
    status: 'READY_FOR_PAYMENT',
    address: { id: 'addr-1' },
    quote: { total_minor: '200', currency: 'XXX', shipping_status: 'UNAVAILABLE', tax_status: 'UNKNOWN' },
  }),
  applyCheckoutPromo: async () => ({}),
  removeCheckoutPromo: async () => ({}),
  createOrderFromPayment: async () => ({ order_number: 'WP-TEST-1' }),
  notifyCartChanged: jest.fn(),
  payCheckout: async () => {
    throw Object.assign(new Error('Payment is not available in this phase.'), { code: 'PAYMENTS_DISABLED' });
  },
  fetchPaymentIntent: async () => ({ status: 'CREATED', sandbox: true }),
  fetchPaymentMethods: async () => ({ methods: [{ family: 'CARD', label: 'Credit / Debit Card' }] }),
}));

jest.mock('./use-selected-country', () => ({
  useSelectedCountry: () => ({ country: 'XX', countryName: 'Sandbox', countries: [], setCountry: jest.fn(), loading: false }),
}));

describe('CheckoutScreen', () => {
  it('does not claim payment succeeded', async () => {
    render(
      <ThemeProvider defaultTheme="light">
        <SessionProvider initialAudience="customer">
          <CheckoutScreen />
        </SessionProvider>
      </ThemeProvider>,
    );
    expect(await screen.findByRole('button', { name: /pay with card|pay securely|place order/i })).toBeInTheDocument();
    expect(screen.queryByText(/order placed successfully/i)).not.toBeInTheDocument();
  });
});
