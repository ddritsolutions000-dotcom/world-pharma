'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { canAccessProtected, type Audience } from '@world-pharma/shell-core';
import {
  Button,
  HeaderBar,
  LoadingState,
  PermissionDeniedState,
  SessionExpiredState,
  Sidebar,
} from '@world-pharma/ui-kit/web';
import { PortalAuthPage } from './portal-auth-page';
import type { PortalAuthId } from './portal-auth-config';
import { RouteBreadcrumbs } from './route-breadcrumbs-ui';
import type { RouteCrumb } from './route-breadcrumbs';
import { useSession } from './session-context';
import { PlatformPartnerStrip } from './platform-ecosystem-nav';
import { PortalBrandBar } from './portal-brand-bar';
import './portal-shell.css';

export type PortalNavItem = { id: string; label: string };

export function PortalWorkspaceShell({
  portalId,
  brandTitle,
  portalLabel,
  nav,
  currentNav,
  onNavSelect,
  breadcrumbs,
  children,
  audience,
  headerActions,
}: {
  portalId: PortalAuthId;
  brandTitle: string;
  portalLabel?: string;
  nav: PortalNavItem[];
  currentNav: string;
  onNavSelect?: (id: string) => void;
  breadcrumbs?: RouteCrumb[];
  children: ReactNode;
  audience?: Audience;
  headerActions?: ReactNode;
}) {
  const { session, signOut } = useSession();
  // Match SSR + first client paint (anonymous auth chrome) to avoid hydration blank/overlays.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || session.status === 'anonymous') {
    return <PortalAuthPage portalId={portalId} />;
  }

  if (session.status === 'expired') {
    return (
      <div className="shell-main">
        <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />
      </div>
    );
  }

  if (session.status !== 'authenticated') {
    return <LoadingState label="Opening workspace…" />;
  }

  if (audience && !canAccessProtected(session, audience)) {
    return (
      <div className="shell-main">
        <PermissionDeniedState />
      </div>
    );
  }

  return (
    <div className="portal-root" data-tone={portalId}>
      {portalLabel ? <PortalBrandBar portalLabel={portalLabel} /> : null}
      <HeaderBar title={`World-Pharma · ${brandTitle}`}>
        {headerActions}
        <Button variant="tertiary" size="sm" onClick={() => signOut()}>
          Sign out
        </Button>
      </HeaderBar>
      <div className="portal-body">
        <aside className="portal-sidebar">
          <Sidebar items={nav} current={currentNav} onSelect={onNavSelect} />
        </aside>
        <main className="portal-main">
          {breadcrumbs?.length ? <RouteBreadcrumbs items={breadcrumbs} /> : null}
          <div className="wp-stack">{children}</div>
        </main>
      </div>
      <PlatformPartnerStrip />
    </div>
  );
}
