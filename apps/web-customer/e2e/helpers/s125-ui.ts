import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ADMIN, clearOtpRateLimits, ensureNoSecrets, s60AdminLogin, CUSTOMER } from './s60-ui';
import {
  selectMarketIfGated,
  expirePendingOtpChallenges,
  uiCustomerLogin,
  uiOtpLogin,
} from './s59-ui';
import { s61LoginPortal, assertNoHorizontalOverflow } from './s61-ui';

export const S125_SHOT_DIR = path.join(
  __dirname,
  '../../../test-results/s125-consultation-erx-shots',
);
export const S125_ARTIFACT_DIR = path.join(
  __dirname,
  '../../../test-results/s125-consultation-erx',
);
export const CUSTOMER_EMAIL = 'sandbox-customer@dev.local';
export const DOCTOR_EMAIL = 'sandbox-doctor@dev.local';
export const DOCTOR = 'http://127.0.0.1:3002';

export async function s125Snap(page: Page, name: string) {
  fs.mkdirSync(S125_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S125_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s125WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S125_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S125_ARTIFACT_DIR, name), body, 'utf8');
}

/** Avoid capturing/asserting real PHI patterns in UI. */
export async function ensureNoClinicalPhiLeak(page: Page) {
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
  selectMarketIfGated,
  uiCustomerLogin,
  uiOtpLogin,
  assertNoHorizontalOverflow,
};
