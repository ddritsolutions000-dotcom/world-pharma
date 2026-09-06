import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ADMIN, clearOtpRateLimits, ensureNoSecrets, s60AdminLogin, CUSTOMER } from './s60-ui';
import { selectMarketIfGated, uiOtpLogin } from './s59-ui';
import { s61LoginPortal, selectSellerOrg } from './s61-ui';

export const S73_SHOT_DIR = path.join(__dirname, '../../../test-results/s73-storage-shots');
export const S73_ARTIFACT_DIR = path.join(__dirname, '../../../test-results/s73-storage');
export const AFFILIATE = 'http://127.0.0.1:3010';
export const VENDOR = 'http://127.0.0.1:3004';
export const DOCTOR = 'http://127.0.0.1:3002';
export const LAB = 'http://127.0.0.1:3005';
export const IMAGING = 'http://127.0.0.1:3006';

export async function s73Snap(page: Page, name: string) {
  fs.mkdirSync(S73_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S73_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s73WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S73_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S73_ARTIFACT_DIR, name), body, 'utf8');
}

export {
  ADMIN,
  CUSTOMER,
  clearOtpRateLimits,
  ensureNoSecrets,
  s60AdminLogin,
  selectMarketIfGated,
  uiOtpLogin,
  s61LoginPortal,
  selectSellerOrg,
};
