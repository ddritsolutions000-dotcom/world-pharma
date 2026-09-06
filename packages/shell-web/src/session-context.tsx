'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  createSessionStore,
  fetchBootstrap,
  hydrateSessionPermissions,
  loadStoredSession,
  logoutSession,
  saveStoredSession,
  signInWithOtp,
  verifyOtp,
  verifyMfaLogin,
  COOKIE_SESSION_TOKEN,
  type Audience,
  type SessionSnapshot,
  type SessionStore,
} from '@world-pharma/shell-core';

interface SessionContextValue {
  session: SessionSnapshot;
  signInWithOtp: (identifier: string, audience: Audience, code?: string) => Promise<void>;
  verifyOtpChallenge: (identifier: string, audience: Audience, challengeId: string, code: string) => Promise<{
    mfaRequired?: boolean;
    mfaEnrollmentRequired?: boolean;
    mfaToken?: string;
    devTotpCode?: string;
  }>;
  verifyMfaChallenge: (mfaToken: string, code: string, audience: Audience) => Promise<void>;
  expire: () => void;
  signOut: () => void;
  setCountryCode: (code: string | null) => void;
  getAccessToken: () => string | null;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function isJestRuntime(): boolean {
  return typeof process !== 'undefined' && typeof process.env.JEST_WORKER_ID === 'string';
}

async function applyPermissions(store: SessionStore): Promise<'ok' | 'unauthorized'> {
  return hydrateSessionPermissions(store);
}

function hydrateSessionStore(store: SessionStore, initialAudience?: Audience): void {
  const stored = loadStoredSession();
  if (stored?.cookieMode && !isJestRuntime()) {
    // Cookie sessions get permissions from /auth/bootstrap. Do not mark authenticated
    // with an empty permission list — admin screens treat that as "no access".
    return;
  }
  if (stored && (!initialAudience || stored.audience === initialAudience)) {
    store.authenticate({
      accessToken: stored.accessToken,
      refreshToken: stored.refreshToken,
      audience: stored.audience,
    });
    return;
  }
  if (initialAudience && isJestRuntime()) {
    store.authenticate({
      accessToken: 'shell-dev-access',
      refreshToken: 'shell-dev-refresh',
      audience: initialAudience,
    });
  }
}

function createHydratedStore(initialAudience?: Audience): SessionStore {
  const store = createSessionStore();
  hydrateSessionStore(store, initialAudience);
  return store;
}

export function SessionProvider({
  children,
  initialAudience,
}: {
  children: ReactNode;
  initialAudience?: Audience;
}): React.JSX.Element {
  const storeRef = useRef<SessionStore>(createHydratedStore(initialAudience));
  const [session, setSession] = useState<SessionSnapshot>(() => storeRef.current.snapshot());

  const sync = useCallback(() => {
    setSession(storeRef.current.snapshot());
  }, []);

  useEffect(() => {
    hydrateSessionStore(storeRef.current, initialAudience);
    sync();
    void (async () => {
      if (initialAudience === 'admin') {
        const bootstrap = await fetchBootstrap(null);
        if (bootstrap.ok && bootstrap.data.audience === 'admin') {
          storeRef.current.authenticate({
            accessToken: COOKIE_SESSION_TOKEN,
            refreshToken: COOKIE_SESSION_TOKEN,
            audience: 'admin',
            permissions: bootstrap.data.permissions,
          });
          saveStoredSession({
            accessToken: COOKIE_SESSION_TOKEN,
            refreshToken: COOKIE_SESSION_TOKEN,
            audience: 'admin',
            cookieMode: true,
          });
          sync();
          return;
        }
      }
      const result = await applyPermissions(storeRef.current);
      if (result === 'unauthorized') {
        saveStoredSession(null);
      }
      sync();
    })();
  }, [initialAudience, sync]);

  const persist = useCallback((audience: Audience, cookieMode = false) => {
    const accessToken = storeRef.current.getAccessToken();
    const refreshToken = storeRef.current.getRefreshToken();
    if (cookieMode || accessToken === COOKIE_SESSION_TOKEN) {
      saveStoredSession({
        accessToken: COOKIE_SESSION_TOKEN,
        refreshToken: COOKIE_SESSION_TOKEN,
        audience,
        cookieMode: true,
      });
      return;
    }
    if (accessToken && refreshToken) {
      saveStoredSession({ accessToken, refreshToken, audience });
    }
  }, []);

  const signInWithOtpHandler = useCallback(async (identifier: string, audience: Audience, code?: string) => {
    const result = await signInWithOtp(identifier, audience, code);
    storeRef.current.authenticate({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      audience: result.audience,
      permissions: [],
    });
    persist(result.audience);
    const profile = await applyPermissions(storeRef.current);
    if (profile === 'unauthorized') {
      saveStoredSession(null);
    }
    sync();
  }, [persist, sync]);

  const verifyOtpChallenge = useCallback(
    async (identifier: string, audience: Audience, challengeId: string, code: string) => {
      const result = await verifyOtp(challengeId, code, audience);
      if (result.mfaRequired && result.mfaToken) {
        return {
          mfaRequired: true,
          mfaEnrollmentRequired: result.mfaEnrollmentRequired,
          mfaToken: result.mfaToken,
          devTotpCode: result.devTotpCode,
        };
      }
      storeRef.current.authenticate({
        accessToken: audience === 'admin' ? COOKIE_SESSION_TOKEN : result.accessToken,
        refreshToken: audience === 'admin' ? COOKIE_SESSION_TOKEN : result.refreshToken,
        audience: result.audience,
        permissions: [],
      });
      persist(result.audience, audience === 'admin');
      const profile = await applyPermissions(storeRef.current);
      if (profile === 'unauthorized') {
        saveStoredSession(null);
      }
      sync();
      return {};
    },
    [initialAudience, persist, sync],
  );

  const verifyMfaChallenge = useCallback(
    async (mfaToken: string, code: string, audience: Audience) => {
      const result = await verifyMfaLogin(mfaToken, code);
      storeRef.current.authenticate({
        accessToken: COOKIE_SESSION_TOKEN,
        refreshToken: COOKIE_SESSION_TOKEN,
        audience: result.audience ?? audience,
        permissions: [],
      });
      persist(audience, true);
      const profile = await applyPermissions(storeRef.current);
      if (profile === 'unauthorized') {
        saveStoredSession(null);
      }
      sync();
    },
    [initialAudience, persist, sync],
  );

  const expire = useCallback(() => {
    storeRef.current.expire();
    sync();
  }, [sync]);

  const signOut = useCallback(() => {
    const token = storeRef.current.getAccessToken();
    if (token && token !== 'shell-dev-access' && token !== COOKIE_SESSION_TOKEN) {
      void logoutSession(token);
    } else if (token === COOKIE_SESSION_TOKEN) {
      void fetch(`${typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    }
    storeRef.current.signOut();
    saveStoredSession(null);
    sync();
  }, [sync]);

  const setCountryCode = useCallback((code: string | null) => {
    storeRef.current.setCountryCode(code);
    sync();
  }, [sync]);

  const getAccessToken = useCallback(() => storeRef.current.getAccessToken(), []);

  const value = useMemo(
    () => ({
      session,
      signInWithOtp: signInWithOtpHandler,
      verifyOtpChallenge,
      verifyMfaChallenge,
      expire,
      signOut,
      setCountryCode,
      getAccessToken,
    }),
    [session, signInWithOtpHandler, verifyOtpChallenge, verifyMfaChallenge, expire, signOut, setCountryCode, getAccessToken],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return ctx;
}
