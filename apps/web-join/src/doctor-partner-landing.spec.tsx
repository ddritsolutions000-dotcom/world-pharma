import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { DoctorPartnerLanding } from './doctor-partner-landing';

jest.mock('next/navigation', () => ({
  usePathname: () => '/doctor',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

function wrap(ui: React.ReactElement) {
  return render(
    <ThemeProvider defaultTheme="light">
      <SessionProvider initialAudience="partner_applicant">{ui}</SessionProvider>
    </ThemeProvider>,
  );
}

describe('DoctorPartnerLanding', () => {
  it('renders doctor join CTA', () => {
    wrap(<DoctorPartnerLanding />);
    expect(screen.getByRole('heading', { name: /Doctor partners/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Join as a doctor/i })).toHaveAttribute('href', '/apply?type=DOCTOR');
  });
});
