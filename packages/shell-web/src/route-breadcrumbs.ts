export type RouteCrumb = { href?: string; label: string };

export type RouteBreadcrumbOptions = {
  /** Root crumb prepended to every trail */
  root?: { href: string; label: string };
  /** Full path or segment → label */
  labels?: Record<string, string>;
  /** Segments to skip in trail (e.g. locale) */
  skipSegments?: Set<string>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function humanizeRouteSegment(segment: string): string {
  return segment
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function labelForSegment(segment: string, pathSoFar: string, labels?: Record<string, string>): string {
  if (labels?.[pathSoFar]) {
    return labels[pathSoFar]!;
  }
  if (labels?.[segment]) {
    return labels[segment]!;
  }
  if (UUID_RE.test(segment)) {
    return 'Details';
  }
  if (/^ord[-_]|^apt[-_]|^ship[-_]|^lab[-_]|^img[-_]/.test(segment)) {
    return segment.replace(/[-_]/g, ' ').toUpperCase();
  }
  if (/^\d+$/.test(segment)) {
    return `#${segment}`;
  }
  return humanizeRouteSegment(segment);
}

/** Build breadcrumb items from a URL pathname. Last item has no href. */
export function buildRouteBreadcrumbs(pathname: string, options?: RouteBreadcrumbOptions): RouteCrumb[] {
  const normalized = pathname.split('?')[0]?.replace(/\/+$/, '') || '/';
  const segments = normalized === '/' ? [] : normalized.split('/').filter(Boolean);
  const skip = options?.skipSegments ?? new Set<string>();
  const items: RouteCrumb[] = [];

  if (options?.root) {
    items.push({ href: options.root.href, label: options.root.label });
  }

  let path = '';
  for (const segment of segments) {
    if (skip.has(segment)) {
      path += `/${segment}`;
      continue;
    }
    path += `/${segment}`;
    items.push({
      href: path,
      label: labelForSegment(segment, path, options?.labels),
    });
  }

  if (items.length > 1) {
    const last = items[items.length - 1]!;
    items[items.length - 1] = { label: last.label };
  } else if (items.length === 1 && !options?.root) {
    const last = items[0]!;
    items[0] = { label: last.label };
  }

  return items;
}

/** Breadcrumbs for hash-based SPA consoles (vendor, lab, store). */
export function buildPortalBreadcrumbs(
  portalName: string,
  tabId: string,
  tabLabels: Record<string, string>,
): RouteCrumb[] {
  const tabLabel = tabLabels[tabId] ?? humanizeRouteSegment(tabId);
  return [{ href: '#dashboard', label: portalName }, { label: tabLabel }];
}

export const CUSTOMER_ROUTE_LABELS: Record<string, string> = {
  '/': 'Home',
  '/search': 'Search',
  '/categories': 'Categories',
  '/services': 'Our Services',
  '/deals': 'Offers',
  '/brands': 'Brands',
  '/cart': 'Cart',
  '/checkout': 'Checkout',
  '/orders': 'My Orders',
  '/buy-again': 'Buy again',
  '/stores': 'Home delivery',
  '/shipments': 'Shipments',
  '/prescriptions': 'Prescriptions',
  '/subscriptions': 'Medicine Subscriptions',
  '/reminders': 'Medicine Reminders',
  '/family': 'Family Members',
  '/doctors': 'Doctors',
  '/appointments': 'Appointments',
  '/lab': 'Lab Tests',
  '/lab/packages': 'Health Checkups',
  '/lab/bookings': 'Lab Bookings',
  '/programs': 'Speciality programs',
  '/care-plan': 'Care Plan',
  '/pet-care': 'Pet Care',
  '/cancer-care': 'Cancer Care',
  '/ayurveda': 'Ayurveda',
  '/vaccines': 'Adult Vaccines',
  '/track-order': 'Track order',
  '/radiology': 'X-Rays & Scans',
  '/radiology/bookings': 'Imaging Bookings',
  '/health': 'Health Records',
  '/health/care-navigation': 'Care Navigation',
  '/help': 'Help Centre',
  '/help/search': 'Search Help',
  '/account': 'My Account',
  '/account/notifications': 'Inbox',
  '/account/addresses': 'Addresses',
  '/account/wishlist': 'Wishlist',
  '/account/preferences': 'Alerts',
  '/account/privacy': 'Privacy & Security',
  '/account/consent': 'Consent',
  '/account/support': 'Support',
  '/account/loyalty': 'Rewards',
  '/recommendations': 'For you',
  '/login': 'Sign in',
  '/signup': 'Create account',
  '/about': 'About',
  '/contact': 'Contact',
  '/careers': 'Careers',
  '/blog': 'Blog',
  '/pharmacist': 'Ask a pharmacist',
  '/corporate': 'Corporate wellness',
  '/salts': 'Salt index',
  '/download': 'Download App',
  '/partners': 'Partners',
  '/legal/privacy': 'Privacy Policy',
  '/legal/terms': 'Terms & Conditions',
  '/legal/returns': 'Return Policy',
  p: 'Product',
  c: 'Category',
  a: 'Article',
};

export const ADMIN_ROUTE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/catalog': 'Catalog',
  '/inventory': 'Inventory',
  '/payments': 'Payments',
  '/orders': 'Orders',
  '/logistics': 'Logistics',
  '/finance': 'Finance',
  '/doctors': 'Doctors',
  '/healthcare-network': 'Healthcare Network',
  '/appointments': 'Appointments',
  '/prescriptions': 'Prescriptions',
  '/video-sessions': 'Video Sessions',
  '/identity': 'Identity',
  '/organizations': 'Organizations',
  '/partners': 'Partners',
  '/countries': 'Countries',
  '/regions': 'Regions',
  '/legal-entities': 'Legal Entities',
  '/business-units': 'Business Units',
  '/audit': 'Audit',
  '/governance': 'Governance',
  '/governance/health': 'Health Governance',
  '/governance/health/break-glass': 'Break Glass',
  '/governance/care-nav': 'Care Navigation',
  '/labs': 'Labs',
  '/imaging': 'Imaging',
  '/marketplace': 'Marketplace',
  '/cms': 'CMS',
  '/seo': 'SEO',
  '/notifications': 'Notifications',
  '/cms/new': 'New Content',
  '/support': 'Support Desk',
  '/crm': 'CRM',
  '/crm/customers': 'Customers',
  '/marketing': 'Marketing',
  '/analytics': 'Analytics',
  '/analytics/commerce': 'Commerce Analytics',
  '/analytics/marketing': 'Marketing Analytics',
  '/promo': 'Promotions',
  '/loyalty': 'Loyalty',
  '/affiliates': 'Affiliates',
  '/reviews': 'Reviews',
  '/questions': 'Questions',
  '/vendor': 'Vendor (Legacy)',
  '/policy-packs': 'Policy packs',
  '/search': 'Search index',
  '/delivery': 'Delivery',
  '/refills': 'Refills',
  '/dispensing': 'Dispensing',
  '/care-plans': 'Care plans',
  '/company-authority': 'Company authority',
  '/login': 'Sign in',
  '/security': 'Account & security',
};

export const DOCTOR_ROUTE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/inbox': 'Inbox',
  '/profile': 'Profile',
  '/credentials': 'Credentials',
  '/organizations': 'Organizations',
  '/availability': 'Availability',
  '/patients': 'Patients',
  '/appointments': 'Appointments',
  '/prescriptions': 'Prescriptions',
  '/refill-requests': 'Refill Requests',
  '/support': 'Support',
  '/settings': 'Settings',
  health: 'Health Timeline',
  artifacts: 'Record',
};

export const AFFILIATE_ROUTE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/codes': 'Referral Codes',
  '/links': 'Referral Links',
  '/earnings': 'Earnings',
  '/inbox': 'Inbox',
  '/support': 'Support',
  '/profile': 'Profile',
};

export const JOIN_ROUTE_LABELS: Record<string, string> = {
  '/': 'Partner home',
  '/apply': 'Apply',
  '/status': 'Application status',
  '/pharmacy': 'Pharmacy',
  '/doctor': 'Doctors',
  '/lab': 'Labs',
  '/imaging': 'Imaging',
  '/delivery': 'Delivery',
  '/affiliate': 'Affiliates',
  '/login': 'Sign in',
  '/signup': 'Register',
};
