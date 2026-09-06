/**
 * Sprint 112 — Real production environment + secrets + deployment activation evidence.
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
  s112Snap,
  s112WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s112-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S112 foundation API gates', () => {
  test('unauthenticated production-foundation-real-activation-onboarding denied', async ({
    request,
  }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/production-foundation-real-activation-onboarding',
    );
    expect(res.status()).toBe(401);
  });
});

test.describe('S112 Admin foundation real activation + SoD + responsive', () => {
  test('EXTERNAL_GATED foundation triad + launch NO + customer denied', async ({
    page,
    context,
    browser,
  }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(
        /Real production environment \+ secrets \+ deployment activation readiness \(Sprint 112\)/i,
      )
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_ENVIRONMENT/i).first()).toBeVisible({
      timeout: 30_000,
    });

    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/Env configured:\s*NO/i);
    expect(adminBody).toMatch(/Env separation verified:\s*YES/i);
    expect(adminBody).toMatch(/Secrets manager selected:\s*NO/i);
    expect(adminBody).toMatch(/Secrets manager enabled:\s*NO/i);
    expect(adminBody).toMatch(/Deployment target selected:\s*NO/i);
    expect(adminBody).toMatch(/Deployment target enabled:\s*NO/i);
    expect(adminBody).toMatch(/Database configured:\s*NO/i);
    expect(adminBody).toMatch(/Client secret exposure:\s*PASS/i);
    expect(adminBody).toMatch(/Sandbox→prod fallback:\s*NO/i);
    expect(adminBody).toMatch(/Force launch:\s*false/i);
    expect(adminBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO/i);
    expect(adminBody).not.toMatch(/sk_live_|BEGIN PRIVATE KEY|postgresql:\/\/[^:]+:[^@]+@/i);
    await ensureNoSecrets(page);
    await s112Snap(page, 'admin-01-real-foundation-card');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
      await s112Snap(page, `admin-responsive-${label}`);
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
    await s112Snap(cust, 'customer-02-denied-admin');
    await ensureNoSecrets(cust);
    await custCtx.close();

    s112WriteArtifact(
      's112-status.json',
      JSON.stringify(
        {
          sprint: 112,
          production_environment_configured: 'NO',
          production_environment_separation_verified: 'YES',
          real_secrets_manager_selected: 'NO',
          production_secrets_manager_enabled: 'NO',
          real_deployment_target_selected: 'NO',
          production_deployment_target_enabled: 'NO',
          production_database_configured: 'NO',
          client_secret_exposure: 'PASS',
          sandbox_to_production_fallback: 'NO',
          production_to_sandbox_fallback: 'NO',
          migration_safety: 'PASS',
          rollback: 'SANDBOX_PROVEN',
          rollback_production: 'NOT_PROVEN',
          can_production_launch: 'NO',
          remaining_blocker: 'NO_PRODUCTION_ENVIRONMENT',
          fake_infrastructure_invented: false,
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
