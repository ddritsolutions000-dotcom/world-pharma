import { createSessionStore, snapshotContainsSecrets } from '@world-pharma/shell-core';
import {
  fetchNotificationInbox,
  markAllNotificationsRead,
  markNotificationRead,
  type InboxItem,
} from '../account-api';
import { applyApiResult } from '../api-result';
import { fetchHealthDashboard } from '../health-api';
import {
  classifyHealthApiFailure,
  resolvePendingActionDestination,
  resolveTimelineDestination,
} from '../health-utils';
import { imagingProgressCaptions, type ImagingProgress } from '../imaging-api';
import { mobileScreen, resolveMobileScreen } from '../navigation';
import {
  customerInboxDestination,
  groupInbox,
  unreadInboxCount,
} from '../notification-inbox';
import {
  formatOrderMoney,
  formatPodCaption,
  formatReturnCaption,
  orderTrackIndex,
} from '../order-display';
import { clampStoreCountry, isStoreMarket } from '../use-selected-country';

jest.mock('@world-pharma/shell-core', () => {
  const actual = jest.requireActual('@world-pharma/shell-core') as typeof import('@world-pharma/shell-core');
  return {
    ...actual,
    apiCall: jest.fn(),
  };
});

const { apiCall } = jest.requireMock('@world-pharma/shell-core') as {
  apiCall: jest.Mock;
};

function inboxItem(partial: Partial<InboxItem> & Pick<InboxItem, 'id' | 'title'>): InboxItem {
  return {
    channel: 'in_app',
    body: 'Open the app for details. External channels remain disabled in sandbox.',
    read: false,
    created_at: '2026-09-03T10:00:00.000Z',
    ...partial,
  };
}

