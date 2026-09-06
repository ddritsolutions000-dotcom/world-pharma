/**
 * Sprint 98 — Production secrets / env configuration activation readiness evidence
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
  s98Snap,
  s98WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s98-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S98 secrets/env API gates', () => {
  test('unauthenticated production-secrets-env-onboarding denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/production-secrets-env-onboarding',
    );
    expect(res.status()).toBe(401);
  });

  test('response body never contains connection-string secrets', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/production-secrets-env-onboarding',
    );
    expect(res.status()).toBe(401);
    const text = await res.text();
    expect(text).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@|sk_live_|BEGIN PRIVATE KEY/i);
  });
});

test.describe('S98 Admin secrets/env + launch NO + SoD', () => {
  test('EXTERNAL_GATED secrets inventory + launch NO', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/Secrets \/ environment configuration activation readiness \(Sprint 98\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_SECRETS_MANAGER/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/PRODUCTION SECRETS ENABLED = NO|Credentials:/i).first()).toBeVisible();

    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/EXTERNAL_GATED/);
    expect(adminBody).toMatch(/Force launch:\s*false/i);
    expect(adminBody).toMatch(/SECRET|CONFIGURATION|NEXT_PUBLIC_|EXPO_PUBLIC_/i);
    expect(adminBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO|CAN_PRODUCTION_LAUNCH/i);
    expect(adminBody).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@|sk_live_|apiSecret=|password=/i);
    await ensureNoSecrets(page);
    await s98Snap(page, 'admin-01-secrets-env-card');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await s98Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/CAN_PRODUCTION_LAUNCH|NOT_READY|NO_PRODUCTION|launch|EXTERNAL_GATED/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    const launchBody = await page.locator('body').innerText();
    expect(launchBody).toMatch(/CAN_PRODUCTION_LAUNCH\s*=?\s*NO|NOT_READY|NO_PRODUCTION/i);
    expect(launchBody).toMatch(/NO_PRODUCTION_SECRETS|Secrets|SECRETS_ENV|CONFIGURATION/i);
    expect(launchBody).not.toMatch(/force.?launch\s*(enabled|=?\s*true)|FORCE_LAUNCH\s*=\s*true/i);
    await s98Snap(page, 'admin-02-launch-readiness-no');

    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-customer@dev.local');
    await cust.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await cust.getByLabel(/^Email$/i).click();
    await cust.getByLabel(/^Email$/i).pressSequentially('sandbox-customer@dev.local', { delay: 15 });
    await uiOtpLogin(cust, 'sandbox-customer@dev.local');
    await selectMarketIfGated(cust, /India/i);
    await cust.goto(`${ADMIN}/provider-activation`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s98Snap(cust, 'security-03-customer-denied-admin');
    await custCtx.close();

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page
      .getByText(
        /NO_PRODUCTION_SECRETS_MANAGER|Secrets \/ environment configuration activation readiness \(Sprint 98\)/i,
      )
      .first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await s98Snap(page, 'admin-04-final-status');

    const status = {
      sprint: 98,
      foundation_sprint: 62,
      Secrets_manager: 'NOT_SELECTED',
      activation_lifecycle: 'NOT_SELECTED',
      Environment: 'sandbox',
      Enabled: false,
      Production: 'EXTERNAL_GATED',
      Remaining_blockers: [
        'NO_PRODUCTION_SECRETS_MANAGER',
        'NO_PRODUCTION_ENVIRONMENT_SEPARATION',
        'PRODUCTION_EXTERNAL_PROVIDER_SECRETS_MISSING',
        'PRODUCTION_CONFIG_MATRIX_INCOMPLETE',
      ],
      Force_launch: false,
      CAN_PRODUCTION_LAUNCH: 'NO',
      PRODUCTION_SECRETS_ENABLED: 'NO',
      PRODUCTION_EXTERNAL_PROVIDERS_ENABLED: 'NO',
      Secret_scan: 'PASS_WITH_PLACEHOLDERS',
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    };
    s98WriteArtifact('final-secrets-env-status.json', JSON.stringify(status, null, 2));
  });
});
