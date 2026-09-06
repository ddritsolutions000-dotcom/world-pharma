'use client';

import { useCallback, useState } from 'react';
import { loginWithPassword } from '@world-pharma/shell-core';
import { Button, FormField, Input, Text } from '@world-pharma/ui-kit/web';

/**
 * Partner sign-in: User ID + password → OTP on registered mobile → session via parent verify.
 */
export function PasswordOtpSignIn({
  title,
  description,
  onVerified,
}: {
  audience?: string;
  title: string;
  description: string;
  onVerified: (identifier: string, code: string, challengeId: string) => Promise<void>;
}) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [maskedPhone, setMaskedPhone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submitPassword = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loginWithPassword(identifier.trim(), password);
      setChallengeId(result.challengeId);
      setMaskedPhone(result.maskedPhone);
      if (result.devCode) {
        setCode(result.devCode);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify password. Try again.');
    } finally {
      setLoading(false);
    }
  }, [identifier, password]);

  const verify = useCallback(async () => {
    if (!challengeId) {
      await submitPassword();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onVerified(identifier.trim(), code, challengeId);
    } catch {
      setError('Invalid or expired code. Sign in again to get a new OTP.');
    } finally {
      setLoading(false);
    }
  }, [challengeId, code, identifier, onVerified, submitPassword]);

  const reset = useCallback(() => {
    setChallengeId(null);
    setMaskedPhone(null);
    setCode('');
    setError(null);
  }, []);

  return (
    <div className="wp-stack" role="form" aria-label={title}>
      <Text tone="secondary">{description}</Text>
      {!challengeId ? (
        <>
          <FormField label="User ID (email)">
            {({ id }) => (
              <Input
                id={id}
                aria-label="User ID"
                type="email"
                autoComplete="username"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
              />
            )}
          </FormField>
          <FormField label="Password">
            {({ id }) => (
              <Input
                id={id}
                aria-label="Password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            )}
          </FormField>
        </>
      ) : (
        <>
          <Text tone="secondary">
            OTP sent to registered mobile {maskedPhone ?? ''}. Enter the code to finish sign-in.
          </Text>
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
        </>
      )}
      {error ? (
        <>
          <Text tone="secondary">{error}</Text>
          <Button variant="secondary" onClick={() => (challengeId ? reset() : setError(null))}>
            {challengeId ? 'Back' : 'Retry'}
          </Button>
        </>
      ) : null}
      {!challengeId ? (
        <Button
          disabled={loading || !identifier.trim() || password.length < 8}
          onClick={() => void submitPassword()}
        >
          {loading ? 'Checking…' : 'Continue'}
        </Button>
      ) : (
        <Button disabled={loading || !code.trim()} onClick={() => void verify()}>
          {loading ? 'Signing in…' : 'Verify & sign in'}
        </Button>
      )}
    </div>
  );
}
