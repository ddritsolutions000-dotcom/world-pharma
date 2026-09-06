import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ADMIN, clearOtpRateLimits, ensureNoSecrets, s60AdminLogin, CUSTOMER } from './s60-ui';
import { selectMarketIfGated, uiOtpLogin } from './s59-ui';
import { s61LoginPortal, selectOrgByCountry } from './s61-ui';

export const S70_SHOT_DIR = path.join(__dirname, '../../../test-results/s70-pacs-shots');
export const S70_ARTIFACT_DIR = path.join(__dirname, '../../../test-results/s70-pacs');
export const IMAGING = 'http://127.0.0.1:3006';
export const RADIOLOGIST = 'http://127.0.0.1:3007';

export async function s70Snap(page: Page, name: string) {
  fs.mkdirSync(S70_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S70_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s70WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S70_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S70_ARTIFACT_DIR, name), body, 'utf8');
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
  selectOrgByCountry,
};
