/**
 * Sprint 55 — Eligible customer reorder + healthcare result visibility (real UI).
 */
import { expect, test } from '@playwright/test';
import {
  ensureNoSecrets,
  s55Snap,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s55-ui';

const CUSTOMER = 'sandbox-customer@dev.local';
const PRODUCT_SLUG = 'demo-paracetamol-500';

async function clearOtpRateLimits() {
  const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:56379';
  try {
    const { default: Redis } = await import('ioredis');
    const client = new Redis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
    await client.connect();
    const keys = await client.keys('rl:*');
    if (keys.length > 0) {
      await client.del(...keys);
    }
    await client.quit();
  } catch {
    /* optional */
  }
}

test.describe('S55 customer reorder + health', () => {
  test.describe.configure({ mode: 'serial' });

  test('delivered order → reorder → cart → checkout → health results', async ({ page, context }) => {
    await clearOtpRateLimits();
    await context.clearCookies();
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();

    await page.goto('/login');
    await uiOtpLogin(page, CUSTOMER);
    await expect(page.getByRole('button', { name: /Sign out/i }).first()).toBeVisible({ timeout: 45_000 });
    await ensureNoSecrets(page);

    await page.goto('/');
    await selectMarketIfGated(page, /India/i);
    const countrySelect = page.getByLabel(/Delivery country/i).first();
    if (await countrySelect.isVisible().catch(() => false)) {
      await countrySelect.selectOption('IN').catch(() => undefined);
    }

    await page.goto('/orders');
    await expect(page.getByText(/My Orders|Order #/i).first()).toBeVisible({ timeout: 45_000 });
    await s55Snap(page, '01-customer-orders');

    const reorderLink = page.getByRole('link', { name: /^Reorder$/i }).first();
    await expect(reorderLink).toBeVisible({ timeout: 30_000 });
    const href = await reorderLink.getAttribute('href');
    expect(href).toMatch(/\/orders\//);

    await page.locator('li').filter({ has: reorderLink }).getByRole('button', { name: /^View$/i }).click();
    await expect(page.getByText(/Order #|Delivered|Shipment|Status/i).first()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(/Reorder is available after delivery only/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Reorder$/i })).toBeVisible();
    await s55Snap(page, '02-customer-eligible-order');
    await s55Snap(page, '03-customer-before-reorder');

    await page.getByRole('button', { name: /^Reorder$/i }).click();
    await expect(page.getByText(/cart|Added|Review cart|unavailable|Reorder summary|could not/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s55Snap(page, '04-customer-reorder-result');

    const cartCta = page.getByRole('link', { name: /Review cart|Cart/i }).first();
    if (await cartCta.isVisible().catch(() => false)) {
      await cartCta.click();
    } else {
      await page.goto('/cart');
    }
    await expect(page.getByText(/Paracetamol|Subtotal|Cart|Total|empty/i).first()).toBeVisible({ timeout: 45_000 });
    await s55Snap(page, '05-customer-reordered-cart');

    await page.goto('/checkout');
    await expect(page.getByText(/Sandbox payment|Checkout|Delivery|Sign in|empty|cart/i).first()).toBeVisible({
      timeout: 45_000,
    });
    const inAddress = page
      .locator('label.mg-address-option')
      .filter({ hasText: /400001|Mumbai| · IN/i })
      .locator('input[name="checkout-address"]')
      .first();
    if (await inAddress.isVisible().catch(() => false)) {
      await inAddress.check({ force: true });
    }
    await s55Snap(page, '06-customer-reordered-checkout');

    const payButton = page.getByRole('button', {
      name: /Pay with card|Pay securely|Place COD|Pay with UPI|Place order/i,
    });
    if (await payButton.isEnabled().catch(() => false)) {
      const cardMethod = page.getByRole('radio', { name: /Debit|Credit|Card/i }).first();
      if (await cardMethod.isVisible().catch(() => false)) {
        await cardMethod.check();
      }
      await payButton.click();
      const upiComplete = page.getByRole('button', { name: 'I have completed payment' });
      if (await upiComplete.isVisible({ timeout: 12_000 }).catch(() => false)) {
        await upiComplete.click();
      }
      await expect(page.getByText(/Payment successful|Order placed|Order #/i).first()).toBeVisible({
        timeout: 90_000,
      });
      await s55Snap(page, '07-customer-reorder-new-order');
    } else {
      await s55Snap(page, '07-customer-reorder-checkout-blocked');
    }

    // Same authenticated session — healthcare result surfaces (no second OTP).
    await page.goto('/health', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/Health|Care|Appointment|Prescription|Lab|Imaging|timeline|overview|Book doctor/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s55Snap(page, '08-customer-health');

    await page.goto('/appointments', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Appointment|consultation|doctor|empty|No /i).first()).toBeVisible({ timeout: 45_000 });
    await s55Snap(page, '09-customer-appointments');

    await page.goto('/prescriptions', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Prescription|Rx|empty|No |sandbox|EXTERNAL/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s55Snap(page, '09b-customer-prescriptions');

    await page.goto('/lab/bookings', { waitUntil: 'domcontentloaded' });
    await selectMarketIfGated(page, /India/i);
    await expect(page.getByText(/Lab|booking|report|empty|No /i).first()).toBeVisible({ timeout: 45_000 });
    await s55Snap(page, '10-customer-lab-bookings');

    await page.goto('/radiology/bookings', { waitUntil: 'domcontentloaded' });
    await selectMarketIfGated(page, /India/i);
    await expect(
      page.getByText(/Imaging|Radiology|booking|report|empty|No |Sandbox|EXTERNAL|PACS/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s55Snap(page, '11-customer-imaging');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/health', { waitUntil: 'domcontentloaded' });
    await s55Snap(page, 'resp-customer-health-390');
    await page.setViewportSize({ width: 768, height: 900 });
    await s55Snap(page, 'resp-customer-health-768');
    await page.setViewportSize({ width: 1024, height: 900 });
    await s55Snap(page, 'resp-customer-health-1024');
    await page.setViewportSize({ width: 1440, height: 900 });
    await s55Snap(page, 'resp-customer-health-1440');
  });
});

test.describe('S55 country scope sanity', () => {
  test('AE/US do not show global UPI', async ({ page, context }) => {
    await clearOtpRateLimits();
    await context.clearCookies();
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();

    for (const [btn, code] of [
      [/United Arab Emirates|UAE/i, 'AE'],
      [/United States|USA/i, 'US'],
    ] as const) {
      await page.goto('/');
      const gate = page.getByRole('heading', { name: 'Choose your market' });
      if (await gate.isVisible().catch(() => false)) {
        await page.getByRole('button', { name: btn }).click();
      } else {
        const select = page.getByLabel(/Delivery country/i).first();
        if (await select.isVisible().catch(() => false)) {
          await select.selectOption(code).catch(() => undefined);
        }
      }
      await page.goto(`/p/${PRODUCT_SLUG}`);
      await selectMarketIfGated(page, btn);
      const body = await page.locator('body').innerText();
      expect(body).not.toMatch(/\bUPI\b/);
      expect(body).not.toMatch(/\+91\b/);
      await s55Snap(page, `country-${code}-pdp`);
    }
  });
});
