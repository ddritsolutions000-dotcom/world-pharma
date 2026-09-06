import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { DeliveryAdminPanel } from './delivery-admin';

describe('DeliveryAdminPanel', () => {
  it('shows assign workspace without live carriers', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <SessionProvider initialAudience="admin">
          <DeliveryAdminPanel />
        </SessionProvider>
      </ThemeProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Delivery assign' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assign job' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /checkout|pay/i })).not.toBeInTheDocument();
  });
});
