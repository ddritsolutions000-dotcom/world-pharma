import { apiBaseUrl } from '@world-pharma/shell-core';

export class AdminHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AdminHttpError';
  }
}

/** Resolve API root on every call so SSR does not freeze :4000 into client fetches. */
export function adminApiRoot(): string {
  if (typeof window !== 'undefined') {
    // Always same-origin in the browser so Next rewrites proxy /api regardless of
    // the actual admin port (3001, 3002 if 3001 is taken, LAN hostname, etc.).
    return window.location.origin;
  }
  return apiBaseUrl();
}

export function adminErrorStatus(err: unknown): number | undefined {
  if (err instanceof AdminHttpError) {
    return err.status;
  }
  if (typeof err === 'object' && err && 'status' in err) {
    const status = Number((err as { status: unknown }).status);
    if (Number.isFinite(status)) {
      return status;
    }
  }
  return undefined;
}

export function isAdminForbidden(err: unknown): boolean {
  return adminErrorStatus(err) === 403;
}

export function isAdminNetworkFailure(err: unknown): boolean {
  const status = adminErrorStatus(err);
  if (status === 0) {
    return true;
  }
  if (status !== undefined) {
    return false;
  }
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  return /failed to fetch|network unavailable|api is not reachable|networkerror|load failed|^network$/i.test(
    msg.trim(),
  );
}

export function classifyAdminViewState(err: unknown): 'forbidden' | 'network' | 'error' {
  if (isAdminForbidden(err)) {
    return 'forbidden';
  }
  if (isAdminNetworkFailure(err)) {
    return 'network';
  }
  return 'error';
}

export function adminAuthHeaders(
  token: string | null,
  extra?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json', ...extra };
  if (token && token !== '__cookie__') {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function adminFetch(token: string | null, path: string, init?: RequestInit): Promise<Response> {
  const baseHeaders = adminAuthHeaders(token, init?.headers as Record<string, string> | undefined);
  try {
    return await fetch(`${adminApiRoot()}${path}`, {
      ...init,
      credentials: 'include',
      headers: baseHeaders,
    });
  } catch {
    throw new AdminHttpError('API is not reachable. Start the API on port 4000, then retry.', 0);
  }
}

export async function adminJson<T = unknown>(token: string | null, path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await adminFetch(token, path, {
      ...init,
      headers: adminAuthHeaders(token, {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers as Record<string, string> | undefined),
      }),
    });
  } catch (err) {
    if (err instanceof AdminHttpError) {
      throw err;
    }
    throw new AdminHttpError('API is not reachable. Start the API on port 4000, then retry.', 0);
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail = typeof body.detail === 'string' ? body.detail : typeof body.message === 'string' ? body.message : null;
    throw new AdminHttpError(detail ?? `Request failed (${res.status})`, res.status);
  }
  return body as T;
}
