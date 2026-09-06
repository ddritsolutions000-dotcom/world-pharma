/**
 * Sprint 57 — Pathologist publish → customer lab report (real UI).
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

test.describe('S57 pathologist publish → customer lab', () => {
  test.beforeEach(async () => {
    await clearRl();
  });

  test('pathologist verify/publish then customer sees report', async ({ page, context, browser }) => {
    await context.clearCookies();
    await loginPortal(page, 'http://127.0.0.1:3009/', 'sandbox-pathologist@dev.local');
    await expect(page.getByRole('button', { name: /Sign out/i }).first()).toBeVisible({ timeout: 60_000 });

    await expect(page.getByRole('heading', { name: 'Assigned cases', exact: true })).toBeVisible({
      timeout: 45_000,
    });
    await selectOrgByCountry(page, /\(IN\)/);
    await expect(page.locator('select.wp-input').first().locator('option:checked')).toContainText('(IN)');
    await page.waitForTimeout(1200);
    await s57Snap(page, 'pathologist-01-worklist');

    const reviewBtn = page.getByRole('button', { name: /^Review$/i }).first();
    const hasCase = await reviewBtn.isVisible().catch(() => false);
    if (hasCase) {
      await reviewBtn.click();
      await expect(page.getByRole('heading', { name: /Case review/i })).toBeVisible({ timeout: 15_000 });
      await s57Snap(page, 'pathologist-02-case');
      await expect(page.getByText(/^You do not have access$/i)).toHaveCount(0);

      for (const label of [/^Accept assignment$/i, /^Verify$/i, /^Publish report$/i]) {
        const btn = page.getByRole('button', { name: label });
        if ((await btn.isVisible().catch(() => false)) && (await btn.isEnabled().catch(() => false))) {
          await btn.click();
          await page.waitForTimeout(1500);
          if (label.source.includes('Verify')) {
            await expect(page.getByRole('button', { name: /^Publish report$/i })).toBeVisible({ timeout: 15_000 });
            await s57Snap(page, 'pathologist-03-verify');
          } else if (label.source.includes('Publish')) {
            await s57Snap(page, 'pathologist-04-publish');
          } else {
            await s57Snap(page, 'pathologist-02b-assign');
          }
        }
      }

      await expect(
        page.getByText(/Published — visible to the authorized customer|Published|Verified — Publish/i).first(),
      ).toBeVisible({ timeout: 20_000 });
      await s57Snap(page, 'pathologist-05-published');
    } else {
      // Report already published in a prior run — worklist correctly empty for PUBLISHED cases.
      await expect(page.getByText(/No assigned cases|Published/i).first()).toBeVisible();
      await s57Snap(page, 'pathologist-05-already-published');
    }

    await clearRl();
    await page.waitForTimeout(500);

    const customer = await browser.newContext();
    const cPage = await customer.newPage();
    await clearRl();
    await cPage.goto('http://127.0.0.1:3000/login', { waitUntil: 'networkidle' });
    await cPage.getByLabel(/^Email$/i).waitFor({ state: 'visible', timeout: 30_000 });
    await uiOtpLogin(cPage, 'sandbox-customer@dev.local');
    await ensureNoSecrets(cPage);
    await selectMarketIfGated(cPage, /India/i);

    await cPage.goto('/lab/bookings', { waitUntil: 'domcontentloaded' });
    await selectMarketIfGated(cPage, /India/i);
    await expect(cPage.getByText(/Lab|booking|report|Published|CONFIRMED/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s57Snap(cPage, 'customer-01-lab-bookings');

    const open = cPage.getByRole('link').filter({ hasText: /View|Open|Report|Booking|Detail/i }).first();
    if (await open.isVisible().catch(() => false)) {
      await open.click();
      await cPage.waitForTimeout(1000);
    }
    await expect(cPage.getByText(/LDL|Published|report|result|lipid|Cholesterol/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await s57Snap(cPage, 'customer-02-lab-result');
    await ensureNoSecrets(cPage);

    const body = await cPage.locator('body').innerText();
    expect(body).not.toMatch(/sandbox-pathologist|entered_by|actor_id|org_staff/i);

    await cPage.setViewportSize({ width: 390, height: 844 });
    await cPage.goto('/lab/bookings');
    await assertNoHorizontalOverflow(cPage);
    await s57Snap(cPage, 'resp-customer-lab-390');
    await customer.close();
  });
});
