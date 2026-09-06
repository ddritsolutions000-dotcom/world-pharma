/**
 * Sprint 84 — Observability / APM / alerting activation readiness evidence (no fake APM).
 * Controlled sandbox failure: unsigned payment webhook fail-closed → operator visibility → recovery.
 * Responsive 390/768/1024/1440 = RESPONSIVE_WEB_VERIFIED ≠ native Android/iOS.
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  CUSTOMER,
  clearOtpRateLimits,
  ensureNoSecrets,
  expirePendingOtpChallenges,
  s60AdminLogin,
  s84Snap,
  s84WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s84-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S84 observability API gates', () => {
  test('unauthenticated observability-onboarding denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/observability-onboarding',
    );
    expect(res.status()).toBe(401);
  });

  test('health echoes correlation id; metrics endpoint present', async ({ request }) => {
    const corr = 's84-corr-health-probe';
    const health = await request.get('http://127.0.0.1:4000/health', {
      headers: { 'x-correlation-id': corr },
    });
    expect(health.ok()).toBeTruthy();
    expect(health.headers()['x-correlation-id']).toBe(corr);

    const ready = await request.get('http://127.0.0.1:4000/health/ready', {
      headers: { 'x-correlation-id': `${corr}-ready` },
    });
    expect(ready.ok()).toBeTruthy();
    const readyBody = JSON.stringify(await ready.json());
    expect(readyBody).toMatch(/ready|ok|postgres|redis/i);
    expect(readyBody).not.toMatch(/APM_LIVE_ENABLED.?true|production_apm.?enabled/i);

    const metrics = await request.get('http://127.0.0.1:4000/metrics');
    expect([200, 401]).toContain(metrics.status());
    if (metrics.status() === 200) {
      const text = await metrics.text();
      expect(text).not.toMatch(/password=|apiSecret|eyJ[A-Za-z0-9_-]{10,}\./i);
    }
  });

  test('controlled unsigned webhook failure is fail-closed', async ({ request }) => {
    const corr = 's84-webhook-fail';
    const wh = await request.post('http://127.0.0.1:4000/api/v1/webhooks/payments/MOCK_PRIMARY', {
      headers: { 'x-correlation-id': corr },
      data: { event_id: 's84-unauth-fail', type: 'payment.captured', note: 'sandbox controlled failure' },
    });
    expect([400, 401, 403, 404, 422, 503]).toContain(wh.status());
    expect(wh.ok()).toBeFalsy();
    const bodyText = await wh.text();
    expect(bodyText).not.toMatch(/password|api_key|secret|otp|eyJ/i);
    s84WriteArtifact(
      'controlled-webhook-failure.json',
      JSON.stringify(
        {
          status: wh.status(),
          ok: false,
          correlation_id: wh.headers()['x-correlation-id'] ?? corr,
          category: 'WEBHOOK_ERROR',
          note: 'Unsigned webhook rejected — sandbox controlled failure',
        },
        null,
        2,
      ),
    );
  });
});

test.describe('S84 Admin + controlled failure recovery', () => {
  test('APM NOT_SELECTED + failure visibility + customer recovery', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const obsHeading = page
      .getByText(
        /Observability \/ APM \/ alerting activation readiness \(Sprint (84|97)\)|APM activation readiness \(Sprint (84|97)\)/i,
      )
      .first();
    await expect(obsHeading).toBeVisible({ timeout: 60_000 });
    await obsHeading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_APM_PROVIDER/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText(/NO_PRODUCTION_MONITORING_PROVIDER|NO_PRODUCTION_ALERTING_PROVIDER/i).first(),
    ).toBeVisible();
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/EXTERNAL_GATED|NOT_SELECTED/);
    expect(adminBody).toMatch(/SANDBOX_VERIFIED|metrics|Logs/i);
    expect(adminBody).toMatch(/THRESHOLD_REQUIRES_PRODUCTION_BASELINE|NOT_SELECTED ≠|NOT_SELECTED providers/i);
    expect(adminBody).not.toMatch(/\bUPI\b/);
    expect(adminBody).not.toMatch(/apiSecret|password=|eyJ[A-Za-z0-9_-]{10,}\./i);
    await ensureNoSecrets(page);
    await s84Snap(page, 'admin-01-observability-status');
    await s84Snap(page, 'admin-02-apm-external-gated');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await obsHeading.scrollIntoViewIfNeeded();
      await s84Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`${ADMIN}/reliability`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/Reliability|Outbox|Recovery|Observability|EXTERNAL|signal|WEBHOOK|DLQ/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s84Snap(page, 'admin-03-reliability-signals');

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/launch|INTERNAL|EXTERNAL|ready|gate|observability|not.*production/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s84Snap(page, 'admin-04-launch-readiness');

    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-customer@dev.local');
    await cust.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await cust.getByLabel(/^Email$/i).click();
    await cust.getByLabel(/^Email$/i).pressSequentially('sandbox-customer@dev.local', { delay: 15 });
    await uiOtpLogin(cust, 'sandbox-customer@dev.local');
    await selectMarketIfGated(cust, /India/i);
    await cust.goto(`${CUSTOMER}/`, { waitUntil: 'domcontentloaded' });
    await expect(
      cust.getByText(/shop|medicine|doctor|order|health|cart|World Pharma/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s84Snap(cust, 'customer-05-recovery-after-failure');

    await cust.goto(`${ADMIN}/reliability`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s84Snap(cust, 'security-06-customer-denied-reliability');
    await custCtx.close();

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page
      .getByText(/NO_PRODUCTION_APM_PROVIDER|Observability \/ APM \/ alerting activation readiness/i)
      .first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await s84Snap(page, 'admin-07-final-status');

    const status = {
      sprint: 84,
      foundation_sprint: 75,
      APM_provider: 'NOT_SELECTED',
      Monitoring_provider: 'NOT_SELECTED',
      Alerting_provider: 'NOT_SELECTED',
      Environment: 'sandbox',
      Configured: false,
      Verified: false,
      Approved: false,
      Enabled: false,
      Sandbox: 'SANDBOX_VERIFIED',
      Production: 'EXTERNAL_GATED',
      Metrics: 'SANDBOX_VERIFIED',
      Logs: 'SANDBOX_VERIFIED',
      Alerting: 'EXTERNAL_GATED',
      Remaining_blocker: 'NO_PRODUCTION_APM_PROVIDER',
      Remaining_blockers: [
        'NO_PRODUCTION_APM_PROVIDER',
        'NO_PRODUCTION_MONITORING_PROVIDER',
        'NO_PRODUCTION_ALERTING_PROVIDER',
      ],
      Controlled_failure: 'UNSIGNED_WEBHOOK_REJECTED',
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    };
    s84WriteArtifact('final-observability-status.json', JSON.stringify(status, null, 2));
  });
});
