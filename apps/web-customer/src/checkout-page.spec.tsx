import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { CheckoutScreen } from './checkout-page';

jest.mock('./commerce-api', () => ({
  startCheckout: async () => ({
    id: 's1',
    status: 'READY_FOR_PAYMENT',
    payment_message: 'Payment is not available in this phase.',
    quote: { total_minor: '200', currency: 'XXX', shipping_status: 'UNAVAILABLE', tax_status: 'UNKNOWN' },
  }),
  payCheckout: async () => {
    throw Object.assign(new Error('Payment is not available in this phase.'), { code: 'PAYMENTS_DISABLED' });
  },
  fetchPaymentIntent: async () => ({ status: 'CREATED', sandbox: true }),
}));

describe('CheckoutScreen', () => {
  it('does not claim payment succeeded', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <SessionProvider>
          <CheckoutScreen />
        </SessionProvider>
      </ThemeProvider>,
    );
    expect(screen.queryByText(/payment successful/i)).not.toBeInTheDocument();
  });
});
