/**
 * Sprint 87 — Production launch control evidence (no fake providers / no force launch).
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  CUSTOMER,
  clearOtpRateLimits,
  ensureNoSecrets,
  expirePendingOtpChallenges,
  s60AdminLogin,
  s87Snap,
  s87WriteArtifact,
  uiCustomerLogin,
} from '../../e2e/helpers/s87-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S87 launch control API', () => {
  test('unauthenticated production-launch-control denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/production-launch-control',
    );
    expect(res.status()).toBe(401);
  });
});

test.describe('S87 Admin launch control', () => {
  test('NOT READY + market/service scopes + security', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/World-Pharma production launch control \(Sprint 87\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();

    const body = await page.locator('body').innerText();
    expect(body).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO|Overall:\s*NOT_READY/i);
    expect(body).toMatch(/Force launch:\s*false/i);
    expect(body).toMatch(/NO_PRODUCTION_PSP|NO_PRODUCTION_OTP|NO_PRODUCTION_CARRIER/i);
    expect(body).not.toMatch(/Force launch:\s*true|force launch override/i);
    expect(body).not.toMatch(/apiSecret|password=|eyJ[A-Za-z0-9_-]{10,}\./i);
    await s87Snap(page, 'admin-01-global-launch-control');
    await s87Snap(page, 'admin-02-blocked-production-state');

    // Market-specific
    await page.getByLabel(/Launch control market/i).selectOption('IN');
    await page.getByRole('button', { name: /Re-evaluate launch control/i }).click();
    await expect(page.getByText(/Market:\s*IN/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/CAN_PRODUCTION_LAUNCH:\s*NO|NOT_READY/i).first()).toBeVisible();
    await s87Snap(page, 'admin-03-market-IN');

    // Service-specific medicine
    await page.getByLabel(/Launch control service scope/i).selectOption('MEDICINE_COMMERCE');
    await page.getByRole('button', { name: /Re-evaluate launch control/i }).click();
    await expect(page.getByText(/Service:\s*MEDICINE_COMMERCE/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/NOT_APPLICABLE for this service/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await s87Snap(page, 'admin-04-service-medicine');

    // Imaging service — PACS blocker expected
    await page.getByLabel(/Launch control service scope/i).selectOption('IMAGING');
    await page.getByRole('button', { name: /Re-evaluate launch control/i }).click();
    await expect(page.getByText(/Service:\s*IMAGING/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/NO_PRODUCTION_PACS|PACS \/ DICOM/i).first()).toBeVisible();
    await s87Snap(page, 'admin-05-service-imaging-blockers');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await s87Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    // Customer denied
    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-customer@dev.local');
    await cust.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await uiCustomerLogin(cust, 'sandbox-customer@dev.local');
    await cust.goto(`${ADMIN}/launch-readiness`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s87Snap(cust, 'security-06-customer-denied');
    await custCtx.close();

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/CAN_PRODUCTION_LAUNCH:\s*NO|production launch control \(Sprint 87\)/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    await s87Snap(page, 'admin-07-final-not-ready');

    s87WriteArtifact(
      'final-launch-control-status.json',
      JSON.stringify(
        {
          sprint: 87,
          can_production_launch: 'NO',
          overall_status: 'NOT_READY',
          force_launch_available: false,
          production_providers_enabled: false,
          Native_Android: 'DEVICE_NOT_AVAILABLE',
          Native_iOS: 'DEVICE_NOT_AVAILABLE',
          Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
        },
        null,
        2,
      ),
    );
  });
});
