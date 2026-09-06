/**
 * Pass-01 — Mobile release config: cleartext + production loopback guard (no native build).
 */
const path = require('node:path');

describe('Pass-01 mobile release config safety', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
    jest.resetModules();
  });

  it('customer local allows cleartext; production forbids loopback API', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'local';
    let cfg = require('../app.config.js')();
    expect(cfg.expo.android.usesCleartextTraffic).toBe(true);

    jest.resetModules();
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:4000';
    expect(() => require('../app.config.js')()).toThrow(/https|localhost|127/i);

    jest.resetModules();
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://api.example.com';
    expect(() => require('../app.config.js')()).toThrow(/https/i);

    jest.resetModules();
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.com';
    cfg = require('../app.config.js')();
    expect(cfg.expo.android.usesCleartextTraffic).toBe(false);
    expect(cfg.expo.extra.appEnv).toBe('production');
  });
});
