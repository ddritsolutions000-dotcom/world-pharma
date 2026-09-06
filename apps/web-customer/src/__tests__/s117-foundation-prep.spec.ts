/**
 * Sprint 117 — Foundation activation preparation evidence.
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
  s117Snap,
  s117WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s117-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S117 foundation prep API', () => {
  test('unauthenticated production-foundation-activation-preparation denied', async ({
    request,
  }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/production-foundation-activation-preparation',
    );
    expect(res.status()).toBe(401);
  });
});

test.describe('S117 Admin foundation prep + launch + responsive', () => {
  test('NOT_CONFIGURED rails + launch NO', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/Foundation activation preparation \(Sprint 117/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    const launchBody = await page.locator('body').innerText();
    expect(launchBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO/i);
    expect(launchBody).toMatch(/Env:\s*NOT_CONFIGURED/i);
    expect(launchBody).toMatch(/Secrets:\s*NOT_CONFIGURED/i);
    expect(launchBody).toMatch(/Database:\s*NOT_CONFIGURED/i);
    expect(launchBody).toMatch(/Deploy:\s*NOT_CONFIGURED/i);
    expect(launchBody).toMatch(/Migration:\s*NOT_AUTHORIZED/i);
    expect(launchBody).toMatch(/Rollback prod:\s*NOT_PROVEN/i);
    expect(launchBody).toMatch(/NO_PRODUCTION_ENVIRONMENT/i);
    await s117Snap(page, 'admin-01-launch-foundation-prep');

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/Production foundation activation preparation \(Sprint 117\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/Fake infra:\s*false/i);
    expect(adminBody).toMatch(/Force launch:\s*false/i);
    expect(adminBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO/i);
    expect(adminBody).not.toMatch(/sk_live_|BEGIN PRIVATE KEY|otp=\d{4,}/i);
    await ensureNoSecrets(page);
    await s117Snap(page, 'admin-02-provider-foundation-prep-card');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
      await s117Snap(page, `admin-responsive-${label}`);
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
    await s117Snap(cust, 'customer-03-denied');
    await ensureNoSecrets(cust);
    await custCtx.close();

    s117WriteArtifact(
      's117-status.json',
      JSON.stringify(
        {
          sprint: 117,
          production_environment: 'NOT_CONFIGURED',
          production_secrets: 'NOT_CONFIGURED',
          production_database: 'NOT_CONFIGURED',
          deployment_target_lifecycle: 'NOT_CONFIGURED',
          migration_cutover: 'NOT_AUTHORIZED',
          rollback_production: 'NOT_PROVEN',
          can_production_launch: 'NO',
          remaining_blocker: 'NO_PRODUCTION_ENVIRONMENT',
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
