/**
 * Sprint 56 — Lab/pathologist/imaging/radiologist/admin (real UI).
 */
import { expect, test } from '@playwright/test';
import { loginPortal, s56Snap, uiAdminLogin, ensureNoSecrets } from '../../e2e/helpers/s56-ui';

test.describe('S56 lab diagnostics', () => {
  test('lab bookings through pathology tabs', async ({ page, context }) => {
    await context.clearCookies();
    await loginPortal(page, 'http://127.0.0.1:3005/', 'sandbox-lab@dev.local');
    await expect(page.getByRole('button', { name: /Sign out/i }).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('select').first()).not.toHaveValue('', { timeout: 45_000 });
    await s56Snap(page, 'lab-01-dashboard');

    for (const label of ['Bookings', 'Collections', 'Accession', 'Processing', 'Pathology']) {
      const btn = page.getByRole('button', { name: label });
      if (await btn.first().isVisible().catch(() => false)) {
        await btn.first().click();
        await expect(page.locator('body')).not.toContainText(/Cannot GET|Internal Server Error/i);
        await s56Snap(page, `lab-02-${label.toLowerCase()}`);
      }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:3005/');
    await s56Snap(page, 'resp-lab-390');
    await page.setViewportSize({ width: 1440, height: 900 });
  });
});

test.describe('S56 pathologist', () => {
  test.beforeEach(async () => {
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
  });

  test('pathologist worklist and report actions', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('http://127.0.0.1:3009/', { waitUntil: 'domcontentloaded' });
    await loginPortal(page, 'http://127.0.0.1:3009/', 'sandbox-pathologist@dev.local');
    await expect(page.getByRole('button', { name: /Sign out/i }).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Pathologist|worklist|Sandbox|report|Verify|Publish|empty|No /i).first()).toBeVisible({
      timeout: 60_000,
    });
    await s56Snap(page, 'pathologist-01-worklist');

    for (const cta of [/Assign/i, /Verify/i, /Publish/i, /Open/i]) {
      const action = page.getByRole('button', { name: cta });
      if ((await action.first().isVisible().catch(() => false)) && (await action.first().isEnabled().catch(() => false))) {
        await action.first().click();
        await page.waitForTimeout(800);
        await s56Snap(page, `pathologist-02-${String(cta).replace(/[^a-z]/gi, '').toLowerCase()}`);
      }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:3009/');
    await s56Snap(page, 'resp-pathologist-390');
    await page.setViewportSize({ width: 1440, height: 900 });
  });
});

test.describe('S56 imaging + radiologist', () => {
  test('study workflow + EXTERNAL_GATED PACS', async ({ page, context }) => {
    await context.clearCookies();
    await loginPortal(page, 'http://127.0.0.1:3006/', 'sandbox-imaging@dev.local');
    await expect(page.getByRole('button', { name: /Sign out/i }).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('select').first()).not.toHaveValue('', { timeout: 45_000 });
    await s56Snap(page, 'imaging-01-dashboard');

    for (const label of ['Bookings', 'Check-in', 'Studies', 'Interpretations']) {
      const btn = page.getByRole('button', { name: new RegExp(label, 'i') });
      if (await btn.first().isVisible().catch(() => false)) {
        await btn.first().click();
        for (const cta of [/Check in/i, /Start acquisition/i, /Mark acquired/i, /Complete/i]) {
          const action = page.getByRole('button', { name: cta });
          if (
            (await action.first().isVisible().catch(() => false)) &&
            (await action.first().isEnabled().catch(() => false))
          ) {
            await action.first().click();
            await page.waitForTimeout(600);
          }
        }
        await s56Snap(page, `imaging-02-${label.toLowerCase().replace(/\s+/g, '-')}`);
      }
    }

    await context.clearCookies();
    await loginPortal(page, 'http://127.0.0.1:3007/', 'sandbox-radiologist@dev.local');
    await expect(page.getByRole('heading', { name: /Radiologist worklist/i })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/EXTERNAL_GATED|PACS|DICOM/i).first()).toBeVisible();
    await s56Snap(page, 'radiologist-01-worklist');

    const caseBtn = page.getByRole('button').filter({ hasText: /Accept|Open|Study|Case|PENDING|ASSIGNED|DRAFT/i }).first();
    if (await caseBtn.isVisible().catch(() => false)) {
      await caseBtn.click();
      await s56Snap(page, 'radiologist-02-study');
      for (const cta of [/Accept/i, /Save draft/i, /Submit/i, /Publish/i]) {
        const action = page.getByRole('button', { name: cta });
        if (
          (await action.first().isVisible().catch(() => false)) &&
          (await action.first().isEnabled().catch(() => false))
        ) {
          await action.first().click();
          await page.waitForTimeout(600);
        }
      }
      await s56Snap(page, 'radiologist-03-report');
    }

    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto('http://127.0.0.1:3007/');
    await s56Snap(page, 'resp-radiologist-1024');
    await page.setViewportSize({ width: 1440, height: 900 });
  });
});

test.describe('S56 admin oversight + empty states', () => {
  test('admin ops + empty-state samples', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('http://127.0.0.1:3001/login');
    await uiAdminLogin(page, 'sandbox-admin@dev.local');
    await ensureNoSecrets(page);
    await s56Snap(page, 'admin-01-dashboard');

    for (const [route, shot] of [
      ['/orders', 'admin-02-orders'],
      ['/launch-readiness', 'admin-03-readiness'],
      ['/partners', 'admin-04-partners'],
    ] as const) {
      await page.goto(`http://127.0.0.1:3001${route}`);
      await s56Snap(page, shot);
    }

    // Empty-state checks on portals (legitimate empty messaging)
    await context.clearCookies();
    await loginPortal(page, 'http://127.0.0.1:3007/', 'sandbox-radiologist@dev.local');
    await expect(page.getByText(/No assigned cases|EXTERNAL_GATED|Worklist/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await s56Snap(page, 'empty-radiologist-worklist');
  });
});
