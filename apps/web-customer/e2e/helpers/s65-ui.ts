import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ADMIN, clearOtpRateLimits, ensureNoSecrets, s60AdminLogin, CUSTOMER, CUSTOMER_EMAIL } from './s60-ui';
import { uiCustomerLogin, selectMarketIfGated } from './s59-ui';

export const S65_SHOT_DIR = path.join(__dirname, '../../../test-results/s65-payment-provider-shots');
export const S65_ARTIFACT_DIR = path.join(__dirname, '../../../test-results/s65-payment-provider');

export async function s65Snap(page: Page, name: string) {
  fs.mkdirSync(S65_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S65_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s65WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S65_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S65_ARTIFACT_DIR, name), body, 'utf8');
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
};
