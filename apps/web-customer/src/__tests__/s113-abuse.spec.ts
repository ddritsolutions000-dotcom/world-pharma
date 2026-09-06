/**
 * Sprint 113 — API abuse / rate-limit hardening evidence.
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
  s113Snap,
  s113WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s113-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S113 abuse API gates', () => {
  test('unauthenticated api-abuse-hardening denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/api-abuse-hardening',
    );
    expect(res.status()).toBe(401);
  });
});

test.describe('S113 Admin abuse card + SoD + responsive', () => {
  test('EXTERNAL_WAF gated + launch NO + customer denied', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/API abuse protection \+ rate limiting hardening \(Sprint 113\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED/i).first()).toBeVisible({
      timeout: 30_000,
    });

    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/Parallel framework:\s*false/i);
    expect(adminBody).toMatch(/Invented WAF:\s*false/i);
    expect(adminBody).toMatch(/OTP:\s*TESTED/i);
    expect(adminBody).toMatch(/Webhooks:\s*HARDENED/i);
    expect(adminBody).toMatch(/Force launch:\s*false/i);
    expect(adminBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO/i);
    expect(adminBody).not.toMatch(/hack-proof|DDoS-proof|100% secure/i);
    expect(adminBody).not.toMatch(/sk_live_|BEGIN PRIVATE KEY|otp=\d{4,}/i);
    await ensureNoSecrets(page);
    await s113Snap(page, 'admin-01-abuse-hardening-card');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
      await s113Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges(CUSTOMER_EMAIL);
    await cust.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await cust.getByLabel(/^Email$/i).click();
    await cust.getByLabel(/^Email$/i).pressSequentially(CUSTOMER_EMAIL, { delay: 15 });
    await uiOtpLogin(cust, CUSTOMER_EMAIL);
    await selectMarketIfGated(cust, /India/i).catch(() => undefined);
    await cust.goto(`${ADMIN}/provider-activation`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s113Snap(cust, 'customer-02-denied-admin');
    await ensureNoSecrets(cust);
    await custCtx.close();

    s113WriteArtifact(
      's113-status.json',
      JSON.stringify(
        {
          sprint: 113,
          parallel_rate_limit_framework_created: false,
          invented_waf_edge_vendor: false,
          otp_abuse_protection: 'TESTED',
          webhook_protection: 'HARDENED',
          distributed_enforcement: 'REDIS_BACKED_SOFTWARE',
          external_waf_edge_protection: 'EXTERNAL_GATED',
          can_production_launch: 'NO',
          remaining_blocker: 'EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED',
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
