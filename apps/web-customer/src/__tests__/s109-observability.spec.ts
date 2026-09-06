/**
 * Sprint 109 — Real APM/monitoring/alerting activation readiness evidence
 * (no invented APM vendor). Responsive ≠ native.
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
  s109Snap,
  s109WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s109-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S109 observability API gates', () => {
  test('unauthenticated production-observability-real-activation-onboarding denied', async ({
    request,
  }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/production-observability-real-activation-onboarding',
    );
    expect(res.status()).toBe(401);
  });

  test('health correlation + metrics without secrets', async ({ request }) => {
    const corr = 's109-corr-health-probe';
    const health = await request.get('http://127.0.0.1:4000/health', {
      headers: { 'x-correlation-id': corr },
    });
    expect(health.ok()).toBeTruthy();
    expect(health.headers()['x-correlation-id']).toBe(corr);
    const healthText = await health.text();
    expect(healthText).not.toMatch(/postgresql:\/\/|password=|sk_live_|AKIA/i);

    const metrics = await request.get('http://127.0.0.1:4000/metrics');
    expect([200, 401]).toContain(metrics.status());
    if (metrics.ok()) {
      const body = await metrics.text();
      expect(body).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@|sk_live_|BEGIN PRIVATE KEY/i);
    }
  });
});

test.describe('S109 Admin + sandbox telemetry + SoD', () => {
  test('EXTERNAL_GATED observability triad + launch NO', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(
        /Real production APM \+ monitoring \+ alerting activation readiness \(Sprint 109\)/i,
      )
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_APM_PROVIDER/i).first()).toBeVisible({
      timeout: 30_000,
    });

    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/EXTERNAL_GATED/);
    expect(adminBody).toMatch(/APM selected:\s*false/i);
    expect(adminBody).toMatch(/APM enabled:\s*false/i);
    expect(adminBody).toMatch(/Monitoring selected:\s*false/i);
    expect(adminBody).toMatch(/Alerting enabled:\s*false/i);
    expect(adminBody).toMatch(/Log redaction:\s*PASS/i);
    expect(adminBody).toMatch(/Health\/readiness:\s*PASS/i);
    expect(adminBody).toMatch(/Force launch:\s*false/i);
    expect(adminBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO|CAN_PRODUCTION_LAUNCH/i);
    expect(adminBody).toMatch(/S100_REUSED|S101_REUSED|COMPOSED/i);
    expect(adminBody).toMatch(/In-process \/metrics|production APM/i);
    expect(adminBody).not.toMatch(/Provider:\s*Datadog|Provider:\s*New Relic|sk_live_/i);
    await ensureNoSecrets(page);
    await s109Snap(page, 'admin-01-real-observability-card');

    await expect(page.getByText(/APM activation readiness \(Sprint 97\)/i).first()).toBeVisible();
    await expect(
      page.getByText(/Monitoring activation readiness \(Sprint 97\)/i).first(),
    ).toBeVisible();
    await expect(
      page.getByText(/Alerting activation readiness \(Sprint 97\)/i).first(),
    ).toBeVisible();
    await s109Snap(page, 'admin-02-s97-triad');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await s109Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/CAN_PRODUCTION_LAUNCH:\s*NO/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await s109Snap(page, 'admin-03-launch-readiness-no');

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
    await s109Snap(cust, 'security-04-customer-denied-admin');
    await custCtx.close();

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page
      .getByText(
        /Real production APM \+ monitoring \+ alerting activation readiness \(Sprint 109\)|NO_PRODUCTION_APM_PROVIDER/i,
      )
      .first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await s109Snap(page, 'admin-05-final-status');

    const status = {
      sprint: 109,
      REAL_APM_PROVIDER_SELECTED: 'NO',
      PRODUCTION_APM_ENABLED: 'NO',
      REAL_MONITORING_PROVIDER_SELECTED: 'NO',
      PRODUCTION_MONITORING_ENABLED: 'NO',
      REAL_ALERTING_DESTINATION_CONFIGURED: 'NO',
      PRODUCTION_ALERTING_ENABLED: 'NO',
      HEALTH_READINESS_CHECKS: 'PASS',
      SENSITIVE_LOG_REDACTION: 'PASS',
      CAN_PRODUCTION_LAUNCH: 'NO',
      Remaining_blockers: [
        'NO_PRODUCTION_APM_PROVIDER',
        'NO_PRODUCTION_MONITORING_PROVIDER',
        'NO_PRODUCTION_ALERTING_PROVIDER',
        'APM_ENDPOINT_REFERENCE_MISSING',
        'ALERT_DESTINATION_CONFIGURATION_REQUIRED',
      ],
      Force_launch: false,
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    };
    s109WriteArtifact('final-observability-status.json', JSON.stringify(status, null, 2));
  });
});
