/**
 * Sprint 159 — Affiliate mobile share URL + launch-safety contracts.
 */
import { resolveShareUrl } from './affiliate-labels';

describe('S159 affiliate share URL fail-closed', () => {
  it('keeps absolute URLs unchanged', () => {
    expect(resolveShareUrl('https://shop.example/r/ABC', {})).toBe('https://shop.example/r/ABC');
  });

  it('allows localhost only for local app env', () => {
    expect(
      resolveShareUrl('/r/ABC', {
        EXPO_PUBLIC_APP_ENV: 'local',
      }),
    ).toBe('http://localhost:3000/r/ABC');
  });

  it('does not invent localhost share base in sandbox/production', () => {
    expect(
      resolveShareUrl('/r/ABC', {
        EXPO_PUBLIC_APP_ENV: 'sandbox',
      }),
    ).toBe('/r/ABC');
    expect(
      resolveShareUrl('/r/ABC', {
        EXPO_PUBLIC_APP_ENV: 'production',
        EXPO_PUBLIC_CUSTOMER_URL: 'http://localhost:3000',
      }),
    ).toBe('/r/ABC');
  });

  it('uses configured customer URL when non-loopback', () => {
    expect(
      resolveShareUrl('/r/ABC', {
        EXPO_PUBLIC_APP_ENV: 'sandbox',
        EXPO_PUBLIC_CUSTOMER_URL: 'https://customer.sandbox.example',
      }),
    ).toBe('https://customer.sandbox.example/r/ABC');
  });
});
