'use client';

import { Button, Card, Heading, Text } from '@world-pharma/ui-kit/web';
import { useSession } from '@world-pharma/shell-web';

export function VendorSecurityPanel({ onSignOut }: { onSignOut: () => void }) {
  const { session, expire } = useSession();

  return (
    <div className="wp-stack">
      <Card>
        <Heading level={2}>Session</Heading>
        <Text tone="secondary">
          You are signed in with OTP authentication. Seller workspace uses the customer audience session.
        </Text>
        <dl className="vws-kv-list">
          <div>
            <dt>Status</dt>
            <dd>{session.status}</dd>
          </div>
          <div>
            <dt>Audience</dt>
            <dd>{session.status === 'authenticated' ? session.audience : '—'}</dd>
          </div>
          <div>
            <dt>Country</dt>
            <dd>{session.status === 'authenticated' ? session.countryCode ?? '—' : '—'}</dd>
          </div>
          <div>
            <dt>Permissions</dt>
            <dd>{session.status === 'authenticated' ? session.permissions.length : 0}</dd>
          </div>
        </dl>
        <div className="wp-toolbar" style={{ marginTop: '1rem' }}>
          <Button variant="secondary" size="sm" onClick={() => expire()}>
            Expire session (dev)
          </Button>
          <Button variant="tertiary" size="sm" onClick={onSignOut}>
            Sign out
          </Button>
        </div>
      </Card>

      <Card>
        <Heading level={2}>Account protection</Heading>
        <Text tone="secondary">
          Device management and MFA settings will appear here when identity hardening ships. For now, sign out on
          shared devices and rotate access if your phone is lost.
        </Text>
      </Card>
    </div>
  );
}
