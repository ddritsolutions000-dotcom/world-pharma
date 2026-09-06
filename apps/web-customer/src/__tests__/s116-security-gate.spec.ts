/**
 * Sprint 116 — Production security gate consolidation evidence.
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
  s116Snap,
  s116WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s116-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S116 security gate API', () => {
  test('unauthenticated production-security-gate denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/production-security-gate',
    );
    expect(res.status()).toBe(401);
  });
});

test.describe('S116 Admin launch + security gate + responsive', () => {
  test('pentest SCOPE_READY + launch NO + provider card', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/World-Pharma production launch control \(Sprint 87\)/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByText(/Security certification gate \(Sprint 116/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    const launchBody = await page.locator('body').innerText();
    expect(launchBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO/i);
    expect(launchBody).toMatch(/Pentest lifecycle:\s*SCOPE_READY/i);
    expect(launchBody).toMatch(/EXTERNAL_PENTEST/i);
    expect(launchBody).toMatch(/Certification pending:\s*YES/i);
    expect(launchBody).toMatch(/Force launch:\s*false/i);
    expect(launchBody).not.toMatch(/hack-proof|100% secure/i);
    await s116Snap(page, 'admin-01-launch-security-gate');

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/Production security gate consolidation \(Sprint 116\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/EXTERNAL_PENTEST_REQUIRED/i);
    expect(adminBody).toMatch(/Pentest lifecycle:\s*SCOPE_READY/i);
    expect(adminBody).toMatch(/Invented pentest:\s*false/i);
    expect(adminBody).toMatch(/Fail-closed:\s*PASS/i);
    expect(adminBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO/i);
    expect(adminBody).not.toMatch(/sk_live_|BEGIN PRIVATE KEY|otp=\d{4,}/i);
    await ensureNoSecrets(page);
    await s116Snap(page, 'admin-02-provider-security-gate-card');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
      await s116Snap(page, `admin-responsive-${label}`);
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
    await cust.goto(`${ADMIN}/launch-readiness`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s116Snap(cust, 'customer-03-denied-launch');
    await ensureNoSecrets(cust);
    await custCtx.close();

    s116WriteArtifact(
      's116-status.json',
      JSON.stringify(
        {
          sprint: 116,
          authoritative_source: 'production-security-gate-consolidation',
          external_pentest_lifecycle: 'SCOPE_READY',
          external_pentest_passed: 'NO',
          production_security_certified: 'NO',
          sandbox_production_fail_closed: 'PASS',
          can_production_launch: 'NO',
          remaining_blocker: 'EXTERNAL_PENTEST_REQUIRED',
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
