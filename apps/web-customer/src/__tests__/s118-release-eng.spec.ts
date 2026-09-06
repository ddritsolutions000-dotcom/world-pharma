/**
 * Sprint 118 — Release engineering readiness evidence.
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
  s118Snap,
  s118WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s118-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S118 release engineering API', () => {
  test('unauthenticated production-release-engineering-readiness denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/production-release-engineering-readiness',
    );
    expect(res.status()).toBe(401);
  });
});

test.describe('S118 Admin release eng + launch + responsive', () => {
  test('NOT_CONFIGURED pipeline + launch NO', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/Release engineering readiness \(Sprint 118/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    const launchBody = await page.locator('body').innerText();
    expect(launchBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO/i);
    expect(launchBody).toMatch(/Deploy target:\s*NOT_CONFIGURED/i);
    expect(launchBody).toMatch(/Migration:\s*NOT_AUTHORIZED/i);
    expect(launchBody).toMatch(/Rollback:\s*PRODUCTION_NOT_PROVEN/i);
    expect(launchBody).toMatch(/EXTERNAL_PENTEST_REQUIRED|Security:/i);
    expect(launchBody).toMatch(/Pipeline:\s*NOT_CONFIGURED/i);
    await s118Snap(page, 'admin-01-launch-release-eng');

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/Production release engineering readiness \(Sprint 118\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/Fake infra:\s*false/i);
    expect(adminBody).toMatch(/Parallel machine:\s*false/i);
    expect(adminBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO/i);
    expect(adminBody).toMatch(/PRECHECK:/i);
    expect(adminBody).toMatch(/MIGRATION_GATE:/i);
    expect(adminBody).toMatch(/RELEASE_SUCCESS:/i);
    expect(adminBody).not.toMatch(/sk_live_|BEGIN PRIVATE KEY|otp=\d{4,}/i);
    await ensureNoSecrets(page);
    await s118Snap(page, 'admin-02-provider-release-eng-card');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
      await s118Snap(page, `admin-responsive-${label}`);
    }

    // Critical public path still reachable after control-plane changes
    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges(CUSTOMER_EMAIL);
    await cust.goto(`${CUSTOMER}/`, { waitUntil: 'domcontentloaded' });
    await expect(cust.locator('body')).toBeVisible({ timeout: 45_000 });
    await s118Snap(cust, 'customer-01-home');

    await cust.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await cust.getByLabel(/^Email$/i).click();
    await cust.getByLabel(/^Email$/i).pressSequentially(CUSTOMER_EMAIL, { delay: 15 });
    await uiOtpLogin(cust, CUSTOMER_EMAIL);
    await selectMarketIfGated(cust, /India/i).catch(() => undefined);
    await cust.goto(`${ADMIN}/launch-readiness`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s118Snap(cust, 'customer-02-denied');
    await ensureNoSecrets(cust);
    await custCtx.close();

    s118WriteArtifact(
      's118-status.json',
      JSON.stringify(
        {
          sprint: 118,
          software: 'READY',
          production_infrastructure: 'NOT_CONFIGURED',
          deployment_target_lifecycle: 'NOT_CONFIGURED',
          release_pipeline: 'NOT_CONFIGURED',
          migration: 'NOT_AUTHORIZED',
          rollback_production: 'PRODUCTION_NOT_PROVEN',
          smoke: 'SANDBOX_ONLY',
          can_production_launch: 'NO',
          remaining_blocker: 'NO_PRODUCTION_DEPLOYMENT_TARGET',
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
