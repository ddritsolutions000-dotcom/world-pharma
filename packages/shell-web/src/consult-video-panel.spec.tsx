import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { ConsultVideoPanel } from './consult-video-panel';

const apiCallMock = jest.fn();

jest.mock('@world-pharma/shell-core', () => {
  const actual = jest.requireActual('@world-pharma/shell-core');
  return {
    ...actual,
    apiCall: (...args: unknown[]) => apiCallMock(...args),
  };
});

describe('ConsultVideoPanel', () => {
  beforeEach(() => {
    apiCallMock.mockReset();
    apiCallMock.mockResolvedValue({ ok: false, status: 404, error: 'Not found', kind: 'error' });
  });

  it('shows online-only hint for in-person appointments', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <ConsultVideoPanel
          appointmentId="appt-1"
          appointmentType="IN_PERSON"
          role="customer"
          token="test-token"
        />
      </ThemeProvider>,
    );
    expect(screen.getByText(/online appointments only/i)).toBeInTheDocument();
  });

  it('never renders join token in the DOM after mock join', async () => {
    const user = userEvent.setup();
    apiCallMock.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path.endsWith('/video/join') && options?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          data: {
            session_id: 'sess-1',
            status: 'IN_PROGRESS',
            role: 'CUSTOMER',
            ws_url: 'wss://mock.video.local/room',
            token: 'mock.customer.secret',
            token_expires_at: new Date().toISOString(),
            recording_enabled: false,
            reconnect: true,
          },
        };
      }
      return { ok: false, status: 404, error: 'Not found', kind: 'error' };
    });

    render(
      <ThemeProvider defaultTheme="light">
        <ConsultVideoPanel
          appointmentId="appt-1"
          appointmentType="ONLINE"
          role="customer"
          token="test-token"
        />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole('button', { name: /join waiting room/i }));
    expect(await screen.findByText(/Recording off/i)).toBeInTheDocument();
    expect(screen.queryByText(/mock\.customer\.secret/)).not.toBeInTheDocument();
  });
});
