/**
 * Pass-01 — Affiliate release config safety.
 */
describe('Pass-01 affiliate release config safety', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
    jest.resetModules();
  });

  it('forbids localhost customer URL in production builds', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.com';
    process.env.EXPO_PUBLIC_CUSTOMER_URL = 'http://localhost:3000';
    expect(() => require('../app.config.js')()).toThrow(/localhost|https/i);
  });

  it('forbids plain http API in production builds', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://api.example.com';
    process.env.EXPO_PUBLIC_CUSTOMER_URL = 'https://shop.example.com';
    expect(() => require('../app.config.js')()).toThrow(/https/i);
  });

  it('allows production HTTPS bases', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.com';
    process.env.EXPO_PUBLIC_CUSTOMER_URL = 'https://shop.example.com';
    const cfg = require('../app.config.js')();
    expect(cfg.expo.android.usesCleartextTraffic).toBe(false);
  });
});