describe('Sprint 37 mobile platform real-use', () => {
  beforeEach(() => {
    apiCall.mockReset();
  });

  describe('auth / session', () => {
    it('1. restores authenticated session secrets via createSessionStore', () => {
      const store = createSessionStore();
      store.authenticate({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        audience: 'customer',
      });
      expect(store.snapshot().status).toBe('authenticated');
      expect(store.getAccessToken()).toBe('access-token');
      expect(mobileScreen(store.snapshot(), 'health-home')).toBe('health-home');
    });

    it('2. expires session safely and clears tokens', () => {
      const store = createSessionStore();
      store.authenticate({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        audience: 'customer',
      });
      store.expire();
      expect(store.snapshot().status).toBe('expired');
      expect(store.getAccessToken()).toBeNull();
      expect(store.getRefreshToken()).toBeNull();
      expect(mobileScreen(store.snapshot(), 'orders')).toBe('expired');
    });

    it('3. rejects unauthorized screen access for guests', () => {
      const store = createSessionStore();
      expect(resolveMobileScreen(store.snapshot(), 'health-home')).toBe('sign-in');
      expect(resolveMobileScreen(store.snapshot(), 'prescriptions')).toBe('sign-in');
      expect(resolveMobileScreen(store.snapshot(), 'order-detail')).toBe('sign-in');
    });

    it('21. API 401 routes through applyApiResult unauthorized handler', () => {
      const onUnauthorized = jest.fn();
      const setViewState = jest.fn();
      const ok = applyApiResult(
        { ok: false, status: 401, error: 'Session expired.', kind: 'unauthorized' },
        { onOk: jest.fn(), onUnauthorized, setViewState },
      );
      expect(ok).toBe(false);
      expect(onUnauthorized).toHaveBeenCalled();
    });

    it('22. API 403 sets forbidden view state', () => {
      const setViewState = jest.fn();
      applyApiResult(
        { ok: false, status: 403, error: 'Forbidden', kind: 'forbidden' },
        { onOk: jest.fn(), setViewState },
      );
      expect(setViewState).toHaveBeenCalledWith('forbidden');
    });

    it('23. API 404 health failures classify as not_found', () => {
      expect(
        classifyHealthApiFailure({
          ok: false,
          status: 404,
          error: 'Not found',
          kind: 'error',
        }),
      ).toBe('not_found');
    });

    it('24. network failure sets retryable network state', () => {
      const setViewState = jest.fn();
      applyApiResult(
        { ok: false, status: 0, error: 'Network error', kind: 'network' },
        { onOk: jest.fn(), setViewState },
      );
      expect(setViewState).toHaveBeenCalledWith('network');
    });

    it('28. session snapshot does not contain secrets', () => {
      const store = createSessionStore();
      store.authenticate({
        accessToken: 'secret-access',
        refreshToken: 'secret-refresh',
        audience: 'customer',
      });
      expect(snapshotContainsSecrets(store.snapshot())).toBe(false);
    });
  });

  describe('health / diagnostics / prescription navigation', () => {
    it('4. health dashboard client hits the dashboard endpoint', async () => {
      apiCall.mockResolvedValue({
        ok: true,
        data: {
          country_code: 'AE',
          timeline_enabled: true,
          overview: {
            upcoming_appointments: [],
            recent_consultations: [],
            recent_prescriptions: [],
            recent_orders: [],
            recent_lab_bookings: [],
            recent_imaging_bookings: [],
            pending_actions: [],
          },
          recent_activity: { items: [], next_cursor: null },
        },
      });
      await fetchHealthDashboard({ token: 't', countryCode: 'AE' });
      expect(apiCall).toHaveBeenCalledWith('api/v1/health/dashboard?country_code=AE', {
        token: 't',
        onUnauthorized: undefined,
      });
    });

    it('5. family subject query is forwarded to dashboard', async () => {
      apiCall.mockResolvedValue({ ok: true, data: { country_code: 'AE', timeline_enabled: true } });
      await fetchHealthDashboard({
        token: 't',
        countryCode: 'AE',
        familyMemberId: '11111111-1111-4111-8111-111111111111',
      });
      expect(apiCall.mock.calls[0][0]).toContain('family_member_id=11111111-1111-4111-8111-111111111111');
    });

    it('6. appointment timeline destination opens', () => {
      expect(
        resolveTimelineDestination({
          id: '1',
          event_type: 'CONSULT_COMPLETED',
          artifact_id: null,
          artifact_type: 'CONSULT_NOTE',
          source_module: 'encounter',
          source_id: 'appt-1',
          title: 'Consultation summary',
          status: 'ACTIVE',
          occurred_at: '2026-09-01T00:00:00.000Z',
          sandbox: true,
        }),
      ).toEqual({ screen: 'appointment-detail', appointmentId: 'appt-1' });
    });

    it('7. prescription reference opens prescriptions', () => {
      expect(
        resolveTimelineDestination({
          id: '2',
          event_type: 'ARTIFACT_PUBLISHED',
          artifact_id: null,
          artifact_type: 'PRESCRIPTION_STRUCTURED',
          source_module: 'clinical',
          source_id: 'rx-ver-1',
          title: 'Prescription',
          status: 'ACTIVE',
          occurred_at: '2026-09-01T00:00:00.000Z',
          sandbox: true,
        }),
      ).toEqual({ screen: 'prescriptions' });
      expect(customerInboxDestination(inboxItem({ id: 'n1', title: 'Rx', reference_type: 'prescription', reference_id: 'rx-1' }))).toBe(
        'prescriptions',
      );
    });

    it('8. Rx medicine handoff pending action opens orders', () => {
      expect(resolvePendingActionDestination({ kind: 'medicine_purchase', id: 'ord-1' })).toEqual({
        screen: 'orders',
      });
    });

    it('9. lab report reference opens artifact or booking', () => {
      expect(
        resolveTimelineDestination({
          id: '3',
          event_type: 'ARTIFACT_PUBLISHED',
          artifact_id: 'art-lab',
          artifact_type: 'LAB_REPORT',
          source_module: 'lab',
          source_id: 'lab-1',
          title: 'Lab diagnostic report',
          summary: 'A lab report is available. Results require authorized access.',
          status: 'ACTIVE',
          occurred_at: '2026-09-01T00:00:00.000Z',
          sandbox: true,
        }),
      ).toEqual({ screen: 'health-artifact-detail', artifactId: 'art-lab' });
      expect(
        customerInboxDestination(
          inboxItem({ id: 'n2', title: 'Lab report ready', reference_type: 'lab_booking', reference_id: 'lab-1' }),
        ),
      ).toEqual({ screen: 'lab-booking-detail', bookingId: 'lab-1' });
    });

    it('10. imaging report reference opens', () => {
      expect(
        resolveTimelineDestination({
          id: '4',
          event_type: 'ARTIFACT_PUBLISHED',
          artifact_id: 'art-img',
          artifact_type: 'IMAGING_REPORT',
          source_module: 'radiology',
          source_id: 'img-1',
          title: 'Imaging report',
          status: 'ACTIVE',
          occurred_at: '2026-09-01T00:00:00.000Z',
          sandbox: true,
        }),
      ).toEqual({ screen: 'health-artifact-detail', artifactId: 'art-img' });
      expect(
        customerInboxDestination(
          inboxItem({
            id: 'n3',
            title: 'Imaging report ready',
            reference_type: 'health_artifact',
            reference_id: 'art-img',
          }),
        ),
      ).toEqual({ screen: 'health-artifact-detail', artifactId: 'art-img' });
    });

    it('25. optional/missing imaging fields do not crash captions', () => {
      const minimal: ImagingProgress = {
        progress: 'SCHEDULED',
        note: 'Awaiting acquisition',
        study_status: null,
        accession_number: null,
      };
      expect(imagingProgressCaptions(minimal)).toEqual(['Progress: SCHEDULED', 'Awaiting acquisition']);
      expect(
        imagingProgressCaptions({
          ...minimal,
          study_instance_uid: '1.2.840.113619.2.55.3.604688119.868.1234567890',
          viewer_note: 'DICOM viewer is not enabled in this environment.',
        }),
      ).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Study UID'),
          'DICOM viewer is not enabled in this environment.',
        ]),
      );
      expect(imagingProgressCaptions(null)).toEqual([]);
    });

    it('30. care journey destinations remain coherent', () => {
      expect(resolvePendingActionDestination({ kind: 'appointment_upcoming', id: 'a1' })).toEqual({
        screen: 'appointment-detail',
        appointmentId: 'a1',
      });
      expect(resolvePendingActionDestination({ kind: 'prescription_available', id: 'rx' })).toEqual({
        screen: 'prescriptions',
      });
      expect(resolvePendingActionDestination({ kind: 'care_plan_action', id: 'cp' })).toEqual({
        screen: 'care-plan',
      });
    });
  });

  describe('commerce / delivery / refund', () => {
    it('11-14. order money, shipment POD, and return captions use server fields safely', () => {
      expect(formatOrderMoney({ currency: 'AED', total_minor: '2500' })).toBe('AED 2500');
      expect(formatOrderMoney({})).toBe('— 0');
      expect(orderTrackIndex('SHIPPED')).toBe(4);
      expect(
        formatPodCaption({
          delivered: true,
          otp_recorded: true,
          photo_attached: false,
          signature_attached: true,
        }),
      ).toContain('POD');
      expect(formatPodCaption({ delivered: false })).toBeNull();
      expect(formatReturnCaption({ status: 'REQUESTED', reason: 'Damaged' })).toBe('REQUESTED · Damaged');
    });

    it('26. currency comes from server order data', () => {
      expect(formatOrderMoney({ currency: 'XXX', total_minor: '99' })).toBe('XXX 99');
      expect(formatOrderMoney({ currency: 'USD', total_minor: '1000' })).not.toContain('INR');
    });
  });

  describe('notifications', () => {
    it('15-17. inbox loads, unread count, and mark-read hit existing endpoints', async () => {
      apiCall.mockResolvedValueOnce({
        ok: true,
        data: {
          data: [
            inboxItem({ id: 'u1', title: 'Order confirmed', reference_type: 'order', reference_id: 'ord-1' }),
            inboxItem({ id: 'r1', title: 'Support reply', read: true, reference_type: 'support' }),
          ],
        },
      });
      const list = await fetchNotificationInbox({ token: 't' });
      expect(list.ok).toBe(true);
      if (list.ok) {
        expect(unreadInboxCount(list.data.data)).toBe(1);
        expect(groupInbox(list.data.data).unread).toHaveLength(1);
      }

      apiCall.mockResolvedValueOnce({ ok: true, data: { data: [] } });
      await markNotificationRead({ token: 't', id: 'u1' });
      expect(apiCall).toHaveBeenLastCalledWith(
        'api/v1/me/notifications/inbox/u1/read',
        expect.objectContaining({ method: 'POST', token: 't' }),
      );
    });

    it('18. mark-all-read uses the existing read-all endpoint', async () => {
      apiCall.mockResolvedValue({ ok: true, data: { data: [] } });
      await markAllNotificationsRead({ token: 't' });
      expect(apiCall).toHaveBeenCalledWith(
        'api/v1/me/notifications/inbox/read-all',
        expect.objectContaining({ method: 'POST', token: 't' }),
      );
    });

    it('19. notification deep links open correct destinations', () => {
      expect(
        customerInboxDestination(
          inboxItem({ id: '1', title: 'Order', reference_type: 'order', reference_id: 'ord-1' }),
        ),
      ).toEqual({ screen: 'order-detail', orderId: 'ord-1' });
      expect(
        customerInboxDestination(
          inboxItem({ id: '2', title: 'Shipment', reference_type: 'shipment', reference_id: 'ship-1' }),
        ),
      ).toEqual({ screen: 'shipment-detail', shipmentId: 'ship-1' });
      expect(
        customerInboxDestination(
          inboxItem({ id: '3', title: 'Appt', reference_type: 'appointment', reference_id: 'apt-1' }),
        ),
      ).toEqual({ screen: 'appointment-detail', appointmentId: 'apt-1' });
    });

    it('20. duplicate inbox rows with same id collapse in unread counting when deduped by caller', () => {
      const rows = [
        inboxItem({ id: 'same', title: 'Lab report ready', reference_type: 'health_artifact', reference_id: 'a1' }),
        inboxItem({ id: 'same', title: 'Lab report ready', reference_type: 'health_artifact', reference_id: 'a1' }),
      ];
      const unique = [...new Map(rows.map((row) => [row.id, row])).values()];
      expect(unreadInboxCount(unique)).toBe(1);
    });
  });

  describe('country / security', () => {
    it('27. country clamp rejects non-store markets and does not force India', () => {
      expect(isStoreMarket('AE')).toBe(true);
      expect(clampStoreCountry('XX')).toBeNull();
      expect(clampStoreCountry('AE')).toBe('AE');
      expect(clampStoreCountry(undefined, 'US')).toBe('US');
      expect(clampStoreCountry(undefined)).toBeNull();
    });

    it('29. customer isolation: foreign audience cannot open customer screens', () => {
      const store = createSessionStore();
      store.authenticate({
        accessToken: 'a',
        refreshToken: 'b',
        audience: 'admin',
      });
      expect(resolveMobileScreen(store.snapshot(), 'health-home')).toBe('forbidden');
    });
  });
});
