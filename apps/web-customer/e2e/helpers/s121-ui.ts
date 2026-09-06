import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ADMIN, clearOtpRateLimits, ensureNoSecrets, s60AdminLogin, CUSTOMER } from './s60-ui';
import {
  selectMarketIfGated,
  uiOtpLogin,
  expirePendingOtpChallenges,
} from './s59-ui';

export const S121_SHOT_DIR = path.join(
  __dirname,
  '../../../test-results/s121-comms-shots',
);
export const S121_ARTIFACT_DIR = path.join(
  __dirname,
  '../../../test-results/s121-comms',
);
export const CUSTOMER_EMAIL = 'sandbox-customer@dev.local';

export async function s121Snap(page: Page, name: string) {
  fs.mkdirSync(S121_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S121_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s121WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S121_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S121_ARTIFACT_DIR, name), body, 'utf8');
}

export async function ensureNoOtpLeak(page: Page) {
  await ensureNoSecrets(page);
  const body = await page.locator('body').innerText();
  expectNoOtp(body);
}

function expectNoOtp(body: string) {
  if (/otp[=:\s]+\d{4,}/i.test(body) || /code[=:\s]+\d{6}/i.test(body)) {
    throw new Error('OTP value leaked into page content');
  }
}

export {
  ADMIN,
  CUSTOMER,
  clearOtpRateLimits,
  ensureNoSecrets,
  s60AdminLogin,
  selectMarketIfGated,
  uiOtpLogin,
  expirePendingOtpChallenges,
};
