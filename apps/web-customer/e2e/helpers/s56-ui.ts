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
} from './s55-ui';

export const S56_SHOT_DIR = path.join(__dirname, '../../../test-results/s56-workflow-shots');

export async function s56Snap(page: Page, name: string) {
  fs.mkdirSync(S56_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S56_SHOT_DIR, `${name}.png`), fullPage: true });
}

export {
  assertNoHorizontalOverflow,
  ensureNoSecrets,
  loginPortal,
  selectMarketIfGated,
  uiAdminLogin,
  uiOtpLogin,
};
