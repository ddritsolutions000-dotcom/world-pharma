/**
 * Sprint 119 — Deployment target activation evidence.
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
  s119Snap,
  s119WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s119-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S119 deployment target API', () => {
  test('unauthenticated production-deployment-target-activation denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/production-deployment-target-activation',
    );
    expect(res.status()).toBe(401);
  });
});

test.describe('S119 Admin deploy target + launch + responsive', () => {
  test('NOT_CONFIGURED target + launch NO', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/Deployment target activation \(Sprint 119/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    const launchBody = await page.locator('body').innerText();
    expect(launchBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO/i);
    expect(launchBody).toMatch(/Target:\s*NOT_CONFIGURED/i);
    expect(launchBody).toMatch(/Env:\s*NOT_CONFIGURED/i);
    expect(launchBody).toMatch(/Pipeline:\s*NOT_CONFIGURED/i);
    expect(launchBody).toMatch(/Database:\s*NOT_CONFIGURED/i);
    expect(launchBody).toMatch(/Secrets:\s*NOT_CONFIGURED/i);
    expect(launchBody).toMatch(/EXTERNAL_PENTEST_REQUIRED|Security:/i);
    expect(launchBody).toMatch(/why can.?t we deploy|No real deployment target/i);
    await s119Snap(page, 'admin-01-launch-deploy-target');

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/Real production deployment target activation \(Sprint 119\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/Fake infra:\s*false/i);
    expect(adminBody).toMatch(/Parallel machine:\s*false/i);
    expect(adminBody).toMatch(/Deployable:\s*false/i);
    expect(adminBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO/i);
    expect(adminBody).toMatch(/case_1_no_target/i);
    expect(adminBody).toMatch(/case_7_points_to_sandbox/i);
    expect(adminBody).not.toMatch(/sk_live_|BEGIN PRIVATE KEY|otp=\d{4,}/i);
    await ensureNoSecrets(page);
    await s119Snap(page, 'admin-02-provider-deploy-target-card');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
      await s119Snap(page, `admin-responsive-${label}`);
    }

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
    await s119Snap(cust, 'customer-03-denied');
    await ensureNoSecrets(cust);
    await custCtx.close();

    s119WriteArtifact(
      's119-status.json',
      JSON.stringify(
        {
          sprint: 119,
          deployment_target_lifecycle: 'NOT_CONFIGURED',
          deployable: false,
          deployed: false,
          production_environment: 'NOT_CONFIGURED',
          secrets_manager: 'NOT_CONFIGURED',
          production_database: 'NOT_CONFIGURED',
          release_pipeline: 'NOT_CONFIGURED',
          rollback: 'NOT_PROVEN',
          security_certification: 'PENDING',
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
