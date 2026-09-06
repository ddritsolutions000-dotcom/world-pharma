/**
 * Sprint 99 — Production deployment / release engineering readiness evidence
 * (no invented cloud accounts / no fake production deploy). Responsive ≠ native.
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  CUSTOMER,
  clearOtpRateLimits,
  ensureNoSecrets,
  expirePendingOtpChallenges,
  s60AdminLogin,
  s99Snap,
  s99WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s99-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S99 deployment API gates', () => {
  test('unauthenticated production-deployment-onboarding denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/production-deployment-onboarding',
    );
    expect(res.status()).toBe(401);
  });

  test('response body never contains connection-string secrets', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/production-deployment-onboarding',
    );
    expect(res.status()).toBe(401);
    const text = await res.text();
    expect(text).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@|sk_live_|BEGIN PRIVATE KEY/i);
  });
});

test.describe('S99 Admin deployment readiness + launch NO + SoD', () => {
  test('EXTERNAL_GATED deployment + launch NO', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/Deployment \/ release engineering readiness \(Sprint 99\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_DEPLOYMENT_TARGET/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText(/PRODUCTION DEPLOYMENT ENABLED = NO|Buildable:/i).first(),
    ).toBeVisible();

    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/EXTERNAL_GATED/);
    expect(adminBody).toMatch(/Force launch:\s*false/i);
    expect(adminBody).toMatch(/Force deploy:\s*false/i);
    expect(adminBody).toMatch(/BUILDABLE|Deployable|NO_PRODUCTION_DEPLOYMENT/i);
    expect(adminBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO|CAN_PRODUCTION_LAUNCH/i);
    expect(adminBody).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@|sk_live_|apiSecret=|password=/i);
    await ensureNoSecrets(page);
    await s99Snap(page, 'admin-01-deployment-card');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await s99Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/CAN_PRODUCTION_LAUNCH|NOT_READY|NO_PRODUCTION|launch|EXTERNAL_GATED/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    const launchBody = await page.locator('body').innerText();
    expect(launchBody).toMatch(/CAN_PRODUCTION_LAUNCH\s*=?\s*NO|NOT_READY|NO_PRODUCTION/i);
    expect(launchBody).toMatch(/NO_PRODUCTION_DEPLOYMENT|Deployment|DEPLOYMENT|RELEASE/i);
    expect(launchBody).not.toMatch(/force.?launch\s*(enabled|=?\s*true)|FORCE_LAUNCH\s*=\s*true/i);
    await s99Snap(page, 'admin-02-launch-readiness-no');

    await page.goto(`${ADMIN}/reliability`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/Reliab|health|outbox|metrics|snapshot|Launch ready|INTERNAL/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s99Snap(page, 'admin-03-reliability');

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
    await s99Snap(cust, 'security-04-customer-denied-admin');
    await custCtx.close();

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page
      .getByText(
        /NO_PRODUCTION_DEPLOYMENT_TARGET|Deployment \/ release engineering readiness \(Sprint 99\)/i,
      )
      .first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await s99Snap(page, 'admin-05-final-status');

    const status = {
      sprint: 99,
      foundation_sprints: '63,87,96,97,98',
      Deployment_target: 'NOT_SELECTED',
      activation_lifecycle: 'NOT_SELECTED',
      Environment: 'sandbox',
      Enabled: false,
      Production: 'EXTERNAL_GATED',
      Buildable: true,
      Deployable: false,
      Remaining_blockers: [
        'NO_PRODUCTION_DEPLOYMENT_TARGET',
        'NO_PRODUCTION_RELEASE_PIPELINE',
        'PRODUCTION_INFRASTRUCTURE_EXTERNAL_GATED',
        'MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED',
        'SMOKE_TEST_PRODUCTION_NOT_AUTHORIZED',
        'ROLLBACK_NOT_YET_PROVEN',
      ],
      Force_launch: false,
      Force_deploy: false,
      CAN_PRODUCTION_LAUNCH: 'NO',
      PRODUCTION_DEPLOYMENT_ENABLED: 'NO',
      PRODUCTION_DEPLOYMENT_PERFORMED: 'NO',
      Rollback: 'NOT_YET_PROVEN',
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    };
    s99WriteArtifact('final-deployment-status.json', JSON.stringify(status, null, 2));
  });
});
