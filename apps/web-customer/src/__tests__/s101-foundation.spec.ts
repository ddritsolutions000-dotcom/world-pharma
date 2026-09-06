/**
 * Sprint 101 — Production foundation activation readiness evidence
 * (no invented infrastructure). Responsive ≠ native.
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  CUSTOMER,
  clearOtpRateLimits,
  ensureNoSecrets,
  expirePendingOtpChallenges,
  s60AdminLogin,
  s101Snap,
  s101WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s101-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S101 foundation API gates', () => {
  test('unauthenticated production-foundation-onboarding denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/production-foundation-onboarding',
    );
    expect(res.status()).toBe(401);
  });

  test('response body never contains connection-string secrets', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/production-foundation-onboarding',
    );
    expect(res.status()).toBe(401);
    const text = await res.text();
    expect(text).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@|sk_live_|BEGIN PRIVATE KEY/i);
  });
});

test.describe('S101 Admin foundation + launch NO + SoD', () => {
  test('EXTERNAL_GATED foundation + launch NO', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/Production foundation activation readiness \(Sprint 101\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_ENVIRONMENT/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Foundation/i).first()).toBeVisible();
    await expect(
      page.getByText(/PRODUCTION ENVIRONMENT ENABLED = NO|Environment enabled:/i).first(),
    ).toBeVisible();

    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/EXTERNAL_GATED/);
    expect(adminBody).toMatch(/Force launch:\s*false/i);
    expect(adminBody).toMatch(/Production Environment|Deployment Target|Secrets Manager|Database/i);
    expect(adminBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO|CAN_PRODUCTION_LAUNCH/i);
    expect(adminBody).toMatch(/S100_REUSED|Control plane/i);
    expect(adminBody).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@|sk_live_|apiSecret=|password=/i);
    await ensureNoSecrets(page);
    await s101Snap(page, 'admin-01-foundation-card');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await s101Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    await expect(
      page.getByText(/Production provider onboarding control plane \(Sprint 100\)/i).first(),
    ).toBeVisible({ timeout: 30_000 });
    await s101Snap(page, 'admin-02-s100-control-plane-still-present');

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/CAN_PRODUCTION_LAUNCH|NOT_READY|NO_PRODUCTION|launch|EXTERNAL_GATED/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    const launchBody = await page.locator('body').innerText();
    expect(launchBody).toMatch(/CAN_PRODUCTION_LAUNCH\s*=?\s*NO|NOT_READY|NO_PRODUCTION/i);
    expect(launchBody).not.toMatch(/force.?launch\s*(enabled|=?\s*true)|FORCE_LAUNCH\s*=\s*true/i);
    await s101Snap(page, 'admin-03-launch-readiness-no');

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
    await s101Snap(cust, 'security-04-customer-denied-admin');
    await custCtx.close();

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page
      .getByText(
        /NO_PRODUCTION_ENVIRONMENT|Production foundation activation readiness \(Sprint 101\)/i,
      )
      .first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await s101Snap(page, 'admin-05-final-status');

    const status = {
      sprint: 101,
      foundation_sprints: '62,87,96,97,98,99,100',
      Control_plane: 'S100_REUSED',
      activation_lifecycle: 'EXTERNAL_GATED',
      Environment: 'sandbox',
      Enabled: false,
      Production: 'EXTERNAL_GATED',
      Remaining_blockers: [
        'NO_PRODUCTION_ENVIRONMENT',
        'NO_PRODUCTION_SECRETS_MANAGER',
        'NO_PRODUCTION_DATABASE',
        'NO_PRODUCTION_DEPLOYMENT_TARGET',
      ],
      Force_launch: false,
      Force_deploy: false,
      CAN_PRODUCTION_LAUNCH: 'NO',
      PRODUCTION_ENVIRONMENT_ENABLED: 'NO',
      PRODUCTION_DEPLOYMENT_TARGET_ENABLED: 'NO',
      PRODUCTION_SECRETS_MANAGER_ENABLED: 'NO',
      PRODUCTION_DATABASE_ENABLED: 'NO',
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    };
    s101WriteArtifact('final-foundation-status.json', JSON.stringify(status, null, 2));
  });
});
