import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ADMIN, clearOtpRateLimits, ensureNoSecrets, s60AdminLogin, CUSTOMER } from './s60-ui';
import {
  selectMarketIfGated,
  uiOtpLogin,
  expirePendingOtpChallenges,
} from './s59-ui';
import { s61LoginPortal, selectOrgByCountry } from './s61-ui';

export const S80_SHOT_DIR = path.join(__dirname, '../../../test-results/s80-pacs-shots');
export const S80_ARTIFACT_DIR = path.join(__dirname, '../../../test-results/s80-pacs');
export const IMAGING = 'http://127.0.0.1:3006';
export const RADIOLOGIST = 'http://127.0.0.1:3007';

export async function s80Snap(page: Page, name: string) {
  fs.mkdirSync(S80_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S80_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s80WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S80_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S80_ARTIFACT_DIR, name), body, 'utf8');
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
  s61LoginPortal,
  selectOrgByCountry,
};
