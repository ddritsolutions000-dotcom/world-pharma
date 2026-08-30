import type { SessionSnapshot } from '@world-pharma/shell-core';

/**
 * Push / deep-link architecture (future):
 * - Register device push token via POST /api/v1/delivery/devices after OTP sign-in.
 * - Foreground: Notifications.addNotificationResponseReceivedListener -> parse jobId from payload.
 * - Background/cold start: Linking.getInitialURL() + Linking.addEventListener('url') in app bootstrap.
 * - Route shape: worldpharma-delivery://jobs/{jobId} -> resolve job -> open jobs tab detail view.
 * - Keep navigation state in a single store; tabs are primary, job detail is a stack overlay on jobs tab.
 */
export type DeliveryTab = 'jobs' | 'presence' | 'support';

export type DeliveryMobileScreen = 'sign-in' | DeliveryTab | 'expired';

export function deliveryMobileScreen(
  session: SessionSnapshot,
  tab: DeliveryTab = 'jobs',
): DeliveryMobileScreen {
  if (session.status === 'expired') {
    return 'expired';
  }
  if (session.status !== 'authenticated') {
    return 'sign-in';
  }
  return tab;
}

export const DELIVERY_TABS: Array<{ id: DeliveryTab; label: string }> = [
  { id: 'jobs', label: 'Jobs' },
  { id: 'presence', label: 'Presence' },
  { id: 'support', label: 'Support' },
];

export function parseDeliveryDeepLink(url: string): { jobId?: string } {
  const match = url.match(/\/jobs\/([^/?#]+)/i);
  return match ? { jobId: match[1] } : {};
}
