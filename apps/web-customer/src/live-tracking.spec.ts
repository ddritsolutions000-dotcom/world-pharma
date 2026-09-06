import type { LiveTrackingPayload } from './commerce-api';
import {
  formatLiveCoords,
  liveJobStatusLabel,
  shouldPollLiveTracking,
} from './live-tracking';

describe('live-tracking helpers', () => {
  it('polls while courier job is active', () => {
    const live: LiveTrackingPayload = {
      sandbox: true,
      message: 'x',
      shipments: [
        {
          shipment_id: 's1',
          job_id: 'j1',
          job_status: 'EN_ROUTE_DROPOFF',
          assignee_id: 'a',
          last_lat: 28.61,
          last_lng: 77.2,
          last_event_type: 'RIDER_PRESENCE',
          last_event_at: new Date().toISOString(),
          pickup: null,
          drop: { postal_code: '110001', city: 'Delhi' },
        },
      ],
    };
    expect(shouldPollLiveTracking('SHIPPED', live)).toBe(true);
    expect(shouldPollLiveTracking('DELIVERED', live)).toBe(false);
  });

  it('formats coords and labels', () => {
    expect(formatLiveCoords(28.6139, 77.209)).toBe('28.61390, 77.20900');
    expect(formatLiveCoords(null, 1)).toBeNull();
    expect(liveJobStatusLabel('ASSIGNED')).toMatch(/assigned/i);
  });
});
