'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  VENDOR_MOBILE_NAV,
  VENDOR_NAV_GROUPS,
  VENDOR_TAB_META,
  vendorTabPath,
  type VendorTabId,
} from './vendor-workspace-nav';
import { VendorNavIconGlyph } from './vendor-sidebar-icons';
import type { VendorOrganization } from './vendor-api';

export function VendorSidebar({
  current,
  organizations,
  organizationId,
  onOrgChange,
  orgLoading,
  orgName,
  onCloseMobile,
}: {
  current: VendorTabId;
  organizations: VendorOrganization[];
  organizationId: string;
  onOrgChange: (id: string) => void;
  orgLoading: boolean;
  orgName?: string;
  onCloseMobile?: () => void;
}) {
  return (
    <aside className="vws-sidebar" aria-label="Seller navigation">
      <div className="vws-sidebar-brand">
        <Link href="/" className="vws-brand-link" onClick={onCloseMobile}>
          <span className="vws-brand-mark" aria-hidden>
            WP
          </span>
          <span className="vws-brand-copy">
            <strong>World Pharma</strong>
            <small>Seller Centre</small>
          </span>
        </Link>
      </div>

      <div className="vws-org-block">
        <label className="vws-org-label" htmlFor="vws-org-select">
          Selling as
        </label>
        {orgLoading ? (
          <p className="vws-org-loading">Loading organizations…</p>
        ) : (
          <select
            id="vws-org-select"
            className="vws-org-select"
            value={organizationId}
            onChange={(e) => onOrgChange(e.target.value)}
          >
            <option value="">Select organization</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.display_name || org.legal_name}
                {org.country_code ? ` · ${org.country_code}` : ''}
              </option>
            ))}
          </select>
        )}
        {orgName ? <p className="vws-org-meta">{orgName}</p> : null}
      </div>

      <nav className="vws-nav">
        {VENDOR_NAV_GROUPS.map((group) => (
          <div key={group.id} className="vws-nav-group">
            <p className="vws-nav-group-label">{group.label}</p>
            <ul className="vws-nav-list">
              {group.items.map((id) => {
                const meta = VENDOR_TAB_META[id];
                const active = current === id;
                return (
                  <li key={id}>
                    <Link
                      href={vendorTabPath(id)}
                      className={`vws-nav-item${active ? ' is-active' : ''}`}
                      aria-current={active ? 'page' : undefined}
                      onClick={onCloseMobile}
                    >
                      <span className="vws-nav-icon" aria-hidden>
                        <VendorNavIconGlyph icon={meta.icon} />
                      </span>
                      <span className="vws-nav-text">{meta.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="vws-sidebar-foot">
        <Link href="/" className="vws-foot-link" onClick={onCloseMobile}>
          ← Vendor website
        </Link>
      </div>
    </aside>
  );
}

export function VendorMobileNav({
  current,
  onOpenMenu,
}: {
  current: VendorTabId;
  onOpenMenu: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="vws-mobile-nav" aria-label="Quick navigation">
      {VENDOR_MOBILE_NAV.map((id) => {
        const meta = VENDOR_TAB_META[id];
        const href = vendorTabPath(id);
        const active = current === id || pathname === href;
        return (
          <Link
            key={id}
            href={href}
            className={`vws-mobile-item${active ? ' is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <VendorNavIconGlyph icon={meta.icon} />
            <span>{meta.label}</span>
          </Link>
        );
      })}
      <button type="button" className="vws-mobile-item" onClick={onOpenMenu} aria-label="Open full menu">
        <span className="vws-mobile-more" aria-hidden>
          ⋯
        </span>
        <span>More</span>
      </button>
    </nav>
  );
}
