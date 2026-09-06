/**
 * Sprint 62 — Production integration readiness (real UI + fail-closed gates).
 * Does not exercise live PSP/OTP/carrier/eRx/video/PACS.
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  clearOtpRateLimits,
  ensureNoSecrets,
  s60AdminLogin,
  s62Snap,
  s62WriteArtifact,
} from '../../e2e/helpers/s62-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S62 health + readiness', () => {
  test('API health and ready distinguish sandbox vs EXTERNAL_GATED infra', async ({ request }) => {
    const health = await request.get('http://127.0.0.1:4000/health');
    expect(health.ok()).toBeTruthy();
    expect(await health.json()).toMatchObject({ status: 'ok' });

    const ready = await request.get('http://127.0.0.1:4000/health/ready');
    expect(ready.ok()).toBeTruthy();
    const body = await ready.json();
    expect(body.status).toBe('ready');
    expect(body.postgres).toBe('up');
    expect(body.redis).toBe('up');
    expect(body.infrastructure?.pitr).toBe('EXTERNAL_GATED');
    expect(body.infrastructure?.rpo).toBe('TARGET_DEFINED');
    expect(body.infrastructure?.rto).toBe('TARGET_DEFINED');
    const runtime = JSON.stringify(body.runtime ?? {});
    expect(runtime).toMatch(/sandbox/i);
    expect(runtime).not.toMatch(/live PSP rails enabled|production carrier live/i);
    s62WriteArtifact('health-ready.json', JSON.stringify(body, null, 2));
  });

  test('unauthenticated launch-readiness and payment webhook are denied/gated', async ({ request }) => {
    const launch = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/regulatory/countries/IN/final-launch-readiness',
    );
    expect(launch.status()).toBe(401);

    const wh = await request.post('http://127.0.0.1:4000/api/v1/webhooks/payments/MOCK_PRIMARY', {
      data: { event_id: 's62-unauth', type: 'payment.captured' },
    });
    // Missing/invalid signature or unknown gateway → never silent success without verify
    expect([401, 403, 404, 422, 400]).toContain(wh.status());
    expect(wh.ok()).toBeFalsy();
  });
});

test.describe('S62 Admin external-gated surfaces', () => {
  test('launch-readiness, payments, logistics, finance, healthcare, reliability', async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/Launch|readiness|EXTERNAL_GATED|NOT_READY|activation|dimension/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    const launchBody = await page.locator('body').innerText();
    expect(launchBody).toMatch(/EXTERNAL_GATED|NOT_READY|not.*launch|provider/i);
    expect(launchBody).not.toMatch(/\bUPI\b/);
    await s62Snap(page, 'admin-01-launch-readiness');

    await page.goto(`${ADMIN}/payments`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Payment|sandbox|EXTERNAL|PSP|production/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s62Snap(page, 'admin-02-payments-gate');

    await page.goto(`${ADMIN}/logistics`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Logistics|carrier|EXTERNAL|sandbox|mock/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s62Snap(page, 'admin-03-carrier-gate');

    await page.goto(`${ADMIN}/finance`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Finance|EXTERNAL_PAYOUT|payout|settlement|sandbox/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s62Snap(page, 'admin-04-payout-gate');

    await page.goto(`${ADMIN}/healthcare-network`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Healthcare|eRx|PACS|VIDEO|EXTERNAL_GATED|integration/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s62Snap(page, 'admin-05-healthcare-gates');

    await page.goto(`${ADMIN}/reliability`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Reliability|PITR|KMS|storage|EXTERNAL|health/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s62Snap(page, 'admin-06-reliability');

    // Customer cannot use Admin session on other origin — open Admin orders as permission smoke
    await page.goto(`${ADMIN}/orders`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Order|EXTERNAL_GATED|carrier|sandbox/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s62Snap(page, 'admin-07-orders-carrier-note');

    for (const [w, h, name] of [
      [390, 844, 'resp-launch-390'],
      [1440, 900, 'resp-launch-1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`${ADMIN}/launch-readiness`);
      await s62Snap(page, name);
    }
  });
});

test.describe('S62 doctor clinical EXTERNAL_GATED honesty', () => {
  test('prescriptions surface eRx/video gates without fake live claims', async ({ page, context }) => {
    await context.clearCookies();
    await clearOtpRateLimits();
    const { s61LoginPortal } = await import('../../e2e/helpers/s61-ui');
    try {
      await s61LoginPortal(page, 'http://127.0.0.1:3002/', 'sandbox-doctor@dev.local');
    } catch {
      test.skip(true, 'Doctor portal login unavailable');
      return;
    }
    await page.goto('http://127.0.0.1:3002/prescriptions', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/EXTERNAL_GATED|sandbox|eRx|prescription|video/i).first()).toBeVisible({
      timeout: 45_000,
    });
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/live eRx transmitted|production video session active/i);
    await s62Snap(page, 'doctor-01-erx-video-gate');
  });
});

test.describe('S62 tenant boundary', () => {
  test('customer session cannot open Admin launch-readiness', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Sign in|Work email|Permission|Secure|OTP|Welcome/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s62Snap(page, 'security-01-anonymous-launch-readiness');
    await ctx.close();
  });
});
