import { humanizeRouteSegment } from '@world-pharma/shell-web';

export type StoreMainTab = 'dashboard' | 'inventory' | 'orders' | 'rx' | 'more';
export type StoreMoreScreen = 'menu' | 'exceptions' | 'grn' | 'adjust' | 'support' | 'inbox';

const TAB_LABELS: Record<StoreMainTab, string> = {
  dashboard: 'Dashboard',
  inventory: 'Inventory',
  orders: 'Orders',
  rx: 'Rx desk',
  more: 'More',
};

const MORE_LABELS: Record<StoreMoreScreen, string> = {
  menu: 'More',
  exceptions: 'Exceptions',
  grn: 'Receive stock',
  adjust: 'Adjust lot',
  support: 'Support',
  inbox: 'Inbox',
};

export function storeBreadcrumbLabel(
  tab: StoreMainTab,
  moreScreen: StoreMoreScreen = 'menu',
  detail?: string,
): string {
  const parts = ['Store', TAB_LABELS[tab] ?? humanizeRouteSegment(tab)];
  if (tab === 'more' && moreScreen !== 'menu') {
    parts.push(MORE_LABELS[moreScreen] ?? humanizeRouteSegment(moreScreen));
  }
  if (detail) {
    parts.push(detail);
  }
  return parts.join(' › ');
}
