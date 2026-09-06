import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ADMIN, clearOtpRateLimits, ensureNoSecrets, s60AdminLogin, CUSTOMER, CUSTOMER_EMAIL } from './s60-ui';
import { uiCustomerLogin, selectMarketIfGated, expirePendingOtpChallenges } from './s59-ui';
import { s61LoginPortal } from './s61-ui';

export const S89_SHOT_DIR = path.join(__dirname, '../../../test-results/s89-communications-shots');
export const S89_ARTIFACT_DIR = path.join(__dirname, '../../../test-results/s89-communications');
export const VENDOR = 'http://127.0.0.1:3004';

export async function s89Snap(page: Page, name: string) {
  fs.mkdirSync(S89_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S89_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s89WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S89_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S89_ARTIFACT_DIR, name), body, 'utf8');
}

export async function ensureNoOtpLeak(page: Page) {
  await ensureNoSecrets(page);
  const text = await page.locator('body').innerText();
  if (/otp\s*[:=]\s*\d{4,8}/i.test(text) || /code\s*[:=]\s*\d{6}\b/i.test(text)) {
    throw new Error('Possible OTP value leaked into page text — do not capture');
  }
  if (/apiSecret|password=|eyJ[A-Za-z0-9_-]{10,}\./i.test(text)) {
    throw new Error('Possible secret leaked into page text');
  }
}

export {
  ADMIN,
  CUSTOMER,
  CUSTOMER_EMAIL,
  VENDOR,
  clearOtpRateLimits,
  ensureNoSecrets,
  s60AdminLogin,
  uiCustomerLogin,
  selectMarketIfGated,
  expirePendingOtpChallenges,
  s61LoginPortal,
};
