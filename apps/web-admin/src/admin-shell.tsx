'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { canAccessProtected, visibleNavItems } from '@world-pharma/shell-core';
import { adminApiRoot, adminAuthHeaders } from './admin-http';
import { scopeLabel } from './working-country';
import { useSession, showDevTools, PathBreadcrumbs, ADMIN_ROUTE_LABELS } from '@world-pharma/shell-web';
import {
  Card,
  EmptyState,
  Heading,
  LoadingState,
  PermissionDeniedState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import { resolveActiveNavId } from './active-admin-nav';
import { AdminChromeFooter } from './admin-chrome-footer';
import { AdminChromeHeader } from './admin-chrome-header';
import { AdminCommandPalette } from './admin-command-palette';
import { AdminSidebar } from './admin-sidebar';
import { loadApiHealthReady } from './home-dashboard-api';
import { ADMIN_NAV } from './nav';

export function AdminShell({
  children,
  currentNav,
}: {
  children?: React.ReactNode;
  currentNav?: string;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const { session, expire, signOut, getAccessToken } = useSession();
  // Defer auth-gated chrome until after mount so SSR (anonymous) matches the
  // first client paint and avoids hydration mismatch / blank overlay on deep links.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (session.status === 'anonymous' && pathname !== '/login') {
      const next = encodeURIComponent(pathname);
      router.replace(`/login?next=${next}`);
    }
  }, [mounted, pathname, router, session.status]);

  if (!mounted || session.status === 'anonymous') {
    return <LoadingState label="Opening Main Admin…" />;
  }

  if (session.status === 'expired') {
    return (
      <SessionExpiredState
        action={{
          label: 'Sign in again',
          onClick: () => router.replace('/login'),
        }}
      />
    );
  }

  if (session.status !== 'authenticated') {
    return <LoadingState label="Opening Main Admin…" />;
  }

  if (!canAccessProtected(session, 'admin')) {
    return <PermissionDeniedState />;
  }

  if (getAccessToken() === '__cookie__' && session.permissions.length === 0) {
    return <LoadingState label="Loading your access…" />;
  }

  return (
    <AdminChrome currentNav={currentNav} expire={expire} signOut={signOut}>
      {children}
    </AdminChrome>
  );
}

function AdminChrome({
  children,
  currentNav,
  expire,
  signOut,
}: {
  children?: React.ReactNode;
  currentNav?: string;
  expire: () => void;
  signOut: () => void;
}) {
  const { session, getAccessToken } = useSession();
  const nav = visibleNavItems(session, ADMIN_NAV);
  const pathname = usePathname() ?? '/';
  const activeId = currentNav ?? resolveActiveNavId(pathname, nav);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [apiReady, setApiReady] = useState<'ready' | 'not_ready' | 'checking'>('checking');

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    void loadApiHealthReady().then((result) => {
      setApiReady(result.ok ? result.data : 'not_ready');
    });
    const token = getAccessToken();
    if (!token) {
      return;
    }
    void fetch(`${adminApiRoot()}/api/v1/me/notifications/inbox`, {
      credentials: 'include',
      headers: adminAuthHeaders(token),
    })
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((body: { data?: Array<{ read?: boolean }> }) => {
        setUnread((body.data ?? []).filter((row) => !row.read).length);
      })
      .catch(() => undefined);
  }, [getAccessToken]);

  return (
    <div className="admin-body" data-tone="admin">
      <a className="wp-admin-skip" href="#admin-main">
        Skip to content
      </a>
      <AdminChromeHeader
        unread={unread}
        countryCode={scopeLabel(session.countryCode)}
        onJump={() => setPaletteOpen(true)}
        onSignOut={signOut}
        onExpire={expire}
        showExpire={showDevTools()}
      />
      <div className="admin-content">
        <AdminSidebar items={nav} activeId={activeId} />
        <main className="admin-main" id="admin-main">
          <div className="wp-admin-inner">
            <PathBreadcrumbs
              pathname={pathname}
              options={{ root: { href: '/', label: 'Dashboard' }, labels: ADMIN_ROUTE_LABELS }}
              LinkComponent={Link}
            />
            {children ?? (
              <div className="wp-stack">
                <Heading level={1}>Operations shell</Heading>
                <Text tone="secondary">Navigation is permission-aware. Press Ctrl+K to jump.</Text>
                <Card>
                  <EmptyState
                    title="Select a module"
                    description="Use the sidebar to open catalog, inventory, partners, and other consoles."
                  />
                </Card>
              </div>
            )}
          </div>
        </main>
      </div>
      <AdminChromeFooter apiReady={apiReady} countryScope={session.countryCode} />
      <AdminCommandPalette items={nav} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
