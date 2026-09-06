'use client';

import { useCallback, useState } from 'react';
import { useSession } from './session-context';
import { OtpSignIn } from './otp-sign-in';
import { PasswordOtpSignIn } from './password-otp-sign-in';
import { PORTAL_AUTH, type PortalAuthId } from './portal-auth-config';
import './portal-auth.css';

export type PortalAuthMode = 'sign-in' | 'sign-up';

export function PortalAuthPage({
  portalId,
  mode: initialMode = 'sign-in',
  showModeTabs = true,
  onAuthenticated,
}: {
  portalId: PortalAuthId;
  mode?: PortalAuthMode;
  showModeTabs?: boolean;
  onAuthenticated?: () => void;
}) {
  const config = PORTAL_AUTH[portalId];
  const { verifyOtpChallenge } = useSession();
  const [mode, setMode] = useState<PortalAuthMode>(initialMode);

  const isSignUp = mode === 'sign-up';
  const title = isSignUp ? config.signUpTitle : config.signInTitle;
  const description = isSignUp ? config.signUpDescription : config.signInDescription;
  const purpose = isSignUp ? ('REGISTER' as const) : ('LOGIN' as const);
  const usePasswordLogin = Boolean(config.passwordLogin) && !isSignUp;

  const handleVerified = useCallback(
    async (identifier: string, code: string, challengeId: string) => {
      await verifyOtpChallenge(identifier, config.audience, challengeId, code);
      onAuthenticated?.();
    },
    [config.audience, onAuthenticated, verifyOtpChallenge],
  );

  return (
    <div className="wp-auth-page" style={{ ['--wp-auth-accent' as string]: config.accent }}>
      <aside className="wp-auth-hero">
        <div className="wp-auth-logo">
          <span className="wp-auth-logo-icon" aria-hidden>
            W
          </span>
          <span>{config.portalName}</span>
        </div>
        <h1>{isSignUp ? 'Join the ecosystem' : 'Secure access'}</h1>
        <p>{config.tagline}</p>
        <div className="wp-auth-trust">
          <span>
            {usePasswordLogin ? '🔒 Password + mobile OTP' : '🔒 Email OTP — no passwords'}
          </span>
          <span>🌍 Global platform</span>
          <span>✓ Role-scoped access</span>
        </div>
      </aside>
      <main className="wp-auth-panel">
        <div className="wp-auth-card">
          {showModeTabs ? (
            <div className="wp-auth-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={!isSignUp}
                className={`wp-auth-tab${!isSignUp ? ' is-active' : ''}`}
                onClick={() => setMode('sign-in')}
              >
                Sign in
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={isSignUp}
                className={`wp-auth-tab${isSignUp ? ' is-active' : ''}`}
                onClick={() => setMode('sign-up')}
              >
                Sign up
              </button>
            </div>
          ) : null}
          <h2>{title}</h2>
          <p className="wp-auth-sub">{description}</p>
          <div className="wp-auth-form">
            {usePasswordLogin ? (
              <PasswordOtpSignIn
                audience={config.audience}
                title={title}
                description=""
                onVerified={handleVerified}
              />
            ) : (
              <OtpSignIn
                audience={config.audience}
                title={title}
                description=""
                purpose={purpose}
                onVerified={handleVerified}
              />
            )}
          </div>
          {config.sandboxEmail ? (
            <p className="wp-auth-sandbox">
              Sandbox login: <code>{config.sandboxEmail}</code>
              {config.sandboxPassword && usePasswordLogin ? (
                <>
                  {' '}
                  · password <code>{config.sandboxPassword}</code>
                </>
              ) : null}
            </p>
          ) : null}
          {config.footerNote ? <p className="wp-auth-footer">{config.footerNote}</p> : null}
          {config.partnerApplyHref ? (
            <p className="wp-auth-footer">
              {isSignUp ? (
                <>
                  New partner?{' '}
                  <a href={config.partnerApplyHref} target="_blank" rel="noopener noreferrer">
                    Start application →
                  </a>
                </>
              ) : (
                <>
                  Need an account?{' '}
                  <a href={config.partnerApplyHref} target="_blank" rel="noopener noreferrer">
                    Apply as partner →
                  </a>
                </>
              )}
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}
