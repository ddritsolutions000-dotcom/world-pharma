/**
 * Sprint 53 — Continuous authenticated customer commerce journey (real UI).
 */
import { expect, test } from '@playwright/test';
import { ensureNoSecrets, s53Snap, selectMarketIfGated, uiOtpLogin } from '../../e2e/helpers/s53-ui';

const PRODUCT_SLUG = 'demo-paracetamol-500';
const PRODUCT_QUERY = 'Paracetamol';
const IN_POSTAL = '400001';
const CUSTOMER = 'sandbox-customer@dev.local';

test.describe.configure({ mode: 'serial' });

test.describe('S53 continuous customer commerce', () => {
  test('one session: market → browse → PDP → cart → checkout → sandbox pay → orders', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/');
    await page.evaluate(() => {
      window.localStorage.clear();
    });
    await page.reload();

    await expect(page.getByRole('heading', { name: 'Choose your market' })).toBeVisible({ timeout: 30_000 });
    await s53Snap(page, '01-customer-home-gate');
    await page.getByRole('button', { name: /India/i }).click();
    await expect(page.getByText(/Paracetamol|Vitamin|Medicine|Browse|Lab/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s53Snap(page, '02-customer-home-IN');

    const search = page.getByRole('searchbox').or(page.getByPlaceholder(/Search/i)).first();
    await search.fill(PRODUCT_QUERY);
    await search.press('Enter');
    await expect(page).toHaveURL(/\/search/);
    await expect(page.getByText(/Paracetamol/i).first()).toBeVisible({ timeout: 45_000 });
    await s53Snap(page, '03-customer-search');

    await page.goto(`/p/${PRODUCT_SLUG}`);
    await selectMarketIfGated(page, /India/i);
    await expect(page.getByText(/Paracetamol/i).first()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(/Sold by|pharmac|Partner|in stock|Rx|composition|mg/i).first()).toBeVisible();
    await page.getByLabel('Delivery postal code').fill(IN_POSTAL);
    await expect(page.getByRole('button', { name: /Add to cart|Out of stock/i })).toBeVisible({
      timeout: 60_000,
    });
    await s53Snap(page, '04-customer-pdp');

    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByText(/Added to cart/i)).toBeVisible({ timeout: 45_000 });
    await page.getByRole('link', { name: /View cart|Cart/i }).first().click();
    await expect(page).toHaveURL(/\/cart/);
    await expect(page.getByText(/Paracetamol/i).first()).toBeVisible();
    await expect(page.getByText(/Subtotal|Total|₹|INR|AED|USD/i).first()).toBeVisible();
    await s53Snap(page, '05-customer-cart');

    await page.goto('/login');
    await uiOtpLogin(page, CUSTOMER);
    await expect(page.getByRole('button', { name: /Sign out/i }).first()).toBeVisible({ timeout: 45_000 });
    await ensureNoSecrets(page);

    await page.goto('/checkout');
    await expect(page.getByText(/Sandbox payment|Checkout|Delivery/i).first()).toBeVisible({ timeout: 45_000 });
    await s53Snap(page, '06-customer-checkout');

    // Prefer an IN-market address (Mumbai / 400001) — US default must not block pay.
    const inAddress = page
      .locator('label.mg-address-option')
      .filter({ hasText: /400001|Mumbai| · IN/i })
      .locator('input[name="checkout-address"]')
      .first();
    if (await inAddress.isVisible().catch(() => false)) {
      await inAddress.check({ force: true });
      await expect(page.getByText(/Delivering to/i).first()).toBeVisible({ timeout: 45_000 });
    } else if (await page.getByLabel('Recipient name').isVisible().catch(() => false)) {
      await page.getByLabel('Recipient name').fill('S53 Commerce Customer');
      await page.getByLabel('Address line').fill('12 Sprint Lane');
      const city = page.getByLabel(/City/i);
      if (await city.isVisible().catch(() => false)) {
        await city.fill('Mumbai');
      }
      const postal = page.getByLabel(/Postal|Pincode|ZIP/i).first();
      if (await postal.isVisible().catch(() => false)) {
        await postal.fill(IN_POSTAL);
      }
      await page.getByRole('button', { name: /Save.*continue|Save address/i }).first().click();
      await expect(page.getByText(/Delivering to/i).first()).toBeVisible({ timeout: 45_000 });
    }

    await expect(page.getByText(/Sandbox payment/i).first()).toBeVisible();

    // Prefer card when listed — more reliable than UPI collect for continuous journey.
    const cardMethod = page.getByRole('radio', { name: /Debit|Credit|Card/i }).first();
    if (await cardMethod.isVisible().catch(() => false)) {
      await cardMethod.check();
    }

    const payButton = page.getByRole('button', {
      name: /Pay with card|Pay securely|Place COD|Pay with UPI|Pay with mobile|Pay ₹|Pay \$|Place order/i,
    });
    await expect(payButton).toBeEnabled({ timeout: 60_000 });
    await payButton.click();

    const upiComplete = page.getByRole('button', { name: 'I have completed payment' });
    if (await upiComplete.isVisible({ timeout: 12_000 }).catch(() => false)) {
      await upiComplete.click();
    }

    await expect(
      page.getByText(/Payment successful|Order placed|Order #|successfully|could not be confirmed|try again/i).first(),
    ).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/Payment successful|Order placed|Order #/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await s53Snap(page, '07-customer-order-success');

    await page.getByRole('link', { name: /View my orders|Orders/i }).first().click();
    await expect(page).toHaveURL(/\/orders/);
    await expect(page.getByText(/WP-|Order|DEMO-SBX|Paracetamol|Placed|Paid/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s53Snap(page, '08-customer-orders');

    const firstOrder = page.locator('a[href*="/orders/"]').first();
    if (await firstOrder.isVisible().catch(() => false)) {
      await firstOrder.click();
      await expect(page).toHaveURL(/\/orders\//);
      await expect(page.getByText(/Shipment|Tracking|Status|Sandbox|Order/i).first()).toBeVisible();
      await s53Snap(page, '09-customer-tracking');
    } else {
      await page.goto('/shipments');
      await s53Snap(page, '09-customer-tracking');
    }

    await page.goto('/wishlist');
    await expect(page.locator('main')).toBeVisible();
    await s53Snap(page, '10-customer-wishlist');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await selectMarketIfGated(page, /India/i);
    await s53Snap(page, '11-customer-home-390');
    await page.setViewportSize({ width: 1440, height: 900 });
  });
});
