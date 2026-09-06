'use client';

import { OtpSignIn, useSession } from '@world-pharma/shell-web';
import { Button, Heading, Text } from '@world-pharma/ui-kit/web';

export function VendorJoinAuthPanel({
  title = 'Sign in to continue',
  description = 'Use OTP with the email you will use for partner operations. Same identity is reused after approval.',
}: {
  title?: string;
  description?: string;
}) {
  const { session, verifyOtpChallenge, signOut } = useSession();

  if (session.status === 'authenticated') {
    return (
      <div className="vendor-join-auth-ok wp-stack">
        <Text>Signed in as partner applicant.</Text>
        <Button variant="tertiary" size="sm" onClick={() => signOut()}>
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <div className="wp-stack vendor-join-auth">
      <Heading level={3}>{title}</Heading>
      <Text tone="secondary">{description}</Text>
      <OtpSignIn
        audience="partner_applicant"
        title="Partner applicant OTP"
        description="We will email you a one-time verification code."
        purpose="LOGIN"
        onVerified={async (identifier, code, challengeId) => {
          await verifyOtpChallenge(identifier, 'partner_applicant', challengeId, code);
        }}
      />
    </div>
  );
}
