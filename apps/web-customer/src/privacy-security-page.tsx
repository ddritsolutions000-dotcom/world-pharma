'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  Heading,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import { logoutAllSessions } from './account-api';

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
    return <EmptyState title="Sign in required" description="Sign in to review privacy and security settings." />;
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
    <section>
      <Heading level={1}>Privacy &amp; security</Heading>
      <Text tone="secondary">
        Manage account security, sessions, and links to consent and notification settings. Legal copy is policy-driven
        and may be updated by your country pack.
      </Text>
      <Link href="/account">
        <Button variant="tertiary" size="sm">
          Back to account
        </Button>
      </Link>

      <Heading level={2}>Privacy</Heading>
      <Card>
        <Text>Data access &amp; consent</Text>
        <Text size="caption" tone="secondary">
          [Policy placeholder] Your country policy pack defines what data is collected, how it is used for clinical
          and commerce services, and how consent is recorded. This text is not legal advice — refer to published policy
          when available.
        </Text>
        <Link href="/account/consent">
          <Button variant="secondary" size="sm">
            Manage consent grants
          </Button>
        </Link>
      </Card>

      <Heading level={2}>Security</Heading>
      <Card>
        <Text>Active sessions</Text>
        <Text size="caption" tone="secondary">
          Sign out of all devices where you are signed in with this identity. You will need to sign in again on each
          device.
        </Text>
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void handleLogoutAll()}>
          {busy ? 'Signing out…' : 'Sign out all sessions'}
        </Button>
        <Button variant="tertiary" size="sm" onClick={() => signOut()}>
          Sign out this device
        </Button>
      </Card>

      <Heading level={2}>Notifications</Heading>
      <Card>
        <Text>Notification preferences</Text>
        <Text size="caption" tone="secondary">
          Control order, appointment, and delivery notifications separately from clinical consent.
        </Text>
        <Link href="/account/preferences">
          <Button variant="secondary" size="sm">
            Open notification preferences
          </Button>
        </Link>
      </Card>

      <Heading level={2}>Support</Heading>
      <Card>
        <Text>Need help?</Text>
        <Text size="caption" tone="secondary">
          Contact support for account access issues. Do not share clinical details in support tickets unless required.
        </Text>
        <Link href="/account/support">
          <Button variant="secondary" size="sm">
            Open support
          </Button>
        </Link>
      </Card>

      {error === 'network' ? (
        <NetworkErrorState action={{ label: 'Dismiss', onClick: () => setError(null) }} />
      ) : null}
      {message ? <Text>{message}</Text> : null}
    </section>
  );
}
