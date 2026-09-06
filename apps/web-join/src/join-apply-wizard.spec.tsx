import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { JoinApplyWizard } from './join-apply-wizard';

jest.mock('next/navigation', () => ({
  usePathname: () => '/apply',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

const mockUseSession = jest.fn();

jest.mock('@world-pharma/shell-web', () => {
  const actual = jest.requireActual('@world-pharma/shell-web');
  return {
    ...actual,
    useSession: () => mockUseSession(),
  };
});

function mockSession(overrides: Partial<ReturnType<typeof mockUseSession>> = {}) {
  mockUseSession.mockReturnValue({
    getAccessToken: () => 'test-token',
    session: {
      audience: 'partner_applicant',
      permissions: [],
      status: 'authenticated',
    },
    signInWithOtp: jest.fn(),
    signOut: jest.fn(),
    ...overrides,
  });
}

function wrap(ui: React.ReactElement) {
  return render(
    <ThemeProvider defaultTheme="light">
      <SessionProvider initialAudience="partner_applicant">{ui}</SessionProvider>
    </ThemeProvider>,
  );
}

describe('JoinApplyWizard', () => {
  beforeEach(() => {
    mockSession();
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/api/v1/countries')) {
        return {
          ok: true,
          json: async () => ({
            data: [{ iso_alpha2: 'XX', name: { en: 'Sandbox' } }],
          }),
        };
      }
      if (url.includes('/join/public')) {
        return {
          ok: true,
          json: async () => ({
            public: true,
            country_code: 'XX',
            partner_types: [
              {
                code: 'VENDOR',
                enabled: true,
                join_public: true,
                required_documents: ['BUSINESS_REGISTRATION'],
                required_fields: ['legal_name'],
              },
            ],
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
  });

  it('renders country step and advances to partner type', async () => {
    const user = userEvent.setup();
    wrap(<JoinApplyWizard />);
    expect(await screen.findByRole('heading', { name: /Select country/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: /Partner type/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Marketplace vendor seller/i })).toBeInTheDocument();
  });

  it('shows sign-in step for anonymous users', async () => {
    mockSession({
      getAccessToken: () => null,
      session: { audience: 'partner_applicant', permissions: [], status: 'anonymous' },
    });
    const user = userEvent.setup();
    wrap(<JoinApplyWizard />);
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: /Marketplace vendor seller/i }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: '3. Sign in' })).toBeInTheDocument();
  });

  it('does not expose document secrets in UI copy', async () => {
    wrap(<JoinApplyWizard />);
    await screen.findByRole('heading', { name: /Apply as partner/i });
    const raw = document.body.textContent?.toLowerCase() ?? '';
    expect(raw.includes('sk_live')).toBe(false);
    expect(raw.includes('base64')).toBe(false);
  });
});
