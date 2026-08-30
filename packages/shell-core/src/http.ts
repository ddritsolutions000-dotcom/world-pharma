export function createCorrelationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `req-${Date.now().toString(36)}`;
}

export function apiBaseUrl(env: Record<string, string | undefined> = {}): string {
  return (
    env['NEXT_PUBLIC_API_BASE_URL'] ??
    env['EXPO_PUBLIC_API_BASE_URL'] ??
    'http://127.0.0.1:4000'
  ).replace(/\/$/, '');
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
    headers: next,
  });
}
