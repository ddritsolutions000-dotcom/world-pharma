import type { SessionSnapshot } from '@world-pharma/shell-core';

export type ViewState = 'idle' | 'loading' | 'network' | 'forbidden';

export type MobileScreen =
  | 'welcome'
  | 'home'
  | 'search'
  | 'product'
  | 'cart'
  | 'checkout'
  | 'orders'
  | 'shipments'
  | 'doctors'
  | 'appointments'
  | 'appointment-detail'
  | 'prescriptions'
  | 'prescription-detail'
  | 'lab'
  | 'lab-bookings'
  | 'lab-booking-detail'
  | 'imaging'
  | 'imaging-bookings'
  | 'imaging-booking-detail'
  | 'health-home'
  | 'health-artifact-detail'
  | 'care-navigation'
  | 'help-home'
  | 'help-category'
  | 'help-article'
  | 'help-search'
  | 'account'
  | 'privacy'
  | 'consent'
  | 'preferences'
  | 'support'
  | 'addresses'
  | 'profile-edit'
  | 'wishlist'
  | 'expired'
  | 'forbidden';

export const MAIN_NAV: MobileScreen[] = ['home', 'search', 'cart', 'orders', 'account'];

export const MORE_NAV: MobileScreen[] = [
  'shipments',
  'doctors',
  'appointments',
  'prescriptions',
  'lab',
  'lab-bookings',
  'imaging',
  'imaging-bookings',
  'health-home',
  'care-navigation',
  'help-home',
  'checkout',
];

export const ACCOUNT_NAV: MobileScreen[] = [
  'privacy',
  'consent',
  'preferences',
  'support',
  'addresses',
  'profile-edit',
  'wishlist',
  'lab',
  'lab-bookings',
  'imaging',
  'imaging-bookings',
  'health-home',
  'care-navigation',
  'help-home',
];

export const PUBLIC_HELP_SCREENS: MobileScreen[] = [
  'help-home',
  'help-category',
  'help-article',
  'help-search',
];

export function resolveMobileScreen(session: SessionSnapshot, route: MobileScreen): MobileScreen {
  if (PUBLIC_HELP_SCREENS.includes(route)) {
    return route;
  }
  if (session.status === 'expired') {
    return 'expired';
  }
  if (session.status !== 'authenticated') {
    return 'welcome';
  }
  if (session.audience !== 'customer') {
    return 'forbidden';
  }
  return route;
}

export function mobileScreen(session: SessionSnapshot, route: MobileScreen = 'home'): MobileScreen {
  return resolveMobileScreen(session, route);
}
