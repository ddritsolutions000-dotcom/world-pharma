'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ServiceHero } from './mg-ui';

const ACCOUNT_LINKS = [
  { href: '/account', label: 'Profile', match: (p: string) => p === '/account' },
  { href: '/health', label: 'Health', match: (p: string) => p.startsWith('/health') },
  { href: '/appointments', label: 'Appointments', match: (p: string) => p.startsWith('/appointments') },
  { href: '/prescriptions', label: 'Prescriptions', match: (p: string) => p.startsWith('/prescriptions') },
  { href: '/lab/bookings', label: 'Lab reports', match: (p: string) => p.startsWith('/lab') },
  { href: '/radiology/bookings', label: 'Imaging', match: (p: string) => p.startsWith('/radiology') },
  { href: '/orders', label: 'Orders', match: (p: string) => p.startsWith('/orders') },
  { href: '/buy-again', label: 'Buy again', match: (p: string) => p.startsWith('/buy-again') },
  { href: '/account/notifications', label: 'Inbox', match: (p: string) => p.startsWith('/account/notifications') },
  { href: '/account/addresses', label: 'Addresses', match: (p: string) => p.startsWith('/account/addresses') },
  { href: '/family', label: 'Family', match: (p: string) => p.startsWith('/family') },
  { href: '/account/wishlist', label: 'Wishlist', match: (p: string) => p.startsWith('/account/wishlist') },
  { href: '/account/loyalty', label: 'Rewards', match: (p: string) => p.startsWith('/account/loyalty') },
  { href: '/care-plan', label: 'Care Plan', match: (p: string) => p.startsWith('/care-plan') },
  { href: '/account/preferences', label: 'Alerts', match: (p: string) => p.startsWith('/account/preferences') },
  { href: '/account/privacy', label: 'Privacy', match: (p: string) => p.startsWith('/account/privacy') },
  { href: '/account/consent', label: 'Consent', match: (p: string) => p.startsWith('/account/consent') },
  { href: '/account/support', label: 'Support', match: (p: string) => p.startsWith('/account/support') },
] as const;

export function AccountHubNav() {
  const pathname = usePathname() ?? '/';
  return (
    <nav className="mg-account-nav" aria-label="Account sections">
      {ACCOUNT_LINKS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={item.match(pathname) ? 'mg-account-nav-link is-active' : 'mg-account-nav-link'}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function AccountPage({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mg-page">
      <AccountHubNav />
      <ServiceHero kicker="Account" title={title} subtitle={subtitle} compact />
      {children}
    </div>
  );
}
