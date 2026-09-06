import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ADMIN, clearOtpRateLimits, ensureNoSecrets, s60AdminLogin, CUSTOMER, CUSTOMER_EMAIL } from './s60-ui';
import {
  uiCustomerLogin,
  selectMarketIfGated,
  uiOtpLogin,
  expirePendingOtpChallenges,
} from './s59-ui';
import { s61LoginPortal } from './s61-ui';

export const S78_SHOT_DIR = path.join(__dirname, '../../../test-results/s78-erx-shots');
export const S78_ARTIFACT_DIR = path.join(__dirname, '../../../test-results/s78-erx');
export const DOCTOR = 'http://127.0.0.1:3002';
export const VENDOR = 'http://127.0.0.1:3004';

export async function s78Snap(page: Page, name: string) {
  fs.mkdirSync(S78_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S78_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s78WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S78_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S78_ARTIFACT_DIR, name), body, 'utf8');
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
  uiOtpLogin,
  s61LoginPortal,
};
