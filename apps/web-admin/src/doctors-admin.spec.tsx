import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { DoctorsAdminPanel } from './doctors-admin';

describe('DoctorsAdminPanel', () => {
  it('does not render for a non-admin session', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <SessionProvider initialAudience="customer">
          <DoctorsAdminPanel />
        </SessionProvider>
      </ThemeProvider>,
    );
    expect(screen.queryByText('Doctor verification')).not.toBeInTheDocument();
  });
});
