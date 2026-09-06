export function createCorrelationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `req-${Date.now().toString(36)}`;
}

export function apiBaseUrl(env: Record<string, string | undefined> = {}): string {
  const configured = (env['NEXT_PUBLIC_API_BASE_URL'] ?? env['EXPO_PUBLIC_API_BASE_URL'] ?? '').trim();
  const fromEnv = configured.replace(/\/$/, '');
  // Partner/admin Next apps proxy /api via rewrites. Hitting :4000 from the browser
  // trips CORS / credential failures and surfaces as a generic "Connection problem".
  if (typeof window !== 'undefined' && !env['EXPO_PUBLIC_API_BASE_URL']?.trim()) {
    const port = window.location?.port;
    const hostname = window.location?.hostname ?? '';
    const portalPort = Number(port);
    if (
      (Number.isFinite(portalPort) && portalPort >= 3000 && portalPort <= 3011) ||
      hostname === 'vendor.demo.com'
    ) {
      return window.location.origin;
    }
  }
  if (fromEnv) {
    return fromEnv;
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return `${window.location.protocol}//${host}:4000`;
    }
  }
  // Native/physical devices must set EXPO_PUBLIC_API_BASE_URL (LAN or emulator alias).
  // Do not invent a production host here — loopback is a local-only last resort for Node/web tests.
  return 'http://127.0.0.1:4000';
}

export async function apiFetch(
  path: string,
  init: RequestInit & { accessToken?: string | null; baseUrl?: string } = {},
): Promise<Response> {
  const { accessToken, baseUrl, headers, ...rest } = init;
  const requestId = createCorrelationId();
  const next = new Headers(headers);
  next.set('Accept', 'application/json');
  next.set('x-request-id', requestId);
  next.set('x-correlation-id', requestId);
  if (accessToken) {
    next.set('Authorization', `Bearer ${accessToken}`);
  }
  if (rest.body && !next.has('Content-Type')) {
    next.set('Content-Type', 'application/json');
  }
  return fetch(`${baseUrl ?? apiBaseUrl(typeof process === 'undefined' ? {} : process.env)}/${path.replace(/^\//, '')}`, {
    ...rest,
    credentials: rest.credentials ?? 'include',
    headers: next,
  });
}
