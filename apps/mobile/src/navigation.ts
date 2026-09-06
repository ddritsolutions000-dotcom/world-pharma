import type { SessionSnapshot } from '@world-pharma/shell-core';

export type ViewState = 'idle' | 'loading' | 'network' | 'forbidden';

export type MobileScreen =
  | 'welcome'
  | 'sign-in'
  | 'sign-up'
  | 'home'
  | 'search'
  | 'product'
  | 'cart'
  | 'checkout'
  | 'orders'
  | 'order-detail'
  | 'buy-again'
  | 'stores'
  | 'shipments'
  | 'shipment-detail'
  | 'doctors'
  | 'appointments'
  | 'appointment-detail'
  | 'prescriptions'
  | 'prescription-detail'
  | 'subscriptions'
  | 'reminders'
  | 'family'
  | 'lab'
  | 'pet-care'
  | 'cancer-care'
  | 'ayurveda'
  | 'vaccines'
  | 'lab-bookings'
  | 'lab-booking-detail'
  | 'imaging'
  | 'imaging-bookings'
  | 'imaging-booking-detail'
  | 'health-home'
  | 'health-profile'
  | 'health-artifact-detail'
  | 'care-navigation'
  | 'help-home'
  | 'help-category'
  | 'help-article'
  | 'help-search'
  | 'account'
  | 'inbox'
  | 'privacy'
  | 'consent'
  | 'preferences'
  | 'support'
  | 'addresses'
  | 'profile-edit'
  | 'wishlist'
  | 'recently-viewed'
  | 'deals'
  | 'track-order'
  | 'loyalty'
  | 'care-plan'
  | 'programs'
  | 'expired'
  | 'forbidden';

export const MAIN_NAV: MobileScreen[] = ['home', 'search', 'appointments', 'health-home', 'orders', 'account'];

export const MORE_NAV: MobileScreen[] = [
  'shipments',
  'buy-again',
  'stores',
  'doctors',
  'appointments',
  'prescriptions',
  'subscriptions',
  'reminders',
  'family',
  'lab',
  'pet-care',
  'cancer-care',
  'ayurveda',
  'vaccines',
  'care-plan',
  'programs',
  'lab-bookings',
  'imaging',
  'imaging-bookings',
  'health-home',
  'health-profile',
  'care-navigation',
  'help-home',
  'checkout',
];

export const ACCOUNT_NAV: MobileScreen[] = [
  'inbox',
  'privacy',
  'consent',
  'preferences',
  'support',
  'addresses',
  'profile-edit',
  'wishlist',
  'recently-viewed',
  'lab',
  'pet-care',
  'cancer-care',
  'ayurveda',
  'vaccines',
  'care-plan',
  'programs',
  'lab-bookings',
  'imaging',
  'imaging-bookings',
  'health-home',
  'health-profile',
  'care-navigation',
  'help-home',
];

export const PUBLIC_HELP_SCREENS: MobileScreen[] = [
  'help-home',
  'help-category',
  'help-article',
  'help-search',
];

export const PUBLIC_GUEST_SCREENS: MobileScreen[] = [
  'home',
  'search',
  'product',
  'cart',
  'deals',
  'welcome',
  'sign-in',
  'sign-up',
  'account',
  'doctors',
  'track-order',
  'stores',
  'lab',
  'imaging',
  'pet-care',
  'cancer-care',
  'ayurveda',
  'vaccines',
  'care-plan',
  'programs',
  ...PUBLIC_HELP_SCREENS,
];

export function resolveMobileScreen(session: SessionSnapshot, route: MobileScreen): MobileScreen {
  if (session.status === 'expired') {
    if (route === 'welcome' || route === 'sign-in' || route === 'sign-up') {
      return route;
    }
    return 'expired';
  }
  if (PUBLIC_GUEST_SCREENS.includes(route)) {
    return route;
  }
  if (session.status !== 'authenticated') {
    return 'sign-in';
  }
  if (session.audience !== 'customer') {
    return 'forbidden';
  }
  return route;
}

export function mobileScreen(session: SessionSnapshot, route: MobileScreen = 'home'): MobileScreen {
  return resolveMobileScreen(session, route);
}
