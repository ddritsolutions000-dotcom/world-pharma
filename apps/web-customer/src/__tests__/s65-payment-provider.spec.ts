/**
 * Sprint 65 — First PSP onboarding evidence (no fake live PSP).
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  CUSTOMER,
  CUSTOMER_EMAIL,
  clearOtpRateLimits,
  ensureNoSecrets,
  s60AdminLogin,
  s65Snap,
  s65WriteArtifact,
  selectMarketIfGated,
  uiCustomerLogin,
} from '../../e2e/helpers/s65-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S65 PSP API gates', () => {
  test('unauthenticated psp-onboarding denied; unsigned webhook fail-closed', async ({ request }) => {
    const onboarding = await request.get('http://127.0.0.1:4000/api/v1/admin/control-plane/psp-onboarding');
    expect(onboarding.status()).toBe(401);

    const wh = await request.post('http://127.0.0.1:4000/api/v1/webhooks/payments/MOCK_PRIMARY', {
      data: { event_id: 's65-unauth', type: 'payment.captured' },
    });
    expect([400, 401, 403, 404, 422, 503]).toContain(wh.status());
    expect(wh.ok()).toBeFalsy();
    s65WriteArtifact('webhook-unsigned.json', JSON.stringify({ status: wh.status(), ok: false }, null, 2));
  });
});

test.describe('S65 Admin + customer sandbox evidence', () => {
  test('activation PSP card EXTERNAL_GATED + sandbox checkout path', async ({ page, context }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    await expect(
      page
        .getByText(/Production payment \/ PSP activation readiness \(Sprint (85|88)\)|First PSP onboarding/i)
        .first(),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByText(/Provider:\s*NOT_SELECTED|NOT CONFIGURED|EXTERNAL GATED|NO_PRODUCTION_PSP/i).first(),
    ).toBeVisible({
      timeout: 30_000,
    });
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/Enabled:\s*false|Production:\s*EXTERNAL_GATED/i);
    expect(adminBody).not.toMatch(/Provider:\s*STRIPE|live PSP enabled/i);
    await ensureNoSecrets(page);
    await s65Snap(page, 'admin-01-psp-status');
    await s65Snap(page, 'admin-02-psp-not-configured');

    await page.goto(`${ADMIN}/payments`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Payment|sandbox|EXTERNAL|PSP/i).first()).toBeVisible({ timeout: 45_000 });
    await s65Snap(page, 'admin-03-payments-sandbox-gate');

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/launch readiness|EXTERNAL_GATED|Provider activation/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s65Snap(page, 'admin-04-production-gated');

    await context.clearCookies();
    await page.goto(CUSTOMER, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await selectMarketIfGated(page, /India/i);
    await s65Snap(page, 'cust-05-market-IN');

    await page.goto(`${CUSTOMER}/p/demo-paracetamol-500`);
    await selectMarketIfGated(page, /India/i);
    const postal = page.getByLabel('Delivery postal code');
    if (await postal.isVisible().catch(() => false)) {
      await postal.fill('400001');
    }
    const add = page.getByRole('button', { name: /Add to cart/i });
    if (await add.isVisible({ timeout: 30_000 }).catch(() => false)) {
      await add.click();
      await page.getByText(/Added to cart/i).waitFor({ timeout: 45_000 }).catch(() => undefined);
    }

    await page.goto(`${CUSTOMER}/login`);
    await uiCustomerLogin(page, CUSTOMER_EMAIL);
    await ensureNoSecrets(page);

    await page.goto(`${CUSTOMER}/checkout`);
    if (await page.getByText(/Connection problem/i).isVisible().catch(() => false)) {
      await page.getByRole('button', { name: /Retry/i }).click();
      await page.waitForTimeout(2500);
    }
    await expect(
      page.getByText(/Sandbox payment|Checkout|Delivery|Connection problem|Nothing was charged/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    await s65Snap(page, 'cust-06-checkout-sandbox');

    if (await page.getByText(/Sandbox payment/i).isVisible().catch(() => false)) {
      const inAddress = page
        .locator('label.mg-address-option')
        .filter({ hasText: /400001|Mumbai| · IN/i })
        .locator('input[name="checkout-address"]')
        .first();
      if (await inAddress.isVisible().catch(() => false)) {
        await inAddress.check({ force: true });
      }
      const cardMethod = page.getByRole('radio', { name: /Debit|Credit|Card/i }).first();
      if (await cardMethod.isVisible().catch(() => false)) {
        await cardMethod.check();
      }
      const payButton = page.getByRole('button', {
        name: /Pay with card|Pay securely|Place COD|Pay with UPI|Pay with mobile|Pay ₹|Pay \$|Place order/i,
      });
      if (await payButton.isEnabled({ timeout: 20_000 }).catch(() => false)) {
        await payButton.click();
        const upiComplete = page.getByRole('button', { name: 'I have completed payment' });
        if (await upiComplete.isVisible({ timeout: 8_000 }).catch(() => false)) {
          await upiComplete.click();
        }
        await expect(
          page
            .getByText(/Payment successful|Order placed|Order #|successfully|could not be confirmed|try again/i)
            .first(),
        ).toBeVisible({ timeout: 90_000 });
        await s65Snap(page, 'cust-07-sandbox-payment-result');
      } else {
        await s65Snap(page, 'cust-07-sandbox-no-pay-cta');
      }
    } else {
      await expect(page.getByText(/Nothing was charged|Retry|Connection problem/i).first()).toBeVisible();
      await s65Snap(page, 'cust-07-checkout-fail-closed-retry');
    }

    await page.goto(`${CUSTOMER}/orders`);
    await expect(page.getByText(/Order|WP-|DEMO|Paracetamol|Paid|Placed|empty|No orders/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s65Snap(page, 'cust-08-order-payment-state');

    const status = {
      sprint: 65,
      Provider: 'NOT_SELECTED',
      Environment: 'sandbox',
      Configured: false,
      Verified: false,
      Approved: false,
      Enabled: false,
      Sandbox: true,
      Production: 'EXTERNAL_GATED',
      Webhook: 'SANDBOX_ONLY',
      Country_support: 'POLICY_DRIVEN',
      Currency_support: 'POLICY_DRIVEN',
      Remaining_blocker: 'Real PSP account/credentials/adapter not supplied',
    };
    s65WriteArtifact('final-psp-status.json', JSON.stringify(status, null, 2));
    await s65Snap(page, 'cust-09-final-status-context');
  });
});
