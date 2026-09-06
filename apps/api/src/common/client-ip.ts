/**
 * Sprint 114 — Trusted client IP resolution for abuse controls.
 * Never trust raw X-Forwarded-For / Forwarded headers unless Express trust proxy
 * is explicitly configured. Not a parallel rate limiter or WAF.
 */
import type { Request } from 'express';

export type TrustedProxySetting = boolean | number | string | string[];

/**
 * Parse TRUSTED_PROXIES env.
 * - empty / unset → false (do not trust forwarded headers)
 * - "1", "2", … → hop count
 * - "loopback" | "true" → Express shorthand
 * - comma-separated IPs/CIDRs → allowlist
 */
export function parseTrustedProxySetting(raw: string | undefined | null): TrustedProxySetting {
  const value = (raw ?? '').trim();
  if (!value || value.toLowerCase() === 'false' || value === '0') {
    return false;
  }
  const lower = value.toLowerCase();
  if (lower === 'true' || lower === 'loopback') {
    return lower === 'true' ? true : 'loopback';
  }
  if (/^\d+$/.test(value)) {
    const hops = Number(value);
    return hops > 0 ? hops : false;
  }
  const list = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return list.length === 1 ? list[0]! : list;
}

/**
 * Resolve client IP for rate limiting / security signals.
 * Uses Express `req.ip` which only honors X-Forwarded-For when `trust proxy` is set.
 * Deliberately does NOT read spoofable headers directly.
 */
export function resolveClientIp(req: Request): string {
  const fromExpress = typeof req.ip === 'string' ? req.ip.trim() : '';
  if (fromExpress) {
    return fromExpress;
  }
  const remote = req.socket?.remoteAddress?.trim();
  return remote || 'unknown';
}

/** True when forwarded client-IP headers must be ignored (secure default). */
export function forwardedHeadersUntrusted(trustedProxies: string | undefined | null): boolean {
  return parseTrustedProxySetting(trustedProxies) === false;
}

/**
 * Host allowlist check for optional PUBLIC_API_HOSTS.
 * Empty allowlist → not enforced here (caller treats as EXTERNAL_GATED for production edge).
 */
export function isAllowedApiHost(
  hostHeader: string | undefined,
  publicApiHosts: string | undefined | null,
): boolean {
  const allow = (publicApiHosts ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length === 0) {
    return true;
  }
  const host = (hostHeader ?? '').split(':')[0]?.trim().toLowerCase() ?? '';
  if (!host) {
    return false;
  }
  return allow.includes(host);
}
