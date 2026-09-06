import { apiBaseUrl, apiFetch, createCorrelationId } from './http';
import type { Audience } from './session';

export type ApiCallResult<T> =
  | { ok: true; status: number; data: T }
  | {
      ok: false;
      status: number;
      error: string;
      kind: 'network' | 'forbidden' | 'unauthorized' | 'error';
      code?: string;
    };

export async function apiCall<T>(
  path: string,
  options: {
    method?: string;
    token?: string | null;
    body?: unknown;
    headers?: Record<string, string>;
    env?: Record<string, string | undefined>;
    baseUrl?: string;
    onUnauthorized?: () => void;
  } = {},
): Promise<ApiCallResult<T>> {
  try {
    const res = await apiFetch(path, {
      method: options.method ?? 'GET',
      baseUrl: options.baseUrl ?? apiBaseUrl(options.env),
      headers: {
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        'x-request-id': createCorrelationId(),
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    if (res.status === 401) {
      options.onUnauthorized?.();
      return { ok: false, status: 401, error: 'Session expired.', kind: 'unauthorized' };
    }
    if (res.status === 403) {
      try {
        const body = (await res.json()) as { detail?: string; title?: string; code?: string };
        return {
          ok: false,
          status: 403,
          error: body.detail ?? body.title ?? 'Permission denied.',
          kind: 'forbidden',
          code: body.code,
        };
      } catch {
        return { ok: false, status: 403, error: 'Permission denied.', kind: 'forbidden' };
      }
    }
    const raw = await res.text();
    let body = {} as T & { detail?: string; code?: string };
    if (raw) {
      try {
        body = JSON.parse(raw) as T & { detail?: string; code?: string };
      } catch {
        return {
          ok: false,
          status: res.status,
          error: res.ok ? 'Invalid response.' : 'Request failed.',
          kind: 'error',
        };
      }
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: body.detail ?? 'Request failed.',
        kind: 'error',
        code: body.code,
      };
    }
    return { ok: true, status: res.status, data: body };
  } catch {
    return { ok: false, status: 0, error: 'Network unavailable.', kind: 'network' };
  }
}

export async function refreshAccessToken(
  refreshToken: string,
  env: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  try {
    const res = await apiFetch('api/v1/auth/token/refresh', {
      method: 'POST',
      baseUrl: apiBaseUrl(env),
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const body = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
    };
    if (!res.ok || !body.access_token || !body.refresh_token) {
      return null;
    }
    return { accessToken: body.access_token, refreshToken: body.refresh_token };
  } catch {
    return null;
  }
}

export async function logoutSession(
  accessToken: string,
  env: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env,
): Promise<void> {
  try {
    await apiFetch('api/v1/auth/logout', {
      method: 'POST',
      baseUrl: apiBaseUrl(env),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    // best effort
  }
}

export type StoredSession = {
  accessToken: string;
  refreshToken: string;
  audience: Audience;
  cookieMode?: boolean;
};

export const COOKIE_SESSION_TOKEN = '__cookie__';

const STORAGE_KEY = 'wp_session_v1';

export function loadStoredSession(): StoredSession | null {
  if (typeof globalThis === 'undefined' || typeof (globalThis as { localStorage?: Storage }).localStorage === 'undefined') {
    return null;
  }
  try {
    const raw = (globalThis as { localStorage: Storage }).localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as StoredSession;
    if (parsed.cookieMode && parsed.audience) {
      return {
        accessToken: COOKIE_SESSION_TOKEN,
        refreshToken: COOKIE_SESSION_TOKEN,
        audience: parsed.audience,
        cookieMode: true,
      };
    }
    if (!parsed.accessToken || !parsed.refreshToken || !parsed.audience) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredSession(session: StoredSession | null): void {
  if (typeof globalThis === 'undefined' || typeof (globalThis as { localStorage?: Storage }).localStorage === 'undefined') {
    return;
  }
  const storage = (globalThis as { localStorage: Storage }).localStorage;
  if (!session) {
    storage.removeItem(STORAGE_KEY);
    return;
  }
  if (session.cookieMode) {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ audience: session.audience, cookieMode: true, accessToken: '', refreshToken: '' }),
    );
    return;
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(session));
}
