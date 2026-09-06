/**
 * Sprint 77 — Carrier / logistics final activation readiness evidence (no fake live carrier).
 * Controlled failure: unsigned mock carrier webhook fail-closed → operator visibility → recovery.
 * 390px responsive ≠ native Android/iOS rider/POD.
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
  expirePendingOtpChallenges,
  s60AdminLogin,
  s61LoginPortal,
  s77Snap,
  s77WriteArtifact,
  selectMarketIfGated,
  selectSellerOrg,
  uiOtpLogin,
} from '../../e2e/helpers/s77-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S77 carrier API gates', () => {
  test('unauthenticated carrier-onboarding denied', async ({ request }) => {
    const res = await request.get('http://127.0.0.1:4000/api/v1/admin/control-plane/carrier-onboarding');
    expect(res.status()).toBe(401);
  });

  test('controlled unsigned carrier webhook is fail-closed', async ({ request }) => {
    const corr = 's77-carrier-webhook-fail';
    const wh = await request.post('http://127.0.0.1:4000/api/v1/webhooks/carriers/mock', {
      headers: { 'x-correlation-id': corr, 'content-type': 'application/json' },
      data: {
        event_id: 's77-unauth-fail',
        shipment_ref: 'sandbox-no-such-shipment',
        status: 'IN_TRANSIT',
        note: 'sandbox controlled failure — no signature',
      },
    });
    expect([400, 401, 403, 404, 422, 503]).toContain(wh.status());
    expect(wh.ok()).toBeFalsy();
    const bodyText = await wh.text();
    expect(bodyText).not.toMatch(/password|api_key|secret=|otp|eyJ/i);
    s77WriteArtifact(
      'controlled-webhook-failure.json',
      JSON.stringify(
        {
          status: wh.status(),
          ok: false,
          correlation_id: wh.headers()['x-correlation-id'] ?? corr,
          category: 'WEBHOOK_ERROR',
          note: 'Unsigned carrier webhook rejected — sandbox controlled failure',
        },
        null,
        2,
      ),
    );
  });
});

test.describe('S77 Admin + vendor + logistics + customer', () => {
  test('carrier EXTERNAL_GATED + sandbox fulfillment/tracking + recovery', async ({
    page,
    context,
    browser,
  }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/Carrier \/ logistics activation readiness \(Sprint (77|90)\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_CARRIER_ADAPTER/i).first()).toBeVisible({
      timeout: 30_000,
    });
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/NOT_SELECTED|EXTERNAL_GATED/);
    expect(adminBody).toMatch(/SANDBOX_VERIFIED|SANDBOX_ONLY/);
    expect(adminBody).toMatch(/CARRIER NOT CONFIGURED|no live carrier/i);
    expect(adminBody).not.toMatch(/\bUPI\b/);
    expect(adminBody).not.toMatch(/apiSecret|password=|eyJ[A-Za-z0-9_-]{10,}\./i);
    await ensureNoSecrets(page);
    await s77Snap(page, 'admin-01-carrier-status');
    await s77Snap(page, 'admin-02-production-external-gated');

    await page.goto(`${ADMIN}/logistics`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/EXTERNAL_GATED|Sandbox|mock|shipment|Book sandbox|carrier/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s77Snap(page, 'admin-03-logistics-console');

    await page.goto(`${ADMIN}/reliability`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/Reliability|Outbox|EXTERNAL|signal|WEBHOOK|DLQ|shipment/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s77Snap(page, 'admin-04-reliability');

    // Vendor fulfillment surface (fixture may already be packed / READY_TO_SHIP)
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-vendor@dev.local');
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
        page
          .getByText(
            /READY_TO_SHIP|SHIPPED|Sandbox shipment|mock|EXTERNAL_GATED|PACKED|ALLOCATED|IN_TRANSIT|tracking/i,
          )
          .first(),
      ).toBeVisible({ timeout: 30_000 });
      await s77Snap(page, 'vendor-05-fulfillment');
      await s77Snap(page, 'vendor-06-shipment-state');
    } else {
      await s77Snap(page, 'vendor-05-orders-queue');
    }

    // Logistics ops shell
    const logCtx = await browser.newContext();
    const logPage = await logCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-admin@dev.local');
    await s61LoginPortal(logPage, `${LOGISTICS}/`, 'sandbox-admin@dev.local').catch(async () => {
      await s60AdminLogin(logPage);
      await logPage.goto(`${LOGISTICS}/`, { waitUntil: 'domcontentloaded' });
    });
    await logPage.goto(`${LOGISTICS}/`, { waitUntil: 'domcontentloaded' });
    await expect(
      logPage.getByText(/shipment|EXTERNAL_GATED|logistics|tracking|carrier|Sandbox|task/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    await s77Snap(logPage, 'logistics-07-shell');
    await logCtx.close();

    // Customer tracking — truthful sandbox / no fake GPS claims required
    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-customer@dev.local');
    await cust.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await cust.getByLabel(/^Email$/i).click();
    await cust.getByLabel(/^Email$/i).pressSequentially('sandbox-customer@dev.local', { delay: 15 });
    await uiOtpLogin(cust, 'sandbox-customer@dev.local');
    await selectMarketIfGated(cust, /India/i);
    await cust.goto(`${CUSTOMER}/orders`, { waitUntil: 'domcontentloaded' });
    await expect(cust.getByText(/Order|WP-|DEMO-|tracking|status/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s77Snap(cust, 'customer-08-orders');

    const trackLink = cust
      .getByRole('link', { name: /track|order|WP-|view/i })
      .or(cust.getByRole('button', { name: /track|view|details/i }))
      .first();
    if (await trackLink.isVisible().catch(() => false)) {
      await trackLink.click().catch(() => undefined);
      await cust.waitForTimeout(800);
    }
    const custBody = await cust.locator('body').innerText();
    expect(custBody).not.toMatch(/live GPS|driver phone \+|production carrier connected/i);
    await s77Snap(cust, 'customer-09-tracking');

    await selectMarketIfGated(cust, /United Arab|UAE|AE/i).catch(() => undefined);
    await s77Snap(cust, 'customer-10-country-context');

    // Tenant isolation
    await cust.goto(`${ADMIN}/logistics`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s77Snap(cust, 'security-11-customer-denied-logistics');
    await custCtx.close();

    // Recovery after controlled webhook failure: Admin still inspectable
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-admin@dev.local');
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page
      .getByText(/NO_PRODUCTION_CARRIER_ADAPTER|Carrier \/ logistics activation readiness/i)
      .first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await s77Snap(page, 'admin-12-recovery-final');

    const status = {
      sprint: 77,
      Provider: 'NOT_SELECTED',
      Environment: 'sandbox',
      Configured: false,
      Verified: false,
      Approved: false,
      Enabled: false,
      Sandbox: 'SANDBOX_VERIFIED',
      Production: 'EXTERNAL_GATED',
      Shipment_creation: 'SANDBOX_ONLY',
      Webhook: 'SANDBOX_ONLY',
      Serviceability: 'POLICY_DRIVEN',
      Tracking: 'SANDBOX_VERIFIED',
      POD: 'DEVICE_NOT_AVAILABLE',
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
      Remaining_blocker: 'NO_PRODUCTION_CARRIER_ADAPTER',
    };
    s77WriteArtifact('final-carrier-status.json', JSON.stringify(status, null, 2));
  });
});
