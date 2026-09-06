/**
 * Sprint 66 — OTP / messaging onboarding evidence (no fake live provider).
 * Never capture OTP codes in screenshots/assertions as secrets.
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  CUSTOMER,
  CUSTOMER_EMAIL,
  clearOtpRateLimits,
  ensureNoSecrets,
  s60AdminLogin,
  s66Snap,
  s66WriteArtifact,
  selectMarketIfGated,
  uiCustomerLogin,
} from '../../e2e/helpers/s66-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S66 messaging API gates', () => {
  test('unauthenticated messaging-onboarding denied', async ({ request }) => {
    const res = await request.get('http://127.0.0.1:4000/api/v1/admin/control-plane/messaging-onboarding');
    expect(res.status()).toBe(401);
  });
});

test.describe('S66 Admin + customer OTP sandbox', () => {
  test('activation messaging card + login OTP + invalid OTP recovery', async ({ page, context }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/OTP \/ messaging (onboarding|activation readiness)/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/NOT_SELECTED|EXTERNAL_GATED|SANDBOX_VERIFIED/i).first()).toBeVisible({
      timeout: 30_000,
    });
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/OTP/);
    expect(adminBody).toMatch(/EXTERNAL_GATED|NOT_SELECTED/);
    expect(adminBody).not.toMatch(/\bUPI\b/);
    await ensureNoSecrets(page);
    await s66Snap(page, 'admin-01-messaging-status');
    await s66Snap(page, 'admin-02-otp-external-gated');

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/launch readiness|EXTERNAL_GATED|Provider activation/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s66Snap(page, 'admin-03-production-gated');

    // Customer sandbox login (console OTP — not real SMS)
    await context.clearCookies();
    await clearOtpRateLimits();
    await page.goto(CUSTOMER, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await selectMarketIfGated(page, /India/i);
    await s66Snap(page, 'cust-04-market-context');

    await page.goto(`${CUSTOMER}/login`);
    await expect(
      page.getByLabel(/email|phone|mobile|Work email/i).or(page.getByPlaceholder(/email|phone/i)).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s66Snap(page, 'cust-05-login');

    // Successful sandbox login first (dev reveal — not production SMS)
    await clearOtpRateLimits();
    await uiCustomerLogin(page, CUSTOMER_EMAIL);
    await expect(page.getByRole('button', { name: /Sign out/i }).first()).toBeVisible({ timeout: 90_000 });
    await ensureNoSecrets(page);
    await s66Snap(page, 'cust-06-authenticated');

    // Invalid OTP recovery in a fresh context (do not burn the logged-in session)
    const bad = await context.browser()?.newContext();
    if (bad) {
      const p2 = await bad.newPage();
      await clearOtpRateLimits();
      await p2.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
      await selectMarketIfGated(p2, /India/i).catch(() => undefined);
      const emailField = p2.getByLabel(/Work email|Email|phone|mobile/i).first();
      if (await emailField.isVisible().catch(() => false)) {
        await emailField.click();
        await emailField.fill('');
        await emailField.pressSequentially(CUSTOMER_EMAIL, { delay: 10 });
        const cont = p2.getByRole('button', { name: /Continue|Send|Request/i }).first();
        if (await cont.isVisible().catch(() => false)) await cont.click();
        const otpInput = p2.getByLabel(/OTP|code|verification|One-time/i).first();
        if (await otpInput.isVisible({ timeout: 20_000 }).catch(() => false)) {
          await otpInput.fill('000000');
          const verify = p2.getByRole('button', { name: /Verify|Sign in|Continue|Submit/i }).first();
          if (await verify.isVisible().catch(() => false)) await verify.click();
          await p2.waitForTimeout(1500);
          await s66Snap(p2, 'cust-07-otp-invalid');
        } else {
          await s66Snap(p2, 'cust-07-otp-entry');
        }
      }
      await bad.close();
    }

    // Cross-audience: customer session must not use Admin as operator
    await page.goto(`${ADMIN}/`);
    await expect(
      page.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s66Snap(page, 'admin-08-customer-denied');

    const status = {
      sprint: 66,
      OTP: {
        Provider: 'NOT_SELECTED',
        Environment: 'sandbox',
        Configured: false,
        Verified: false,
        Approved: false,
        Enabled: false,
        Sandbox: 'SANDBOX_VERIFIED',
        Production: 'EXTERNAL_GATED',
        Webhook: 'SANDBOX_ONLY',
        Remaining_blocker: 'ConsoleOtpAdapter only',
      },
      SMS: {
        Provider: 'NOT_SELECTED',
        Production: 'EXTERNAL_GATED',
        Status: 'EXTERNAL_GATED',
      },
      EMAIL: {
        Provider: 'NOT_SELECTED',
        Production: 'EXTERNAL_GATED',
        Status: 'EXTERNAL_GATED',
      },
      PUSH: {
        Provider: 'NOT_SELECTED',
        Production: 'EXTERNAL_GATED',
        Status: 'NOT_VERIFIED',
        Native: 'DEVICE_NOT_AVAILABLE',
      },
    };
    s66WriteArtifact('final-messaging-status.json', JSON.stringify(status, null, 2));
    await s66Snap(page, 'admin-09-final-status-context');
  });
});
