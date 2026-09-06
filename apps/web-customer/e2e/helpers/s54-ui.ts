import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ensureNoSecrets, selectMarketIfGated, uiAdminLogin, uiOtpLogin } from './s53-ui';

export const S54_SHOT_DIR = path.join(__dirname, '../../../test-results/s54-ux-shots');

export async function s54Snap(page: Page, name: string) {
  fs.mkdirSync(S54_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S54_SHOT_DIR, `${name}.png`), fullPage: true });
}

export { ensureNoSecrets, selectMarketIfGated, uiAdminLogin, uiOtpLogin };

export async function loginPortal(page: Page, baseUrl: string, email: string) {
  await page.goto(baseUrl);
  const emailField = page.getByLabel(/^Email$/i).or(page.getByLabel(/Email/i)).first();
  if (!(await emailField.isVisible().catch(() => false))) {
    await page.goto(`${baseUrl.replace(/\/$/, '')}/login`);
  }
  await uiOtpLogin(page, email);
  await ensureNoSecrets(page);
}

export async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 2;
  });
  if (overflow) {
    throw new Error(`Horizontal overflow at viewport ${page.viewportSize()?.width}`);
  }
}
