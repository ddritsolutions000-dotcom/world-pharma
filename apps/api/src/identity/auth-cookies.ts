import type { Response } from 'express';
import type { AppEnv } from '@world-pharma/config';

export const ACCESS_COOKIE = 'wp_at';
export const REFRESH_COOKIE = 'wp_rt';

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq < 1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim();
    try {
      out[key] = decodeURIComponent(raw);
    } catch {
      out[key] = raw;
    }
  }
  return out;
}

function serializeCookie(
  name: string,
  value: string,
  opts: { httpOnly: boolean; secure: boolean; sameSite: 'Lax' | 'Strict' | 'None'; path: string; maxAge: number },
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path}`, `Max-Age=${opts.maxAge}`, `SameSite=${opts.sameSite}`];
  if (opts.httpOnly) {
    parts.push('HttpOnly');
  }
  if (opts.secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string; accessTtl: number; refreshTtl: number },
  env: Pick<AppEnv, 'NODE_ENV'>,
): void {
  const secure = env.NODE_ENV === 'production' || env.NODE_ENV === 'staging';
  res.setHeader('Set-Cookie', [
    serializeCookie(ACCESS_COOKIE, tokens.accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      path: '/',
      maxAge: tokens.accessTtl,
    }),
    serializeCookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      path: '/',
      maxAge: tokens.refreshTtl,
    }),
  ]);
}

export function clearAuthCookies(res: Response, env: Pick<AppEnv, 'NODE_ENV'>): void {
  const secure = env.NODE_ENV === 'production' || env.NODE_ENV === 'staging';
  res.setHeader('Set-Cookie', [
    serializeCookie(ACCESS_COOKIE, '', { httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge: 0 }),
    serializeCookie(REFRESH_COOKIE, '', { httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge: 0 }),
  ]);
}

export function readRefreshTokenFromRequest(cookies: Record<string, string>, bodyToken?: string): string | undefined {
  return bodyToken?.trim() || cookies[REFRESH_COOKIE]?.trim() || undefined;
}

export function readAccessTokenFromRequest(
  authorization: string | undefined,
  cookies: Record<string, string>,
): string | undefined {
  if (authorization?.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim();
  }
  return cookies[ACCESS_COOKIE]?.trim() || undefined;
}
