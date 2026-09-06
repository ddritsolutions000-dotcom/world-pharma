import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ADMIN, clearOtpRateLimits, ensureNoSecrets, s60AdminLogin, CUSTOMER } from './s60-ui';
import {
  selectMarketIfGated,
  expirePendingOtpChallenges,
  uiCustomerLogin,
} from './s59-ui';
import { s61LoginPortal, selectSellerOrg } from './s61-ui';

export const S122_SHOT_DIR = path.join(
  __dirname,
  '../../../test-results/s122-carrier-shots',
);
export const S122_ARTIFACT_DIR = path.join(
  __dirname,
  '../../../test-results/s122-carrier',
);
export const CUSTOMER_EMAIL = 'sandbox-customer@dev.local';
export const VENDOR = 'http://127.0.0.1:3004';
export const LOGISTICS = 'http://127.0.0.1:3011';
export const FIXTURE_ORDER = 'WP-IN-4B5C33D1C4';

export async function s122Snap(page: Page, name: string) {
  fs.mkdirSync(S122_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S122_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s122WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S122_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S122_ARTIFACT_DIR, name), body, 'utf8');
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
  uiCustomerLogin,
};
