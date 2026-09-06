import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { AdminShell } from './admin-shell';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: jest.fn(), replace }),
}));

function wrap(ui: React.ReactElement, initialAudience?: 'admin' | 'customer') {
  return render(
    <ThemeProvider defaultTheme="dark">
      <SessionProvider initialAudience={initialAudience}>{ui}</SessionProvider>
    </ThemeProvider>,
  );
}

describe('AdminShell', () => {
  beforeEach(() => {
    replace.mockClear();
  });

  it('redirects anonymous users to login', () => {
    wrap(<AdminShell />);
    expect(screen.getByText(/Opening Main Admin/i)).toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/login?next=%2F');
  });

  it('denies a customer audience', () => {
    wrap(<AdminShell />, 'customer');
    expect(screen.getByText(/You do not have access/i)).toBeInTheDocument();
  });

  it('shows the admin shell and hides permissioned nav', async () => {
    wrap(<AdminShell />, 'admin');
    expect(await screen.findByRole('heading', { name: 'Operations shell' })).toBeInTheDocument();
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Filter modules')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Inbox' })).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    const sidebar = screen.getByRole('navigation', { name: 'Admin modules' });
    expect(screen.queryByText('Operations')).not.toBeInTheDocument();
    expect(sidebar.textContent).not.toMatch(/\bCMS\b/);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(replace).toHaveBeenCalled();
  });
});
