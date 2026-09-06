'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { AFFILIATE_ROUTE_LABELS, PortalWorkspaceShell } from '@world-pharma/shell-web';

export const AFFILIATE_NAV = [
  { id: 'dashboard', label: 'Dashboard', href: '/' },
  { id: 'codes', label: 'Codes', href: '/codes' },
  { id: 'links', label: 'Links', href: '/links' },
  { id: 'earnings', label: 'Earnings', href: '/earnings' },
  { id: 'statement', label: 'Statement', href: '/statement' },
  { id: 'inbox', label: 'Inbox', href: '/inbox' },
  { id: 'support', label: 'Support', href: '/support' },
  { id: 'profile', label: 'Profile', href: '/profile' },
] as const;

export type AffiliateNavId = (typeof AFFILIATE_NAV)[number]['id'];

export function AffiliateShell({
  currentNav,
  children,
}: {
  currentNav: AffiliateNavId;
  children: ReactNode;
}) {
  const router = useRouter();
  const current = AFFILIATE_NAV.find((item) => item.id === currentNav);
  const pageLabel = current ? AFFILIATE_ROUTE_LABELS[current.href] ?? current.label : 'Affiliate';

  return (
    <PortalWorkspaceShell
      portalId="affiliate"
      brandTitle="World Pharma Affiliate"
      nav={AFFILIATE_NAV.map(({ id, label }) => ({ id, label }))}
      currentNav={currentNav}
      onNavSelect={(id) => {
        const item = AFFILIATE_NAV.find((row) => row.id === id);
        if (item) {
          router.push(item.href);
        }
      }}
      audience="customer"
      breadcrumbs={[{ label: 'World Pharma' }, { label: 'Affiliate' }, { label: pageLabel }]}
    >
      {children}
    </PortalWorkspaceShell>
  );
}
