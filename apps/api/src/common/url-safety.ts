/**
 * Sprint 115 — External URL destination safety (SSRF / unsafe protocol / private net).
 * Not a parallel WAF, rate limiter, or security framework.
 * Use when accepting or fetching user/provider-influenced URLs.
 * DNS rebinding after resolve remains a residual risk for live outbound fetch (document as such).
 */
export type UrlSafetyOk = { ok: true; url: URL; hostname: string };
export type UrlSafetyFail = { ok: false; reason: string };
export type UrlSafetyResult = UrlSafetyOk | UrlSafetyFail;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.google',
  'instance-data',
]);

function isIpv4Literal(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return parts;
}

function isPrivateOrLinkLocalIpv4(parts: number[]): boolean {
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isLocalOrPrivateIpv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === '::1' || h === '0:0:0:0:0:0:0:1') return true;
  if (h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true;
  if (h.startsWith('::ffff:')) {
    const mapped = h.slice('::ffff:'.length);
    const parts = isIpv4Literal(mapped);
    if (parts && isPrivateOrLinkLocalIpv4(parts)) return true;
  }
  return false;
}

/**
 * Validate that a URL is http(s) to a non-private, non-link-local, non-metadata host.
 * Does not perform DNS resolution (document residual DNS-rebinding risk for fetchers).
 */
export function assertSafeExternalHttpUrl(raw: string): UrlSafetyResult {
  const trimmed = (raw ?? '').trim();
  if (!trimmed || trimmed.length > 2048) {
    return { ok: false, reason: 'invalid_url' };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  const protocol = url.protocol.toLowerCase();
  if (protocol !== 'https:' && protocol !== 'http:') {
    return { ok: false, reason: 'unsafe_protocol' };
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'credentials_in_url' };
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname) {
    return { ok: false, reason: 'missing_hostname' };
  }
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { ok: false, reason: 'blocked_hostname' };
  }
  if (
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.intranet')
  ) {
    return { ok: false, reason: 'internal_hostname' };
  }
  const v4 = isIpv4Literal(hostname);
  if (v4 && isPrivateOrLinkLocalIpv4(v4)) {
    return { ok: false, reason: 'private_or_link_local' };
  }
  if (isLocalOrPrivateIpv6(hostname)) {
    return { ok: false, reason: 'private_or_link_local' };
  }
  return { ok: true, url, hostname };
}

export function isSafeExternalHttpUrl(raw: string): boolean {
  return assertSafeExternalHttpUrl(raw).ok;
}

/** Strip keys that commonly participate in prototype-pollution gadgets. */
export function stripPrototypePollutionKeys<T extends Record<string, unknown>>(
  input: T,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    out[key] = value;
  }
  return out;
}
