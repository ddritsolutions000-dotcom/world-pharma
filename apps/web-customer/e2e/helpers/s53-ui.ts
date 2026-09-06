import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const S53_SHOT_DIR = path.join(__dirname, '../../../test-results/s53-ux-shots');

export async function s53Snap(page: Page, name: string) {
  fs.mkdirSync(S53_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S53_SHOT_DIR, `${name}.png`), fullPage: true });
}

async function expectVisibleOtp(page: Page, label: RegExp = /One-time code/i) {
  const otp = page.getByLabel(label);
  await otp.waitFor({ state: 'visible', timeout: 30_000 });
  const value = await otp.inputValue();
  if (!/^\d{4,8}$/.test(value)) {
    throw new Error(`Expected auto-filled OTP, got "${value}"`);
  }
}

/** Real UI OTP login — uses auto-filled AUTH_DEV_REVEAL_OTP code. No localStorage session inject. */
export async function uiOtpLogin(page: Page, email: string) {
  const emailField = page.getByLabel(/^Email$/i).or(page.getByLabel(/Work email|Email/i)).first();
  await emailField.fill(email);
  const send = page.getByRole('button', { name: 'Send OTP' });
  if (await send.isVisible().catch(() => false)) {
    // Cooldown after a prior OTP for the same identifier can briefly disable Send OTP.
    await send.waitFor({ state: 'visible', timeout: 30_000 });
    for (let i = 0; i < 60; i++) {
      if (await send.isEnabled().catch(() => false)) break;
      await page.waitForTimeout(1000);
    }
    if (!(await send.isEnabled().catch(() => false))) {
      throw new Error('Send OTP remained disabled (likely OTP cooldown).');
    }
    await send.click();
  } else {
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  await expectVisibleOtp(page);
  const verify = page.getByRole('button', { name: /Verify & sign in/i });
  if (await verify.isVisible().catch(() => false)) {
    await verify.click();
  } else {
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  // Wait until auth UI leaves the sign-in form (avoids false positives matching Sandbox copy on login).
  await page.getByRole('button', { name: /Sign out/i }).first().waitFor({ state: 'visible', timeout: 60_000 });
}

/** Admin enterprise auth: Continue → OTP Continue → optional MFA. */
export async function uiAdminLogin(page: Page, email: string) {
  await page.getByLabel(/Work email|Email/i).first().fill(email);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expectVisibleOtp(page, /One-time code/i);
  await page.getByRole('button', { name: 'Continue' }).click();

  const mfa = page.getByLabel(/Authenticator code/i);
  if (await mfa.isVisible({ timeout: 15_000 }).catch(() => false)) {
    const value = await mfa.inputValue();
    if (!/^\d{4,8}$/.test(value)) {
      // Wait briefly for AUTH_DEV_REVEAL prefill
      await page.waitForTimeout(500);
    }
    const filled = await mfa.inputValue();
    if (!/^\d{4,8}$/.test(filled)) {
      throw new Error(`Expected auto-filled MFA code, got "${filled}"`);
    }
    await page.getByRole('button', { name: /Verify & sign in|Activate MFA/i }).click();
  }
  await page.getByRole('button', { name: /Sign out/i }).first().waitFor({ state: 'visible', timeout: 60_000 });
}

export async function selectMarketIfGated(page: Page, countryLabel: RegExp) {
  const gate = page.getByRole('heading', { name: 'Choose your market' });
  if (await gate.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: countryLabel }).click();
  }
}

export async function ensureNoSecrets(page: Page) {
  const text = await page.locator('body').innerText();
  if (/Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_.]+/.test(text)) {
    throw new Error('Access token leaked into page text');
  }
  if (/otp[_-]?pepper|JWT_ACCESS_SECRET/i.test(text)) {
    throw new Error('Secret material leaked into page text');
  }
}
