import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ADMIN, clearOtpRateLimits, ensureNoSecrets, s60AdminLogin, CUSTOMER } from './s60-ui';
import {
  selectMarketIfGated,
  uiOtpLogin,
  expirePendingOtpChallenges,
  uiCustomerLogin,
} from './s59-ui';
import { s61LoginPortal } from './s61-ui';

export const S103_SHOT_DIR = path.join(__dirname, '../../../test-results/s103-communications-shots');
export const S103_ARTIFACT_DIR = path.join(__dirname, '../../../test-results/s103-communications');
export const CUSTOMER_EMAIL = 'sandbox-customer@dev.local';
export const VENDOR = 'http://127.0.0.1:3004';

export async function s103Snap(page: Page, name: string) {
  fs.mkdirSync(S103_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S103_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s103WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S103_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S103_ARTIFACT_DIR, name), body, 'utf8');
}

export {
  ADMIN,
  CUSTOMER,
  clearOtpRateLimits,
  expirePendingOtpChallenges,
  ensureNoSecrets,
  s60AdminLogin,
  s61LoginPortal,
  selectMarketIfGated,
  uiOtpLogin,
  uiCustomerLogin,
};
