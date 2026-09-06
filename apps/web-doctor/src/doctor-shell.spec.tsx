import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { DoctorShell } from './doctor-shell';

jest.mock('./doctor-api', () => ({
  fetchNotificationInbox: async () => ({ ok: true, status: 200, data: { data: [] } }),
}));

function wrap(ui: React.ReactElement, initialAudience?: 'admin' | 'customer' | 'doctor') {
  return render(
    <ThemeProvider defaultTheme="light">
      <SessionProvider initialAudience={initialAudience}>{ui}</SessionProvider>
    </ThemeProvider>,
  );
}

describe('DoctorShell', () => {
  it('does not expose doctor chrome while anonymous', () => {
    wrap(<DoctorShell title="Home" description="Foundation workspace" />);
    expect(screen.getByRole('heading', { name: 'Doctor portal' })).toBeInTheDocument();
  });

  it('denies a customer audience', () => {
    wrap(<DoctorShell title="Home" description="Foundation workspace" />, 'customer');
    expect(screen.getByText(/You do not have access/i)).toBeInTheDocument();
  });

  it('exposes an inbox entry for an authenticated doctor', () => {
    wrap(<DoctorShell title="Home" description="Foundation workspace" />, 'doctor');
    expect(screen.getByRole('button', { name: 'Inbox' })).toBeInTheDocument();
  });
});
