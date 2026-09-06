import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { LabPartnerLanding } from './lab-partner-landing';

jest.mock('next/navigation', () => ({
  usePathname: () => '/lab',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

function wrap(ui: React.ReactElement) {
  return render(
    <ThemeProvider defaultTheme="light">
      <SessionProvider initialAudience="partner_applicant">{ui}</SessionProvider>
    </ThemeProvider>,
  );
}

describe('LabPartnerLanding', () => {
  it('renders lab join CTA', () => {
    wrap(<LabPartnerLanding />);
    expect(screen.getByRole('heading', { name: /Laboratory partners/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Join as a lab/i })).toHaveAttribute('href', '/apply?type=LAB');
  });
});
