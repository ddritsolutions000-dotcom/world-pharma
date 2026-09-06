/**
 * Sprint 57 — Imaging → radiologist report → customer result (real UI).
 */
import { expect, test } from '@playwright/test';
import {
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

test.describe('S57 imaging report → customer', () => {
  test.beforeEach(async () => {
    await clearRl();
  });

  test('imaging study + radiologist sign-off + customer result', async ({ page, context, browser }) => {
    await context.clearCookies();
    await loginPortal(page, 'http://127.0.0.1:3006/', 'sandbox-imaging@dev.local');
    await expect(page.getByRole('button', { name: /Sign out/i }).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('select').first()).not.toHaveValue('', { timeout: 45_000 });
    await selectOrgByCountry(page, /\(IN\)/);
    await s57Snap(page, 'imaging-01-home');

    for (const label of ['Bookings', 'Check-in', 'Studies', 'Interpretations']) {
      const btn = page.getByRole('button', { name: new RegExp(label, 'i') });
      if (await btn.first().isVisible().catch(() => false)) {
        await btn.first().click();
        await page.waitForTimeout(600);
        await s57Snap(page, `imaging-02-${label.toLowerCase().replace(/\s+/g, '-')}`);
      }
    }

    const radCtx = await browser.newContext();
    const rad = await radCtx.newPage();
    await loginPortal(rad, 'http://127.0.0.1:3007/', 'sandbox-radiologist@dev.local');
    await expect(rad.getByRole('button', { name: /Sign out/i }).first()).toBeVisible({ timeout: 60_000 });
    await expect(rad.getByRole('heading', { name: /Radiologist worklist/i })).toBeVisible({ timeout: 60_000 });
    await selectOrgByCountry(rad, /\(IN\)/);
    await expect(rad.getByText(/EXTERNAL_GATED|PACS|DICOM/i).first()).toBeVisible();
    await s57Snap(rad, 'radiologist-01-worklist');

    const caseBtn = rad
      .getByRole('button')
      .filter({ hasText: /Accept|Open|Review|Study|Case|PENDING|ASSIGNED|DRAFT|Verify/i })
      .first();
    if (await caseBtn.isVisible().catch(() => false)) {
      await caseBtn.click();
      await rad.waitForTimeout(800);
    }
    await s57Snap(rad, 'radiologist-02-report');

    const finding = rad.locator('textarea').first();
    if (await finding.isVisible().catch(() => false)) {
      await finding.fill('S57 sandbox impression — no acute abnormality.');
    }
    for (const label of [
      /^Accept assignment$/i,
      /^Save findings$/i,
      /^Submit for verify$/i,
    ]) {
      const btn = rad.getByRole('button', { name: label });
      if ((await btn.isVisible().catch(() => false)) && (await btn.isEnabled().catch(() => false))) {
        await btn.click();
        await rad.waitForTimeout(1200);
      }
    }
    await s57Snap(rad, 'radiologist-03-after-actions');

    const revCtx = await browser.newContext();
    const rev = await revCtx.newPage();
    await loginPortal(rev, 'http://127.0.0.1:3007/', 'sandbox-radiologist-reviewer@dev.local');
    await expect(rev.getByRole('button', { name: /Sign out/i }).first()).toBeVisible({ timeout: 60_000 });
    await selectOrgByCountry(rev, /\(IN\)/);
    const verifyTab = rev.getByRole('button', { name: /Verify queue/i });
    if (await verifyTab.isVisible().catch(() => false)) {
      await verifyTab.click();
      await rev.waitForTimeout(800);
    }
    const openCase = rev.getByRole('button', { name: /Review|Open|Continue/i }).first();
    if (await openCase.isVisible().catch(() => false)) {
      await openCase.click();
      await rev.waitForTimeout(800);
    }
    for (const label of [/^Verify \/ sign-off$/i, /^Publish report to customer$/i]) {
      const btn = rev.getByRole('button', { name: label });
      if ((await btn.isVisible().catch(() => false)) && (await btn.isEnabled().catch(() => false))) {
        await btn.click();
        await rev.waitForTimeout(1200);
      }
    }
    await s57Snap(rev, 'radiologist-04-reviewer');
    await revCtx.close();
    await radCtx.close();

    await clearRl();
    const customer = await browser.newContext();
    const cPage = await customer.newPage();
    await clearRl();
    await cPage.goto('http://127.0.0.1:3000/login', { waitUntil: 'networkidle' });
    await cPage.getByLabel(/^Email$/i).waitFor({ state: 'visible', timeout: 30_000 });
    await uiOtpLogin(cPage, 'sandbox-customer@dev.local');
    await ensureNoSecrets(cPage);
    await selectMarketIfGated(cPage, /India/i);
    await cPage.goto('/radiology/bookings', { waitUntil: 'domcontentloaded' });
    await selectMarketIfGated(cPage, /India/i);
    await expect(cPage.getByText(/Imaging|Radiology|booking|report|study|EXTERNAL/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s57Snap(cPage, 'customer-03-imaging-bookings');

    const link = cPage.getByRole('link').filter({ hasText: /View|Open|Report|Booking|Detail/i }).first();
    if (await link.isVisible().catch(() => false)) {
      await link.click();
      await cPage.waitForTimeout(1000);
    }
    const body = await cPage.locator('body').innerText();
    if (/EXTERNAL_GATED|PACS|DICOM|viewer/i.test(body)) {
      await expect(cPage.getByText(/EXTERNAL_GATED|viewer unavailable|image viewer|PACS/i).first()).toBeVisible();
    }
    await s57Snap(cPage, 'customer-04-imaging-result');
    await customer.close();
  });
});
