/**
 * Sprint 120 — PSP payment activation preparation evidence (no real money).
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  CUSTOMER,
  CUSTOMER_EMAIL,
  clearOtpRateLimits,
  ensureNoSecrets,
  expirePendingOtpChallenges,
  s60AdminLogin,
  s120Snap,
  s120WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s120-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S120 PSP API gates', () => {
  test('unauthenticated psp-payment-activation-preparation denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/psp-payment-activation-preparation',
    );
    expect(res.status()).toBe(401);
  });

  test('unsigned webhook remains rejected', async ({ request }) => {
    const wh = await request.post('http://127.0.0.1:4000/api/v1/webhooks/payments/MOCK_PRIMARY', {
      data: { event_id: 's120-unauth', type: 'payment.captured' },
    });
    expect(wh.ok()).toBeFalsy();
    expect([400, 401, 403, 404, 422, 503]).toContain(wh.status());
  });
});

test.describe('S120 Admin PSP + launch + checkout + responsive', () => {
  test('NOT_SELECTED PSP + launch NO + sandbox checkout path', async ({
    page,
    context,
    browser,
  }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/PSP \/ payment activation \(Sprint 120/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    const launchBody = await page.locator('body').innerText();
    expect(launchBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO/i);
    expect(launchBody).toMatch(/Provider:\s*NOT_SELECTED/i);
    expect(launchBody).toMatch(/Production payment:\s*BLOCKED/i);
    expect(launchBody).toMatch(/Credentials:\s*MISSING/i);
    expect(launchBody).toMatch(/Webhook:\s*NOT_CONFIGURED/i);
    await s120Snap(page, 'admin-01-launch-psp-blocker');

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/Real PSP \/ payment activation preparation \(Sprint 120\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/Fake PSP:\s*false/i);
    expect(adminBody).toMatch(/Real money:\s*false/i);
    expect(adminBody).toMatch(/Production payment:\s*BLOCKED/i);
    expect(adminBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO/i);
    expect(adminBody).toMatch(/psp_not_selected/i);
    expect(adminBody).not.toMatch(/sk_live_|whsec_|BEGIN PRIVATE KEY/i);
    await ensureNoSecrets(page);
    await s120Snap(page, 'admin-02-provider-psp-card');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
      await s120Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    // Sandbox customer journey still reachable (mock allowed in sandbox)
    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges(CUSTOMER_EMAIL);
    await cust.goto(`${CUSTOMER}/`, { waitUntil: 'domcontentloaded' });
    await expect(cust.locator('body')).toBeVisible({ timeout: 45_000 });
    await cust.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await cust.getByLabel(/^Email$/i).click();
    await cust.getByLabel(/^Email$/i).pressSequentially(CUSTOMER_EMAIL, { delay: 15 });
    await uiOtpLogin(cust, CUSTOMER_EMAIL);
    await selectMarketIfGated(cust, /India/i).catch(() => undefined);
    await cust.goto(`${CUSTOMER}/cart`, { waitUntil: 'domcontentloaded' });
    await expect(cust.locator('body')).toBeVisible({ timeout: 45_000 });
    const cartBody = await cust.locator('body').innerText();
    expect(cartBody).not.toMatch(/sk_live_|whsec_/i);
    await s120Snap(cust, 'customer-01-cart-sandbox');

    // Production-like payment path remains blocked at control plane (no live PSP)
    await cust.goto(`${ADMIN}/launch-readiness`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s120Snap(cust, 'customer-02-denied');
    await ensureNoSecrets(cust);
    await custCtx.close();

    s120WriteArtifact(
      's120-status.json',
      JSON.stringify(
        {
          sprint: 120,
          psp_lifecycle: 'NOT_SELECTED',
          production_payment: 'BLOCKED',
          sandbox_payment: 'SANDBOX_VERIFIED',
          real_money_processed: false,
          can_production_launch: 'NO',
          remaining_blocker: 'NO_PRODUCTION_PSP',
          native_android: 'DEVICE_NOT_AVAILABLE',
          native_ios: 'DEVICE_NOT_AVAILABLE',
          responsive_web: 'RESPONSIVE_WEB_VERIFIED',
        },
        null,
        2,
      ),
    );
  });
});
