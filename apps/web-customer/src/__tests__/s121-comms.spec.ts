/**
 * Sprint 121 — OTP + communications activation preparation evidence (no real OTP).
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  CUSTOMER,
  CUSTOMER_EMAIL,
  clearOtpRateLimits,
  ensureNoOtpLeak,
  ensureNoSecrets,
  expirePendingOtpChallenges,
  s60AdminLogin,
  s121Snap,
  s121WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s121-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S121 OTP/comms API', () => {
  test('unauthenticated otp-messaging-activation-preparation denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/otp-messaging-activation-preparation',
    );
    expect(res.status()).toBe(401);
  });
});

test.describe('S121 Admin + customer OTP + launch + responsive', () => {
  test('NOT_SELECTED OTP + launch NO + sandbox login', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoOtpLeak(page);

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/OTP \/ communications activation \(Sprint 121/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    const launchBody = await page.locator('body').innerText();
    expect(launchBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO/i);
    expect(launchBody).toMatch(/OTP:\s*NOT_SELECTED/i);
    expect(launchBody).toMatch(/SMS:\s*EXTERNAL_GATED/i);
    expect(launchBody).toMatch(/Production comms:\s*BLOCKED/i);
    expect(launchBody).not.toMatch(/otp[=:\s]+\d{4,}/i);
    await s121Snap(page, 'admin-01-launch-comms-blocker');

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/Real OTP \+ transactional communications activation preparation \(Sprint 121\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/Fake provider:\s*false/i);
    expect(adminBody).toMatch(/Real OTP sent:\s*false/i);
    expect(adminBody).toMatch(/Production comms:\s*BLOCKED/i);
    expect(adminBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO/i);
    expect(adminBody).toMatch(/otp_not_selected/i);
    expect(adminBody).not.toMatch(/otp[=:\s]+\d{4,}|sk_live_/i);
    await ensureNoOtpLeak(page);
    await s121Snap(page, 'admin-02-provider-comms-card');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
      await s121Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    // Sandbox customer OTP login still works (Console OTP)
    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges(CUSTOMER_EMAIL);
    await cust.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await cust.getByLabel(/^Email$/i).click();
    await cust.getByLabel(/^Email$/i).pressSequentially(CUSTOMER_EMAIL, { delay: 15 });
    await uiOtpLogin(cust, CUSTOMER_EMAIL);
    await selectMarketIfGated(cust, /India/i).catch(() => undefined);
    await ensureNoOtpLeak(cust);
    await s121Snap(cust, 'customer-01-otp-sandbox');

    await cust.goto(`${ADMIN}/launch-readiness`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s121Snap(cust, 'customer-02-denied');
    await ensureNoSecrets(cust);
    await custCtx.close();

    s121WriteArtifact(
      's121-status.json',
      JSON.stringify(
        {
          sprint: 121,
          otp_lifecycle: 'NOT_SELECTED',
          sms: 'EXTERNAL_GATED',
          email: 'EXTERNAL_GATED',
          push: 'EXTERNAL_GATED',
          production_communications: 'BLOCKED',
          sandbox_otp: 'SANDBOX_VERIFIED',
          real_otp_sent: false,
          can_production_launch: 'NO',
          remaining_blocker: 'NO_PRODUCTION_OTP_MESSAGING_PROVIDER',
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
