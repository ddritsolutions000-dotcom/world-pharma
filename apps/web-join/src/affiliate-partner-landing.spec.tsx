import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { AffiliatePartnerLanding } from './affiliate-partner-landing';

jest.mock('next/navigation', () => ({
  usePathname: () => '/affiliate',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

function wrap(ui: React.ReactElement) {
  return render(
    <ThemeProvider defaultTheme="light">
      <SessionProvider initialAudience="partner_applicant">{ui}</SessionProvider>
    </ThemeProvider>,
  );
}

describe('AffiliatePartnerLanding', () => {
  it('renders affiliate join CTA', () => {
    wrap(<AffiliatePartnerLanding />);
    expect(screen.getByRole('heading', { name: /Affiliate program/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Apply as affiliate/i })).toHaveAttribute('href', '/apply?type=AFFILIATE');
  });
});
