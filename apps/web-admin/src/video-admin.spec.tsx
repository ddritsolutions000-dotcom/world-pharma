import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { VideoAdminPanel } from './video-admin';

describe('VideoAdminPanel', () => {
  it('does not render for a non-admin session', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <SessionProvider initialAudience="customer">
          <VideoAdminPanel />
        </SessionProvider>
      </ThemeProvider>,
    );
    expect(screen.queryByText('Video sessions')).not.toBeInTheDocument();
  });

  it('renders read-only copy for admin', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <SessionProvider initialAudience="admin">
          <VideoAdminPanel />
        </SessionProvider>
      </ThemeProvider>,
    );
    expect(screen.getByText('Video sessions')).toBeInTheDocument();
    expect(screen.getByText(/No join, admit, or recording controls/i)).toBeInTheDocument();
  });
});
