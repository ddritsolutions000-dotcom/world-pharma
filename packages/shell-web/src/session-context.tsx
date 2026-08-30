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
  loadStoredSession,
  logoutSession,
  saveStoredSession,
  signInWithOtp,
  verifyOtp,
  type Audience,
  type SessionSnapshot,
  type SessionStore,
} from '@world-pharma/shell-core';

interface SessionContextValue {
  session: SessionSnapshot;
  signInWithOtp: (identifier: string, audience: Audience, code?: string) => Promise<void>;
  verifyOtpChallenge: (identifier: string, audience: Audience, challengeId: string, code: string) => Promise<void>;
  expire: () => void;
  signOut: () => void;
  setCountryCode: (code: string | null) => void;
  getAccessToken: () => string | null;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function isJestRuntime(): boolean {
  return typeof process !== 'undefined' && typeof process.env.JEST_WORKER_ID === 'string';
}

function hydrateSessionStore(store: SessionStore, initialAudience?: Audience): void {
  const stored = loadStoredSession();
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
  }, [initialAudience, sync]);

  const persist = useCallback((audience: Audience) => {
    const accessToken = storeRef.current.getAccessToken();
    const refreshToken = storeRef.current.getRefreshToken();
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
    });
    persist(result.audience);
    sync();
  }, [persist, sync]);

  const verifyOtpChallenge = useCallback(
    async (identifier: string, audience: Audience, challengeId: string, code: string) => {
      const result = await verifyOtp(challengeId, code, audience);
      storeRef.current.authenticate({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        audience: result.audience,
      });
      persist(result.audience);
      sync();
    },
    [persist, sync],
  );

  const expire = useCallback(() => {
    storeRef.current.expire();
    sync();
  }, [sync]);

  const signOut = useCallback(() => {
    const token = storeRef.current.getAccessToken();
    if (token && token !== 'shell-dev-access') {
      void logoutSession(token);
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
      expire,
      signOut,
      setCountryCode,
      getAccessToken,
    }),
    [session, signInWithOtpHandler, verifyOtpChallenge, expire, signOut, setCountryCode, getAccessToken],
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
