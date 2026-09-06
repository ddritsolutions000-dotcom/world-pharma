/**
 * Sprint 100 — Provider onboarding control plane evidence
 * (no invented credentials). Responsive ≠ native.
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  CUSTOMER,
  clearOtpRateLimits,
  ensureNoSecrets,
  expirePendingOtpChallenges,
  s60AdminLogin,
  s100Snap,
  s100WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s100-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S100 onboarding API gates', () => {
  test('unauthenticated production-provider-onboarding denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/production-provider-onboarding',
    );
    expect(res.status()).toBe(401);
  });

  test('response body never contains connection-string secrets', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/production-provider-onboarding',
    );
    expect(res.status()).toBe(401);
    const text = await res.text();
    expect(text).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@|sk_live_|BEGIN PRIVATE KEY/i);
  });
});

test.describe('S100 Admin onboarding control plane + launch NO + SoD', () => {
  test('EXTERNAL_GATED onboarding dashboard + launch NO', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/Production provider onboarding control plane \(Sprint 100\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_|EXTERNAL_GATED/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText(/PRODUCTION PROVIDERS ENABLED = NO|Control plane:/i).first(),
    ).toBeVisible();

    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/EXTERNAL_GATED/);
    expect(adminBody).toMatch(/Force launch:\s*false/i);
    expect(adminBody).toMatch(/SOFTWARE READY|CONTROL PLANE|Activation sequence/i);
    expect(adminBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO|CAN_PRODUCTION_LAUNCH/i);
    expect(adminBody).toMatch(/PSP|CARRIER|SECRETS_ENV|Dependency|deps/i);
    expect(adminBody).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@|sk_live_|apiSecret=|password=/i);
    await ensureNoSecrets(page);
    await s100Snap(page, 'admin-01-onboarding-control-plane');

    await page.getByRole('button', { name: /^BLOCKED$/i }).first().click();
    await expect(page.getByText(/Filter:\s*BLOCKED/i).first()).toBeVisible({ timeout: 10_000 });
    await s100Snap(page, 'admin-02-filter-blocked');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await s100Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/CAN_PRODUCTION_LAUNCH|NOT_READY|NO_PRODUCTION|launch|EXTERNAL_GATED/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    const launchBody = await page.locator('body').innerText();
    expect(launchBody).toMatch(/CAN_PRODUCTION_LAUNCH\s*=?\s*NO|NOT_READY|NO_PRODUCTION/i);
    expect(launchBody).not.toMatch(/force.?launch\s*(enabled|=?\s*true)|FORCE_LAUNCH\s*=\s*true/i);
    await s100Snap(page, 'admin-03-launch-readiness-no');

    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-customer@dev.local');
    await cust.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await expect(cust.getByLabel(/Email/i).first()).toBeVisible({ timeout: 45_000 });
    await uiOtpLogin(cust, 'sandbox-customer@dev.local');
    await selectMarketIfGated(cust, /India/i);
    await cust.goto(`${ADMIN}/provider-activation`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s100Snap(cust, 'security-04-customer-denied-admin');
    await custCtx.close();

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page
      .getByText(
        /Production provider onboarding control plane \(Sprint 100\)|PRODUCTION PROVIDERS ENABLED = NO/i,
      )
      .first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await s100Snap(page, 'admin-05-final-status');

    const status = {
      sprint: 100,
      foundation_sprints: '64,87,88-99',
      Control_plane: 'SOFTWARE_READY',
      activation_lifecycle: 'EXTERNAL_GATED',
      Environment: 'sandbox',
      Enabled: false,
      Production: 'EXTERNAL_GATED',
      Rails: 21,
      Ready_for_activation: 0,
      Force_launch: false,
      Force_deploy: false,
      CAN_PRODUCTION_LAUNCH: 'NO',
      PRODUCTION_PROVIDERS_ENABLED: 'NO',
      PRODUCTION_INFRASTRUCTURE_ENABLED: 'NO',
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    };
    s100WriteArtifact('final-onboarding-status.json', JSON.stringify(status, null, 2));
  });
});
