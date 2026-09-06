import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertNoHorizontalOverflow,
  ensureNoSecrets,
  loginPortal,
  selectMarketIfGated,
  selectOrgByCountry,
  uiAdminLogin,
  uiOtpLogin,
} from './s57-ui';

export const S61_SHOT_DIR = path.join(__dirname, '../../../test-results/s61-partner-operations-shots');

export async function s61Snap(page: Page, name: string) {
  fs.mkdirSync(S61_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S61_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function clearOtpRateLimits() {
  try {
    const Redis = (await import('ioredis')).default;
    const client = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:56379', {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    await client.connect();
    // Match s59: clear rate-limit and OTP throttle keys so portal hops are deterministic.
    for (const pattern of ['rl:*', 'otp:*'] as const) {
      const keys = await client.keys(pattern);
      if (keys.length > 0) await client.del(...keys);
    }
    await client.quit();
  } catch {
    /* optional */
  }
}

/**
 * Reliable partner-portal OTP login.
 *
 * Sprint 104 root cause:
 * - Prior helper pre-filled email then called loginPortal → uiOtpLogin (.fill),
 *   which does not update React-controlled Email state → "Send OTP" stays disabled.
 * - Blind /login navigation 404s on doctor/lab/imaging/affiliate (auth is on `/`).
 *
 * Fix: resolve auth surface (home, else /login), then pressSequentially like uiCustomerLogin.
 */
export async function s61LoginPortal(page: Page, baseUrl: string, email: string) {
  await clearOtpRateLimits();
  const root = baseUrl.replace(/\/$/, '');

  await page.goto(`${root}/`, { waitUntil: 'domcontentloaded' });
  let emailField = page.getByLabel(/^Email$/i).or(page.getByLabel(/Email/i)).first();
  const homeHasEmail = await emailField
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => true)
    .catch(() => false);

  if (!homeHasEmail) {
    await page.goto(`${root}/login`, { waitUntil: 'domcontentloaded' });
    emailField = page.getByLabel(/^Email$/i).or(page.getByLabel(/Email/i)).first();
  }

  await emailField.waitFor({ state: 'visible', timeout: 45_000 });
  // Dismiss portal loading overlays if still painted over the form.
  await page
    .getByText(/Loading .+ console|Loading…/i)
    .first()
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => undefined);

  // Fail closed if Next.js client chunks did not hydrate (stale SSR / 404 assets).
  await page
    .waitForFunction(
      () => {
        const input = document.querySelector('input[aria-label="Email"], input[type="email"]');
        if (!input) return false;
        return Object.keys(input).some((k) => k.startsWith('__react'));
      },
      { timeout: 45_000 },
    )
    .catch(() => {
      throw new Error(
        `Portal ${root} auth form did not hydrate (Next client assets missing/stale). Restart the portal next-dev process.`,
      );
    });

  await emailField.click();
  await emailField.fill('');
  await emailField.pressSequentially(email, { delay: 15 });

  const send = page.getByRole('button', { name: 'Send OTP' });
  await send.waitFor({ state: 'visible', timeout: 30_000 });
  for (let i = 0; i < 40; i++) {
    if (await send.isEnabled().catch(() => false)) break;
    const current = await emailField.inputValue().catch(() => '');
    if (!current.includes('@')) {
      await emailField.click({ clickCount: 3 });
      await emailField.pressSequentially(email, { delay: 20 });
    }
    await page.waitForTimeout(250);
  }
  if (!(await send.isEnabled().catch(() => false))) {
    throw new Error(
      `Send OTP remained disabled on ${root} after email entry (React-controlled fill).`,
    );
  }
  await send.click();

  const otp = page.getByLabel(/One-time code/i);
  await otp.waitFor({ state: 'visible', timeout: 30_000 });
  const value = await otp.inputValue();
  if (!/^\d{4,8}$/.test(value)) {
    throw new Error(`Expected auto-filled sandbox OTP on ${root}, got empty/invalid`);
  }
  const verify = page.getByRole('button', { name: /Verify & sign in/i });
  if (await verify.isVisible().catch(() => false)) {
    await verify.click();
  } else {
    await page.getByRole('button', { name: 'Continue' }).click();
  }

  await page.getByRole('button', { name: /Sign out/i }).first().waitFor({
    state: 'visible',
    timeout: 90_000,
  });
  await ensureNoSecrets(page);
}

/** Vendor Selling as switcher uses class vws-org-select (not wp-input). */
export async function selectSellerOrg(page: Page, orgHint: RegExp) {
  const select = page.locator('#vws-org-select').or(page.getByLabel(/^Selling as$/i)).first();
  await select.waitFor({ state: 'visible', timeout: 45_000 });
  for (let attempt = 0; attempt < 25; attempt++) {
    const options = select.locator('option');
    const count = await options.count();
    for (let i = 0; i < count; i++) {
      const text = (await options.nth(i).textContent()) ?? '';
      const value = await options.nth(i).getAttribute('value');
      if (value && orgHint.test(text)) {
        await select.selectOption(value);
        await page.waitForTimeout(1200);
        return;
      }
    }
    await page.waitForTimeout(300);
  }
  throw new Error(`No seller organization matching ${orgHint}`);
}

export {
  assertNoHorizontalOverflow,
  ensureNoSecrets,
  loginPortal,
  selectMarketIfGated,
  selectOrgByCountry,
  uiAdminLogin,
  uiOtpLogin,
};
