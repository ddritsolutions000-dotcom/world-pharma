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

export const S58_SHOT_DIR = path.join(__dirname, '../../../test-results/s58-marketplace-shots');

export async function s58Snap(page: Page, name: string) {
  fs.mkdirSync(S58_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S58_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function clearOtpRateLimits() {
  try {
    const Redis = (await import('ioredis')).default;
    const client = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:56379', {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    await client.connect();
    const keys = await client.keys('rl:*');
    if (keys.length > 0) await client.del(...keys);
    await client.quit();
  } catch {
    /* optional */
  }
}

export {
  assertNoHorizontalOverflow,
  ensureNoSecrets,
  loginPortal,
  selectMarketIfGated,
  uiAdminLogin,
  uiOtpLogin,
};
