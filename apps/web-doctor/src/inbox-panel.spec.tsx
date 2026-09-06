import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { DoctorInboxPanel } from './inbox-panel';
import * as doctorApi from './doctor-api';

jest.mock('./doctor-api');

const mockInbox = doctorApi.fetchNotificationInbox as jest.MockedFunction<typeof doctorApi.fetchNotificationInbox>;
const mockMarkRead = doctorApi.markNotificationRead as jest.MockedFunction<typeof doctorApi.markNotificationRead>;

const unreadItem: doctorApi.InboxItem = {
  id: 'doc-unread',
  channel: 'in_app',
  title: 'Appointment confirmed',
  body: 'Open the app for details. External channels remain disabled in sandbox.',
  read: false,
  created_at: '2026-08-30T10:00:00.000Z',
  reference_type: 'appointment',
  reference_id: 'apt-1',
};

const readItem: doctorApi.InboxItem = {
  id: 'doc-read',
  channel: 'in_app',
  title: 'Video consult ended',
  body: 'Open the app for details. External channels remain disabled in sandbox.',
  read: true,
  created_at: '2026-08-29T10:00:00.000Z',
  reference_type: 'video',
};

function wrap(ui: React.ReactElement, audience: 'doctor' | 'customer' = 'doctor') {
  return render(
    <ThemeProvider defaultTheme="light">
      <SessionProvider initialAudience={audience}>{ui}</SessionProvider>
    </ThemeProvider>,
  );
}

describe('DoctorInboxPanel', () => {
  beforeEach(() => {
    mockInbox.mockReset();
    mockMarkRead.mockReset();
  });

  it('renders inbox items with unread and read state', async () => {
    mockInbox.mockResolvedValue({ ok: true, status: 200, data: { data: [unreadItem, readItem] } });
    wrap(<DoctorInboxPanel />);
    expect(screen.getByText(/Loading inbox/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Appointment confirmed')).toBeInTheDocument();
    });
    expect(screen.getByText('Video consult ended')).toBeInTheDocument();
    expect(screen.getAllByText('Unread').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Read').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Open' })[0]).toHaveAttribute('href', '/appointments?id=apt-1');
  });

  it('marks an unread notification as read', async () => {
    mockInbox.mockResolvedValue({ ok: true, status: 200, data: { data: [unreadItem] } });
    mockMarkRead.mockResolvedValue({
      ok: true,
      status: 200,
      data: { data: [{ ...unreadItem, read: true }] },
    });
    const user = userEvent.setup();
    wrap(<DoctorInboxPanel />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Mark as read' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Mark as read' }));
    await waitFor(() => {
      expect(mockMarkRead).toHaveBeenCalledWith(expect.objectContaining({ id: 'doc-unread' }));
    });
    await waitFor(() => {
      expect(screen.getByText('Read')).toBeInTheDocument();
    });
  });

  it('shows empty state when the inbox has no items', async () => {
    mockInbox.mockResolvedValue({ ok: true, status: 200, data: { data: [] } });
    wrap(<DoctorInboxPanel />);
    await waitFor(() => {
      expect(screen.getByText('No notifications')).toBeInTheDocument();
    });
  });

  it('shows API error state with retry', async () => {
    mockInbox
      .mockResolvedValueOnce({ ok: false, status: 0, error: 'Network unavailable.', kind: 'network' })
      .mockResolvedValueOnce({ ok: true, status: 200, data: { data: [] } });
    const user = userEvent.setup();
    wrap(<DoctorInboxPanel />);
    await waitFor(() => {
      expect(screen.getByText(/Connection problem/i)).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(mockInbox).toHaveBeenCalledTimes(2);
    });
  });

  it('denies a customer audience', async () => {
    wrap(<DoctorInboxPanel />, 'customer');
    await waitFor(() => {
      expect(screen.getByText(/You do not have access/i)).toBeInTheDocument();
    });
    expect(mockInbox).not.toHaveBeenCalled();
  });
});
