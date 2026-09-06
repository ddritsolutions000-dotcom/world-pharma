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

export const S57_SHOT_DIR = path.join(__dirname, '../../../test-results/s57-closure-shots');

export async function s57Snap(page: Page, name: string) {
  fs.mkdirSync(S57_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S57_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function selectOrgByCountry(page: Page, countryHint: RegExp) {
  const select = page.locator('select.wp-input').first();
  await expectVisible(select, 30_000);
  // Wait until options include a country-coded label when possible
  for (let attempt = 0; attempt < 20; attempt++) {
    const options = select.locator('option');
    const count = await options.count();
    for (let i = 0; i < count; i++) {
      const text = (await options.nth(i).textContent()) ?? '';
      const value = await options.nth(i).getAttribute('value');
      if (value && countryHint.test(text)) {
        await select.selectOption(value);
        await page.waitForTimeout(1000);
        return;
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`No organization option matching ${countryHint}`);
}

async function expectVisible(locator: { waitFor: (opts: { state: 'visible'; timeout: number }) => Promise<void> }, timeout: number) {
  await locator.waitFor({ state: 'visible', timeout });
}

export {
  assertNoHorizontalOverflow,
  ensureNoSecrets,
  loginPortal,
  selectMarketIfGated,
  uiAdminLogin,
  uiOtpLogin,
};
