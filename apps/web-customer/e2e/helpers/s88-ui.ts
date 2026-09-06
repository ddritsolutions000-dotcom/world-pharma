import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ADMIN, clearOtpRateLimits, ensureNoSecrets, s60AdminLogin, CUSTOMER, CUSTOMER_EMAIL } from './s60-ui';
import { uiCustomerLogin, selectMarketIfGated, uiOtpLogin, expirePendingOtpChallenges } from './s59-ui';
import { s61LoginPortal, selectSellerOrg } from './s61-ui';

export const S88_SHOT_DIR = path.join(__dirname, '../../../test-results/s88-psp-shots');
export const S88_ARTIFACT_DIR = path.join(__dirname, '../../../test-results/s88-psp');
export const VENDOR = 'http://127.0.0.1:3004';

export async function s88Snap(page: Page, name: string) {
  fs.mkdirSync(S88_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S88_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s88WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S88_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S88_ARTIFACT_DIR, name), body, 'utf8');
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
  uiOtpLogin,
  selectMarketIfGated,
  expirePendingOtpChallenges,
  s61LoginPortal,
  selectSellerOrg,
};
