import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ADMIN, clearOtpRateLimits, ensureNoSecrets, s60AdminLogin, CUSTOMER, CUSTOMER_EMAIL } from './s60-ui';
import { uiCustomerLogin, selectMarketIfGated, uiOtpLogin } from './s59-ui';
import { s61LoginPortal, selectSellerOrg } from './s61-ui';

export const S67_SHOT_DIR = path.join(__dirname, '../../../test-results/s67-carrier-shots');
export const S67_ARTIFACT_DIR = path.join(__dirname, '../../../test-results/s67-carrier');

export const VENDOR = 'http://127.0.0.1:3004';
export const LOGISTICS = 'http://127.0.0.1:3011';
export const FIXTURE_ORDER = 'WP-IN-4B5C33D1C4';

export async function s67Snap(page: Page, name: string) {
  fs.mkdirSync(S67_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S67_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s67WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S67_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S67_ARTIFACT_DIR, name), body, 'utf8');
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
  selectSellerOrg,
};
