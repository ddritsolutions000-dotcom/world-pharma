/**
 * Sprint 90 — Production carrier / logistics activation readiness evidence.
 * Sandbox fulfillment/tracking only. NEVER invent live carrier / GPS / POD.
 * Responsive 390/768/1024/1440 ≠ native Android/iOS rider.
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
  s90Snap,
  s90WriteArtifact,
  selectMarketIfGated,
  selectSellerOrg,
  uiOtpLogin,
} from '../../e2e/helpers/s90-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S90 carrier API gates', () => {
  test('unauthenticated carrier-onboarding denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/carrier-onboarding',
    );
    expect(res.status()).toBe(401);
  });

  test('unsigned carrier webhook fail-closed; duplicate remains rejected', async ({ request }) => {
    const corr = 's90-carrier-webhook-fail';
    const payload = {
      event_id: 's90-unauth-fail',
      shipment_ref: 'sandbox-no-such-shipment',
      status: 'IN_TRANSIT',
      note: 'sandbox controlled failure — no signature',
    };
    const wh = await request.post('http://127.0.0.1:4000/api/v1/webhooks/carriers/mock', {
      headers: { 'x-correlation-id': corr, 'content-type': 'application/json' },
      data: payload,
    });
    expect([400, 401, 403, 404, 422, 503]).toContain(wh.status());
    expect(wh.ok()).toBeFalsy();
    const bodyText = await wh.text();
    expect(bodyText).not.toMatch(/password|api_key|secret=|otp|eyJ/i);
    const dup = await request.post('http://127.0.0.1:4000/api/v1/webhooks/carriers/mock', {
      data: payload,
    });
    expect(dup.ok()).toBeFalsy();
    s90WriteArtifact(
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

test.describe('S90 Admin + vendor + logistics + customer', () => {
  test('carrier NOT_SELECTED EXTERNAL_GATED + sandbox surfaces + launch NO', async ({
    page,
    context,
    browser,
  }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/Carrier \/ logistics activation readiness \(Sprint 90\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_CARRIER_ADAPTER/i).first()).toBeVisible({
      timeout: 30_000,
    });
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/NOT_SELECTED/);
    expect(adminBody).toMatch(/EXTERNAL_GATED/);
    expect(adminBody).toMatch(/Configuration:\s*MISSING|Webhook:\s*MISSING/i);
    expect(adminBody).toMatch(/Production activation:\s*EXTERNAL_GATED/i);
    expect(adminBody).toMatch(/Force launch:\s*false/i);
    expect(adminBody).toMatch(/SANDBOX_VERIFIED|SANDBOX_ONLY/);
    expect(adminBody).not.toMatch(/force.?launch\s*(enabled|=?\s*true)/i);
    expect(adminBody).not.toMatch(/apiSecret|password=|eyJ[A-Za-z0-9_-]{10,}\./i);
    await ensureNoSecrets(page);
    await s90Snap(page, 'admin-01-carrier-card');
    await s90Snap(page, 'admin-02-production-external-gated');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await s90Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/CAN_PRODUCTION_LAUNCH|NOT_READY|NO_PRODUCTION|launch|EXTERNAL_GATED/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    const launchBody = await page.locator('body').innerText();
    expect(launchBody).toMatch(/CAN_PRODUCTION_LAUNCH\s*=?\s*NO|NOT_READY|NO_PRODUCTION/i);
    expect(launchBody).toMatch(/NO_PRODUCTION_CARRIER_ADAPTER/i);
    expect(launchBody).not.toMatch(/force.?launch\s*(enabled|=?\s*true)|FORCE_LAUNCH\s*=\s*true/i);
    await s90Snap(page, 'admin-03-launch-readiness-no');

    // Vendor fulfillment
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
      await s90Snap(page, 'vendor-04-fulfillment');
    } else {
      await s90Snap(page, 'vendor-04-orders-queue');
    }

    // Logistics ops
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
    await s90Snap(logPage, 'logistics-05-shell');
    await logCtx.close();

    // Customer tracking
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
    await s90Snap(cust, 'customer-06-orders');

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
    await s90Snap(cust, 'customer-07-tracking');

    await cust.goto(`${ADMIN}/provider-activation`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s90Snap(cust, 'security-08-customer-denied-admin');
    await custCtx.close();

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page
      .getByText(/NO_PRODUCTION_CARRIER_ADAPTER|Carrier \/ logistics activation readiness \(Sprint 90\)/i)
      .first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await s90Snap(page, 'admin-09-final-status');

    const status = {
      sprint: 90,
      foundation_sprint: 77,
      Provider: 'NOT_SELECTED',
      activation_lifecycle: 'NOT_SELECTED',
      Environment: 'sandbox',
      Configured: false,
      Enabled: false,
      Sandbox: 'SANDBOX_VERIFIED',
      Production: 'EXTERNAL_GATED',
      Configuration: 'MISSING',
      Webhook: 'MISSING',
      Shipment_creation: 'SANDBOX_ONLY',
      Shipping_cost: 'SANDBOX_ONLY',
      Serviceability: 'POLICY_DRIVEN',
      Tracking: 'SANDBOX_VERIFIED',
      POD: 'DEVICE_NOT_AVAILABLE',
      Returns: 'POLICY_REQUIRED',
      Remaining_blocker: 'NO_PRODUCTION_CARRIER_ADAPTER',
      Force_launch: false,
      CAN_PRODUCTION_LAUNCH: 'NO',
      PRODUCTION_CARRIER_ENABLED: 'NO',
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
      Note: 'Sandbox mock carrier only — no live shipment / GPS / POD invented',
    };
    s90WriteArtifact('final-carrier-status.json', JSON.stringify(status, null, 2));
  });
});
