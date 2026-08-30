'use client';

import { useState } from 'react';
import { canAccessProtected, visibleNavItems } from '@world-pharma/shell-core';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  HeaderBar,
  Heading,
  Input,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
  Sidebar,
  Text,
} from '@world-pharma/ui-kit/web';
import { ADMIN_NAV } from './nav';

export function AdminShell({ children }: { children?: React.ReactNode }) {
  const { session, signInWithOtp, expire, signOut } = useSession();
  const [email, setEmail] = useState('');
  const [signInError, setSignInError] = useState<string | null>(null);

  if (session.status === 'expired') {
    return (
      <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />
    );
  }

  if (session.status !== 'authenticated') {
    return (
      <main className="admin-main">
        <div className="wp-stack">
          <Heading level={1}>Admin sign-in</Heading>
          <Text tone="secondary">Use OTP against the real API. Dev tokens are not accepted.</Text>
          <FormField label="Admin email">
            {({ id }) => <Input id={id} value={email} onChange={(e) => setEmail(e.target.value)} />}
          </FormField>
          <Button
            onClick={() => {
              void signInWithOtp(email, 'admin')
                .then(() => setSignInError(null))
                .catch((err: Error) => setSignInError(err.message));
            }}
          >
            Sign in with OTP
          </Button>
          {signInError ? <NetworkErrorState action={{ label: 'Retry', onClick: () => setSignInError(null) }} /> : null}
        </div>
      </main>
    );
  }

  if (!canAccessProtected(session, 'admin')) {
    return <PermissionDeniedState />;
  }

  const nav = visibleNavItems(session, ADMIN_NAV);

  return (
    <div className="admin-body">
      <HeaderBar title="World Pharma Admin">
        <Button variant="secondary" size="sm" onClick={() => expire()}>
          Expire session
        </Button>
        <Button variant="tertiary" size="sm" onClick={() => signOut()}>
          Sign out
        </Button>
      </HeaderBar>
      <div className="admin-content">
        <Sidebar items={nav.map((item) => ({ id: item.id, label: item.label }))} current="home" />
        <main className="admin-main">
          {children ?? (
            <div className="wp-stack">
              <Heading level={1}>Operations shell</Heading>
              <Text tone="secondary">Navigation is permission-aware.</Text>
              <Card>
                <EmptyState
                  title="Select a module"
                  description="Use the sidebar to open catalog, inventory, partners, and other consoles."
                />
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
