export type VendorTabId =
  | 'dashboard'
  | 'organization'
  | 'profile'
  | 'marketplace'
  | 'catalog'
  | 'pricing'
  | 'inventory'
  | 'orders'
  | 'returns'
  | 'shipments'
  | 'settlements'
  | 'support'
  | 'notifications'
  | 'security'
  | 'audit'
  | 'compliance'
  | 'reports'
  | 'settings'
  | 'team';

export type VendorNavIcon =
  | 'dashboard'
  | 'organization'
  | 'profile'
  | 'marketplace'
  | 'catalog'
  | 'pricing'
  | 'inventory'
  | 'orders'
  | 'returns'
  | 'shipments'
  | 'settlements'
  | 'support'
  | 'notifications'
  | 'security'
  | 'audit'
  | 'compliance'
  | 'reports'
  | 'settings'
  | 'team';

export type VendorTabMeta = {
  id: VendorTabId;
  label: string;
  description: string;
  icon: VendorNavIcon;
};

export const VENDOR_TAB_META: Record<VendorTabId, VendorTabMeta> = {
  dashboard: {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Operations snapshot, alerts, and quick actions for your seller org.',
    icon: 'dashboard',
  },
  marketplace: {
    id: 'marketplace',
    label: 'Marketplace',
    description: 'Eligibility, attestation, and go-live readiness for marketplace selling.',
    icon: 'marketplace',
  },
  catalog: {
    id: 'catalog',
    label: 'Catalog',
    description: 'Create listings, publish offers, and manage product variants.',
    icon: 'catalog',
  },
  pricing: {
    id: 'pricing',
    label: 'Pricing rules',
    description: 'Commercial terms and platform fee rules applied to your catalog.',
    icon: 'pricing',
  },
  inventory: {
    id: 'inventory',
    label: 'Inventory',
    description: 'Stock lots, GRN receipts, transfers, and warehouse adjustments.',
    icon: 'inventory',
  },
  orders: {
    id: 'orders',
    label: 'Orders',
    description: 'Pick, pack, and fulfil customer orders from your queue.',
    icon: 'orders',
  },
  returns: {
    id: 'returns',
    label: 'Returns',
    description: 'Review customer return requests and after-sales status.',
    icon: 'returns',
  },
  shipments: {
    id: 'shipments',
    label: 'Shipments',
    description: 'Dispatch tracking, carrier labels, and delivery status.',
    icon: 'shipments',
  },
  settlements: {
    id: 'settlements',
    label: 'Settlements',
    description: 'Payout lines, fees, and settlement batch history.',
    icon: 'settlements',
  },
  organization: {
    id: 'organization',
    label: 'Organization',
    description: 'Legal profile, warehouses, and seller org settings.',
    icon: 'organization',
  },
  profile: {
    id: 'profile',
    label: 'Profile',
    description: 'Your operator profile and seller contact details.',
    icon: 'profile',
  },
  support: {
    id: 'support',
    label: 'Support',
    description: 'Raise tickets and track seller support conversations.',
    icon: 'support',
  },
  notifications: {
    id: 'notifications',
    label: 'Notifications',
    description: 'Inbox, alerts, and notification preferences.',
    icon: 'notifications',
  },
  security: {
    id: 'security',
    label: 'Security',
    description: 'Session, sign-in, and account security controls.',
    icon: 'security',
  },
  audit: {
    id: 'audit',
    label: 'Activity log',
    description: 'Marketplace and seller audit trail for your organization.',
    icon: 'audit',
  },
  compliance: {
    id: 'compliance',
    label: 'Compliance',
    description: 'KYC status, marketplace gates, documents, and regulatory notices.',
    icon: 'compliance',
  },
  reports: {
    id: 'reports',
    label: 'Reports',
    description: 'Sales, fulfilment, inventory, and settlement analytics from your seller data.',
    icon: 'reports',
  },
  settings: {
    id: 'settings',
    label: 'Settings',
    description: 'Business profile, notifications, security, and operational preferences.',
    icon: 'settings',
  },
  team: {
    id: 'team',
    label: 'Team',
    description: 'Staff access and roles for your seller organization.',
    icon: 'team',
  },
};

export const VENDOR_NAV_GROUPS: Array<{ id: string; label: string; items: VendorTabId[] }> = [
  { id: 'overview', label: 'Overview', items: ['dashboard'] },
  {
    id: 'commerce',
    label: 'Commerce',
    items: ['marketplace', 'catalog', 'pricing', 'inventory'],
  },
  {
    id: 'operations',
    label: 'Operations',
    items: ['orders', 'returns', 'shipments', 'settlements'],
  },
  {
    id: 'insights',
    label: 'Insights',
    items: ['reports', 'audit'],
  },
  {
    id: 'account',
    label: 'Account',
    items: ['organization', 'profile', 'compliance', 'settings', 'team', 'notifications', 'support', 'security'],
  },
];

export const VENDOR_MOBILE_NAV: VendorTabId[] = ['dashboard', 'orders', 'catalog', 'inventory', 'support'];

export function isVendorTabId(value: string): value is VendorTabId {
  return value in VENDOR_TAB_META;
}

export function vendorTabLabel(tab: VendorTabId): string {
  return VENDOR_TAB_META[tab].label;
}

export function vendorTabPath(tab: VendorTabId): string {
  return tab === 'dashboard' ? '/workspace' : `/workspace/${tab}`;
}

export function vendorTabFromPath(pathname: string): VendorTabId | null {
  const normalized = pathname.replace(/\/$/, '') || '/workspace';
  if (normalized === '/workspace') {
    return 'dashboard';
  }
  const match = normalized.match(/^\/workspace\/([^/]+)$/);
  if (match?.[1] && isVendorTabId(match[1])) {
    return match[1];
  }
  return null;
}
