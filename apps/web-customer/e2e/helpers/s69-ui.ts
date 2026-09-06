import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ADMIN, clearOtpRateLimits, ensureNoSecrets, s60AdminLogin, CUSTOMER, CUSTOMER_EMAIL } from './s60-ui';
import { uiCustomerLogin, selectMarketIfGated, uiOtpLogin } from './s59-ui';
import { s61LoginPortal } from './s61-ui';

export const S69_SHOT_DIR = path.join(__dirname, '../../../test-results/s69-video-shots');
export const S69_ARTIFACT_DIR = path.join(__dirname, '../../../test-results/s69-video');
export const DOCTOR = 'http://127.0.0.1:3002';

export async function s69Snap(page: Page, name: string) {
  fs.mkdirSync(S69_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S69_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s69WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S69_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S69_ARTIFACT_DIR, name), body, 'utf8');
}

export {
  ADMIN,
  CUSTOMER,
  CUSTOMER_EMAIL,
  clearOtpRateLimits,
  ensureNoSecrets,
  s60AdminLogin,
  uiCustomerLogin,
  selectMarketIfGated,
  uiOtpLogin,
  s61LoginPortal,
};
