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

export const S102_SHOT_DIR = path.join(__dirname, '../../../test-results/s102-psp-shots');
export const S102_ARTIFACT_DIR = path.join(__dirname, '../../../test-results/s102-psp');
export const CUSTOMER_EMAIL = 'sandbox-customer@dev.local';
export const VENDOR = 'http://127.0.0.1:3004';

export async function s102Snap(page: Page, name: string) {
  fs.mkdirSync(S102_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S102_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s102WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S102_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S102_ARTIFACT_DIR, name), body, 'utf8');
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
