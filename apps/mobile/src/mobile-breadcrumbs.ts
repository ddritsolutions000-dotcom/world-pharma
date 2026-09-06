import type { MobileScreen } from './navigation';

export type RouteCrumb = { href?: string; label: string };

function humanizeRouteSegment(segment: string): string {
  return segment.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const SCREEN_LABELS: Partial<Record<MobileScreen, string>> = {
  welcome: 'Welcome',
  'sign-in': 'Sign in',
  'sign-up': 'Create account',
  search: 'Search',
  product: 'Product',
  cart: 'Cart',
  checkout: 'Checkout',
  orders: 'Orders',
  'buy-again': 'Buy again',
  stores: 'Home delivery',
  'order-detail': 'Order details',
  shipments: 'Shipments',
  'shipment-detail': 'Shipment',
  doctors: 'Doctors',
  appointments: 'Appointments',
  'appointment-detail': 'Appointment',
  prescriptions: 'Prescriptions',
  subscriptions: 'Medicine Subscriptions',
  reminders: 'Medicine Reminders',
  family: 'Family Members',
  'prescription-detail': 'Prescription',
  lab: 'Lab tests',
  'pet-care': 'Pet care',
  'cancer-care': 'Cancer care',
  ayurveda: 'Ayurveda',
  vaccines: 'Vaccines',
  'lab-bookings': 'Lab bookings',
  'lab-booking-detail': 'Booking',
  imaging: 'Scans',
  'imaging-bookings': 'Imaging bookings',
  'imaging-booking-detail': 'Booking',
  'health-home': 'Health records',
  'health-artifact-detail': 'Health record',
  'care-navigation': 'Care navigation',
  'help-home': 'Help',
  'help-search': 'Search help',
  'help-category': 'Help topic',
  'help-article': 'Article',
  account: 'Account',
  inbox: 'Inbox',
  addresses: 'Addresses',
  wishlist: 'Wishlist',
  deals: 'Offers & deals',
  'track-order': 'Track order',
  loyalty: 'Rewards',
  'care-plan': 'Care Plan',
  programs: 'Speciality programs',
  preferences: 'Alerts',
  privacy: 'Privacy',
  consent: 'Consent',
  support: 'Support',
  'profile-edit': 'Edit profile',
};

const PARENT_SECTION: Partial<Record<MobileScreen, string>> = {
  'order-detail': 'Orders',
  'shipment-detail': 'Shipments',
  'appointment-detail': 'Appointments',
  'prescription-detail': 'Prescriptions',
  'lab-booking-detail': 'Lab bookings',
  'imaging-booking-detail': 'Imaging bookings',
  'health-artifact-detail': 'Health records',
};

export function mobileScreenBreadcrumbs(screen: MobileScreen): RouteCrumb[] {
  if (screen === 'home' || screen === 'welcome') {
    return [{ label: screen === 'welcome' ? 'Welcome' : 'Home' }];
  }
  const label = SCREEN_LABELS[screen] ?? humanizeRouteSegment(screen);
  const parent = PARENT_SECTION[screen];
  if (parent) {
    return [{ label: 'Home' }, { label: parent }, { label }];
  }
  return [{ label: 'Home' }, { label }];
}

export function mobileBreadcrumbLabel(screen: MobileScreen): string {
  const crumbs = mobileScreenBreadcrumbs(screen);
  return crumbs.map((c) => c.label).join(' › ');
}
