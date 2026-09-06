'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { PathBreadcrumbs, JOIN_ROUTE_LABELS } from '@world-pharma/shell-web';

const PRIMARY_NAV = [
  { href: '/', label: 'Home' },
  { href: '/apply', label: 'Apply now' },
  { href: '/status', label: 'Track status' },
] as const;

const PARTNER_NAV = [
  { href: '/pharmacy', label: 'Pharmacy', icon: '💊' },
  { href: '/doctor', label: 'Doctors', icon: '👨‍⚕️' },
  { href: '/lab', label: 'Labs', icon: '🧪' },
  { href: '/imaging', label: 'Imaging', icon: '🩻' },
  { href: '/delivery', label: 'Delivery', icon: '🚚' },
  { href: '/affiliate', label: 'Affiliates', icon: '🤝' },
] as const;

export function JoinShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/';

  return (
    <div className="join-root">
      <div className="join-sandbox-banner" role="status">
        Partner onboarding sandbox — applications here do not create live licences or production settlements.
      </div>
      <header className="join-header">
        <div className="join-header-inner">
          <Link href="/" className="join-brand">
            World-Pharma™ Partners
          </Link>
          <nav className="join-nav-primary" aria-label="Primary">
            {PRIMARY_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={pathname === item.href ? 'join-nav-link is-active' : 'join-nav-link'}
              >
                {item.label}
              </Link>
            ))}
            <Link href="/login" className="join-nav-link">
              Sign in
            </Link>
            <Link href="/signup" className="join-nav-link join-nav-link--accent">
              Create partner login
            </Link>
          </nav>
        </div>
        <nav className="join-partner-strip" aria-label="Partner types">
          {PARTNER_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={pathname.startsWith(item.href) ? 'join-partner-chip is-active' : 'join-partner-chip'}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="join-main">
        <PathBreadcrumbs
          pathname={pathname}
          options={{ root: { href: '/', label: 'Partners' }, labels: JOIN_ROUTE_LABELS }}
          LinkComponent={Link}
          className="join-crumbs wp-crumbs"
        />
        {children}
      </main>
      <footer className="join-footer">
        <p className="join-footer-trust">Trusted by healthcare partners across medicines, diagnostics, and delivery.</p>
        <p className="join-footer-note">
          World Pharma is a marketplace platform. Partners sell and fulfil through approved onboarding — not a manufacturer.
        </p>
      </footer>
    </div>
  );
}
