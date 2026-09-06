import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ADMIN, clearOtpRateLimits, ensureNoSecrets, s60AdminLogin, CUSTOMER } from './s60-ui';
import {
  selectMarketIfGated,
  uiOtpLogin,
  expirePendingOtpChallenges,
} from './s59-ui';

export const S99_SHOT_DIR = path.join(__dirname, '../../../test-results/s99-deployment-shots');
export const S99_ARTIFACT_DIR = path.join(__dirname, '../../../test-results/s99-deployment');

export async function s99Snap(page: Page, name: string) {
  fs.mkdirSync(S99_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S99_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s99WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S99_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S99_ARTIFACT_DIR, name), body, 'utf8');
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
