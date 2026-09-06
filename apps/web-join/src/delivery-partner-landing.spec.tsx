import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { DeliveryPartnerLanding } from './delivery-partner-landing';

jest.mock('next/navigation', () => ({
  usePathname: () => '/delivery',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

function wrap(ui: React.ReactElement) {
  return render(
    <ThemeProvider defaultTheme="light">
      <SessionProvider initialAudience="partner_applicant">{ui}</SessionProvider>
    </ThemeProvider>,
  );
}

describe('DeliveryPartnerLanding', () => {
  it('renders delivery join CTA', () => {
    wrap(<DeliveryPartnerLanding />);
    expect(screen.getByRole('heading', { name: /Delivery partners/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Join as delivery partner/i })).toHaveAttribute(
      'href',
      '/apply?type=DELIVERY_PARTNER',
    );
  });
});
