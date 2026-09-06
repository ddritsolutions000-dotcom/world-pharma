/** Sandbox live track helpers for mobile — no map tile provider. */

import type { LiveTrackingPayload } from './commerce-api';

const ACTIVE_JOB = new Set([
  'CREATED',
  'ASSIGNED',
  'ACCEPTED',
  'EN_ROUTE_PICKUP',
  'AT_PICKUP',
  'PICKED_UP',
  'EN_ROUTE_DROPOFF',
  'AT_DROPOFF',
]);

export function shouldPollLiveTracking(orderStatus: string, live?: LiveTrackingPayload | null): boolean {
  if (orderStatus === 'DELIVERED' || orderStatus === 'RETURNED' || orderStatus === 'CANCELLED') {
    return false;
  }
  if (!live?.shipments?.length) {
    return (
      orderStatus === 'SHIPPED' ||
      orderStatus === 'OUT_FOR_DELIVERY' ||
      orderStatus === 'READY_TO_SHIP' ||
      orderStatus === 'PACKED'
    );
  }
  return live.shipments.some((s) => s.job_status != null && ACTIVE_JOB.has(s.job_status));
}

export function formatLiveCoords(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function liveJobStatusLabel(status: string | null): string {
  if (!status) return 'Waiting for courier job';
  const labels: Record<string, string> = {
    CREATED: 'Courier job created',
    ASSIGNED: 'Rider assigned',
    ACCEPTED: 'Rider accepted',
    EN_ROUTE_PICKUP: 'Rider heading to pharmacy',
    AT_PICKUP: 'Rider at pharmacy',
    PICKED_UP: 'Picked up',
    EN_ROUTE_DROPOFF: 'Out for delivery',
    AT_DROPOFF: 'Rider nearby',
    DELIVERED: 'Delivered',
    FAILED: 'Delivery attempt failed',
    CANCELLED: 'Job cancelled',
  };
  return labels[status] ?? status.replaceAll('_', ' ').toLowerCase();
}
