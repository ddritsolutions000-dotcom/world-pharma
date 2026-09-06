import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { ImagingAdminPanel } from './imaging-admin';

describe('ImagingAdminPanel', () => {
  it('shows imaging partner workspace without clinical editing', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <SessionProvider initialAudience="admin">
          <ImagingAdminPanel />
        </SessionProvider>
      </ThemeProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Imaging partners' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load imaging' })).toBeInTheDocument();
  });
});
