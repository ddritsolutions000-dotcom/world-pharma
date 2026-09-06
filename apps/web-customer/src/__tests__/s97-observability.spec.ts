/**
 * Sprint 97 — Production APM / monitoring / alerting activation readiness evidence
 * (no fake APM). Responsive ≠ native.
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  CUSTOMER,
  clearOtpRateLimits,
  ensureNoSecrets,
  expirePendingOtpChallenges,
  s60AdminLogin,
  s97Snap,
  s97WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s97-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S97 observability API gates', () => {
  test('unauthenticated observability-onboarding denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/observability-onboarding',
    );
    expect(res.status()).toBe(401);
  });

  test('health correlation + metrics without secrets', async ({ request }) => {
    const corr = 's97-corr-health-probe';
    const health = await request.get('http://127.0.0.1:4000/health', {
      headers: { 'x-correlation-id': corr },
    });
    expect(health.ok()).toBeTruthy();
    expect(health.headers()['x-correlation-id']).toBe(corr);

    const metrics = await request.get('http://127.0.0.1:4000/metrics');
    expect([200, 401]).toContain(metrics.status());
    if (metrics.status() === 200) {
      const text = await metrics.text();
      expect(text).not.toMatch(/password=|otp=|apiSecret|eyJ[A-Za-z0-9_-]{10,}\./i);
    }
  });
});

test.describe('S97 Admin triad + launch NO + SoD', () => {
  test('EXTERNAL_GATED APM/Monitoring/Alerting + launch NO', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const apmHeading = page.getByText(/APM activation readiness \(Sprint 97\)/i).first();
    await expect(apmHeading).toBeVisible({ timeout: 60_000 });
    await apmHeading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_APM_PROVIDER/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Monitoring activation readiness \(Sprint 97\)/i).first()).toBeVisible();
    await expect(page.getByText(/NO_PRODUCTION_MONITORING_PROVIDER/i).first()).toBeVisible();
    await expect(page.getByText(/Alerting activation readiness \(Sprint 97\)/i).first()).toBeVisible();
    await expect(page.getByText(/NO_PRODUCTION_ALERTING_PROVIDER/i).first()).toBeVisible();

    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/EXTERNAL_GATED/);
    expect(adminBody).toMatch(/Configuration:\s*MISSING|Credentials:\s*MISSING/i);
    expect(adminBody).toMatch(/Force launch:\s*false/i);
    expect(adminBody).toMatch(/\/metrics|not production APM|In-process/i);
    expect(adminBody).toMatch(/THRESHOLD_REQUIRES_PRODUCTION_BASELINE|Destinations/i);
    expect(adminBody).not.toMatch(/force.?launch\s*(enabled|=?\s*true)/i);
    expect(adminBody).not.toMatch(/password=|apiSecret|eyJ[A-Za-z0-9_-]{10,}\./i);
    await ensureNoSecrets(page);
    await s97Snap(page, 'admin-01-apm-card');
    await s97Snap(page, 'admin-02-monitoring-card');
    await s97Snap(page, 'admin-03-alerting-card');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await apmHeading.scrollIntoViewIfNeeded();
      await s97Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`${ADMIN}/reliability`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/Reliability|Observability|APM|EXTERNAL_GATED|metrics|signals/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s97Snap(page, 'admin-04-reliability');

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/CAN_PRODUCTION_LAUNCH|NOT_READY|NO_PRODUCTION|launch|EXTERNAL_GATED/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    const launchBody = await page.locator('body').innerText();
    expect(launchBody).toMatch(/CAN_PRODUCTION_LAUNCH\s*=?\s*NO|NOT_READY|NO_PRODUCTION/i);
    expect(launchBody).toMatch(
      /NO_PRODUCTION_APM|NO_PRODUCTION_MONITORING|NO_PRODUCTION_ALERTING/i,
    );
    expect(launchBody).not.toMatch(/force.?launch\s*(enabled|=?\s*true)|FORCE_LAUNCH\s*=\s*true/i);
    await s97Snap(page, 'admin-05-launch-readiness-no');

    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-customer@dev.local');
    await cust.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await cust.getByLabel(/^Email$/i).click();
    await cust.getByLabel(/^Email$/i).pressSequentially('sandbox-customer@dev.local', { delay: 15 });
    await uiOtpLogin(cust, 'sandbox-customer@dev.local');
    await selectMarketIfGated(cust, /India/i);
    await cust.goto(`${ADMIN}/reliability`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s97Snap(cust, 'security-06-customer-denied-reliability');
    await cust.goto(`${ADMIN}/provider-activation`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s97Snap(cust, 'security-07-customer-denied-admin');
    await custCtx.close();

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page
      .getByText(/NO_PRODUCTION_APM_PROVIDER|APM activation readiness \(Sprint 97\)/i)
      .first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await s97Snap(page, 'admin-08-final-status');

    const status = {
      sprint: 97,
      foundation_sprint: 84,
      APM: 'NOT_SELECTED',
      Monitoring: 'NOT_SELECTED',
      Alerting: 'NOT_SELECTED',
      activation_lifecycle: 'NOT_SELECTED',
      Environment: 'sandbox',
      Enabled: false,
      Sandbox_metrics: 'SANDBOX_VERIFIED',
      Production: 'EXTERNAL_GATED',
      Remaining_blockers: [
        'NO_PRODUCTION_APM_PROVIDER',
        'NO_PRODUCTION_MONITORING_PROVIDER',
        'NO_PRODUCTION_ALERTING_PROVIDER',
      ],
      Force_launch: false,
      CAN_PRODUCTION_LAUNCH: 'NO',
      PRODUCTION_APM_ENABLED: 'NO',
      PRODUCTION_MONITORING_ENABLED: 'NO',
      PRODUCTION_ALERTING_ENABLED: 'NO',
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    };
    s97WriteArtifact('final-observability-status.json', JSON.stringify(status, null, 2));
  });
});
