'use client';

import { useCallback, useState } from 'react';
import { requestOtp, type Audience } from '@world-pharma/shell-core';
import { Button, FormField, Input, Text } from '@world-pharma/ui-kit/web';

export function OtpSignIn({
  audience,
  title,
  description,
  purpose = 'LOGIN',
  onVerified,
}: {
  audience: Audience;
  title: string;
  description: string;
  /** LOGIN for returning users; REGISTER creates a new person on first verify. */
  purpose?: 'REGISTER' | 'LOGIN';
  onVerified: (identifier: string, code: string, challengeId: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const sendOtp = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await requestOtp(email, purpose);
      setChallengeId(result.challengeId);
      if (result.devCode) {
        setCode(result.devCode);
      }
    } catch {
      setError('Could not send OTP. Check your email and try again.');
    } finally {
      setLoading(false);
    }
  }, [email, purpose]);

  const verify = useCallback(async () => {
    if (!challengeId) {
      await sendOtp();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onVerified(email, code, challengeId);
    } catch {
      setError('Invalid or expired code. Request a new OTP.');
    } finally {
      setLoading(false);
    }
  }, [challengeId, code, email, onVerified, sendOtp]);

  return (
    <div className="wp-stack" role="form" aria-label={title}>
      <Text tone="secondary">{description}</Text>
      <FormField label="Email">
        {({ id }) => (
          <Input
            id={id}
            aria-label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        )}
      </FormField>
      {challengeId ? (
        <FormField label="One-time code">
          {({ id }) => (
            <Input
              id={id}
              aria-label="One-time code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          )}
        </FormField>
      ) : null}
      {error ? (
        <>
          <Text tone="secondary">{error}</Text>
          <Button variant="secondary" onClick={() => setError(null)}>
            Retry
          </Button>
        </>
      ) : null}
      {!challengeId ? (
        <Button disabled={loading || !email.trim()} onClick={() => void sendOtp()}>
          {loading ? 'Sending…' : 'Send OTP'}
        </Button>
      ) : (
        <Button disabled={loading || !code.trim()} onClick={() => void verify()}>
          {loading ? 'Signing in…' : 'Verify & sign in'}
        </Button>
      )}
    </div>
  );
}
