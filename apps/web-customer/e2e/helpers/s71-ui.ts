import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ADMIN, clearOtpRateLimits, ensureNoSecrets, s60AdminLogin, CUSTOMER } from './s60-ui';
import { selectMarketIfGated, uiOtpLogin } from './s59-ui';
import { s61LoginPortal } from './s61-ui';

export const S71_SHOT_DIR = path.join(__dirname, '../../../test-results/s71-payout-shots');
export const S71_ARTIFACT_DIR = path.join(__dirname, '../../../test-results/s71-payout');
export const AFFILIATE = 'http://127.0.0.1:3010';

export async function s71Snap(page: Page, name: string) {
  fs.mkdirSync(S71_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S71_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s71WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S71_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S71_ARTIFACT_DIR, name), body, 'utf8');
}

export {
  ADMIN,
  CUSTOMER,
  clearOtpRateLimits,
  ensureNoSecrets,
  s60AdminLogin,
  selectMarketIfGated,
  uiOtpLogin,
  s61LoginPortal,
};
