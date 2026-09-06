'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { canAccessProtected, visibleNavItems } from '@world-pharma/shell-core';
import { showDevTools, useSession, PathBreadcrumbs, DOCTOR_ROUTE_LABELS, PortalAuthPage, PortalBrandBar } from '@world-pharma/shell-web';
import {
  Button,
  HeaderBar,
  Heading,
  PermissionDeniedState,
  SessionExpiredState,
  Sidebar,
  Text,
} from '@world-pharma/ui-kit/web';
import { fetchNotificationInbox } from './doctor-api';
import { DOCTOR_NAV } from './nav';
import { unreadInboxCount } from './notification-inbox';

function InboxNavButton() {
  const { session, getAccessToken, expire } = useSession();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated' || session.audience !== 'doctor') {
      setUnread(0);
      return;
    }
    void fetchNotificationInbox({ token, onUnauthorized: expire }).then((result) => {
      if (result.ok) {
        setUnread(unreadInboxCount(result.data.data ?? []));
      }
    });
  }, [expire, getAccessToken, session.audience, session.status]);

  const label = unread > 0 ? `Inbox (${unread})` : 'Inbox';
  return (
    <Button variant="tertiary" size="sm" onClick={() => (window.location.href = '/inbox')}>
      {label}
    </Button>
  );
}

export function DoctorShell({
  title,
  description,
  children,
  currentNav = 'home',
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
  currentNav?: string;
}) {
  const { session, expire, signOut } = useSession();
  // Hooks must run unconditionally (Sprint 104 — was after early returns).
  const pathname = usePathname() ?? '/';
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || session.status === 'anonymous') {
    return <PortalAuthPage portalId="doctor" />;
  }

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (session.status !== 'authenticated') {
    return <PortalAuthPage portalId="doctor" />;
  }

  if (!canAccessProtected(session, 'doctor')) {
    return <PermissionDeniedState />;
  }

  const nav = visibleNavItems(session, DOCTOR_NAV);

  return (
    <div className="portal-root doctor-body" data-tone="doctor">
      <PortalBrandBar portalLabel="Doctors" />
      <HeaderBar title="Consult workspace">
        <InboxNavButton />
        {showDevTools() ? (
          <Button variant="secondary" size="sm" onClick={() => expire()}>
            Expire session
          </Button>
        ) : null}
        <Button variant="tertiary" size="sm" onClick={() => signOut()}>
          Sign out
        </Button>
      </HeaderBar>
      <div className="portal-body">
        <aside className="portal-sidebar">
          <Sidebar
            items={nav.map((item) => ({ id: item.id, label: item.label }))}
            current={currentNav}
            onSelect={(id) => {
              const item = nav.find((entry) => entry.id === id);
              if (item?.href) {
                window.location.assign(item.href);
              }
            }}
          />
        </aside>
        <main className="portal-main doctor-main">
          <PathBreadcrumbs
            pathname={pathname}
            options={{ root: { href: '/', label: 'Dashboard' }, labels: DOCTOR_ROUTE_LABELS }}
            LinkComponent={Link}
          />
          <div className="wp-stack">
            <header className="wp-page-header">
              <Heading level={1}>{title}</Heading>
              {description ? <p className="wp-page-intro">{description}</p> : null}
            </header>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
