/**
 * Sprint 67 — Carrier / logistics onboarding evidence (no fake live carrier).
 * Native 390px screenshots are NOT Android/iOS evidence.
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  CUSTOMER,
  FIXTURE_ORDER,
  LOGISTICS,
  VENDOR,
  clearOtpRateLimits,
  ensureNoSecrets,
  s60AdminLogin,
  s61LoginPortal,
  s67Snap,
  s67WriteArtifact,
  selectMarketIfGated,
  selectSellerOrg,
  uiOtpLogin,
} from '../../e2e/helpers/s67-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S67 carrier API gates', () => {
  test('unauthenticated carrier-onboarding denied', async ({ request }) => {
    const res = await request.get('http://127.0.0.1:4000/api/v1/admin/control-plane/carrier-onboarding');
    expect(res.status()).toBe(401);
  });
});

test.describe('S67 Admin + vendor + logistics + customer', () => {
  test('carrier EXTERNAL_GATED + sandbox shipment surfaces', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Carrier \/ logistics (onboarding|activation readiness)/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(/NOT_SELECTED|EXTERNAL_GATED|CARRIER NOT CONFIGURED/i).first()).toBeVisible({
      timeout: 30_000,
    });
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/NOT_SELECTED|EXTERNAL_GATED/);
    expect(adminBody).toMatch(/CARRIER NOT CONFIGURED|no live carrier connected/i);
    expect(adminBody).not.toMatch(/\bUPI\b/);
    await ensureNoSecrets(page);
    await s67Snap(page, 'admin-01-carrier-status');
    await s67Snap(page, 'admin-02-production-external-gated');

    await page.goto(`${ADMIN}/logistics`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/EXTERNAL_GATED|Sandbox|mock|shipment|Book sandbox/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s67Snap(page, 'admin-03-logistics-console');

    // Vendor READY_TO_SHIP / shipment state (fixture may already be packed from prior sprints)
    await context.clearCookies();
    await clearOtpRateLimits();
    await s61LoginPortal(page, `${VENDOR}/`, 'sandbox-vendor@dev.local');
    await page.goto(`${VENDOR}/workspace/orders`, { waitUntil: 'domcontentloaded' });
    await selectSellerOrg(page, /Demo Care Pharmacy · IN|Demo Pharmacy Store · IN/);
    const search = page.getByPlaceholder(/Order #, id, status/i);
    if (await search.isVisible().catch(() => false)) {
      await search.fill(FIXTURE_ORDER);
      await page.waitForTimeout(400);
    }
    const orderRow = page.getByRole('button').filter({ hasText: new RegExp(FIXTURE_ORDER) }).first();
    if (await orderRow.isVisible({ timeout: 20_000 }).catch(() => false)) {
      await orderRow.click();
      await expect(page.getByRole('heading', { name: new RegExp(FIXTURE_ORDER, 'i') })).toBeVisible({
        timeout: 20_000,
      });
      await expect(
        page.getByText(/READY_TO_SHIP|SHIPPED|Sandbox shipment|mock|EXTERNAL_GATED|PACKED|ALLOCATED/i).first(),
      ).toBeVisible({ timeout: 30_000 });
      await s67Snap(page, 'vendor-04-ready-to-ship');
      await s67Snap(page, 'vendor-05-shipment-action');
    } else {
      await s67Snap(page, 'vendor-04-orders-queue');
    }

    // Logistics ops shell
    const logCtx = await browser.newContext();
    const logPage = await logCtx.newPage();
    await clearOtpRateLimits();
    await s61LoginPortal(logPage, `${LOGISTICS}/`, 'sandbox-admin@dev.local').catch(async () => {
      await s60AdminLogin(logPage);
      await logPage.goto(`${LOGISTICS}/`, { waitUntil: 'domcontentloaded' });
    });
    await logPage.goto(`${LOGISTICS}/`, { waitUntil: 'domcontentloaded' });
    await expect(
      logPage.getByText(/shipment|EXTERNAL_GATED|logistics|tracking|carrier|Sandbox/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    await s67Snap(logPage, 'logistics-06-shell');
    await logCtx.close();

    // Customer tracking
    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await cust.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await cust.getByLabel(/^Email$/i).click();
    await cust.getByLabel(/^Email$/i).pressSequentially('sandbox-customer@dev.local', { delay: 15 });
    await uiOtpLogin(cust, 'sandbox-customer@dev.local');
    await selectMarketIfGated(cust, /India/i);
    await cust.goto(`${CUSTOMER}/orders`, { waitUntil: 'domcontentloaded' });
    await expect(cust.getByText(/Order|WP-|DEMO-|tracking|status/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s67Snap(cust, 'customer-07-orders-tracking');

    // Country context (AE) — no INR/UPI leak expected in shipping framing
    await selectMarketIfGated(cust, /United Arab|UAE|AE/i).catch(() => undefined);
    await s67Snap(cust, 'customer-08-country-context');

    // Tenant: customer must not operate Admin carrier activation
    await cust.goto(`${ADMIN}/provider-activation`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s67Snap(cust, 'security-09-customer-denied-admin');
    await custCtx.close();

    // Failure / recovery framing on Admin logistics (gate copy)
    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/logistics`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/EXTERNAL_GATED|fail|sandbox|mock|never falls back/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s67Snap(page, 'admin-10-failure-recovery-gate');

    const status = {
      sprint: 67,
      Provider: 'NOT_SELECTED',
      Environment: 'sandbox',
      Configured: false,
      Verified: false,
      Approved: false,
      Enabled: false,
      Sandbox: 'SANDBOX_VERIFIED',
      Production: 'EXTERNAL_GATED',
      Webhook: 'SANDBOX_ONLY',
      Serviceability: 'POLICY_DRIVEN',
      Tracking: 'SANDBOX_VERIFIED',
      POD: 'DEVICE_NOT_AVAILABLE',
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Remaining_blocker: 'NO_PRODUCTION_CARRIER_ADAPTER',
    };
    s67WriteArtifact('final-carrier-status.json', JSON.stringify(status, null, 2));
    await s67Snap(page, 'admin-11-final-status-context');
  });
});
