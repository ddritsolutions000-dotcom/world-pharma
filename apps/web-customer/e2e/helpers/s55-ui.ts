import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertNoHorizontalOverflow,
  ensureNoSecrets,
  loginPortal,
  selectMarketIfGated,
  uiAdminLogin,
  uiOtpLogin,
} from './s54-ui';

export const S55_SHOT_DIR = path.join(__dirname, '../../../test-results/s55-workflow-shots');

export async function s55Snap(page: Page, name: string) {
  fs.mkdirSync(S55_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S55_SHOT_DIR, `${name}.png`), fullPage: true });
}

export {
  assertNoHorizontalOverflow,
  ensureNoSecrets,
  loginPortal,
  selectMarketIfGated,
  uiAdminLogin,
  uiOtpLogin,
};
