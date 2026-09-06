import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ADMIN, clearOtpRateLimits, ensureNoSecrets, s60AdminLogin } from './s60-ui';

export const S63_SHOT_DIR = path.join(__dirname, '../../../test-results/s63-final-launch-gate-shots');
export const S63_ARTIFACT_DIR = path.join(__dirname, '../../../test-results/s63-final-launch-gate');

export async function s63Snap(page: Page, name: string) {
  fs.mkdirSync(S63_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S63_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function s63WriteArtifact(name: string, body: string) {
  fs.mkdirSync(S63_ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(S63_ARTIFACT_DIR, name), body, 'utf8');
}

export { ADMIN, clearOtpRateLimits, ensureNoSecrets, s60AdminLogin };
