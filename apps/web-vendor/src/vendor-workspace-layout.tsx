'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  showDevTools,
  RouteBreadcrumbs,
  buildPortalBreadcrumbs,
  useSession,
  PortalBrandBar,
} from '@world-pharma/shell-web';
import { Button } from '@world-pharma/ui-kit/web';
import { VendorCtaLink } from './vendor-cta-link';
import { VENDOR_JOIN_ROUTES } from './vendor-join-routes';
import { VendorMobileNav, VendorSidebar } from './vendor-sidebar';
import { VendorNotificationBell } from './vendor-notification-bell';
import { VendorWorkspaceProvider, useVendorWorkspace } from './vendor-workspace-context';
import {
  isVendorTabId,
  VENDOR_TAB_META,
  vendorTabFromPath,
  vendorTabPath,
} from './vendor-workspace-nav';

function VendorWorkspaceChrome({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { expire } = useSession();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const {
    organizations,
    organizationId,
    selectedOrg,
    token,
    scopeLoading,
    setOrganizationId,
    signOut,
  } = useVendorWorkspace();

  const tab = vendorTabFromPath(pathname) ?? 'dashboard';

  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '';
    if (hash && isVendorTabId(hash)) {
      router.replace(vendorTabPath(hash));
    }
  }, [router]);

  useEffect(() => {
    if (!mobileNavOpen) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileNavOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileNavOpen]);

  const orgMeta = selectedOrg
    ? `${selectedOrg.country_code} · ${selectedOrg.role_name}`
    : undefined;

  const breadcrumbLabels = Object.fromEntries(
    Object.values(VENDOR_TAB_META).map((item) => [item.id, item.label]),
  );

  return (
    <div className="portal-root vendor-body vws-root" data-tone="vendor">
      <PortalBrandBar portalLabel="Pharmacy vendor" />
      <header className="vws-topbar">
        <div className="vws-topbar-left">
          <button
            type="button"
            className="vws-menu-btn"
            aria-label="Open navigation menu"
            onClick={() => setMobileNavOpen(true)}
          >
            ☰
          </button>
          <div className="vws-topbar-title">
            <strong>Seller workspace</strong>
            <span>{selectedOrg?.display_name ?? 'Select organization'}</span>
          </div>
        </div>
        <div className="vws-topbar-actions">
          {token ? (
            <VendorNotificationBell
              token={token}
              onNavigate={() => router.push(vendorTabPath('notifications'))}
            />
          ) : null}
          <Link href="/">
            <Button variant="tertiary" size="sm">
              Home
            </Button>
          </Link>
          <VendorCtaLink href={VENDOR_JOIN_ROUTES.hub} variant="secondary" size="sm">
            Join
          </VendorCtaLink>
          {showDevTools() ? (
            <Button variant="secondary" size="sm" onClick={() => expire()}>
              Expire
            </Button>
          ) : null}
          <Button variant="tertiary" size="sm" onClick={() => signOut()}>
            Sign out
          </Button>
        </div>
      </header>

      <div className="vws-layout">
        <VendorSidebar
          current={tab}
          organizations={organizations}
          organizationId={organizationId}
          onOrgChange={setOrganizationId}
          orgLoading={scopeLoading}
          orgName={orgMeta}
        />

        {mobileNavOpen ? (
          <button
            type="button"
            className="vws-backdrop"
            aria-label="Close navigation menu"
            onClick={() => setMobileNavOpen(false)}
          />
        ) : null}

        <div className={`vws-mobile-drawer${mobileNavOpen ? ' is-open' : ''}`}>
          <VendorSidebar
            current={tab}
            organizations={organizations}
            organizationId={organizationId}
            onOrgChange={setOrganizationId}
            orgLoading={scopeLoading}
            orgName={orgMeta}
            onCloseMobile={() => setMobileNavOpen(false)}
          />
        </div>

        <main className="vws-main shell-main">
          <div className="wp-stack">
            <RouteBreadcrumbs
              items={buildPortalBreadcrumbs('Vendor', tab, breadcrumbLabels)}
            />
            {children}
          </div>
        </main>
      </div>

      <VendorMobileNav
        current={tab}
        onOpenMenu={() => setMobileNavOpen(true)}
      />
    </div>
  );
}

export function VendorWorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <VendorWorkspaceProvider>
      <VendorWorkspaceChrome>{children}</VendorWorkspaceChrome>
    </VendorWorkspaceProvider>
  );
}

/** @deprecated use VendorWorkspaceLayout */
export function VendorShell({ children }: { children?: ReactNode }) {
  return <VendorWorkspaceLayout>{children}</VendorWorkspaceLayout>;
}
