'use client';

import { OtpSignIn, useSession } from '@world-pharma/shell-web';
import { Button, Heading, Text } from '@world-pharma/ui-kit/web';

export function JoinAuthPanel({
  title = 'Sign in to continue',
  description = 'Use OTP with the email you will use for partner operations. Same Person identity is reused after approval.',
  mode = 'sign-in',
}: {
  title?: string;
  description?: string;
  mode?: 'sign-in' | 'sign-up';
}) {
  const { session, verifyOtpChallenge, signOut } = useSession();

  if (session.status === 'authenticated') {
    return (
      <div className="wp-stack">
        <Text>Signed in as partner applicant.</Text>
        <Button variant="tertiary" size="sm" onClick={() => signOut()}>
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <div className="wp-stack join-auth-panel">
      <Heading level={3}>{title}</Heading>
      <Text tone="secondary">{description}</Text>
      <OtpSignIn
        audience="partner_applicant"
        title={mode === 'sign-up' ? 'Create partner identity' : 'Sign in'}
        description="We will email you a one-time verification code."
        purpose={mode === 'sign-up' ? 'REGISTER' : 'LOGIN'}
        onVerified={(identifier, code, challengeId) =>
          verifyOtpChallenge(identifier, 'partner_applicant', challengeId, code)
        }
      />
    </div>
  );
}
