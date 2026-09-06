import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { JoinStatusPage } from './join-status-page';

jest.mock('next/navigation', () => ({
  usePathname: () => '/status',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const mockUseSession = jest.fn();

jest.mock('@world-pharma/shell-web', () => {
  const actual = jest.requireActual('@world-pharma/shell-web');
  return {
    ...actual,
    useSession: () => mockUseSession(),
  };
});

describe('JoinStatusPage', () => {
  it('prompts anonymous users to sign in', () => {
    mockUseSession.mockReturnValue({
      getAccessToken: () => null,
      session: { audience: 'partner_applicant', status: 'anonymous', permissions: [] },
      signOut: jest.fn(),
    });
    render(
      <ThemeProvider defaultTheme="light">
        <SessionProvider initialAudience="partner_applicant">
          <JoinStatusPage />
        </SessionProvider>
      </ThemeProvider>,
    );
    expect(screen.getByRole('heading', { name: /Track application/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send OTP/i })).toBeInTheDocument();
  });

  it('lists authenticated applicant applications', async () => {
    mockUseSession.mockReturnValue({
      getAccessToken: () => 'token',
      session: { audience: 'partner_applicant', status: 'authenticated', permissions: [] },
      signOut: jest.fn(),
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'app-1', status: 'UNDER_REVIEW', partner_type_code: 'VENDOR' }],
      }),
    });
    render(
      <ThemeProvider defaultTheme="light">
        <SessionProvider initialAudience="partner_applicant">
          <JoinStatusPage />
        </SessionProvider>
      </ThemeProvider>,
    );
    expect(await screen.findByText(/VENDOR/i)).toBeInTheDocument();
    expect(screen.queryByText(/content_base64/i)).not.toBeInTheDocument();
  });
});
