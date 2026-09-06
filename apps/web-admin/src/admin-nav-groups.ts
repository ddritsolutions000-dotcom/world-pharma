import type { ShellNavItem } from '@world-pharma/shell-core';

export const ADMIN_NAV_GROUPS: { id: string; label: string; itemIds: string[] }[] = [
  { id: 'overview', label: 'Overview', itemIds: ['home', 'approvals', 'countries', 'storefront', 'analytics'] },
  {
    id: 'commerce',
    label: 'Commerce',
    itemIds: [
      'orders',
      'catalog',
      'inventory',
      'marketplace',
      'search',
      'substitutes',
      'promo',
      'loyalty',
      'reviews',
    ],
  },
  {
    id: 'customers',
    label: 'Customers',
    itemIds: ['crm', 'crm-automation', 'support', 'notifications'],
  },
  {
    id: 'healthcare',
    label: 'Healthcare',
    itemIds: [
      'doctors',
      'healthcare-network',
      'appointments',
      'prescriptions',
      'dispensing',
      'refills',
      'video-sessions',
      'labs',
      'imaging',
      'care-plans',
      'health-packages',
      'speciality-care',
    ],
  },
  {
    id: 'partners',
    label: 'Partners',
    itemIds: ['partners', 'organizations', 'affiliates', 'corporate'],
  },
  {
    id: 'logistics',
    label: 'Logistics',
    itemIds: ['logistics', 'delivery', 'serviceability', 'store-locator'],
  },
  {
    id: 'finance',
    label: 'Finance',
    itemIds: ['payments', 'finance'],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    itemIds: ['marketing', 'seo'],
  },
  {
    id: 'cms',
    label: 'CMS',
    itemIds: ['cms', 'cms-blog', 'cms-legal', 'cms-faq', 'cms-pages', 'cms-health', 'cms-media'],
  },
  {
    id: 'countries',
    label: 'Countries & policies',
    itemIds: ['countries', 'launch-readiness', 'provider-activation', 'regions', 'policy-packs', 'legal-entities', 'business-units'],
  },
  {
    id: 'platform',
    label: 'Platform',
    itemIds: ['identity', 'company-authority', 'reliability'],
  },
  {
    id: 'security',
    label: 'Security',
    itemIds: ['security', 'audit', 'break-glass', 'health-consents', 'health-access-audits', 'care-nav-governance'],
  },
];

export function filterNavItems(items: ShellNavItem[], query: string): ShellNavItem[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return items;
  }
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q) ||
      item.href.toLowerCase().includes(q),
  );
}

export function groupedAdminNav(visible: ShellNavItem[]): Array<{
  id: string;
  label: string;
  items: ShellNavItem[];
}> {
  const byId = new Map(visible.map((item) => [item.id, item]));
  const used = new Set<string>();
  const groups = ADMIN_NAV_GROUPS.map((group) => {
    const items = group.itemIds.map((id) => byId.get(id)).filter((row): row is ShellNavItem => Boolean(row));
    items.forEach((item) => used.add(item.id));
    return { id: group.id, label: group.label, items };
  }).filter((group) => group.items.length > 0);

  const leftover = visible.filter((item) => !used.has(item.id));
  if (leftover.length) {
    groups.push({ id: 'more', label: 'More', items: leftover });
  }
  return groups;
}
