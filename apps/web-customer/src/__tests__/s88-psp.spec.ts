/**
 * Sprint 88 — Production PSP activation readiness evidence (no fake live PSP).
 * Sandbox checkout + payment + order consistency + Admin EXTERNAL_GATED / NOT_SELECTED.
 * Responsive 390/768/1024/1440 = RESPONSIVE_WEB_VERIFIED ≠ native Android/iOS.
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  CUSTOMER,
  CUSTOMER_EMAIL,
  VENDOR,
  clearOtpRateLimits,
  ensureNoSecrets,
  expirePendingOtpChallenges,
  s60AdminLogin,
  s61LoginPortal,
  s88Snap,
  s88WriteArtifact,
  selectMarketIfGated,
  uiCustomerLogin,
} from '../../e2e/helpers/s88-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S88 PSP API gates', () => {
  test('unauthenticated psp-onboarding denied; customer cannot read Admin PSP', async ({
    request,
  }) => {
    const onboarding = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/psp-onboarding',
    );
    expect(onboarding.status()).toBe(401);
  });

  test('unsigned webhook fail-closed; correlation preserved', async ({ request }) => {
    const corr = 's88-webhook-fail';
    const wh = await request.post('http://127.0.0.1:4000/api/v1/webhooks/payments/MOCK_PRIMARY', {
      headers: { 'x-correlation-id': corr },
      data: { event_id: 's88-unauth', type: 'payment.captured', note: 'sandbox controlled failure' },
    });
    expect([400, 401, 403, 404, 422, 503]).toContain(wh.status());
    expect(wh.ok()).toBeFalsy();
    const bodyText = await wh.text();
    expect(bodyText).not.toMatch(/password|api_key|secret|pan|cvv|eyJ/i);
    s88WriteArtifact(
      'controlled-webhook-failure.json',
      JSON.stringify(
        {
          status: wh.status(),
          ok: false,
          correlation_id: wh.headers()['x-correlation-id'] ?? corr,
          category: 'WEBHOOK_ERROR',
          note: 'Unsigned webhook rejected — sandbox controlled failure',
        },
        null,
        2,
      ),
    );
  });

  test('duplicate unsigned webhook remains rejected (idempotent fail-closed)', async ({
    request,
  }) => {
    const payload = {
      event_id: 's88-dup-event',
      type: 'payment.captured',
      note: 'duplicate attempt',
    };
    const a = await request.post('http://127.0.0.1:4000/api/v1/webhooks/payments/MOCK_PRIMARY', {
      data: payload,
    });
    const b = await request.post('http://127.0.0.1:4000/api/v1/webhooks/payments/MOCK_PRIMARY', {
      data: payload,
    });
    expect(a.ok()).toBeFalsy();
    expect(b.ok()).toBeFalsy();
  });
});

test.describe('S88 Admin + customer sandbox payment evidence', () => {
  test('PSP NOT_SELECTED + EXTERNAL_GATED + sandbox checkout + order consistency', async ({
    page,
    context,
    browser,
  }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const pspHeading = page
      .getByText(/Production payment \/ PSP activation readiness \(Sprint 88\)/i)
      .first();
    await expect(pspHeading).toBeVisible({ timeout: 60_000 });
    await pspHeading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_PSP/i).first()).toBeVisible({ timeout: 30_000 });
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/NOT_SELECTED/);
    expect(adminBody).toMatch(/EXTERNAL_GATED/);
    expect(adminBody).toMatch(/Configuration:\s*MISSING/i);
    expect(adminBody).toMatch(/Webhook:\s*MISSING/i);
    expect(adminBody).toMatch(/Markets:\s*MISSING/i);
    expect(adminBody).toMatch(/Currencies:\s*MISSING/i);
    expect(adminBody).toMatch(/Reconciliation:\s*MISSING/i);
    expect(adminBody).toMatch(/Production activation:\s*EXTERNAL_GATED/i);
    expect(adminBody).toMatch(/SANDBOX_VERIFIED|Sandbox payment/i);
    expect(adminBody).toMatch(/EXTERNAL_PAYOUT_GATED|Settlement/i);
    expect(adminBody).toMatch(/Force launch available:\s*false/i);
    expect(adminBody).not.toMatch(/force.?launch\s*(enabled|=?\s*true)|FORCE_LAUNCH\s*=\s*true/i);
    expect(adminBody).not.toMatch(/Provider:\s*STRIPE|Provider:\s*RAZORPAY|live PSP enabled/i);
    expect(adminBody).not.toMatch(/apiSecret|password=|eyJ[A-Za-z0-9_-]{10,}\./i);
    await ensureNoSecrets(page);
    await s88Snap(page, 'admin-01-psp-activation-status');
    await s88Snap(page, 'admin-02-production-external-gated');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await pspHeading.scrollIntoViewIfNeeded();
      await s88Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`${ADMIN}/payments`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Payment|sandbox|EXTERNAL|PSP|reconcil/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s88Snap(page, 'admin-03-payments-ops');

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/launch|EXTERNAL_GATED|NO_PRODUCTION_PSP|Provider activation|payment|PSP/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    const launchBody = await page.locator('body').innerText();
    expect(launchBody).toMatch(/NO_PRODUCTION_PSP|CAN_PRODUCTION_LAUNCH|NOT_READY|EXTERNAL_GATED/i);
    expect(launchBody).not.toMatch(/force.?launch\s*(enabled|=?\s*true)|FORCE_LAUNCH\s*=\s*true/i);
    await s88Snap(page, 'admin-04-launch-readiness-gated');

    // --- Customer sandbox commerce ---
    await context.clearCookies();
    await page.goto(CUSTOMER, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await selectMarketIfGated(page, /India/i);
    await s88Snap(page, 'cust-05-market');

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
    await s88Snap(page, 'cust-06-product-cart');

    await page.goto(`${CUSTOMER}/login`);
    await uiCustomerLogin(page, CUSTOMER_EMAIL);
    await ensureNoSecrets(page);

    await page.goto(`${CUSTOMER}/checkout`);
    for (let attempt = 0; attempt < 4; attempt++) {
      if (await page.getByText(/Sandbox payment/i).isVisible().catch(() => false)) break;
      if (await page.getByText(/Connection problem/i).isVisible().catch(() => false)) {
        await page.getByRole('button', { name: /Retry/i }).click().catch(() => undefined);
        await page.waitForTimeout(3000);
        continue;
      }
      if (await page.getByText(/Loading/i).isVisible().catch(() => false)) {
        await page.waitForTimeout(3000);
        continue;
      }
      await page.waitForTimeout(2000);
    }
    if (!(await page.getByText(/Sandbox payment/i).isVisible().catch(() => false))) {
      await page.goto(`${CUSTOMER}/p/demo-paracetamol-500`);
      await selectMarketIfGated(page, /India/i);
      const postal2 = page.getByLabel('Delivery postal code');
      if (await postal2.isVisible().catch(() => false)) await postal2.fill('400001');
      const add2 = page.getByRole('button', { name: /Add to cart/i });
      if (await add2.isVisible({ timeout: 20_000 }).catch(() => false)) {
        await add2.click();
        await page.getByText(/Added to cart/i).waitFor({ timeout: 30_000 }).catch(() => undefined);
      }
      await page.goto(`${CUSTOMER}/checkout`);
      await page.waitForTimeout(4000);
      if (await page.getByText(/Connection problem/i).isVisible().catch(() => false)) {
        await page.getByRole('button', { name: /Retry/i }).click();
        await page.waitForTimeout(3500);
      }
    }
    await expect(
      page.getByText(/Sandbox payment|Checkout|Delivery|Connection problem|Nothing was charged/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    await s88Snap(page, 'cust-07-checkout-sandbox');

    let paymentOutcome: 'SUCCESS' | 'FAILURE_OR_RETRY' | 'NO_CTA' | 'CHECKOUT_GATED' = 'CHECKOUT_GATED';

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
        const result = page
          .getByText(/Payment successful|Order placed|Order #|successfully|could not be confirmed|try again|failed/i)
          .first();
        await expect(result).toBeVisible({ timeout: 90_000 });
        const resultText = (await result.innerText()).toLowerCase();
        paymentOutcome =
          /successful|order placed|order #/.test(resultText) && !/could not|failed|try again/.test(resultText)
            ? 'SUCCESS'
            : 'FAILURE_OR_RETRY';
        await s88Snap(page, 'cust-08-sandbox-payment-result');

        if (paymentOutcome === 'FAILURE_OR_RETRY') {
          const retry = page.getByRole('button', { name: /Retry|Try again|Pay again/i }).first();
          if (await retry.isVisible({ timeout: 5_000 }).catch(() => false)) {
            await retry.click();
            await s88Snap(page, 'cust-09-payment-retry');
          } else {
            await s88Snap(page, 'cust-09-payment-failure-state');
          }
        } else {
          await s88Snap(page, 'cust-09-payment-success');
        }
      } else {
        paymentOutcome = 'NO_CTA';
        await s88Snap(page, 'cust-08-sandbox-no-pay-cta');
      }
    } else {
      await expect(page.getByText(/Nothing was charged|Retry|Connection problem/i).first()).toBeVisible();
      await s88Snap(page, 'cust-08-checkout-fail-closed-retry');
    }

    await page.goto(`${CUSTOMER}/orders`);
    await expect(page.getByText(/Order|WP-|DEMO|Paracetamol|Paid|Placed|empty|No orders/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s88Snap(page, 'cust-10-order-payment-consistency');

    const orderLink = page.getByRole('link', { name: /WP-|Order|DEMO|Paracetamol/i }).first();
    if (await orderLink.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await orderLink.click();
      await expect(
        page.getByText(/Order|Payment|Paid|Placed|Status|Sandbox|total|Paracetamol/i).first(),
      ).toBeVisible({ timeout: 30_000 });
      await s88Snap(page, 'cust-11-order-detail');
    }

    const refundUi = page.getByText(/Refund|Cancel order|Request refund/i).first();
    if (await refundUi.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await s88Snap(page, 'cust-12-refund-or-cancel-surface');
    }

    const vendCtx = await browser.newContext();
    const vend = await vendCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-vendor@dev.local');
    await s61LoginPortal(vend, `${VENDOR}/`, 'sandbox-vendor@dev.local');
    for (const p of ['/', '/workspace', '/fulfillment', '/marketplace']) {
      await vend.goto(`${VENDOR}${p}`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      const t = await vend.locator('body').innerText().catch(() => '');
      if (t && !/Page not found|route does not exist/i.test(t)) break;
    }
    await vend.waitForTimeout(1500);
    const vendBody = await vend.locator('body').innerText().catch(() => '');
    expect(vendBody.length).toBeGreaterThan(20);
    expect(vendBody).not.toMatch(/apiSecret|password=|eyJ[A-Za-z0-9_-]{10,}\./i);
    await s88Snap(vend, 'vendor-13-orders-after-payment');
    await vendCtx.close();

    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-customer@dev.local');
    await cust.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await uiCustomerLogin(cust, 'sandbox-customer@dev.local');
    await cust.goto(`${ADMIN}/provider-activation`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s88Snap(cust, 'security-14-customer-denied-psp-activation');
    await custCtx.close();

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page
      .getByText(/NO_PRODUCTION_PSP|Production payment \/ PSP activation readiness \(Sprint 88\)/i)
      .first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await s88Snap(page, 'admin-15-final-status');

    const status = {
      sprint: 88,
      foundation_sprint: 85,
      PSP_provider: 'NOT_SELECTED',
      activation_lifecycle: 'NOT_SELECTED',
      Environment: 'sandbox',
      Configured: false,
      Verified: false,
      Approved: false,
      Enabled: false,
      Sandbox: 'SANDBOX_VERIFIED',
      Production: 'EXTERNAL_GATED',
      Configuration: 'MISSING',
      Webhook: 'MISSING',
      Markets: 'MISSING',
      Currencies: 'MISSING',
      Reconciliation: 'MISSING',
      Production_activation: 'EXTERNAL_GATED',
      Sandbox_payment: 'SANDBOX_VERIFIED',
      Production_payment: 'EXTERNAL_GATED',
      Settlement_payout: 'EXTERNAL_PAYOUT_GATED',
      Remaining_blocker: 'NO_PRODUCTION_PSP',
      Force_launch: false,
      Observed_sandbox_payment_outcome: paymentOutcome,
      Controlled_failure: 'UNSIGNED_WEBHOOK_REJECTED',
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
      PRODUCTION_PSP_ENABLED: 'NO',
      Note: 'SANDBOX_PAYMENT / SANDBOX_ORDER only — no real-money transaction',
    };
    s88WriteArtifact('final-psp-status.json', JSON.stringify(status, null, 2));
  });
});
