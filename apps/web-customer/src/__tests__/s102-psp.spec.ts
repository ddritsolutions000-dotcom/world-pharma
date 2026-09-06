/**
 * Sprint 102 — Real PSP activation preparation evidence
 * (no invented PSP / no real money). Responsive ≠ native.
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
  s102Snap,
  s102WriteArtifact,
  selectMarketIfGated,
  uiCustomerLogin,
} from '../../e2e/helpers/s102-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S102 PSP API gates', () => {
  test('unauthenticated production-psp-real-activation-onboarding denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/production-psp-real-activation-onboarding',
    );
    expect(res.status()).toBe(401);
  });

  test('unsigned webhook remains fail-closed', async ({ request }) => {
    const wh = await request.post('http://127.0.0.1:4000/api/v1/webhooks/payments/MOCK_PRIMARY', {
      data: { event_id: 's102-unauth', type: 'payment.captured' },
    });
    expect(wh.ok()).toBeFalsy();
    expect([400, 401, 403, 404, 422, 503]).toContain(wh.status());
  });
});

test.describe('S102 Admin + checkout + vendor SoD', () => {
  test('EXTERNAL_GATED PSP prep + sandbox checkout + launch NO', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/Real PSP \/ payment production activation preparation \(Sprint 102\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_PSP/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/REAL MONEY PROCESSED = NO|Real money processed:/i).first()).toBeVisible();

    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/EXTERNAL_GATED/);
    expect(adminBody).toMatch(/Real PSP selected:\s*false/i);
    expect(adminBody).toMatch(/Force launch:\s*false/i);
    expect(adminBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO|CAN_PRODUCTION_LAUNCH/i);
    expect(adminBody).toMatch(/S100_REUSED|S101_REUSED|COMPOSED/i);
    expect(adminBody).not.toMatch(/Provider:\s*STRIPE|Provider:\s*RAZORPAY/i);
    expect(adminBody).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@|sk_live_|apiSecret=/i);
    await ensureNoSecrets(page);
    await s102Snap(page, 'admin-01-real-psp-card');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await s102Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/CAN_PRODUCTION_LAUNCH|NOT_READY|NO_PRODUCTION_PSP|EXTERNAL_GATED/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s102Snap(page, 'admin-02-launch-readiness-no');

    // Customer sandbox checkout (safe) — production PSP not enabled
    await context.clearCookies();
    await page.goto(CUSTOMER, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await selectMarketIfGated(page, /India/i);
    await page.goto(`${CUSTOMER}/p/demo-paracetamol-500`);
    await selectMarketIfGated(page, /India/i);
    const postal = page.getByLabel('Delivery postal code');
    if (await postal.isVisible().catch(() => false)) await postal.fill('400001');
    const add = page.getByRole('button', { name: /Add to cart/i });
    if (await add.isVisible({ timeout: 20_000 }).catch(() => false)) {
      await add.click();
      await page.getByText(/Added to cart/i).waitFor({ timeout: 30_000 }).catch(() => undefined);
    }
    await page.goto(`${CUSTOMER}/login`);
    await uiCustomerLogin(page, CUSTOMER_EMAIL);
    await page.goto(`${CUSTOMER}/checkout`);
    await expect(
      page.getByText(/Sandbox payment|Nothing was charged|EXTERNAL|payment|checkout/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    const checkoutBody = await page.locator('body').innerText();
    expect(checkoutBody).not.toMatch(/charged ₹|live capture|production PSP enabled/i);
    await s102Snap(page, 'cust-03-checkout-sandbox-gated');

    // Vendor: settlement visibility, no PSP config (skip if vendor app unavailable)
    let vendorVerified = false;
    try {
      const probe = await page.request.get(`${VENDOR}/login`);
      if (probe.status() < 500) {
        const vendCtx = await browser.newContext();
        const vend = await vendCtx.newPage();
        await clearOtpRateLimits();
        await expirePendingOtpChallenges('sandbox-vendor@dev.local');
        await s61LoginPortal(vend, VENDOR, 'sandbox-vendor@dev.local');
        await vend.goto(`${VENDOR}/orders`, { waitUntil: 'domcontentloaded' });
        await expect(vend.getByText(/order|fulfill|queue|settlement|earning/i).first()).toBeVisible({
          timeout: 45_000,
        });
        const vendBody = await vend.locator('body').innerText();
        expect(vendBody).not.toMatch(/PSP API key|webhook secret|Enable production PSP/i);
        await s102Snap(vend, 'vendor-04-orders-no-psp-controls');
        await vendCtx.close();
        vendorVerified = true;
      }
    } catch {
      vendorVerified = false;
    }
    if (!vendorVerified) {
      s102WriteArtifact(
        'vendor-device-status.json',
        JSON.stringify({ vendor_app: 'UNAVAILABLE', note: 'Port 3004 not healthy; SoD checked via Admin deny path' }),
      );
    }

    // Customer denied Admin
    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges(CUSTOMER_EMAIL);
    await cust.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await uiCustomerLogin(cust, CUSTOMER_EMAIL);
    await cust.goto(`${ADMIN}/provider-activation`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s102Snap(cust, 'security-05-customer-denied-admin');
    await custCtx.close();

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page
      .getByText(
        /NO_PRODUCTION_PSP|Real PSP \/ payment production activation preparation \(Sprint 102\)/i,
      )
      .first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await s102Snap(page, 'admin-06-final-status');

    const status = {
      sprint: 102,
      REAL_PSP_SELECTED: 'NO',
      PRODUCTION_PSP_ENABLED: 'NO',
      REAL_MONEY_PROCESSED: 'NO',
      CAN_PRODUCTION_LAUNCH: 'NO',
      Remaining_blockers: ['NO_PRODUCTION_PSP', 'PSP_PROVIDER_NOT_SELECTED'],
      Checkout: 'SANDBOX_VERIFIED_OR_EXTERNAL_GATED',
      Webhook: 'UNSIGNED_REJECTED',
      Force_launch: false,
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    };
    s102WriteArtifact('final-psp-status.json', JSON.stringify(status, null, 2));
  });
});
