import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { PharmacyPartnerLanding } from './pharmacy-partner-landing';

jest.mock('next/navigation', () => ({
  usePathname: () => '/pharmacy',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

function wrap(ui: React.ReactElement) {
  return render(
    <ThemeProvider defaultTheme="light">
      <SessionProvider initialAudience="partner_applicant">{ui}</SessionProvider>
    </ThemeProvider>,
  );
}

describe('PharmacyPartnerLanding', () => {
  it('renders pharmacy join CTA', () => {
    wrap(<PharmacyPartnerLanding />);
    expect(screen.getByRole('heading', { name: /Pharmacy operators/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Apply as pharmacy operator/i })).toHaveAttribute(
      'href',
      '/apply?type=PHARMACY',
    );
  });
});
