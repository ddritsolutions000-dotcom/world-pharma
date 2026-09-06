import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertNoHorizontalOverflow,
  clearOtpRateLimits,
  ensureNoSecrets,
  selectMarketIfGated,
  uiAdminLogin,
  uiCustomerLogin,
} from './s59-ui';

export const S60_SHOT_DIR = path.join(__dirname, '../../../test-results/s60-admin-control-plane-shots');
export const ADMIN = process.env.WP_ADMIN_BASE_URL ?? 'http://127.0.0.1:3001';
export const CUSTOMER = process.env.WP_CUSTOMER_BASE_URL ?? 'http://127.0.0.1:3000';
export const ADMIN_EMAIL = 'sandbox-admin@dev.local';
export const CUSTOMER_EMAIL = 'sandbox-customer@dev.local';
export const CMS_MARKER = 'S60-SANDBOX-CMS-MARKER';
export const PRODUCT_SLUG = 'demo-paracetamol-500';

export async function s60Snap(page: Page, name: string) {
  fs.mkdirSync(S60_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S60_SHOT_DIR, `${name}.png`), fullPage: true });
}

/** Admin OTP login with reliable email fill. */
export async function s60AdminLogin(page: Page, email = ADMIN_EMAIL) {
  await clearOtpRateLimits();
  await page.goto(`${ADMIN}/login`, { waitUntil: 'networkidle' });
  const emailField = page.getByLabel(/Work email|Email/i).first();
  await emailField.click();
  await emailField.fill('');
  await emailField.pressSequentially(email, { delay: 15 });
  const cont = page.getByRole('button', { name: 'Continue' });
  if (await cont.isEnabled().catch(() => false)) {
    await uiAdminLogin(page, email).catch(async () => {
      /* partial fill path */
    });
  } else {
    await uiAdminLogin(page, email);
  }
  await page.getByRole('button', { name: /Sign out/i }).first().waitFor({ state: 'visible', timeout: 90_000 });
}

export {
  assertNoHorizontalOverflow,
  clearOtpRateLimits,
  ensureNoSecrets,
  selectMarketIfGated,
  uiAdminLogin,
  uiCustomerLogin,
};
