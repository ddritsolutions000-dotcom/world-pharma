import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionProvider } from '@world-pharma/shell-web';
import { ThemeProvider } from '@world-pharma/ui-kit/web';
import { NotificationInboxScreen } from './notification-inbox-page';
import * as accountApi from './account-api';
import { customerInboxHref, groupInbox, unreadInboxCount } from './notification-inbox';

jest.mock('./account-api');

const mockInbox = accountApi.fetchNotificationInbox as jest.MockedFunction<typeof accountApi.fetchNotificationInbox>;
const mockMarkRead = accountApi.markNotificationRead as jest.MockedFunction<typeof accountApi.markNotificationRead>;

const unreadItem: accountApi.InboxItem = {
  id: 'n-unread',
  channel: 'in_app',
  title: 'Order confirmed',
  body: 'Open the app for details. External channels remain disabled in sandbox.',
  read: false,
  created_at: '2026-08-30T10:00:00.000Z',
  reference_type: 'order',
  reference_id: 'ord-1',
};

const readItem: accountApi.InboxItem = {
  id: 'n-read',
  channel: 'in_app',
  title: 'Shipment delivered',
  body: 'Open the app for details. External channels remain disabled in sandbox.',
  read: true,
  created_at: '2026-08-29T10:00:00.000Z',
  reference_type: 'shipment',
};

function wrap(ui: React.ReactElement, audience: 'customer' | 'doctor' = 'customer') {
  return render(
    <ThemeProvider defaultTheme="light">
      <SessionProvider initialAudience={audience}>{ui}</SessionProvider>
    </ThemeProvider>,
  );
}

describe('customer inbox helpers', () => {
  it('counts unread and groups read after unread', () => {
    expect(unreadInboxCount([unreadItem, readItem])).toBe(1);
    const grouped = groupInbox([readItem, unreadItem]);
    expect(grouped.unread.map((row) => row.id)).toEqual(['n-unread']);
    expect(grouped.read.map((row) => row.id)).toEqual(['n-read']);
  });

  it('deep-links from known reference types without exposing another account', () => {
    expect(customerInboxHref(unreadItem)).toBe('/orders/ord-1');
    expect(customerInboxHref({ ...unreadItem, reference_id: undefined })).toBe('/orders');
    expect(
      customerInboxHref({ ...unreadItem, reference_type: 'imaging_booking', reference_id: 'img-1' }),
    ).toBe('/radiology/bookings/img-1');
    expect(
      customerInboxHref({ ...unreadItem, reference_type: 'lab_booking', reference_id: 'lab-booking-1' }),
    ).toBe('/lab/bookings/lab-booking-1');
    expect(customerInboxHref({ ...unreadItem, reference_type: 'appointment', reference_id: 'apt-1' })).toBe(
      '/appointments/apt-1',
    );
    expect(customerInboxHref({ ...unreadItem, reference_type: 'video', reference_id: 'apt-2' })).toBe(
      '/appointments/apt-2',
    );
    expect(customerInboxHref({ ...unreadItem, reference_type: 'prescription', reference_id: 'rx-1' })).toBe(
      '/prescriptions?id=rx-1',
    );
    expect(
      customerInboxHref({ ...unreadItem, reference_type: 'health_artifact', reference_id: 'art-1' }),
    ).toBe('/health/artifacts/art-1');
    expect(customerInboxHref({ ...unreadItem, reference_type: 'shipment', reference_id: 'ship-1' })).toBe(
      '/shipments/ship-1',
    );
    expect(customerInboxHref({ ...unreadItem, reference_type: 'support' })).toBe('/account/support');
  });
});

describe('NotificationInboxScreen', () => {
  beforeEach(() => {
    mockInbox.mockReset();
    mockMarkRead.mockReset();
  });

  it('renders inbox items with unread and read state', async () => {
    mockInbox.mockResolvedValue({ ok: true, status: 200, data: { data: [unreadItem, readItem] } });
    wrap(<NotificationInboxScreen />);
    expect(screen.getByText(/Loading inbox/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
    });
    expect(screen.getByText('Order confirmed')).toBeInTheDocument();
    expect(screen.getByText('Shipment delivered')).toBeInTheDocument();
    expect(screen.getAllByText('Unread').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Read').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Open' })[0]).toHaveAttribute('href', '/orders/ord-1');
  });

  it('marks an unread notification as read', async () => {
    mockInbox.mockResolvedValue({ ok: true, status: 200, data: { data: [unreadItem] } });
    mockMarkRead.mockResolvedValue({
      ok: true,
      status: 200,
      data: { data: [{ ...unreadItem, read: true }] },
    });
    const user = userEvent.setup();
    wrap(<NotificationInboxScreen />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Mark read' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Mark read' }));
    await waitFor(() => {
      expect(mockMarkRead).toHaveBeenCalledWith(expect.objectContaining({ id: 'n-unread' }));
    });
    await waitFor(() => {
      expect(screen.getByText('Read')).toBeInTheDocument();
    });
  });

  it('shows empty state when the inbox has no items', async () => {
    mockInbox.mockResolvedValue({ ok: true, status: 200, data: { data: [] } });
    wrap(<NotificationInboxScreen />);
    await waitFor(() => {
      expect(screen.getByText('No notifications yet')).toBeInTheDocument();
    });
  });

  it('shows API error state with retry', async () => {
    mockInbox
      .mockResolvedValueOnce({ ok: false, status: 0, error: 'Network unavailable.', kind: 'network' })
      .mockResolvedValueOnce({ ok: true, status: 200, data: { data: [] } });
    const user = userEvent.setup();
    wrap(<NotificationInboxScreen />);
    await waitFor(() => {
      expect(screen.getByText(/Connection problem/i)).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(mockInbox).toHaveBeenCalledTimes(2);
    });
  });

  it('requires an authenticated customer', async () => {
    wrap(<NotificationInboxScreen />, 'doctor');
    expect(screen.getByText(/You do not have access/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(mockInbox).not.toHaveBeenCalled();
    });
  });
});
