'use client';

import { PLATFORM_APP_URLS } from './platform-ecosystem-nav';
import './portal-shell.css';

/** Partner portal top bar — links back to the World-Pharma consumer site. */
export function PortalBrandBar({ portalLabel }: { portalLabel: string }) {
  return (
    <div className="wp-portal-brand-bar">
      <span className="wp-portal-brand-title">
        World<span className="wp-portal-brand-accent">Pharma</span>
        <span className="wp-portal-brand-sep">·</span>
        {portalLabel}
      </span>
      <nav className="wp-portal-brand-links" aria-label="Platform links">
        <a href={PLATFORM_APP_URLS.customer}>Customer store</a>
        <a href={PLATFORM_APP_URLS.join}>Partner with us</a>
        <a href={PLATFORM_APP_URLS.admin}>Admin</a>
      </nav>
    </div>
  );
}
