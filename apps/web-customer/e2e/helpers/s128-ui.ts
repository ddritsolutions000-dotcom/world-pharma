import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ADMIN, clearOtpRateLimits, ensureNoSecrets, s60AdminLogin, CUSTOMER } from './s60-ui';
import {
  selectMarketIfGated,
  expirePendingOtpChallenges,
  uiOtpLogin,
} from './s59-ui';
import { s61LoginPortal } from './s61-ui';

export const S128_SHOT_DIR = path.join(
  __dirname,
  '../../../test-results/s128-psp-activation-control-shots',
);
export const S128_ARTIFACT_DIR = path.join(
  __dirname,
  '../../../test-results/s128-psp-activation-control',
);
export const VENDOR = 'http://127.0.0.1:3004';
export const CUSTOMER_EMAIL = 'sandbox-customer@dev.local';
export const VENDOR_EMAIL = 'sandbox-vendor@dev.local';

export async function s128Snap(page: Page, name: string) {
  fs.mkdirSync(S128_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S128_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s128WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S128_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S128_ARTIFACT_DIR, name), body, 'utf8');
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
};
