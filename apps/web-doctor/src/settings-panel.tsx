'use client';

import Link from 'next/link';
import { useSession } from '@world-pharma/shell-web';
import { Button, Card, Heading, Text } from '@world-pharma/ui-kit/web';

export function DoctorSettingsPanel() {
  const { session, signOut, expire } = useSession();

  return (
    <div className="wp-stack">
      <Card>
        <Heading level={2}>Account &amp; session</Heading>
        <Text tone="secondary">
          Signed in as {session.status === 'authenticated' ? session.audience : 'guest'}. OTP sessions expire per
          platform policy — use Sign out on shared devices.
        </Text>
        <div className="wp-stack" style={{ marginTop: '1rem' }}>
          <Button variant="secondary" onClick={() => signOut()}>
            Sign out
          </Button>
          <Button variant="tertiary" size="sm" onClick={() => expire()}>
            Expire session (dev)
          </Button>
        </div>
      </Card>

      <Card>
        <Heading level={2}>Notifications</Heading>
        <Text tone="secondary">In-app alerts for appointments, prescriptions, and platform messages.</Text>
        <Link href="/inbox">
          <Button variant="secondary" size="sm">
            Open inbox
          </Button>
        </Link>
      </Card>

      <Card>
        <Heading level={2}>Profile &amp; credentials</Heading>
        <Text tone="secondary">Update display name, specialties, and verification documents.</Text>
        <div className="wp-stack" style={{ marginTop: '0.75rem' }}>
          <Link href="/profile">
            <Button variant="secondary" size="sm">
              Edit profile
            </Button>
          </Link>
          <Link href="/credentials">
            <Button variant="tertiary" size="sm">
              Credentials
            </Button>
          </Link>
        </div>
      </Card>

      <Card>
        <Heading level={2}>Support</Heading>
        <Text tone="secondary">Clinical or technical issues — no patient PHI in ticket bodies.</Text>
        <Link href="/support">
          <Button variant="secondary" size="sm">
            Contact support
          </Button>
        </Link>
      </Card>
    </div>
  );
}
