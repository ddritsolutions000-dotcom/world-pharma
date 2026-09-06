import { customerInboxDestination, groupInbox, inboxView, unreadInboxCount } from './notification-inbox';
import type { InboxItem } from './account-api';
import { markNotificationRead } from './account-api';
import { apiCall } from '@world-pharma/shell-core';

jest.mock('@world-pharma/shell-core', () => ({
  apiCall: jest.fn(),
}));

const mockApiCall = apiCall as jest.MockedFunction<typeof apiCall>;

const unread: InboxItem = {
  id: 'm-unread',
  channel: 'in_app',
  title: 'Order confirmed',
  body: 'Open the app for details. External channels remain disabled in sandbox.',
  read: false,
  created_at: '2026-08-30T10:00:00.000Z',
  reference_type: 'order',
};

const read: InboxItem = {
  id: 'm-read',
  channel: 'in_app',
  title: 'Support team replied',
  body: 'Open the app for details. External channels remain disabled in sandbox.',
  read: true,
  created_at: '2026-08-29T10:00:00.000Z',
  reference_type: 'support',
};

describe('mobile customer inbox helpers', () => {
  it('counts unread and groups read after unread', () => {
    expect(unreadInboxCount([unread, read])).toBe(1);
    const grouped = groupInbox([read, unread]);
    expect(grouped.unread.map((row) => row.id)).toEqual(['m-unread']);
    expect(grouped.read.map((row) => row.id)).toEqual(['m-read']);
  });

  it('maps notification categories onto existing mobile screens', () => {
    expect(customerInboxDestination(unread)).toBe('orders');
    expect(customerInboxDestination({ ...unread, reference_id: 'ord-1' })).toEqual({
      screen: 'order-detail',
      orderId: 'ord-1',
    });
    expect(
      customerInboxDestination({ ...unread, reference_type: 'imaging_booking', reference_id: 'img-1' }),
    ).toEqual({ screen: 'imaging-booking-detail', bookingId: 'img-1' });
    expect(
      customerInboxDestination({ ...unread, reference_type: 'lab_booking', reference_id: 'lab-1' }),
    ).toEqual({ screen: 'lab-booking-detail', bookingId: 'lab-1' });
    expect(customerInboxDestination({ ...unread, reference_type: 'appointment', reference_id: 'apt-1' })).toEqual({
      screen: 'appointment-detail',
      appointmentId: 'apt-1',
    });
    expect(customerInboxDestination({ ...unread, reference_type: 'appointment' })).toBe('appointments');
    expect(customerInboxDestination({ ...unread, reference_type: 'prescription', reference_id: 'rx-1' })).toBe(
      'prescriptions',
    );
    expect(
      customerInboxDestination({ ...unread, reference_type: 'health_artifact', reference_id: 'art-1' }),
    ).toEqual({ screen: 'health-artifact-detail', artifactId: 'art-1' });
    expect(customerInboxDestination({ ...unread, reference_type: 'shipment', reference_id: 'ship-1' })).toEqual({
      screen: 'shipment-detail',
      shipmentId: 'ship-1',
    });
    expect(customerInboxDestination({ ...unread, reference_type: 'shipment' })).toBe('shipments');
    expect(customerInboxDestination(read)).toBe('support');
  });

  it('renders unread and read groups when idle', () => {
    const view = inboxView('idle', [unread, read]);
    expect(view.showEmpty).toBe(false);
    expect(view.showLoading).toBe(false);
    expect(view.unread.map((row) => row.title)).toEqual(['Order confirmed']);
    expect(view.read.map((row) => row.title)).toEqual(['Support team replied']);
  });

  it('shows empty state when idle with no items', () => {
    const view = inboxView('idle', []);
    expect(view.showEmpty).toBe(true);
    expect(view.unread).toEqual([]);
    expect(view.read).toEqual([]);
  });

  it('shows loading and hides items', () => {
    const view = inboxView('loading', [unread]);
    expect(view.showLoading).toBe(true);
    expect(view.showEmpty).toBe(false);
    expect(view.unread).toEqual([]);
  });

  it('shows error/retry state', () => {
    const view = inboxView('network', [unread]);
    expect(view.showNetwork).toBe(true);
    expect(view.unread).toEqual([]);
  });
});

describe('mobile mark-read API', () => {
  beforeEach(() => {
    mockApiCall.mockReset();
  });

  it('posts mark-read to the existing inbox endpoint', async () => {
    mockApiCall.mockResolvedValue({
      ok: true,
      status: 200,
      data: { data: [{ ...unread, read: true }] },
    });
    const result = await markNotificationRead({ token: 'customer-token', id: 'm-unread' });
    expect(mockApiCall).toHaveBeenCalledWith(
      'api/v1/me/notifications/inbox/m-unread/read',
      expect.objectContaining({ method: 'POST', token: 'customer-token' }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.data[0].read).toBe(true);
    }
  });
});

