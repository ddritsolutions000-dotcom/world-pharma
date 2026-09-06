import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ADMIN, clearOtpRateLimits, ensureNoSecrets, s60AdminLogin, CUSTOMER } from './s60-ui';
import {
  selectMarketIfGated,
  expirePendingOtpChallenges,
  uiCustomerLogin,
} from './s59-ui';
import { s61LoginPortal, selectOrgByCountry, assertNoHorizontalOverflow } from './s61-ui';

export const S126_SHOT_DIR = path.join(
  __dirname,
  '../../../test-results/s126-lab-diagnostics-shots',
);
export const S126_ARTIFACT_DIR = path.join(
  __dirname,
  '../../../test-results/s126-lab-diagnostics',
);
export const CUSTOMER_EMAIL = 'sandbox-customer@dev.local';
export const LAB_EMAIL = 'sandbox-lab@dev.local';
export const PATHOLOGIST_EMAIL = 'sandbox-pathologist@dev.local';
export const LAB = 'http://127.0.0.1:3005';
export const PATHOLOGIST = 'http://127.0.0.1:3009';

export async function s126Snap(page: Page, name: string) {
  fs.mkdirSync(S126_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S126_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s126WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S126_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S126_ARTIFACT_DIR, name), body, 'utf8');
}

export async function ensureNoLabPhiLeak(page: Page) {
  await ensureNoSecrets(page);
  const body = await page.locator('body').innerText();
  if (/aadhaar|passport\s*no|ssn[=:]|mrn[=:]\s*\d{6,}/i.test(body)) {
    throw new Error('Sensitive clinical/identity content leaked into page');
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
  selectOrgByCountry,
  selectMarketIfGated,
  uiCustomerLogin,
  assertNoHorizontalOverflow,
};
