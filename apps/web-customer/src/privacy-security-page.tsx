'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  EmptyState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
} from '@world-pharma/ui-kit/web';
import { logoutAllSessions } from './account-api';
import { AccountPage } from './ui/account-hub-nav';
import { MgBtn, MgCard, Section } from './ui/mg-ui';

export function PrivacySecurityScreen() {
  const { session, getAccessToken, signOut, expire } = useSession();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<'network' | null>(null);

  const onUnauthorized = useCallback(() => expire(), [expire]);

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (session.status !== 'authenticated') {
    return (
      <AccountPage title="Privacy & security" subtitle="Manage your data and sessions.">
        <EmptyState
          title="Sign in required"
          description="Sign in to review privacy and security settings."
          action={{ label: 'Sign in', onClick: () => (window.location.href = '/login') }}
        />
      </AccountPage>
    );
  }

  if (session.audience !== 'customer') {
    return <PermissionDeniedState />;
  }

  async function handleLogoutAll() {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    const result = await logoutAllSessions({ token, onUnauthorized });
    setBusy(false);
    if (result.ok) {
      setMessage('All sessions signed out. Sign in again on this device.');
      signOut();
    } else if (result.kind !== 'unauthorized') {
      setError('network');
    }
  }

  return (
    <AccountPage title="Privacy & security" subtitle="Your data, sessions, and notification settings.">
      <Section title="Privacy">
        <MgCard>
          <h3 className="mg-list-title">Data access & consent</h3>
          <p className="mg-list-meta">
            Manage who can access your health records for consultations and lab services.
          </p>
          <MgBtn href="/account/consent" variant="secondary" size="sm">
            Manage consent
          </MgBtn>
        </MgCard>
      </Section>

      <Section title="Security">
        <MgCard>
          <h3 className="mg-list-title">Active sessions</h3>
          <p className="mg-list-meta">
            Sign out everywhere you are logged in. You will need to sign in again on each device.
          </p>
          <div className="mg-toolbar">
            <MgBtn variant="secondary" size="sm" onClick={() => void handleLogoutAll()}>
              {busy ? 'Signing out…' : 'Sign out all sessions'}
            </MgBtn>
            <MgBtn variant="ghost" size="sm" onClick={() => signOut()}>
              Sign out this device
            </MgBtn>
          </div>
        </MgCard>
      </Section>

      <Section title="Notifications">
        <MgCard>
          <h3 className="mg-list-title">Alert preferences</h3>
          <p className="mg-list-meta">Control order, appointment, and delivery notifications.</p>
          <MgBtn href="/account/preferences" variant="secondary" size="sm">
            Open alert settings
          </MgBtn>
        </MgCard>
      </Section>

      <Section title="Help">
        <MgCard>
          <h3 className="mg-list-title">Need help?</h3>
          <p className="mg-list-meta">Contact support for account access issues.</p>
          <MgBtn href="/account/support" variant="secondary" size="sm">
            Open support
          </MgBtn>
        </MgCard>
      </Section>

      <p className="mg-list-meta">
        <Link href="/help">Visit Help Center</Link> for FAQs on orders, refunds, and privacy policy.
      </p>

      {error === 'network' ? (
        <NetworkErrorState action={{ label: 'Dismiss', onClick: () => setError(null) }} />
      ) : null}
      {message ? <p className="mg-page-subtitle">{message}</p> : null}
    </AccountPage>
  );
}
