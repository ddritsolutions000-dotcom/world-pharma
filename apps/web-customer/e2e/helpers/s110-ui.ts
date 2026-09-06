import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ADMIN, clearOtpRateLimits, ensureNoSecrets, s60AdminLogin, CUSTOMER } from './s60-ui';
import {
  selectMarketIfGated,
  uiOtpLogin,
  expirePendingOtpChallenges,
} from './s59-ui';

export const S110_SHOT_DIR = path.join(__dirname, '../../../test-results/s110-security-shots');
export const S110_ARTIFACT_DIR = path.join(__dirname, '../../../test-results/s110-security');
export const CUSTOMER_EMAIL = 'sandbox-customer@dev.local';

export async function s110Snap(page: Page, name: string) {
  fs.mkdirSync(S110_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S110_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s110WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S110_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S110_ARTIFACT_DIR, name), body, 'utf8');
}

export {
  ADMIN,
  CUSTOMER,
  clearOtpRateLimits,
  ensureNoSecrets,
  s60AdminLogin,
  selectMarketIfGated,
  uiOtpLogin,
  expirePendingOtpChallenges,
};
