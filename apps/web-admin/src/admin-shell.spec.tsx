import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { AdminShell } from './admin-shell';

function wrap(ui: React.ReactElement, initialAudience?: 'admin' | 'customer') {
  return render(
    <ThemeProvider defaultTheme="light">
      <SessionProvider initialAudience={initialAudience}>{ui}</SessionProvider>
    </ThemeProvider>,
  );
}

describe('AdminShell', () => {
  it('does not expose admin chrome while anonymous', () => {
    wrap(<AdminShell />);
    expect(screen.getByRole('heading', { name: 'Admin sign-in' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Operations shell' })).not.toBeInTheDocument();
  });

  it('denies a customer audience', () => {
    wrap(<AdminShell />, 'customer');
    expect(screen.getByText(/You do not have access/i)).toBeInTheDocument();
  });

  it('shows the admin shell and hides permissioned nav', async () => {
    wrap(<AdminShell />, 'admin');
    expect(screen.getByRole('heading', { name: 'Operations shell' })).toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.queryByText('CMS')).not.toBeInTheDocument();
    expect(screen.queryByText('Operations')).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Expire session' }));
    expect(screen.getByText(/Session expired/i)).toBeInTheDocument();
  });
});
