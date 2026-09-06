'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { requestOtp, canAccessProtected } from '@world-pharma/shell-core';
import { useSession } from '@world-pharma/shell-web';
import { Button, FormField, Input, PermissionDeniedState, Text } from '@world-pharma/ui-kit/web';
import { safeInternalPath } from './safe-internal-path';

type Step = 'identify' | 'verify' | 'mfa' | 'mfa-enroll';

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function AdminEnterpriseAuth() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, verifyOtpChallenge, verifyMfaChallenge } = useSession();

  const nextPath = useMemo(() => {
    return safeInternalPath(searchParams.get('next')) ?? '/';
  }, [searchParams]);

  const [step, setStep] = useState<Step>('identify');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [enrollmentUri, setEnrollmentUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const goDashboard = useCallback(() => {
    router.replace(nextPath);
  }, [nextPath, router]);

  useEffect(() => {
    if (session.status === 'authenticated' && canAccessProtected(session, 'admin')) {
      goDashboard();
    }
  }, [goDashboard, session]);

  if (session.status === 'authenticated' && canAccessProtected(session, 'admin')) {
    return null;
  }

  if (session.status === 'authenticated' && !canAccessProtected(session, 'admin')) {
    return <PermissionDeniedState />;
  }

  const submitIdentify = async () => {
    const identifier = normalizeEmail(email);
    if (!isValidEmail(identifier)) {
      setError('Enter a valid company admin email address.');
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const result = await requestOtp(identifier, 'LOGIN');
      setChallengeId(result.challengeId);
      setStep('verify');
      if (result.devCode) {
        setCode(result.devCode);
        setInfo('Development OTP prefilled. In production, check your email for the verification code.');
      } else {
        setInfo('We sent a one-time code to your email. Enter it below to continue.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('not found') || message.includes('unknown')) {
        setError('No account found for this email. Contact your platform administrator for access.');
      } else if (message.includes('locked') || message.includes('suspended')) {
        setError('This account is locked or suspended. Contact security operations.');
      } else {
        setError('Could not start sign-in. Check your email and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const beginEnrollment = async (token: string) => {
    const res = await fetch(`${window.location.origin}/api/v1/auth/mfa/enroll/start`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mfa_token: token }),
    });
    const body = (await res.json()) as { otpauth_uri?: string; dev_totp_code?: string; detail?: string };
    if (!res.ok || !body.otpauth_uri) {
      throw new Error(body.detail ?? 'enrollment_failed');
    }
    setEnrollmentUri(body.otpauth_uri);
    if (body.dev_totp_code) {
      setMfaCode(body.dev_totp_code);
      setInfo('Development MFA code prefilled. In production, use your authenticator app.');
    }
  };

  const submitVerify = async () => {
    if (!challengeId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await verifyOtpChallenge(normalizeEmail(email), 'admin', challengeId, code.trim());
      if (result.mfaRequired && result.mfaToken) {
        setMfaToken(result.mfaToken);
        if (result.mfaEnrollmentRequired) {
          await beginEnrollment(result.mfaToken);
          setStep('mfa-enroll');
          if (!info) {
            setInfo('Scan the authenticator setup in your security app, then enter the 6-digit code to activate MFA.');
          }
        } else {
          setStep('mfa');
          if (result.devTotpCode) {
            setMfaCode(result.devTotpCode);
            setInfo('Development MFA code prefilled. In production, use your authenticator app.');
          } else {
            setInfo('Enter the 6-digit code from your authenticator app.');
          }
        }
        return;
      }
      goDashboard();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('not authorized') || message.includes('Forbidden')) {
        setError('This account is not authorized for Main Admin.');
      } else {
        setError('Invalid or expired code. Request a new code or check your email.');
      }
    } finally {
      setLoading(false);
    }
  };

  const submitMfa = async (enrolling: boolean) => {
    if (!mfaToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (enrolling) {
        const confirm = await fetch(`${window.location.origin}/api/v1/auth/mfa/enroll/confirm`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mfa_token: mfaToken, code: mfaCode.trim() }),
        });
        if (!confirm.ok) {
          throw new Error('mfa_enroll_failed');
        }
      }
      await verifyMfaChallenge(mfaToken, mfaCode.trim(), 'admin');
      goDashboard();
    } catch {
      setError(enrolling ? 'Could not confirm MFA enrollment. Check the code and try again.' : 'Invalid MFA code.');
    } finally {
      setLoading(false);
    }
  };

  const resetFlow = () => {
    setStep('identify');
    setChallengeId(null);
    setMfaToken(null);
    setEnrollmentUri(null);
    setCode('');
    setMfaCode('');
    setError(null);
    setInfo(null);
  };

  const stepLabel =
    step === 'identify' ? '1. Account' : step === 'verify' ? '2. Verify' : step === 'mfa-enroll' ? '3. Enroll MFA' : '3. MFA';

  return (
    <div className="admin-auth-root">
      <div className="admin-auth-ambient" aria-hidden />
      <div className="admin-auth-grid">
        <aside className="admin-auth-aside">
          <div className="admin-auth-brand">
            <span className="admin-auth-mark" aria-hidden>
              WP
            </span>
            <div>
              <strong>World Pharma</strong>
              <small>Main Admin</small>
            </div>
          </div>
          <h1>Company control plane</h1>
          <p>
            Global marketplace operations — commerce, healthcare partners, finance, CMS, CRM, and platform
            governance from one secure console.
          </p>
          <ul className="admin-auth-trust">
            <li>Role-based access with server-side enforcement</li>
            <li>Email OTP verification — no shared passwords</li>
            <li>HttpOnly session cookies — tokens not stored in the browser</li>
            <li>All sensitive actions are audit logged</li>
          </ul>
        </aside>

        <main className="admin-auth-main">
          <div className="admin-auth-card">
            <div className="admin-auth-steps" aria-label="Sign-in progress">
              <span className={`admin-auth-step${step === 'identify' ? ' is-active' : ' is-done'}`}>1. Account</span>
              <span
                className={`admin-auth-step${step === 'verify' ? ' is-active' : step === 'mfa' || step === 'mfa-enroll' ? ' is-done' : ''}`}
              >
                2. Verify
              </span>
              <span className={`admin-auth-step${step === 'mfa' || step === 'mfa-enroll' ? ' is-active' : ''}`}>
                {stepLabel.includes('3') ? stepLabel : '3. MFA'}
              </span>
            </div>

            {step === 'identify' ? (
              <>
                <h2>Sign in to Main Admin</h2>
                <Text tone="secondary" className="admin-auth-lead">
                  Enter your authorized operations email. Access is provisioned by platform owners.
                </Text>
                <FormField label="Work email" hint="Use the email linked to your company admin role">
                  {({ id }) => (
                    <Input
                      id={id}
                      type="email"
                      autoComplete="username email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          void submitIdentify();
                        }
                      }}
                    />
                  )}
                </FormField>
                {error ? <p className="admin-auth-error">{error}</p> : null}
                <Button disabled={loading || !email.trim()} onClick={() => void submitIdentify()}>
                  {loading ? 'Checking…' : 'Continue'}
                </Button>
              </>
            ) : step === 'verify' ? (
              <>
                <h2>Verify it&apos;s you</h2>
                <Text tone="secondary" className="admin-auth-lead">
                  Signing in as <strong>{normalizeEmail(email)}</strong>
                </Text>
                {info ? <p className="admin-auth-info">{info}</p> : null}
                <FormField label="One-time code">
                  {({ id }) => (
                    <Input
                      id={id}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="6-digit code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          void submitVerify();
                        }
                      }}
                    />
                  )}
                </FormField>
                {error ? <p className="admin-auth-error">{error}</p> : null}
                <div className="admin-auth-actions">
                  <Button disabled={loading || !code.trim()} onClick={() => void submitVerify()}>
                    {loading ? 'Signing in…' : 'Continue'}
                  </Button>
                  <Button variant="tertiary" disabled={loading} onClick={resetFlow}>
                    Use a different email
                  </Button>
                  <Button variant="secondary" disabled={loading} onClick={() => void submitIdentify()}>
                    Resend code
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h2>{step === 'mfa-enroll' ? 'Set up authenticator MFA' : 'Multi-factor verification'}</h2>
                {info ? <p className="admin-auth-info">{info}</p> : null}
                {enrollmentUri ? (
                  <p className="admin-auth-info">
                    Authenticator URI issued. Add the account in your TOTP app using the setup key from your security
                    team, or scan if your device supports URI handoff.
                  </p>
                ) : null}
                <FormField label="Authenticator code">
                  {({ id }) => (
                    <Input
                      id={id}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="6-digit code"
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          void submitMfa(step === 'mfa-enroll');
                        }
                      }}
                    />
                  )}
                </FormField>
                {error ? <p className="admin-auth-error">{error}</p> : null}
                <div className="admin-auth-actions">
                  <Button
                    disabled={loading || !mfaCode.trim()}
                    onClick={() => void submitMfa(step === 'mfa-enroll')}
                  >
                    {loading ? 'Verifying…' : step === 'mfa-enroll' ? 'Activate MFA & sign in' : 'Verify & sign in'}
                  </Button>
                  <Button variant="tertiary" disabled={loading} onClick={resetFlow}>
                    Start over
                  </Button>
                </div>
              </>
            )}

            <p className="admin-auth-foot">
              Unauthorized access attempts are recorded.{' '}
              <Link href="/">Return to dashboard</Link>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
