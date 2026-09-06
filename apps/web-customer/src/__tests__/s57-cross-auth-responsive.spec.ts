/**
 * Sprint 57 — cross-portal consistency + auth smoke + responsive clinical.
 */
import { expect, test } from '@playwright/test';
import {
  assertNoHorizontalOverflow,
  ensureNoSecrets,
  loginPortal,
  s57Snap,
  selectMarketIfGated,
  selectOrgByCountry,
  uiOtpLogin,
} from '../../e2e/helpers/s57-ui';

async function clearRl() {
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

test.describe('S57 cross-portal + auth + responsive', () => {
  test.beforeEach(async () => {
    await clearRl();
  });

  test('cross-portal state labels coherent', async ({ browser }) => {
    const pathCtx = await browser.newContext();
    const pathPage = await pathCtx.newPage();
    await loginPortal(pathPage, 'http://127.0.0.1:3009/', 'sandbox-pathologist@dev.local');
    await selectOrgByCountry(pathPage, /\(IN\)/);
    const pathText = await pathPage.locator('body').innerText();
    await s57Snap(pathPage, 'cross-01-pathologist');

    await clearRl();
    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearRl();
    await cust.goto('http://127.0.0.1:3000/login', { waitUntil: 'networkidle' });
    await cust.getByLabel(/^Email$/i).waitFor({ state: 'visible', timeout: 30_000 });
    await uiOtpLogin(cust, 'sandbox-customer@dev.local');
    await selectMarketIfGated(cust, /India/i);
    await cust.goto('/lab/bookings');
    const custLab = await cust.locator('body').innerText();
    await s57Snap(cust, 'cross-02-customer-lab');
    await cust.goto('/radiology/bookings');
    const custImg = await cust.locator('body').innerText();
    await s57Snap(cust, 'cross-03-customer-imaging');

    // If pathologist shows Published, customer should not contradict with only DRAFT-only language without report
    if (/Published/i.test(pathText)) {
      expect(custLab).toMatch(/Published|report|result|Available|Complete|CONFIRMED/i);
    }
    void custImg;

    await pathCtx.close();
    await custCtx.close();
  });

  test('authorization: vendor cannot open pathologist portal work', async ({ page }) => {
    await loginPortal(page, 'http://127.0.0.1:3009/', 'sandbox-vendor@dev.local');
    // Vendor may authenticate as customer audience but should not see pathology cases for IN lab
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    const denied =
      /do not have access|membership required|Sign in|forbidden|No assigned|Select laboratory/i.test(body);
    expect(denied || !/LDL Cholesterol|Publish report/i.test(body)).toBeTruthy();
    await s57Snap(page, 'security-01-vendor-on-pathologist');
  });

  test('responsive clinical portals 390–1440', async ({ page }) => {
    await loginPortal(page, 'http://127.0.0.1:3005/', 'sandbox-lab@dev.local');
    await expect(page.getByRole('button', { name: /Sign out/i }).first()).toBeVisible({ timeout: 60_000 });

    for (const [w, h, name] of [
      [390, 844, 'resp-lab-390'],
      [768, 900, 'resp-lab-768'],
      [1024, 900, 'resp-lab-1024'],
      [1440, 900, 'resp-lab-1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('http://127.0.0.1:3005/', { waitUntil: 'domcontentloaded' });
      await assertNoHorizontalOverflow(page);
      await s57Snap(page, name);
    }

    await loginPortal(page, 'http://127.0.0.1:3009/', 'sandbox-pathologist@dev.local');
    for (const [w, h, name] of [
      [390, 844, 'resp-pathologist-390'],
      [1440, 900, 'resp-pathologist-1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('http://127.0.0.1:3009/', { waitUntil: 'domcontentloaded' });
      await assertNoHorizontalOverflow(page);
      await s57Snap(page, name);
    }
    await ensureNoSecrets(page);
  });
});
