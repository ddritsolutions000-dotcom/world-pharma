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

export const S127_SHOT_DIR = path.join(
  __dirname,
  '../../../test-results/s127-lab-partner-onboarding-shots',
);
export const S127_ARTIFACT_DIR = path.join(
  __dirname,
  '../../../test-results/s127-lab-partner-onboarding',
);
export const LAB = 'http://127.0.0.1:3005';
export const CUSTOMER_EMAIL = 'sandbox-customer@dev.local';

export async function s127Snap(page: Page, name: string) {
  fs.mkdirSync(S127_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S127_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s127WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S127_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S127_ARTIFACT_DIR, name), body, 'utf8');
}

export async function ensureNoPiiPhi(page: Page) {
  await ensureNoSecrets(page);
  const body = await page.locator('body').innerText();
  if (/aadhaar|passport\s*no|ssn[=:]|pan[=:]\s*[A-Z]{5}/i.test(body)) {
    throw new Error('Sensitive identity document content leaked into page');
  }
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
