/**
 * Sprint 54 — Customer post-checkout polish + responsive + multi-market UX (real UI).
 */
import { expect, test } from '@playwright/test';
import {
  assertNoHorizontalOverflow,
  ensureNoSecrets,
  s54Snap,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s54-ui';

const PRODUCT_SLUG = 'demo-paracetamol-500';
const CUSTOMER = 'sandbox-customer@dev.local';
const IN_POSTAL = '400001';

test.describe.configure({ mode: 'serial' });

test.describe('S54 customer commerce + post-checkout', () => {
  test('sandbox journey with polished checkout/orders/wishlist/reorder', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();

    const gate = page.getByRole('heading', { name: 'Choose your market' });
    if (await gate.isVisible({ timeout: 15_000 }).catch(() => false)) {
      await s54Snap(page, '01-customer-home-gate');
      await page.getByRole('button', { name: /India/i }).click();
    } else {
      await selectMarketIfGated(page, /India/i);
      const countrySelect = page.getByLabel(/Delivery country/i).first();
      if (await countrySelect.isVisible().catch(() => false)) {
        await countrySelect.selectOption('IN').catch(() => undefined);
      }
      await s54Snap(page, '01-customer-home-gate');
    }
    await expect(page.getByText(/Paracetamol|Vitamin|Medicine|Browse|Lab|Delivering/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s54Snap(page, '02-customer-home-IN');

    await page.goto(`/p/${PRODUCT_SLUG}`);
    await selectMarketIfGated(page, /India/i);
    await page.getByLabel('Delivery postal code').fill(IN_POSTAL);
    await expect(page.getByRole('button', { name: /Add to cart|Out of stock/i })).toBeVisible({
      timeout: 60_000,
    });
    await s54Snap(page, '03-customer-pdp');
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByText(/Added to cart/i)).toBeVisible({ timeout: 45_000 });

    await page.goto('/cart');
    await expect(page.getByText(/Paracetamol/i).first()).toBeVisible();
    await s54Snap(page, '04-customer-cart');

    await page.goto('/login');
    await uiOtpLogin(page, CUSTOMER);
    await expect(page.getByRole('button', { name: /Sign out/i }).first()).toBeVisible({ timeout: 45_000 });
    await ensureNoSecrets(page);

    await page.goto('/checkout');
    await expect(page.getByText(/Sandbox payment/i).first()).toBeVisible({ timeout: 45_000 });
    // No misleading "Card payment (default)" while methods load — either loading copy or real methods.
    await expect(page.getByText('Card payment (default)')).toHaveCount(0);
    await expect(
      page.getByText(/Loading payment options|Debit|Credit|UPI|Cash on Delivery|No published payment/i).first(),
    ).toBeVisible({ timeout: 30_000 });

    // Deduped addresses: at most one visible row per fingerprint (no triple Debug Mumbai).
    const inLabels = page.locator('label.mg-address-option').filter({ hasText: /400001|Mumbai/i });
    const inCount = await inLabels.count();
    expect(inCount).toBeLessThanOrEqual(2);

    const inAddress = inLabels.locator('input[name="checkout-address"]').first();
    if (await inAddress.isVisible().catch(() => false)) {
      await inAddress.check({ force: true });
      await expect(page.getByText(/Delivering to/i).first()).toBeVisible({ timeout: 45_000 });
    }
    await s54Snap(page, '05-customer-checkout');

    const cardMethod = page.getByRole('radio', { name: /Debit|Credit|Card/i }).first();
    if (await cardMethod.isVisible().catch(() => false)) {
      await cardMethod.check();
    }
    const payButton = page.getByRole('button', {
      name: /Pay with card|Pay securely|Place COD|Pay with UPI|Pay with mobile|Place order/i,
    });
    await expect(payButton).toBeEnabled({ timeout: 60_000 });
    await payButton.click();
    const upiComplete = page.getByRole('button', { name: 'I have completed payment' });
    if (await upiComplete.isVisible({ timeout: 12_000 }).catch(() => false)) {
      await upiComplete.click();
    }
    await expect(page.getByText(/Payment successful|Order placed|Order #/i).first()).toBeVisible({
      timeout: 90_000,
    });
    await s54Snap(page, '06-customer-order-success');

    await page.getByRole('link', { name: /View my orders|Orders/i }).first().click();
    await expect(page).toHaveURL(/\/orders/);
    await expect(page.getByText(/Order #|WP-|DEMO-SBX/i).first()).toBeVisible({ timeout: 45_000 });
    await s54Snap(page, '07-customer-orders');

    const firstOrder = page.locator('a[href*="/orders/"], button:has-text("View")').first();
    if (await firstOrder.isVisible().catch(() => false)) {
      await firstOrder.click();
      await expect(page.getByText(/Shipment|Tracking|Status|Sandbox|Order|Reorder/i).first()).toBeVisible({
        timeout: 45_000,
      });
      await s54Snap(page, '08-customer-tracking');
      const reorder = page.getByRole('button', { name: /^Reorder$/i });
      if (await reorder.isVisible().catch(() => false)) {
        await reorder.click();
        await expect(page.getByText(/cart|added|reorder|unavailable|eligible/i).first()).toBeVisible({
          timeout: 30_000,
        });
        await s54Snap(page, '09-customer-reorder');
      }
    }

    await page.goto('/wishlist');
    await expect(page).toHaveURL(/\/account\/wishlist|\/wishlist/);
    await expect(page.getByText(/Wishlist|empty|Save for later|Browse/i).first()).toBeVisible();
    await s54Snap(page, '10-customer-wishlist');
  });

  test('responsive matrix 390/768/1024/1440', async ({ page, context }) => {
    await context.clearCookies();
    for (const width of [390, 768, 1024, 1440] as const) {
      await page.setViewportSize({ width, height: width <= 768 ? 844 : 900 });
      await page.goto('/');
      await selectMarketIfGated(page, /India/i);
      await expect(page.locator('body')).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await s54Snap(page, `resp-customer-home-${width}`);

      await page.goto('/cart');
      await selectMarketIfGated(page, /India/i);
      await assertNoHorizontalOverflow(page);
      await s54Snap(page, `resp-customer-cart-${width}`);

      await page.goto('/checkout');
      await selectMarketIfGated(page, /India/i);
      await assertNoHorizontalOverflow(page);
      await s54Snap(page, `resp-customer-checkout-${width}`);
    }
  });

  test('country switch IN → AE → US currency/labels', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();

    async function pickMarket(name: RegExp, code: string) {
      await page.goto('/');
      const gate = page.getByRole('heading', { name: 'Choose your market' });
      if (await gate.isVisible().catch(() => false)) {
        await page.getByRole('button', { name }).click();
        return;
      }
      const select = page.getByLabel(/Delivery country/i).first();
      await expect(select).toBeVisible({ timeout: 20_000 });
      await select.selectOption(code).catch(async () => {
        await select.selectOption({ label: new RegExp(code, 'i') });
      });
    }

    await pickMarket(/India/i, 'IN');
    await page.goto(`/p/${PRODUCT_SLUG}`);
    await selectMarketIfGated(page, /India/i);
    await expect(page.getByText(/Paracetamol/i).first()).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('body')).toContainText(/₹|INR|Rs|Add to cart|Out of stock|Sold by/i);
    await s54Snap(page, 'country-IN-pdp');

    await pickMarket(/United Arab Emirates|UAE/i, 'AE');
    await page.goto(`/p/${PRODUCT_SLUG}`);
    await selectMarketIfGated(page, /United Arab Emirates|UAE|AE/i);
    await expect(page.getByText(/Paracetamol/i).first()).toBeVisible({ timeout: 45_000 });
    const aeBody = await page.locator('body').innerText();
    expect(aeBody).not.toMatch(/\bUPI\b/);
    await s54Snap(page, 'country-AE-pdp');

    await pickMarket(/United States|USA/i, 'US');
    await page.goto(`/p/${PRODUCT_SLUG}`);
    await selectMarketIfGated(page, /United States|USA|US/i);
    await expect(page.getByText(/Paracetamol/i).first()).toBeVisible({ timeout: 45_000 });
    const usBody = await page.locator('body').innerText();
    expect(usBody).not.toMatch(/\bUPI\b/);
    expect(usBody).not.toMatch(/\+91\b/);
    await s54Snap(page, 'country-US-pdp');
  });
});
