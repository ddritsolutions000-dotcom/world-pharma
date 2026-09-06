import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ADMIN, clearOtpRateLimits, ensureNoSecrets, s60AdminLogin, CUSTOMER } from './s60-ui';
import { selectMarketIfGated, uiOtpLogin } from './s59-ui';

export const S74_SHOT_DIR = path.join(__dirname, '../../../test-results/s74-backup-shots');
export const S74_ARTIFACT_DIR = path.join(__dirname, '../../../test-results/s74-backup');

export async function s74Snap(page: Page, name: string) {
  fs.mkdirSync(S74_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S74_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s74WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S74_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S74_ARTIFACT_DIR, name), body, 'utf8');
}

export {
  ADMIN,
  CUSTOMER,
  clearOtpRateLimits,
  ensureNoSecrets,
  s60AdminLogin,
  selectMarketIfGated,
  uiOtpLogin,
};
