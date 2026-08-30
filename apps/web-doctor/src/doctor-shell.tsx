'use client';

import { canAccessProtected, visibleNavItems } from '@world-pharma/shell-core';
import { OtpSignIn, useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  HeaderBar,
  Heading,
  PermissionDeniedState,
  SessionExpiredState,
  Sidebar,
  Text,
} from '@world-pharma/ui-kit/web';
import { DOCTOR_NAV } from './nav';

export function DoctorShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  const { session, verifyOtpChallenge, expire, signOut } = useSession();

  if (session.status === 'expired') {
    return (
      <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />
    );
  }

  if (session.status !== 'authenticated') {
    return (
      <main className="doctor-main">
        <div className="wp-stack">
          <Heading level={1}>Doctor sign-in</Heading>
          <OtpSignIn
            audience="doctor"
            title="Doctor sign-in"
            description="Clinical partner workspace. Sign in with a one-time code sent to your email."
            onVerified={(identifier, code, challengeId) =>
              verifyOtpChallenge(identifier, 'doctor', challengeId, code)
            }
          />
        </div>
      </main>
    );
  }

  if (!canAccessProtected(session, 'doctor')) {
    return <PermissionDeniedState />;
  }

  const nav = visibleNavItems(session, DOCTOR_NAV);

  return (
    <div className="doctor-body">
      <HeaderBar title="World Pharma Doctor">
        <Button variant="secondary" size="sm" onClick={() => expire()}>
          Expire session
        </Button>
        <Button variant="tertiary" size="sm" onClick={() => signOut()}>
          Sign out
        </Button>
      </HeaderBar>
      <div className="doctor-content">
        <Sidebar items={nav.map((item) => ({ id: item.id, label: item.label }))} current="home" />
        <main className="doctor-main">
          <div className="wp-stack">
            <Heading level={1}>{title}</Heading>
            <Text tone="secondary">{description}</Text>
            {children ?? (
              <Card>
                <EmptyState
                  title="Foundation only"
                  description="Profile, credentials, organizations, availability, and appointments."
                />
              </Card>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
