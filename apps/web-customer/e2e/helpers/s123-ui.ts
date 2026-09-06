import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ADMIN, clearOtpRateLimits, ensureNoSecrets, s60AdminLogin, CUSTOMER } from './s60-ui';
import {
  selectMarketIfGated,
  expirePendingOtpChallenges,
  uiCustomerLogin,
} from './s59-ui';
import { s61LoginPortal, selectSellerOrg, assertNoHorizontalOverflow } from './s61-ui';

export const S123_SHOT_DIR = path.join(
  __dirname,
  '../../../test-results/s123-vendor-shots',
);
export const S123_ARTIFACT_DIR = path.join(
  __dirname,
  '../../../test-results/s123-vendor',
);
export const CUSTOMER_EMAIL = 'sandbox-customer@dev.local';
export const VENDOR_EMAIL = 'sandbox-vendor@dev.local';
export const VENDOR = 'http://127.0.0.1:3004';
export const LOGISTICS = 'http://127.0.0.1:3011';
export const FIXTURE_ORDER = 'WP-IN-4B5C33D1C4';
/** Authoritative vendor fulfillment queue (S122 wrongly used /orders → 404). */
export const VENDOR_ORDERS_PATH = `${VENDOR}/workspace/orders`;

export async function s123Snap(page: Page, name: string) {
  fs.mkdirSync(S123_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S123_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s123WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S123_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S123_ARTIFACT_DIR, name), body, 'utf8');
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
  assertNoHorizontalOverflow,
};
