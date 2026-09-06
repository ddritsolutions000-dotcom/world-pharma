import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ADMIN, clearOtpRateLimits, ensureNoSecrets, s60AdminLogin, CUSTOMER } from './s60-ui';
import {
  selectMarketIfGated,
  uiOtpLogin,
  expirePendingOtpChallenges,
} from './s59-ui';

export const S117_SHOT_DIR = path.join(
  __dirname,
  '../../../test-results/s117-foundation-prep-shots',
);
export const S117_ARTIFACT_DIR = path.join(
  __dirname,
  '../../../test-results/s117-foundation-prep',
);
export const CUSTOMER_EMAIL = 'sandbox-customer@dev.local';

export async function s117Snap(page: Page, name: string) {
  fs.mkdirSync(S117_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S117_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s117WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S117_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S117_ARTIFACT_DIR, name), body, 'utf8');
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
