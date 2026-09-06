import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ADMIN, clearOtpRateLimits, ensureNoSecrets, s60AdminLogin, CUSTOMER } from './s60-ui';
import { uiCustomerLogin, expirePendingOtpChallenges } from './s59-ui';

export const S87_SHOT_DIR = path.join(__dirname, '../../../test-results/s87-launch-control-shots');
export const S87_ARTIFACT_DIR = path.join(__dirname, '../../../test-results/s87-launch-control');

export async function s87Snap(page: Page, name: string) {
  fs.mkdirSync(S87_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S87_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s87WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S87_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S87_ARTIFACT_DIR, name), body, 'utf8');
}

export {
  ADMIN,
  CUSTOMER,
  clearOtpRateLimits,
  ensureNoSecrets,
  s60AdminLogin,
  uiCustomerLogin,
  expirePendingOtpChallenges,
};
