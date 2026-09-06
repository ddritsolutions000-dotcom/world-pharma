'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { VendorCtaLink } from './vendor-cta-link';
import { VENDOR_JOIN_ROUTES } from './vendor-join-routes';
import {
  isVendorNavActive,
  scrollToVendorSection,
  VendorNavLink,
  type VendorNavItem,
} from './vendor-public-nav';

const PRIMARY_NAV: VendorNavItem[] = [
  { href: '/', label: 'Home' },
  { href: VENDOR_JOIN_ROUTES.hub, label: 'Join' },
  { href: VENDOR_JOIN_ROUTES.apply, label: 'Apply' },
  { href: VENDOR_JOIN_ROUTES.status, label: 'Track application' },
  { href: '/#why-sell', label: 'Why sell' },
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#faq', label: 'FAQ' },
];

export function VendorPublicShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/';
  const { session } = useSession();
  const signedIn = session.status === 'authenticated';
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    closeMenu();
  }, [pathname]);

  useEffect(() => {
    if (pathname !== '/') {
      return;
    }

    const scrollFromHash = () => {
      const hash = window.location.hash.replace(/^#/, '');
      if (!hash) {
        return;
      }
      window.requestAnimationFrame(() => {
        scrollToVendorSection(hash);
      });
    };

    scrollFromHash();
    window.addEventListener('hashchange', scrollFromHash);
    return () => window.removeEventListener('hashchange', scrollFromHash);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  const navLinkClass = (href: string) =>
    isVendorNavActive(pathname, href) ? 'vendor-public-nav-link is-active' : 'vendor-public-nav-link';

  return (
    <div className="vendor-public-root">
      <div className="vendor-public-ambient" aria-hidden />
      <div className="vendor-public-announce">
        <span className="vendor-public-announce-pill">Vendor sellers only</span>
        <span>Marketplace vendor onboarding — apply here, then manage catalog & orders after approval.</span>
      </div>
      <header className="vendor-public-header">
        <div className="vendor-public-header-inner">
          <Link href="/" className="vendor-public-brand" onClick={closeMenu}>
            <span className="vendor-public-brand-mark" aria-hidden>
              W
            </span>
            <span className="vendor-public-brand-text">
              World Pharma <em>Vendor</em>
            </span>
          </Link>

          <button
            type="button"
            className={`vendor-public-menu-btn${menuOpen ? ' is-open' : ''}`}
            aria-expanded={menuOpen}
            aria-controls="vendor-public-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="vendor-public-menu-icon" aria-hidden />
            <span className="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
          </button>

          <nav
            id="vendor-public-nav"
            className={`vendor-public-nav${menuOpen ? ' is-open' : ''}`}
            aria-label="Primary"
          >
            <div className="vendor-public-nav-links">
              {PRIMARY_NAV.map((item) => (
                <VendorNavLink
                  key={item.href}
                  item={item}
                  className={navLinkClass(item.href)}
                  onNavigate={closeMenu}
                />
              ))}
            </div>
            <div className="vendor-public-nav-actions">
              {signedIn ? (
                <Link
                  href="/workspace"
                  className="vendor-public-nav-link vendor-public-nav-link--accent"
                  onClick={closeMenu}
                >
                  Seller workspace
                </Link>
              ) : (
                <Link href="/login" className="vendor-public-nav-link" onClick={closeMenu}>
                  Sign in
                </Link>
              )}
              <VendorCtaLink href={VENDOR_JOIN_ROUTES.apply} size="sm" onClick={closeMenu}>
                Join as vendor
              </VendorCtaLink>
            </div>
          </nav>
        </div>
        {menuOpen ? (
          <button
            type="button"
            className="vendor-public-nav-backdrop"
            aria-label="Close menu"
            onClick={closeMenu}
          />
        ) : null}
      </header>
      <main className="vendor-public-main">{children}</main>
      <footer className="vendor-public-footer">
        <div className="vendor-public-footer-grid">
          <div className="vendor-public-footer-brand">
            <Link href="/" className="vendor-public-brand vendor-public-brand--footer">
              <span className="vendor-public-brand-mark" aria-hidden>
                W
              </span>
              <span className="vendor-public-brand-text">
                World Pharma <em>Vendor</em>
              </span>
            </Link>
            <p className="vendor-public-footer-lead">
              Marketplace vendor seller portal — list products, fulfil orders, and view settlements. For approved vendor
              operators only.
            </p>
          </div>
          <div>
            <p className="vendor-public-footer-col-title">Onboarding</p>
            <div className="vendor-public-footer-links">
              <Link href={VENDOR_JOIN_ROUTES.hub}>Join program</Link>
              <Link href={VENDOR_JOIN_ROUTES.apply}>Apply as vendor</Link>
              <Link href={VENDOR_JOIN_ROUTES.status}>Track application</Link>
            </div>
          </div>
          <div>
            <p className="vendor-public-footer-col-title">Seller portal</p>
            <div className="vendor-public-footer-links">
              <Link href="/login">Vendor sign in</Link>
              <Link href="/workspace">Seller workspace</Link>
            </div>
          </div>
        </div>
        <p className="vendor-public-footer-note">
          World Pharma marketplace vendors sell and fulfil through approved onboarding — not a manufacturer.
        </p>
      </footer>
    </div>
  );
}
