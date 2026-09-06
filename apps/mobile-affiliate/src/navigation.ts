import type { SessionSnapshot } from '@world-pharma/shell-core';

export type AffiliateTab =
  | 'dashboard'
  | 'links'
  | 'earnings'
  | 'statement'
  | 'inbox'
  | 'support'
  | 'profile';

export type AffiliateMobileScreen = 'sign-in' | AffiliateTab | 'expired';

export function affiliateMobileScreen(
  session: SessionSnapshot,
  tab: AffiliateTab = 'dashboard',
): AffiliateMobileScreen {
  if (session.status === 'expired') {
    return 'expired';
  }
  if (session.status !== 'authenticated') {
    return 'sign-in';
  }
  return tab;
}

export const AFFILIATE_TABS: Array<{ id: AffiliateTab; label: string }> = [
  { id: 'dashboard', label: 'Home' },
  { id: 'links', label: 'Links' },
  { id: 'earnings', label: 'Earn' },
  { id: 'statement', label: 'Stmt' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'support', label: 'Help' },
  { id: 'profile', label: 'Profile' },
];

export const AFFILIATE_SHELL_TABS: Array<{ id: AffiliateTab; label: string }> = [
  { id: 'dashboard', label: 'Home' },
  { id: 'links', label: 'Links' },
  { id: 'earnings', label: 'Earn' },
  { id: 'profile', label: 'More' },
];

export function affiliateTabBreadcrumb(tab: AffiliateTab): string {
  const labels: Record<AffiliateTab, string> = {
    dashboard: 'Dashboard',
    links: 'Referral links & codes',
    earnings: 'Commissions',
    statement: 'Statement',
    inbox: 'Inbox',
    support: 'Support',
    profile: 'Profile & verification',
  };
  return labels[tab];
}
