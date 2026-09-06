import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ADMIN, clearOtpRateLimits, ensureNoSecrets, s60AdminLogin, CUSTOMER } from './s60-ui';
import { selectMarketIfGated, uiOtpLogin } from './s59-ui';

export const S75_SHOT_DIR = path.join(__dirname, '../../../test-results/s75-observability-shots');
export const S75_ARTIFACT_DIR = path.join(__dirname, '../../../test-results/s75-observability');

export async function s75Snap(page: Page, name: string) {
  fs.mkdirSync(S75_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S75_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s75WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S75_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S75_ARTIFACT_DIR, name), body, 'utf8');
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
