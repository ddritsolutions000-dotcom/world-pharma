import { apiBaseUrl, apiFetch } from './http';
import type { Audience, SessionStore } from './session';

export interface OtpVerifyResult {
  accessToken: string;
  refreshToken: string;
  personId: string;
  audience: Audience;
  mfaRequired?: boolean;
  mfaEnrollmentRequired?: boolean;
  mfaToken?: string;
  devTotpCode?: string;
}

export interface BootstrapSnapshot {
  authenticated: boolean;
  person_id: string;
  audience: Audience;
  roles: string[];
  permissions: string[];
  account_status?: string;
  mfa?: {
    enrolled: boolean;
    required: boolean;
    policy_required: boolean;
    recovery_codes_remaining: number;
  };
}

export async function loginWithPassword(
  identifier: string,
  password: string,
  env: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env,
): Promise<{ challengeId: string; maskedPhone: string; channel: 'SMS'; next: 'otp'; devCode?: string }> {
  const res = await apiFetch('api/v1/auth/password/login', {
    method: 'POST',
    baseUrl: apiBaseUrl(env),
    body: JSON.stringify({ identifier, password }),
  });
  const body = (await res.json()) as {
    challenge_id?: string;
    masked_phone?: string;
    channel?: 'SMS';
    next?: 'otp';
    dev_code?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(body.detail ?? 'password_login_failed');
  }
  if (!body.challenge_id || !body.masked_phone) {
    throw new Error('password_login_challenge_missing');
  }
  return {
    challengeId: body.challenge_id,
    maskedPhone: body.masked_phone,
    channel: body.channel ?? 'SMS',
    next: 'otp',
    ...(body.dev_code ? { devCode: body.dev_code } : {}),
  };
}

export async function requestOtp(
  identifier: string,
  purpose: 'REGISTER' | 'LOGIN' = 'REGISTER',
  env: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env,
): Promise<{ challengeId: string; devCode?: string }> {
  const res = await apiFetch('api/v1/auth/otp/request', {
    method: 'POST',
    baseUrl: apiBaseUrl(env),
    body: JSON.stringify({ identifier, purpose }),
  });
  const body = (await res.json()) as {
    challenge_id?: string;
    dev_code?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(body.detail ?? 'otp_request_failed');
  }
  if (!body.challenge_id) {
    throw new Error('otp_challenge_missing');
  }
  return { challengeId: body.challenge_id, devCode: body.dev_code };
}

export async function verifyOtp(
  challengeId: string,
  code: string,
  audience: Audience,
  env: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env,
): Promise<OtpVerifyResult> {
  const res = await apiFetch('api/v1/auth/otp/verify', {
    method: 'POST',
    baseUrl: apiBaseUrl(env),
    body: JSON.stringify({ challenge_id: challengeId, code, audience }),
  });
  const body = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    person_id?: string;
    mfa_required?: boolean;
    mfa_enrollment_required?: boolean;
    mfa_token?: string;
    dev_totp_code?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(body.detail ?? 'otp_verify_failed');
  }
  if (body.mfa_required && body.mfa_token && body.person_id) {
    return {
      accessToken: '',
      refreshToken: '',
      personId: body.person_id,
      audience,
      mfaRequired: true,
      mfaEnrollmentRequired: body.mfa_enrollment_required === true,
      mfaToken: body.mfa_token,
      devTotpCode: body.dev_totp_code,
    };
  }
  if (!body.access_token || !body.refresh_token || !body.person_id) {
    throw new Error(body.detail ?? 'otp_verify_failed');
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    personId: body.person_id,
    audience,
  };
}

export async function verifyMfaLogin(
  mfaToken: string,
  code: string,
  env: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env,
): Promise<OtpVerifyResult> {
  const res = await apiFetch('api/v1/auth/mfa/verify-login', {
    method: 'POST',
    baseUrl: apiBaseUrl(env),
    body: JSON.stringify({ mfa_token: mfaToken, code }),
  });
  const body = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    person_id?: string;
    detail?: string;
  };
  if (!res.ok || !body.access_token || !body.refresh_token || !body.person_id) {
    throw new Error(body.detail ?? 'mfa_verify_failed');
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    personId: body.person_id,
    audience: 'admin',
  };
}

export async function signInWithOtp(
  identifier: string,
  audience: Audience,
  code?: string,
  env: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env,
): Promise<OtpVerifyResult> {
  const requested = await requestOtp(identifier, 'REGISTER', env);
  const otp = code ?? requested.devCode;
  if (!otp) {
    throw new Error('otp_code_required');
  }
  return verifyOtp(requested.challengeId, otp, audience, env);
}

export type CurrentUserResult =
  | { ok: true; permissions: string[] }
  | { ok: false; unauthorized: boolean };

export async function fetchCurrentUser(
  accessToken: string,
  env: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env,
): Promise<CurrentUserResult> {
  try {
    const res = await apiFetch('api/v1/me', {
      accessToken: accessToken === '__cookie__' ? null : accessToken,
      baseUrl: apiBaseUrl(env),
    });
    if (res.status === 401) {
      return { ok: false, unauthorized: true };
    }
    if (!res.ok) {
      return { ok: true, permissions: [] };
    }
    const body = (await res.json()) as { permissions?: unknown };
    return {
      ok: true,
      permissions: Array.isArray(body.permissions)
        ? body.permissions.filter((item): item is string => typeof item === 'string')
        : [],
    };
  } catch {
    return { ok: true, permissions: [] };
  }
}

export async function fetchBootstrap(
  accessToken?: string | null,
  env: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env,
): Promise<{ ok: true; data: BootstrapSnapshot } | { ok: false; unauthorized: boolean }> {
  try {
    const res = await apiFetch('api/v1/auth/bootstrap', {
      accessToken: accessToken === '__cookie__' || !accessToken ? null : accessToken,
      baseUrl: apiBaseUrl(env),
    });
    if (res.status === 401) {
      return { ok: false, unauthorized: true };
    }
    if (!res.ok) {
      return { ok: false, unauthorized: true };
    }
    const body = (await res.json()) as BootstrapSnapshot;
    return { ok: true, data: body };
  } catch {
    return { ok: false, unauthorized: true };
  }
}

export async function hydrateSessionPermissions(store: SessionStore): Promise<'ok' | 'unauthorized'> {
  const accessToken = store.getAccessToken();
  const refreshToken = store.getRefreshToken();
  const audience = store.snapshot().audience;
  if (!accessToken || !refreshToken || !audience || accessToken === 'shell-dev-access') {
    return 'ok';
  }
  const bootstrap = await fetchBootstrap(accessToken === '__cookie__' ? null : accessToken);
  if (!bootstrap.ok && bootstrap.unauthorized) {
    store.expire();
    return 'unauthorized';
  }
  if (bootstrap.ok) {
    store.authenticate({
      accessToken,
      refreshToken,
      audience: (bootstrap.data.audience as Audience) ?? audience,
      permissions: bootstrap.data.permissions ?? [],
    });
    return 'ok';
  }
  const me = await fetchCurrentUser(accessToken);
  if (!me.ok && me.unauthorized) {
    store.expire();
    return 'unauthorized';
  }
  if (me.ok) {
    store.authenticate({
      accessToken,
      refreshToken,
      audience,
      permissions: me.permissions,
    });
  }
  return 'ok';
}
