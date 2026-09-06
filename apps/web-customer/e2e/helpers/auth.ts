import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const SESSION_KEY = 'wp_session_v1';
export const COUNTRY_KEY = 'wp_country_iso';
export const POSTAL_KEY = 'wp_postal_code';

export type CustomerSession = {
  accessToken: string;
  refreshToken: string;
  personId: string;
  audience: 'customer';
};

type OtpRequestBody = {
  challenge_id?: string;
  dev_code?: string;
  detail?: string;
};

type OtpVerifyBody = {
  access_token?: string;
  refresh_token?: string;
  person_id?: string;
  detail?: string;
};

export function apiBase(): string {
  return (process.env.WP_API_BASE_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '');
}

export async function requestDevOtp(
  request: APIRequestContext,
  email: string,
  purpose: 'REGISTER' | 'LOGIN' = 'REGISTER',
): Promise<{ challengeId: string; code: string }> {
  const res = await request.post(`${apiBase()}/api/v1/auth/otp/request`, {
    data: { identifier: email, purpose },
  });
  const body = (await res.json()) as OtpRequestBody;
  if (!res.ok() || !body.challenge_id || !body.dev_code) {
    throw new Error(`OTP request failed (${res.status()}): ${JSON.stringify(body)}`);
  }
  return { challengeId: body.challenge_id, code: body.dev_code };
}

export async function verifyDevOtp(
  request: APIRequestContext,
  challengeId: string,
  code: string,
): Promise<CustomerSession> {
  const res = await request.post(`${apiBase()}/api/v1/auth/otp/verify`, {
    data: { challenge_id: challengeId, code, audience: 'customer' },
  });
  const body = (await res.json()) as OtpVerifyBody;
  if (!res.ok() || !body.access_token || !body.refresh_token || !body.person_id) {
    throw new Error(`OTP verify failed (${res.status()}): ${JSON.stringify(body)}`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    personId: body.person_id,
    audience: 'customer',
  };
}

export async function signInCustomerApi(
  request: APIRequestContext,
  email: string,
  purpose: 'REGISTER' | 'LOGIN' = 'REGISTER',
): Promise<CustomerSession> {
  const otp = await requestDevOtp(request, email, purpose);
  return verifyDevOtp(request, otp.challengeId, otp.code);
}

/** Inject session into localStorage before app scripts hydrate. */
export async function injectCustomerSession(page: Page, session: CustomerSession): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    {
      key: SESSION_KEY,
      value: {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        audience: session.audience,
      },
    },
  );
}

export async function injectMarket(
  page: Page,
  country: string,
  postal?: string,
): Promise<void> {
  await page.addInitScript(
    ({ countryKey, postalKey, countryCode, postalCode }) => {
      window.localStorage.setItem(countryKey, countryCode);
      if (postalCode) {
        window.localStorage.setItem(postalKey, postalCode);
      }
    },
    {
      countryKey: COUNTRY_KEY,
      postalKey: POSTAL_KEY,
      countryCode: country,
      postalCode: postal ?? null,
    },
  );
}

export async function loginViaUi(page: Page, email: string): Promise<void> {
  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send OTP' }).click();
  await page.getByLabel('One-time code').waitFor({ state: 'visible' });
  const code = await page.getByLabel('One-time code').inputValue();
  if (!/^\d{6}$/.test(code)) {
    throw new Error(`Dev OTP was not auto-filled (got "${code}"). Is AUTH_DEV_REVEAL_OTP enabled?`);
  }
  await page.getByRole('button', { name: 'Verify & sign in' }).click();
  await page.waitForFunction(() => {
    try {
      const raw = window.localStorage.getItem('wp_session_v1');
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { accessToken?: string; audience?: string };
      return Boolean(parsed.accessToken && parsed.audience === 'customer');
    } catch {
      return false;
    }
  }, undefined, { timeout: 30_000 });
  await page.waitForURL((url) => !url.pathname.startsWith('/signup') && !url.pathname.startsWith('/login'), {
    timeout: 30_000,
  });
}

export function uniqueEmail(prefix: string): string {
  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${stamp}@example.com`;
}
