import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { AdminCommandPalette } from './admin-command-palette';
import { ADMIN_NAV } from './nav';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
}));

function wrap(ui: React.ReactElement) {
  return render(
    <ThemeProvider defaultTheme="light">
      <SessionProvider initialAudience="admin">{ui}</SessionProvider>
    </ThemeProvider>,
  );
}

describe('AdminCommandPalette', () => {
  beforeEach(() => {
    push.mockClear();
  });

  it('filters modules and navigates', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }) as unknown as typeof fetch;
    wrap(<AdminCommandPalette items={ADMIN_NAV} open onClose={jest.fn()} />);
    await user.type(screen.getByLabelText(/Search modules and entities/i), 'cata');
    expect(screen.getByText('Catalog')).toBeInTheDocument();
    await user.click(screen.getByText('Catalog'));
    expect(push).toHaveBeenCalledWith('/catalog');
  });
});
