import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ADMIN, clearOtpRateLimits, ensureNoSecrets, s60AdminLogin, CUSTOMER } from './s60-ui';
import {
  selectMarketIfGated,
  uiOtpLogin,
  expirePendingOtpChallenges,
} from './s59-ui';

export const S98_SHOT_DIR = path.join(__dirname, '../../../test-results/s98-secrets-env-shots');
export const S98_ARTIFACT_DIR = path.join(__dirname, '../../../test-results/s98-secrets-env');

export async function s98Snap(page: Page, name: string) {
  fs.mkdirSync(S98_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S98_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s98WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S98_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S98_ARTIFACT_DIR, name), body, 'utf8');
}

export {
  ADMIN,
  CUSTOMER,
  clearOtpRateLimits,
  expirePendingOtpChallenges,
  ensureNoSecrets,
  s60AdminLogin,
  selectMarketIfGated,
  uiOtpLogin,
};
