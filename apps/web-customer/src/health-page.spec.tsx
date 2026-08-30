import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { HealthScreen } from './health-page';
import * as healthApi from './health-api';

jest.mock('./health-api');

const mockTimeline = healthApi.fetchHealthTimeline as jest.MockedFunction<typeof healthApi.fetchHealthTimeline>;

function wrap(ui: React.ReactElement) {
  return render(
    <ThemeProvider defaultTheme="light">
      <SessionProvider initialAudience="customer">{ui}</SessionProvider>
    </ThemeProvider>,
  );
}

describe('HealthScreen', () => {
  beforeEach(() => {
    mockTimeline.mockReset();
  });

  it('shows loading then populated timeline from API', async () => {
    mockTimeline.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        items: [
          {
            id: 'evt-1',
            event_type: 'ARTIFACT_PUBLISHED',
            artifact_id: 'art-1',
            artifact_type: 'LAB_REPORT',
            source_module: 'lab',
            source_id: 'booking-1',
            title: 'CBC panel',
            status: 'ACTIVE',
            occurred_at: '2026-08-29T10:00:00.000Z',
            sandbox: true,
          },
        ],
        next_cursor: null,
      },
    });

    wrap(<HealthScreen />);
    expect(screen.getByText(/Loading health timeline/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('CBC panel')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /View CBC panel/i })).toHaveAttribute('href', '/health/artifacts/art-1');
    expect(screen.queryByText(/fake/i)).not.toBeInTheDocument();
  });

  it('shows empty state when API returns no items', async () => {
    mockTimeline.mockResolvedValue({ ok: true, status: 200, data: { items: [], next_cursor: null } });
    wrap(<HealthScreen />);
    await waitFor(() => {
      expect(screen.getByText('No health records yet')).toBeInTheDocument();
    });
  });

  it('shows session expired state on 401', async () => {
    mockTimeline.mockResolvedValue({
      ok: false,
      status: 401,
      error: 'Session expired.',
      kind: 'unauthorized',
    });
    wrap(<HealthScreen />);
    await waitFor(() => {
      expect(screen.getByText(/Session expired/i)).toBeInTheDocument();
    });
  });

  it('shows forbidden state on 403', async () => {
    mockTimeline.mockResolvedValue({
      ok: false,
      status: 403,
      error: 'Permission denied.',
      kind: 'forbidden',
    });
    wrap(<HealthScreen />);
    await waitFor(() => {
      expect(screen.getByText('You do not have access')).toBeInTheDocument();
    });
  });

  it('shows disabled pack state when health timeline is off', async () => {
    mockTimeline.mockResolvedValue({
      ok: false,
      status: 403,
      error: 'Health timeline is not enabled for this country.',
      kind: 'forbidden',
    });
    wrap(<HealthScreen />);
    await waitFor(() => {
      expect(screen.getByText('Health timeline unavailable')).toBeInTheDocument();
    });
  });

  it('shows network error with retry', async () => {
    mockTimeline
      .mockResolvedValueOnce({ ok: false, status: 0, error: 'Network unavailable.', kind: 'network' })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { items: [], next_cursor: null },
      });
    const user = userEvent.setup();
    wrap(<HealthScreen />);
    await waitFor(() => {
      expect(screen.getByText(/Connection problem/i)).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(mockTimeline).toHaveBeenCalledTimes(2);
    });
  });

  it('loads more when next cursor is present', async () => {
    mockTimeline
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          items: [
            {
              id: 'evt-1',
              event_type: 'ARTIFACT_PUBLISHED',
              artifact_id: 'art-1',
              artifact_type: 'LAB_REPORT',
              source_module: 'lab',
              source_id: 'booking-1',
              title: 'First',
              status: 'ACTIVE',
              occurred_at: '2026-08-29T10:00:00.000Z',
              sandbox: true,
            },
          ],
          next_cursor: '2026-08-29T10:00:00.000Z|evt-1',
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          items: [
            {
              id: 'evt-2',
              event_type: 'ARTIFACT_PUBLISHED',
              artifact_id: 'art-2',
              artifact_type: 'IMAGING_REPORT',
              source_module: 'radiology',
              source_id: 'booking-2',
              title: 'Second',
              status: 'ACTIVE',
              occurred_at: '2026-08-28T10:00:00.000Z',
              sandbox: true,
            },
          ],
          next_cursor: null,
        },
      });
    const user = userEvent.setup();
    wrap(<HealthScreen />);
    await waitFor(() => {
      expect(screen.getByText('First')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => {
      expect(screen.getByText('Second')).toBeInTheDocument();
    });
  });
});
