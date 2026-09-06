export type SessionStatus = 'anonymous' | 'authenticated' | 'expired';
export type Audience = 'customer' | 'admin' | 'doctor' | 'partner_applicant';

export interface SessionSnapshot {
  status: SessionStatus;
  audience: Audience | null;
  permissions: string[];
  countryCode: string | null;
}

export interface SessionSecrets {
  accessToken: string;
  refreshToken: string;
}

export interface SessionStore {
  snapshot(): SessionSnapshot;
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  authenticate(input: SessionSecrets & { audience: Audience; permissions?: string[] }): void;
  expire(): void;
  signOut(): void;
  setCountryCode(code: string | null): void;
}

const empty: SessionSnapshot = {
  status: 'anonymous',
  audience: null,
  permissions: [],
  countryCode: null,
};

export function createSessionStore(): SessionStore {
  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  let publicState: SessionSnapshot = { ...empty };

  return {
    snapshot() {
      return { ...publicState };
    },
    getAccessToken() {
      return accessToken;
    },
    getRefreshToken() {
      return refreshToken;
    },
    authenticate(input) {
      accessToken = input.accessToken;
      refreshToken = input.refreshToken;
      publicState = {
        status: 'authenticated',
        audience: input.audience,
        // Omit permissions on re-hydrate so a cookie bootstrap is not wiped to [].
        permissions: input.permissions !== undefined ? input.permissions : publicState.permissions,
        countryCode: publicState.countryCode,
      };
    },
    expire() {
      accessToken = null;
      refreshToken = null;
      publicState = {
        ...publicState,
        status: publicState.status === 'anonymous' ? 'anonymous' : 'expired',
        audience: null,
        permissions: [],
      };
    },
    signOut() {
      accessToken = null;
      refreshToken = null;
      publicState = { ...empty, countryCode: publicState.countryCode };
    },
    setCountryCode(code) {
      publicState = { ...publicState, countryCode: code };
    },
  };
}

export function snapshotContainsSecrets(snapshot: SessionSnapshot): boolean {
  const blob = JSON.stringify(snapshot).toLowerCase();
  return blob.includes('token') || blob.includes('otp') || blob.includes('password');
}
