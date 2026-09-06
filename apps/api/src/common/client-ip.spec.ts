/**
 * Sprint 114 — trusted client IP + Host allowlist (no parallel WAF).
 */
import {
  forwardedHeadersUntrusted,
  isAllowedApiHost,
  parseTrustedProxySetting,
  resolveClientIp,
} from './client-ip';
import type { Request } from 'express';

function fakeReq(partial: {
  ip?: string;
  remoteAddress?: string;
  headers?: Record<string, string | undefined>;
}): Request {
  return {
    ip: partial.ip,
    socket: { remoteAddress: partial.remoteAddress },
    headers: partial.headers ?? {},
  } as unknown as Request;
}

describe('S114 client-ip / trusted proxy', () => {
  it('empty TRUSTED_PROXIES means do not trust forwarded headers', () => {
    expect(parseTrustedProxySetting('')).toBe(false);
    expect(parseTrustedProxySetting(undefined)).toBe(false);
    expect(forwardedHeadersUntrusted('')).toBe(true);
  });

  it('parses hop count and allowlist', () => {
    expect(parseTrustedProxySetting('1')).toBe(1);
    expect(parseTrustedProxySetting('loopback')).toBe('loopback');
    expect(parseTrustedProxySetting('true')).toBe(true);
    expect(parseTrustedProxySetting('10.0.0.1,10.0.0.2')).toEqual(['10.0.0.1', '10.0.0.2']);
  });

  it('resolveClientIp never reads X-Forwarded-For directly', () => {
    const spoofed = fakeReq({
      ip: '127.0.0.1',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-for': '203.0.113.9', forwarded: 'for=203.0.113.9' },
    });
    expect(resolveClientIp(spoofed)).toBe('127.0.0.1');
    expect(resolveClientIp(spoofed)).not.toBe('203.0.113.9');
  });

  it('falls back to socket remoteAddress when req.ip empty', () => {
    expect(
      resolveClientIp(
        fakeReq({
          ip: '',
          remoteAddress: '10.1.2.3',
          headers: { 'x-forwarded-for': '198.51.100.7' },
        }),
      ),
    ).toBe('10.1.2.3');
  });

  it('Host allowlist rejects unknown hosts when configured', () => {
    expect(isAllowedApiHost('api.example.com', 'api.example.com')).toBe(true);
    expect(isAllowedApiHost('evil.example', 'api.example.com')).toBe(false);
    expect(isAllowedApiHost('api.example.com:443', 'api.example.com')).toBe(true);
    expect(isAllowedApiHost('anything', '')).toBe(true);
  });
});
