import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ADMIN, clearOtpRateLimits, ensureNoSecrets, s60AdminLogin, CUSTOMER } from './s60-ui';
import {
  selectMarketIfGated,
  expirePendingOtpChallenges,
  uiOtpLogin,
} from './s59-ui';
import { s61LoginPortal, selectSellerOrg } from './s61-ui';

export const S124_SHOT_DIR = path.join(__dirname, '../../../test-results/s124-kyc-shots');
export const S124_ARTIFACT_DIR = path.join(__dirname, '../../../test-results/s124-kyc');
export const AFFILIATE = 'http://127.0.0.1:3010';
export const VENDOR = 'http://127.0.0.1:3004';
export const DOCTOR = 'http://127.0.0.1:3002';
export const LAB = 'http://127.0.0.1:3005';
export const IMAGING = 'http://127.0.0.1:3006';
export const CUSTOMER_EMAIL = 'sandbox-customer@dev.local';

export async function s124Snap(page: Page, name: string) {
  fs.mkdirSync(S124_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S124_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s124WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S124_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S124_ARTIFACT_DIR, name), body, 'utf8');
}

export async function ensureNoPiiPhi(page: Page) {
  await ensureNoSecrets(page);
  const body = await page.locator('body').innerText();
  if (/aadhaar|passport\s*no|ssn[=:]|pan[=:]\s*[A-Z]{5}/i.test(body)) {
    throw new Error('Sensitive identity document content leaked into page');
  }
}

export {
  ADMIN,
  CUSTOMER,
  clearOtpRateLimits,
  expirePendingOtpChallenges,
  ensureNoSecrets,
  s60AdminLogin,
  s61LoginPortal,
  selectSellerOrg,
  selectMarketIfGated,
  uiOtpLogin,
};
