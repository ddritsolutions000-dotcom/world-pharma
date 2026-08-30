import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button';
import { ThemeProvider, useTheme } from './theme';

function Probe() {
  const { preference, setPreference, resolved } = useTheme();
  return (
    <div>
      <span>pref:{preference}</span>
      <span>resolved:{resolved}</span>
      <button type="button" onClick={() => setPreference('dark')}>
        Dark
      </button>
    </div>
  );
}

describe('ThemeProvider', () => {
  it('switches theme without throwing and keeps controls usable', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ThemeProvider defaultTheme="light">
        <Probe />
        <Button>Ok</Button>
      </ThemeProvider>,
    );
    expect(screen.getByText('pref:light')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dark' }));
    expect(screen.getByText('pref:dark')).toBeInTheDocument();
    expect(container.querySelector('#wp-theme')?.textContent).toContain('--wp-color-text-primary');
  });
});
