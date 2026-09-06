/**
 * Sprint 115 — URL safety + prototype-key strip (SSRF / pollution helpers).
 */
import {
  assertSafeExternalHttpUrl,
  isSafeExternalHttpUrl,
  stripPrototypePollutionKeys,
} from './url-safety';

describe('S115 url-safety', () => {
  it('allows normal https hosts', () => {
    expect(isSafeExternalHttpUrl('https://placehold.co/480.png')).toBe(true);
    expect(assertSafeExternalHttpUrl('https://cdn.example.com/a.png').ok).toBe(true);
  });

  it('blocks localhost, private IPs, link-local, metadata', () => {
    expect(isSafeExternalHttpUrl('http://127.0.0.1/secret')).toBe(false);
    expect(isSafeExternalHttpUrl('http://localhost/x')).toBe(false);
    expect(isSafeExternalHttpUrl('http://10.0.0.5/x')).toBe(false);
    expect(isSafeExternalHttpUrl('http://192.168.1.1/x')).toBe(false);
    expect(isSafeExternalHttpUrl('http://172.16.0.1/x')).toBe(false);
    expect(isSafeExternalHttpUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isSafeExternalHttpUrl('http://[::1]/')).toBe(false);
    expect(isSafeExternalHttpUrl('http://metadata.google.internal/')).toBe(false);
  });

  it('blocks unsafe protocols and credentials', () => {
    expect(isSafeExternalHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalHttpUrl('data:text/html,hi')).toBe(false);
    expect(isSafeExternalHttpUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeExternalHttpUrl('https://user:pass@evil.example/')).toBe(false);
  });

  it('strips prototype pollution keys', () => {
    const cleaned = stripPrototypePollutionKeys({
      a: 1,
      __proto__: { polluted: true },
      constructor: { polluted: true },
      prototype: { polluted: true },
      b: 'ok',
    } as Record<string, unknown>);
    expect(cleaned).toEqual({ a: 1, b: 'ok' });
    expect(Object.prototype.hasOwnProperty.call(cleaned, '__proto__')).toBe(false);
  });
});
