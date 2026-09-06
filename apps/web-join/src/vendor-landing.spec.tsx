import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { VendorLanding } from './vendor-landing';

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

function wrap(ui: React.ReactElement) {
  return render(
    <ThemeProvider defaultTheme="light">
      <SessionProvider initialAudience="partner_applicant">{ui}</SessionProvider>
    </ThemeProvider>,
  );
}

describe('VendorLanding', () => {
  it('renders hero and join CTA', () => {
    wrap(<VendorLanding />);
    expect(screen.getByRole('heading', { name: /Partner with World Pharma/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Start application/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Track my application/i })).toBeInTheDocument();
  });

  it('disclaims fabricated legal or commission guarantees', () => {
    wrap(<VendorLanding />);
    const raw = document.body.textContent?.toLowerCase() ?? '';
    expect(raw.includes('marketplace')).toBe(true);
    expect(raw.includes('guaranteed licence')).toBe(false);
    expect(raw.includes('500+')).toBe(false);
    expect(raw.includes('partner slots')).toBe(false);
  });

  it('links apply flow to /apply', () => {
    wrap(<VendorLanding />);
    const links = screen.getAllByRole('link', { name: /Start application/i });
    expect(links.some((link) => link.getAttribute('href') === '/apply')).toBe(true);
  });
});
