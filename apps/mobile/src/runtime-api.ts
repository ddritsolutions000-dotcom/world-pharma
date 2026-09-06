export type MobileAppEnv = 'local' | 'sandbox' | 'production';

export type MobileApiResolution = {
  baseUrl: string;
  appEnv: MobileAppEnv;
  source: 'env' | 'expo-packager-lan' | 'web-loopback' | 'loopback-allowed' | 'android-emulator-alias' | 'unresolved';
};

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

let applied: MobileApiResolution | null = null;

export function resolveMobileAppEnv(env: Record<string, string | undefined>): MobileAppEnv {
  const value = (env['EXPO_PUBLIC_APP_ENV'] ?? '').trim().toLowerCase();
  if (value === 'sandbox' || value === 'production' || value === 'local') {
    return value;
  }
  return 'local';
}

export function hostnameOf(urlOrHost: string): string {
  const trimmed = urlOrHost.trim();
  if (!trimmed) {
    return '';
  }
  try {
    if (trimmed.includes('://')) {
      return new URL(trimmed).hostname;
    }
  } catch {
    return '';
  }
  return trimmed.split(':')[0] ?? '';
}

export function isLoopbackHostname(host: string): boolean {
  return LOOPBACK.has(host.trim().toLowerCase());
}

export function isPrivateLanHostname(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (h === '10.0.2.2') {
    return true;
  }
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) {
    return true;
  }
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) {
    return true;
  }
  const m = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(h);
  if (m) {
    const second = Number(m[1]);
    return second >= 16 && second <= 31;
  }
  return false;
}

/** Public HTTPS hosts are treated as production unless APP_ENV is explicitly production or sandbox. */
export function looksLikePublicProductionUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    if (parsed.protocol !== 'https:') {
      return false;
    }
    if (isLoopbackHostname(host) || isPrivateLanHostname(host)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function packagerHostnameFromExpo(constants: {
  expoConfig?: { hostUri?: string | null } | null;
  linkingUri?: string | null;
}): string | null {
  const hostUri = constants.expoConfig?.hostUri?.trim();
  if (hostUri) {
    const host = hostnameOf(`http://${hostUri}`);
    return host || null;
  }
  const linking = constants.linkingUri?.trim();
  if (linking) {
    try {
      const host = new URL(linking).hostname;
      return host || null;
    } catch {
      return null;
    }
  }
  return null;
}

function stripSlash(url: string): string {
  return url.replace(/\/$/, '');
}

export function resolveMobileApiBaseUrl(input: {
  env: Record<string, string | undefined>;
  packagerHost?: string | null;
  isReactNative: boolean;
}): MobileApiResolution {
  const appEnv = resolveMobileAppEnv(input.env);
  const configured = (input.env['EXPO_PUBLIC_API_BASE_URL'] ?? '').trim().replace(/\/$/, '');
  const allowLoopback = input.env['EXPO_PUBLIC_ALLOW_LOOPBACK'] === 'true';
  const emulator = input.env['EXPO_PUBLIC_ANDROID_EMULATOR'] === 'true';

  if (appEnv === 'production') {
    if (!configured) {
      return { baseUrl: '', appEnv, source: 'unresolved' };
    }
    return { baseUrl: stripSlash(configured), appEnv, source: 'env' };
  }

  if (!input.isReactNative) {
    if (configured) {
      const host = hostnameOf(configured);
      const remoteNonProd =
        !isLoopbackHostname(host) &&
        !isPrivateLanHostname(host) &&
        !(looksLikePublicProductionUrl(configured) && appEnv === 'local');
      if (remoteNonProd) {
        return { baseUrl: configured, appEnv, source: 'env' };
      }
    }
    return { baseUrl: 'http://127.0.0.1:4000', appEnv, source: 'web-loopback' };
  }

  if (configured) {
    const host = hostnameOf(configured);
    const rejectsLoopbackOnDevice =
      input.isReactNative && isLoopbackHostname(host) && !allowLoopback;
    const rejectsProdOnNonProd = looksLikePublicProductionUrl(configured) && appEnv === 'local';
    if (!rejectsLoopbackOnDevice && !rejectsProdOnNonProd) {
      return { baseUrl: configured, appEnv, source: 'env' };
    }
  }

  const packager = (input.packagerHost ?? '').trim();
  if (packager && !isLoopbackHostname(packager) && isPrivateLanHostname(packager)) {
    return { baseUrl: `http://${packager}:4000`, appEnv, source: 'expo-packager-lan' };
  }

  if (allowLoopback) {
    return { baseUrl: 'http://127.0.0.1:4000', appEnv, source: 'loopback-allowed' };
  }

  if (emulator || (packager && isLoopbackHostname(packager))) {
    return { baseUrl: 'http://10.0.2.2:4000', appEnv, source: 'android-emulator-alias' };
  }

  return { baseUrl: '', appEnv, source: 'unresolved' };
}

export function applyMobileRuntimeEnv(input: {
  env: Record<string, string | undefined>;
  packagerHost?: string | null;
  isReactNative: boolean;
}): MobileApiResolution {
  const resolved = resolveMobileApiBaseUrl(input);
  if (typeof process !== 'undefined' && process.env) {
    process.env['EXPO_PUBLIC_APP_ENV'] = resolved.appEnv;
    if (resolved.baseUrl) {
      process.env['EXPO_PUBLIC_API_BASE_URL'] = resolved.baseUrl;
    }
  }
  applied = resolved;
  return resolved;
}

export function getAppliedMobileRuntime(): MobileApiResolution | null {
  return applied;
}

export function formatMobileRuntimeCaption(runtime: MobileApiResolution | null): string {
  if (!runtime) {
    return 'Environment: unknown · API: not configured';
  }
  if (!runtime.baseUrl) {
    return `Environment: ${runtime.appEnv} · API: not configured (${runtime.source})`;
  }
  return `Environment: ${runtime.appEnv} · API: ${runtime.baseUrl}`;
}

export function isReactNativeRuntime(): boolean {
  return typeof navigator !== 'undefined' && (navigator as { product?: string }).product === 'ReactNative';
}
