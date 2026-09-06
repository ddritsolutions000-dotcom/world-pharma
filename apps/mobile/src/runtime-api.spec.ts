import {
  applyMobileRuntimeEnv,
  formatMobileRuntimeCaption,
  looksLikePublicProductionUrl,
  packagerHostnameFromExpo,
  resolveMobileApiBaseUrl,
  resolveMobileAppEnv,
} from './runtime-api';

describe('mobile runtime API resolution', () => {
  it('defaults APP_ENV to local', () => {
    expect(resolveMobileAppEnv({})).toBe('local');
    expect(resolveMobileAppEnv({ EXPO_PUBLIC_APP_ENV: 'sandbox' })).toBe('sandbox');
    expect(resolveMobileAppEnv({ EXPO_PUBLIC_APP_ENV: 'production' })).toBe('production');
  });

  it('uses explicit LAN URL for a physical device', () => {
    const resolved = resolveMobileApiBaseUrl({
      env: { EXPO_PUBLIC_API_BASE_URL: 'http://192.168.1.24:4000', EXPO_PUBLIC_APP_ENV: 'local' },
      packagerHost: '192.168.1.24',
      isReactNative: true,
    });
    expect(resolved).toEqual({
      baseUrl: 'http://192.168.1.24:4000',
      appEnv: 'local',
      source: 'env',
    });
  });

  it('does not keep localhost as the API host on native without ALLOW_LOOPBACK', () => {
    const resolved = resolveMobileApiBaseUrl({
      env: { EXPO_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4000' },
      packagerHost: '192.168.0.12',
      isReactNative: true,
    });
    expect(resolved.baseUrl).toBe('http://192.168.0.12:4000');
    expect(resolved.source).toBe('expo-packager-lan');
  });

  it('derives the API host from the Expo packager LAN address', () => {
    expect(packagerHostnameFromExpo({ expoConfig: { hostUri: '10.0.0.8:8081' } })).toBe('10.0.0.8');
    const resolved = resolveMobileApiBaseUrl({
      env: {},
      packagerHost: '10.0.0.8',
      isReactNative: true,
    });
    expect(resolved.baseUrl).toBe('http://10.0.0.8:4000');
    expect(resolved.source).toBe('expo-packager-lan');
  });

  it('uses 10.0.2.2 for Android emulator when opted in', () => {
    const resolved = resolveMobileApiBaseUrl({
      env: { EXPO_PUBLIC_ANDROID_EMULATOR: 'true' },
      packagerHost: '127.0.0.1',
      isReactNative: true,
    });
    expect(resolved.baseUrl).toBe('http://10.0.2.2:4000');
    expect(resolved.source).toBe('android-emulator-alias');
  });

  it('keeps loopback for Expo web on the same machine', () => {
    const resolved = resolveMobileApiBaseUrl({
      env: {},
      packagerHost: 'localhost',
      isReactNative: false,
    });
    expect(resolved).toEqual({
      baseUrl: 'http://127.0.0.1:4000',
      appEnv: 'local',
      source: 'web-loopback',
    });
  });

  it('does not point Expo web at a developer LAN IP', () => {
    const resolved = resolveMobileApiBaseUrl({
      env: { EXPO_PUBLIC_API_BASE_URL: 'http://192.168.1.4:4000' },
      isReactNative: false,
    });
    expect(resolved.baseUrl).toBe('http://127.0.0.1:4000');
    expect(resolved.source).toBe('web-loopback');
  });

  it('does not silently send local builds to a public HTTPS host', () => {
    expect(looksLikePublicProductionUrl('https://api.worldpharma.example')).toBe(true);
    const resolved = resolveMobileApiBaseUrl({
      env: {
        EXPO_PUBLIC_APP_ENV: 'local',
        EXPO_PUBLIC_API_BASE_URL: 'https://api.worldpharma.example',
      },
      isReactNative: true,
    });
    expect(resolved.baseUrl).toBe('');
    expect(resolved.source).toBe('unresolved');
  });

  it('allows an explicit sandbox HTTPS API when APP_ENV is sandbox', () => {
    const resolved = resolveMobileApiBaseUrl({
      env: {
        EXPO_PUBLIC_APP_ENV: 'sandbox',
        EXPO_PUBLIC_API_BASE_URL: 'https://api.sandbox.example',
      },
      isReactNative: true,
    });
    expect(resolved.source).toBe('env');
    expect(resolved.baseUrl).toBe('https://api.sandbox.example');
  });

  it('refuses production without an explicit URL', () => {
    const resolved = resolveMobileApiBaseUrl({
      env: { EXPO_PUBLIC_APP_ENV: 'production' },
      isReactNative: true,
    });
    expect(resolved.baseUrl).toBe('');
    expect(resolved.source).toBe('unresolved');
  });

  it('writes EXPO_PUBLIC_API_BASE_URL for shell-core apiBaseUrl', () => {
    const previous = process.env['EXPO_PUBLIC_API_BASE_URL'];
    try {
      const resolved = applyMobileRuntimeEnv({
        env: { EXPO_PUBLIC_API_BASE_URL: 'http://192.168.4.4:4000' },
        isReactNative: true,
      });
      expect(process.env['EXPO_PUBLIC_API_BASE_URL']).toBe('http://192.168.4.4:4000');
      expect(formatMobileRuntimeCaption(resolved)).toContain('192.168.4.4:4000');
      expect(formatMobileRuntimeCaption(resolved)).not.toMatch(/token|secret|otp/i);
    } finally {
      if (previous === undefined) {
        delete process.env['EXPO_PUBLIC_API_BASE_URL'];
      } else {
        process.env['EXPO_PUBLIC_API_BASE_URL'] = previous;
      }
    }
  });
});
