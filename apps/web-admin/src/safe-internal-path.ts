const ALLOWED = /^\/[A-Za-z0-9/_?-]*$/;

/** Same allowlist as web-customer `safeInternalPath` — blocks open redirects. */
export function safeInternalPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return null;
  }
  if (value.includes('\\') || value.includes('://')) {
    return null;
  }
  return ALLOWED.test(value) ? value : null;
}
