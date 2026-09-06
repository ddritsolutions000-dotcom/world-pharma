'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@world-pharma/shell-web';
import {
  LoadingState,
  PermissionDeniedState,
  SessionExpiredState,
} from '@world-pharma/ui-kit/web';
import { VendorApiError, fetchVendorOrganizations, type VendorOrganization } from './vendor-api';

const ORG_STORAGE_KEY = 'wp-vendor-org-id';

export type VendorViewState = 'idle' | 'forbidden' | 'network' | 'error';

type VendorWorkspaceContextValue = {
  organizations: VendorOrganization[];
  organizationId: string;
  selectedOrg: VendorOrganization | null;
  token: string | null;
  scopeLoading: boolean;
  scopeError: string | null;
  scoped: boolean;
  viewState: VendorViewState;
  errorMessage: string | null;
  setOrganizationId: (id: string) => void;
  reloadScope: () => Promise<void>;
  onError: (err: unknown) => void;
  resetViewState: () => void;
  signOut: () => void;
};

const VendorWorkspaceContext = createContext<VendorWorkspaceContextValue | null>(null);

export function VendorWorkspaceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { session, signOut, expire, getAccessToken } = useSession();

  const [organizations, setOrganizations] = useState<VendorOrganization[]>([]);
  const [organizationId, setOrganizationIdState] = useState('');
  const [scopeLoading, setScopeLoading] = useState(false);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [viewState, setViewState] = useState<VendorViewState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedOrg = useMemo(
    () => organizations.find((org) => org.id === organizationId) ?? null,
    [organizationId, organizations],
  );

  const persistOrg = useCallback((id: string) => {
    setOrganizationIdState(id);
    if (typeof window !== 'undefined') {
      if (id) {
        window.localStorage.setItem(ORG_STORAGE_KEY, id);
      } else {
        window.localStorage.removeItem(ORG_STORAGE_KEY);
      }
    }
  }, []);

  const onError = useCallback(
    (err: unknown) => {
      if (err instanceof VendorApiError) {
        if (err.status === 403) {
          setViewState('forbidden');
          return;
        }
        if (err.status === 401) {
          expire();
          return;
        }
        setViewState('error');
        setErrorMessage(err.message);
        return;
      }
      setViewState('network');
    },
    [expire],
  );

  const resetViewState = useCallback(() => {
    setViewState('idle');
    setErrorMessage(null);
  }, []);

  const loadScope = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setScopeLoading(true);
    setScopeError(null);
    try {
      const orgRes = await fetchVendorOrganizations(token);
      const unique = new Map<string, (typeof orgRes.data)[number]>();
      for (const org of orgRes.data) {
        if (!unique.has(org.id)) {
          unique.set(org.id, org);
        }
      }
      const orgs = [...unique.values()];
      setOrganizations(orgs);
      const saved =
        typeof window !== 'undefined' ? window.localStorage.getItem(ORG_STORAGE_KEY) : null;
      const savedMatch = saved ? orgs.find((org) => org.id === saved) : null;
      if (savedMatch) {
        persistOrg(savedMatch.id);
      } else if (orgs.length === 1) {
        persistOrg(orgs[0]!.id);
      } else if (orgs.length > 1) {
        persistOrg('');
      } else {
        persistOrg('');
      }
      setViewState('idle');
    } catch (err) {
      if (err instanceof VendorApiError) {
        setScopeError(err.message);
      } else {
        setScopeError('Unable to reach the seller API. Check that the API is running on port 4000.');
      }
      onError(err);
    } finally {
      setScopeLoading(false);
    }
  }, [getAccessToken, onError, persistOrg]);

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'customer') {
      void loadScope();
    }
  }, [session.status, session.audience, loadScope]);

  useEffect(() => {
    if (session.status === 'anonymous') {
      router.replace('/login');
    }
  }, [router, session.status]);

  const token = session.status === 'authenticated' ? getAccessToken() : null;
  const scoped = Boolean(organizationId && token);

  const value = useMemo(
    () => ({
      organizations,
      organizationId,
      selectedOrg,
      token,
      scopeLoading,
      scopeError,
      scoped,
      viewState,
      errorMessage,
      setOrganizationId: persistOrg,
      reloadScope: loadScope,
      onError,
      resetViewState,
      signOut,
    }),
    [
      organizations,
      organizationId,
      selectedOrg,
      token,
      scopeLoading,
      scopeError,
      scoped,
      viewState,
      errorMessage,
      persistOrg,
      loadScope,
      onError,
      resetViewState,
      signOut,
    ],
  );

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (session.status !== 'authenticated') {
    return <LoadingState label="Opening seller workspace…" />;
  }

  if (session.audience !== 'customer') {
    return <PermissionDeniedState />;
  }

  return <VendorWorkspaceContext.Provider value={value}>{children}</VendorWorkspaceContext.Provider>;
}

export function useVendorWorkspace(): VendorWorkspaceContextValue {
  const ctx = useContext(VendorWorkspaceContext);
  if (!ctx) {
    throw new Error('useVendorWorkspace must be used within VendorWorkspaceProvider');
  }
  return ctx;
}
