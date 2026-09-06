import { fetchHealthDashboard } from './health-api';
import { resolvePendingActionDestination, resolveTimelineDestination } from './health-utils';

jest.mock('@world-pharma/shell-core', () => ({
  apiCall: jest.fn(),
}));

describe('mobile health dashboard client', () => {
  it('requests the Sprint 10 dashboard endpoint', async () => {
    const { apiCall } = jest.requireMock('@world-pharma/shell-core') as {
      apiCall: jest.Mock;
    };
    apiCall.mockResolvedValue({
      ok: true,
      data: {
        country_code: 'XX',
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

    await fetchHealthDashboard({ token: 't', countryCode: 'XX' });

    expect(apiCall).toHaveBeenCalledWith('api/v1/health/dashboard?country_code=XX', {
      token: 't',
      onUnauthorized: undefined,
    });
  });
});

describe('mobile health timeline destinations', () => {
  it('maps lab and imaging timeline events to booking destinations', () => {
    expect(
      resolveTimelineDestination({
        id: '1',
        event_type: 'ARTIFACT_PUBLISHED',
        artifact_id: null,
        artifact_type: 'LAB_REPORT',
        source_module: 'lab',
        source_id: 'booking-1',
        title: 'Lab report',
        status: 'ACTIVE',
        occurred_at: '2026-01-01T00:00:00.000Z',
        sandbox: true,
      }),
    ).toEqual({ screen: 'lab-booking-detail', bookingId: 'booking-1' });

    expect(
      resolvePendingActionDestination({ kind: 'imaging_report_pending', id: 'img-1' }),
    ).toEqual({ screen: 'imaging-booking-detail', bookingId: 'img-1' });
  });
});
