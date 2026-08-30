import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionProvider, useSession } from './session-context';

function Probe() {
  const { session, expire } = useSession();
  return (
    <div>
      <span>status:{session.status}</span>
      <span>audience:{session.audience ?? 'none'}</span>
      <button type="button" onClick={() => expire()}>
        Expire
      </button>
    </div>
  );
}

describe('SessionProvider', () => {
  it('hydrates test audience and can expire an authenticated session', async () => {
    const user = userEvent.setup();
    render(
      <SessionProvider initialAudience="admin">
        <Probe />
      </SessionProvider>,
    );
    expect(screen.getByText('status:authenticated')).toBeInTheDocument();
    expect(screen.getByText('audience:admin')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Expire' }));
    expect(screen.getByText('status:expired')).toBeInTheDocument();
  });
});
