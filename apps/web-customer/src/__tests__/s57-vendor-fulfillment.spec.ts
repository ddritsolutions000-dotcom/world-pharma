/**
 * Sprint 57 — Vendor accept → pick → pack → shipment + customer tracking.
 */
import {
  assertNoHorizontalOverflow,
  ensureNoSecrets,
  loginPortal,
  s57Snap,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s57-ui';
import { expect, test } from '@playwright/test';

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

test.describe('S57 vendor fulfillment + tracking', () => {
  test.beforeEach(async () => {
    await clearRl();
  });

  test('accept → pick → pack → customer tracking + admin oversight', async ({ page, context, browser }) => {
    await context.clearCookies();
    await loginPortal(page, 'http://127.0.0.1:3004/', 'sandbox-vendor@dev.local');
    await expect(page.getByRole('button', { name: /Sign out/i }).first()).toBeVisible({ timeout: 60_000 });

    await page.goto('http://127.0.0.1:3004/workspace/orders', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Order|Fulfill|ALLOCATED|Accept|seller|queue/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s57Snap(page, 'vendor-01-orders');

    const actionFilter = page.getByRole('button', { name: /Needs action|Action/i }).first();
    if (await actionFilter.isVisible().catch(() => false)) {
      await actionFilter.click();
    }

    const orderRow = page
      .getByRole('button')
      .filter({ hasText: /WP-|DEMO-|ALLOCATED|CONFIRMED|Accept/i })
      .first();
    if (await orderRow.isVisible().catch(() => false)) {
      await orderRow.click();
    }
    await page.waitForTimeout(1000);
    await s57Snap(page, 'vendor-02-order-detail');

    const accept = page.getByRole('button', { name: /^Accept order$/i });
    if (await accept.isVisible().catch(() => false)) {
      await expect(page.getByRole('button', { name: /Start pick/i })).toHaveCount(0);
      await expect(page.getByText(/Accept this order|before starting pick|Next: Accept/i).first()).toBeVisible();
      await accept.click();
      await page.waitForTimeout(1200);
      await s57Snap(page, 'vendor-03-accepted');
    }

    for (const [label, shot] of [
      [/^Start pick$/i, 'vendor-04-picked-start'],
      [/^Complete pick$/i, 'vendor-05-picked'],
      [/^Complete pack/i, 'vendor-06-packed'],
    ] as const) {
      const btn = page.getByRole('button', { name: label });
      if ((await btn.isVisible().catch(() => false)) && (await btn.isEnabled().catch(() => false))) {
        await btn.click();
        await page.waitForTimeout(1500);
        await s57Snap(page, shot);
      }
    }

    await expect(
      page.getByText(/READY_TO_SHIP|SHIPPED|shipment|sandbox|EXTERNAL_GATED|packed|ready|Next:/i).first(),
    ).toBeVisible({ timeout: 20_000 });
    await s57Snap(page, 'vendor-07-shipment');

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
    await cPage.goto('/orders', { waitUntil: 'domcontentloaded' });
    await expect(cPage.getByText(/Order|WP-|DEMO-/i).first()).toBeVisible({ timeout: 45_000 });
    await s57Snap(cPage, 'customer-05-orders');

    const orderLink = cPage.getByRole('link').filter({ hasText: /WP-|DEMO-|View|Detail/i }).first();
    if (await orderLink.isVisible().catch(() => false)) {
      await orderLink.click();
      await cPage.waitForTimeout(1000);
    }
    await s57Snap(cPage, 'customer-06-tracking');
    const trackBody = await cPage.locator('body').innerText();
    expect(trackBody).not.toMatch(/live carrier|production tracking active/i);

    const admin = await browser.newContext();
    const aPage = await admin.newPage();
    await clearRl();
    await aPage.goto('http://127.0.0.1:3001/login', { waitUntil: 'networkidle' });
    const email = aPage.getByLabel(/Work email|Email/i).first();
    await email.waitFor({ state: 'visible', timeout: 30_000 });
    await email.click();
    await email.fill('');
    await email.pressSequentially('sandbox-admin@dev.local', { delay: 20 });
    const cont = aPage.getByRole('button', { name: 'Continue' });
    await expect(cont).toBeEnabled({ timeout: 15_000 });
    await cont.click();
    await aPage.getByLabel(/One-time code/i).waitFor({ state: 'visible', timeout: 30_000 });
    await aPage.getByRole('button', { name: 'Continue' }).click();
    const mfa = aPage.getByLabel(/Authenticator code/i);
    if (await mfa.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await aPage.getByRole('button', { name: /Verify & sign in|Activate MFA/i }).click();
    }
    await expect(aPage.getByRole('button', { name: /Sign out/i }).first()).toBeVisible({ timeout: 60_000 });
    await s57Snap(aPage, 'admin-01-dashboard');
    for (const path of ['/orders', '/launch-readiness', '/partners']) {
      await aPage.goto(`http://127.0.0.1:3001${path}`, { waitUntil: 'domcontentloaded' });
      await aPage.waitForTimeout(500);
    }
    await s57Snap(aPage, 'admin-02-operational');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:3004/workspace/orders');
    await assertNoHorizontalOverflow(page);
    await s57Snap(page, 'resp-vendor-390');
    await page.setViewportSize({ width: 768, height: 900 });
    await s57Snap(page, 'resp-vendor-768');
    await page.setViewportSize({ width: 1024, height: 900 });
    await s57Snap(page, 'resp-vendor-1024');
    await page.setViewportSize({ width: 1440, height: 900 });
    await s57Snap(page, 'resp-vendor-1440');

    await customer.close();
    await admin.close();
  });
});
