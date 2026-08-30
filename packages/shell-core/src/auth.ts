import { apiBaseUrl, apiFetch } from './http';
import type { Audience } from './session';

export interface OtpVerifyResult {
  accessToken: string;
  refreshToken: string;
  personId: string;
  audience: Audience;
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
    detail?: string;
  };
  if (!res.ok || !body.access_token || !body.refresh_token || !body.person_id) {
    throw new Error(body.detail ?? 'otp_verify_failed');
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    personId: body.person_id,
    audience,
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
