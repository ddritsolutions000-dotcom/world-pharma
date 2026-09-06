'use client';

import Link from 'next/link';
import { Button } from '@world-pharma/ui-kit/web';
import { customerSiteUrl } from './site-url';

export function AdminChromeHeader({
  unread,
  countryCode,
  onJump,
  onSignOut,
  onExpire,
  showExpire,
}: {
  unread: number;
  countryCode: string;
  onJump: () => void;
  onSignOut: () => void;
  onExpire?: () => void;
  showExpire: boolean;
}) {
  return (
    <header className="wp-admin-top">
      <div className="wp-admin-top-brand">
        <strong>World Pharma</strong>
        <span className="wp-admin-env">Main Admin · {countryCode} · sandbox</span>
      </div>
      <nav className="wp-admin-top-links" aria-label="Control plane shortcuts">
        <Link href="/">Dashboard</Link>
        <Link href="/orders">Orders</Link>
        <Link href="/partners">Partners</Link>
        <Link href="/catalog">Catalog</Link>
        <Link href="/finance">Finance</Link>
        <Link href="/cms">CMS</Link>
        <Link href="/crm">CRM</Link>
        <Link href="/support">Support</Link>
        <Link href="/notifications">
          Inbox{unread > 0 ? ` (${unread})` : ''}
        </Link>
        <Link href="/security">Security</Link>
        <Link href="/audit">Audit</Link>
      </nav>
      <div className="wp-admin-top-actions">
        <a className="wp-admin-storefront" href={customerSiteUrl()} target="_blank" rel="noreferrer">
          Storefront ↗
        </a>
        <Button size="sm" variant="secondary" onClick={onJump}>
          Search ⌘K
        </Button>
        <Link href="/security">
          <Button size="sm" variant="tertiary">
            Account
          </Button>
        </Link>
        {showExpire && onExpire ? (
          <Button variant="secondary" size="sm" onClick={onExpire}>
            Expire session
          </Button>
        ) : null}
        <Button variant="tertiary" size="sm" onClick={onSignOut}>
          Sign out
        </Button>
      </div>
    </header>
  );
}
