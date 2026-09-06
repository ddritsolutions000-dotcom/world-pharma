/**
 * Sprint 110 — Application security authorization / IDOR / BOLA evidence.
 * Responsive ≠ native. No PHI/credentials in screenshots.
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
  s110Snap,
  s110WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s110-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S110 security API gates', () => {
  test('unauthenticated application-security-hardening denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/application-security-hardening',
    );
    expect(res.status()).toBe(401);
  });
});

test.describe('S110 Admin security card + SoD + responsive', () => {
  test('EXTERNAL_PENTEST_REQUIRED + launch NO + customer denied Admin', async ({
    page,
    context,
    browser,
  }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/Application security hardening — authorization \/ IDOR \/ BOLA \(Sprint 110\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/EXTERNAL_PENTEST_REQUIRED/i).first()).toBeVisible({
      timeout: 30_000,
    });

    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/Parallel framework:\s*false/i);
    expect(adminBody).toMatch(/IDOR\/BOLA:\s*HARDENED/i);
    expect(adminBody).toMatch(/Force launch:\s*false/i);
    expect(adminBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO/i);
    expect(adminBody).toMatch(/Security controls tested/i);
    expect(adminBody).not.toMatch(/hack-proof|100% secure|cannot be hacked/i);
    expect(adminBody).not.toMatch(/sk_live_|BEGIN PRIVATE KEY|postgresql:\/\//i);
    await ensureNoSecrets(page);
    await s110Snap(page, 'admin-01-security-hardening-card');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
      await s110Snap(page, `admin-responsive-${label}`);
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
    await s110Snap(cust, 'customer-02-denied-admin');
    await ensureNoSecrets(cust);
    await custCtx.close();

    s110WriteArtifact(
      's110-status.json',
      JSON.stringify(
        {
          sprint: 110,
          can_production_launch: 'NO',
          remaining_blocker: 'EXTERNAL_PENTEST_REQUIRED',
          parallel_security_framework_created: false,
          customer_denied_admin: true,
          idor_bola: 'HARDENED',
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
