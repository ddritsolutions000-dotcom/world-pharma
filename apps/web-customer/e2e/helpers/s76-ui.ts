import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ADMIN, CUSTOMER, CUSTOMER_EMAIL, clearOtpRateLimits, ensureNoSecrets, s60AdminLogin } from './s60-ui';
import { uiCustomerLogin, selectMarketIfGated, expirePendingOtpChallenges } from './s59-ui';
import { s61LoginPortal } from './s61-ui';

export const S76_SHOT_DIR = path.join(__dirname, '../../../test-results/s76-otp-messaging-shots');
export const S76_ARTIFACT_DIR = path.join(__dirname, '../../../test-results/s76-otp-messaging');

export const AFFILIATE = 'http://127.0.0.1:3010';
export const VENDOR = 'http://127.0.0.1:3004';
export const DOCTOR = 'http://127.0.0.1:3002';
export const LAB = 'http://127.0.0.1:3005';
export const IMAGING = 'http://127.0.0.1:3006';

export async function s76Snap(page: Page, name: string) {
  fs.mkdirSync(S76_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S76_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s76WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S76_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S76_ARTIFACT_DIR, name), body, 'utf8');
}

export {
  ADMIN,
  CUSTOMER,
  CUSTOMER_EMAIL,
  clearOtpRateLimits,
  expirePendingOtpChallenges,
  ensureNoSecrets,
  s60AdminLogin,
  uiCustomerLogin,
  selectMarketIfGated,
  s61LoginPortal,
};
