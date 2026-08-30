'use client';

import { useEffect, useState } from 'react';
import { OtpSignIn, useSession } from '@world-pharma/shell-web';
import {
  Button,
  HeaderBar,
  Heading,
  LoadingState,
  NetworkErrorState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import { StoreHome } from './store-home';

export function CustomerShell({
  apiReachable,
  countryLabel,
  joinPublic,
  children,
}: {
  apiReachable: boolean | null;
  countryLabel: string;
  joinPublic?: boolean;
  children?: React.ReactNode;
}) {
  const { session, verifyOtpChallenge, expire, signOut, getAccessToken } = useSession();
  const [joinStatusUrl, setJoinStatusUrl] = useState<string | null>(null);

  useEffect(() => {
    setJoinStatusUrl(process.env.NEXT_PUBLIC_JOIN_URL ?? 'http://localhost:3004');
  }, []);

  if (session.status === 'expired') {
    return (
      <SessionExpiredState
        action={{ label: 'Return to sign-in', onClick: () => signOut() }}
      />
    );
  }

  return (
    <>
      <HeaderBar title="World Pharma">
        {session.status === 'authenticated' ? (
          <Button variant="secondary" size="sm" onClick={() => signOut()}>
            Sign out
          </Button>
        ) : null}
      </HeaderBar>
      <main className="shell-main">
        <div className="wp-stack">
          {session.status !== 'authenticated' ? (
            <>
              <Heading level={1}>Customer sign-in</Heading>
              <OtpSignIn
                audience="customer"
                title="Customer sign-in"
                description="Use OTP to access orders, shipments, checkout, and account settings."
                onVerified={(identifier, code, challengeId) =>
                  verifyOtpChallenge(identifier, 'customer', challengeId, code)
                }
              />
            </>
          ) : (
            <>
              <Heading level={1}>Customer workspace</Heading>
              <Text tone="secondary">
                Browse the catalog, manage a cart, and review checkout. Payment is sandbox-only in this phase.
              </Text>
              <Button variant="tertiary" size="sm" onClick={() => (window.location.href = '/cart')}>
                Cart
              </Button>
              <Button variant="tertiary" size="sm" onClick={() => (window.location.href = '/orders')}>
                Orders
              </Button>
              <Button variant="tertiary" size="sm" onClick={() => (window.location.href = '/shipments')}>
                Shipments
              </Button>
              <Button variant="tertiary" size="sm" onClick={() => (window.location.href = '/doctors')}>
                Doctors
              </Button>
              <Button variant="tertiary" size="sm" onClick={() => (window.location.href = '/appointments')}>
                Appointments
              </Button>
              <Button variant="tertiary" size="sm" onClick={() => (window.location.href = '/lab')}>
                Lab tests
              </Button>
              <Button variant="tertiary" size="sm" onClick={() => (window.location.href = '/lab/bookings')}>
                Lab bookings
              </Button>
              <Button variant="tertiary" size="sm" onClick={() => (window.location.href = '/radiology')}>
                Radiology
              </Button>
              <Button variant="tertiary" size="sm" onClick={() => (window.location.href = '/radiology/bookings')}>
                Imaging bookings
              </Button>
              <Button variant="tertiary" size="sm" onClick={() => (window.location.href = '/prescriptions')}>
                Prescriptions
              </Button>
              <Button variant="tertiary" size="sm" onClick={() => (window.location.href = '/health')}>
                Health
              </Button>
              <Button variant="tertiary" size="sm" onClick={() => (window.location.href = '/account')}>
                Account
              </Button>
              <Button variant="tertiary" size="sm" onClick={() => (window.location.href = '/account/support')}>
                Support
              </Button>
              <Button variant="tertiary" size="sm" onClick={() => (window.location.href = '/help')}>
                Help Center
              </Button>
              {joinPublic ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (joinStatusUrl) {
                      window.location.href = joinStatusUrl;
                    }
                  }}
                >
                  Join as partner
                </Button>
              ) : null}
              <Button
                variant="tertiary"
                size="sm"
                onClick={() => {
                  if (joinStatusUrl) {
                    window.location.href = joinStatusUrl;
                  }
                }}
              >
                Partner application status
              </Button>
              <Text size="caption" tone="secondary">
                Country context: {countryLabel}. Session: {session.status}.
                {getAccessToken() ? '' : ' No token.'}
              </Text>
              {apiReachable === null ? <LoadingState label="Checking service" /> : null}
              {apiReachable === false ? (
                <NetworkErrorState action={{ label: 'Retry', onClick: () => window.location.reload() }} />
              ) : null}
              {children ?? <StoreHome />}
              <Button variant="tertiary" onClick={() => expire()}>
                Simulate session expiry
              </Button>
            </>
          )}
        </div>
      </main>
    </>
  );
}
