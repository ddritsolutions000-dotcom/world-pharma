/**
 * Sprint 56 — Doctor clinical + customer result + vendor fulfillment (real UI).
 */
import { expect, test } from '@playwright/test';
import {
  ensureNoSecrets,
  loginPortal,
  s56Snap,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s56-ui';

const CUSTOMER = 'sandbox-customer@dev.local';

test.describe('S56 doctor clinical lifecycle', () => {
  test('appointment → consent → consult → Rx/complete', async ({ page, context }) => {
    await context.clearCookies();
    await loginPortal(page, 'http://127.0.0.1:3002/', 'sandbox-doctor@dev.local');
    await expect(page.getByRole('button', { name: /Sign out/i }).first()).toBeVisible({ timeout: 60_000 });

    await page.goto('http://127.0.0.1:3002/appointments', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Appointment/i }).first()).toBeVisible({ timeout: 45_000 });
    await s56Snap(page, 'doctor-01-appointments');

    const apptRow = page
      .getByRole('button', { name: /^(Requested|Confirmed|Checked in|In consultation|Completed)\b/i })
      .first();
    await expect(apptRow).toBeVisible({ timeout: 30_000 });
    await apptRow.click();
    await expect(page.getByText(/Sandbox clinical workflow|Patient consent|Clinical access/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await s56Snap(page, 'doctor-02-appointment-detail');

    // Consent state should not look like a generic permission denial when pending
    const bodyBefore = await page.locator('body').innerText();
    if (/Pending — patient consent required/i.test(bodyBefore)) {
      await expect(page.getByText(/Patient consent required before consultation can start/i).first()).toBeVisible();
      await s56Snap(page, 'doctor-03-consent-required');
    } else {
      await expect(page.getByText(/Access permitted|consent is active|consultation:/i).first()).toBeVisible();
      await s56Snap(page, 'doctor-03-consent-ready');
    }

    for (const label of [
      /^Confirm appointment$/i,
      /^Check in patient$/i,
      /^Start consultation$/i,
      /^Complete consultation$/i,
    ]) {
      const btn = page.getByRole('button', { name: label });
      if ((await btn.isVisible().catch(() => false)) && (await btn.isEnabled().catch(() => false))) {
        if (/Complete/i.test(label.source)) {
          const summary = page.locator('textarea').first();
          if (await summary.isVisible().catch(() => false)) {
            await summary.fill('S56 sandbox consult complete — rest, hydration, OTC as discussed.');
          }
        }
        await btn.click();
        await page.waitForTimeout(1200);
      }
    }
    await s56Snap(page, 'doctor-04-consultation');

    // Start may show consent required banner (not PermissionDenied)
    const consentBanner = page.getByText(/Patient consent required|consent required\)/i);
    if (await consentBanner.first().isVisible().catch(() => false)) {
      await expect(page.getByText(/You do not have access/i)).toHaveCount(0);
      await s56Snap(page, 'doctor-04b-consent-not-permission-denied');
    }

    await page.goto('http://127.0.0.1:3002/prescriptions', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/sandbox|EXTERNAL_GATED|prescription|Issue|encounter/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s56Snap(page, 'doctor-05-rx');

    await page.goto('http://127.0.0.1:3002/earnings', { waitUntil: 'domcontentloaded' });
    await s56Snap(page, 'doctor-06-earnings');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:3002/appointments');
    await s56Snap(page, 'resp-doctor-390');
    await page.setViewportSize({ width: 1440, height: 900 });
  });
});

test.describe('S56 customer doctor + health results', () => {
  test('appointments, Rx, lab, imaging, timeline', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'domcontentloaded' });
    await uiOtpLogin(page, CUSTOMER);
    await ensureNoSecrets(page);
    await selectMarketIfGated(page, /India/i);

    await page.goto('/appointments', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Appointment|consultation|doctor|empty|No /i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s56Snap(page, 'customer-01-appointments');

    await page.goto('/prescriptions', { waitUntil: 'domcontentloaded' });
    await s56Snap(page, 'customer-02-rx');

    await page.goto('/lab/bookings', { waitUntil: 'domcontentloaded' });
    await selectMarketIfGated(page, /India/i);
    await expect(page.getByText(/Lab|booking|report|empty|No |Published|CONFIRMED/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s56Snap(page, 'customer-03-lab-bookings');

    // Open first booking if link present
    const labLink = page.getByRole('link').filter({ hasText: /View|Open|Report|Booking/i }).first();
    if (await labLink.isVisible().catch(() => false)) {
      await labLink.click();
      await s56Snap(page, 'customer-04-lab-report');
    }

    await page.goto('/radiology/bookings', { waitUntil: 'domcontentloaded' });
    await selectMarketIfGated(page, /India/i);
    await expect(page.getByText(/Imaging|Radiology|booking|EXTERNAL|PACS|report|empty/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s56Snap(page, 'customer-05-imaging');

    await page.goto('/health', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Health|timeline|Book doctor|overview/i).first()).toBeVisible({ timeout: 45_000 });
    await s56Snap(page, 'customer-06-health-timeline');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/health');
    await s56Snap(page, 'resp-customer-health-390');
    await page.setViewportSize({ width: 768, height: 900 });
    await s56Snap(page, 'resp-customer-health-768');
    await page.setViewportSize({ width: 1440, height: 900 });
  });
});

test.describe('S56 vendor fulfillment', () => {
  test('accept → pick → pack when CTAs available', async ({ page, context }) => {
    await context.clearCookies();
    await loginPortal(page, 'http://127.0.0.1:3004/', 'sandbox-vendor@dev.local');
    await expect(page.getByRole('button', { name: /Sign out/i }).first()).toBeVisible({ timeout: 60_000 });
    await page.goto('http://127.0.0.1:3004/workspace/orders', { waitUntil: 'domcontentloaded' });
    await s56Snap(page, 'vendor-01-orders');

    for (const cta of [/Accept/i, /Start pick/i, /Complete pick/i, /Start pack/i, /Complete pack/i]) {
      const action = page.getByRole('button', { name: cta });
      if ((await action.first().isVisible().catch(() => false)) && (await action.first().isEnabled().catch(() => false))) {
        await action.first().click();
        await page.waitForTimeout(900);
        await s56Snap(page, `vendor-02-${String(cta).replace(/[^a-z]/gi, '').toLowerCase()}`);
      }
    }

    await page.goto('http://127.0.0.1:3004/workspace/inventory');
    await s56Snap(page, 'vendor-03-inventory');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:3004/workspace/orders');
    await s56Snap(page, 'resp-vendor-390');
    await page.setViewportSize({ width: 1440, height: 900 });
  });
});
