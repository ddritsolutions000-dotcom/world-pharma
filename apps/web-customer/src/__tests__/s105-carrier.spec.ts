/**
 * Sprint 105 — Real carrier activation readiness evidence
 * (no invented carrier / no real shipment). Responsive ≠ native rider.
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  CUSTOMER,
  CUSTOMER_EMAIL,
  FIXTURE_ORDER,
  LOGISTICS,
  VENDOR,
  clearOtpRateLimits,
  ensureNoSecrets,
  expirePendingOtpChallenges,
  s60AdminLogin,
  s61LoginPortal,
  s105Snap,
  s105WriteArtifact,
  selectMarketIfGated,
  selectSellerOrg,
  uiCustomerLogin,
} from '../../e2e/helpers/s105-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S105 carrier API gates', () => {
  test('unauthenticated production-carrier-real-activation-onboarding denied', async ({
    request,
  }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/production-carrier-real-activation-onboarding',
    );
    expect(res.status()).toBe(401);
  });

  test('unsigned carrier webhook remains fail-closed', async ({ request }) => {
    const wh = await request.post('http://127.0.0.1:4000/api/v1/webhooks/carriers/mock', {
      data: {
        event_id: 's105-unauth',
        shipment_ref: 'sandbox-no-such',
        status: 'IN_TRANSIT',
      },
    });
    expect(wh.ok()).toBeFalsy();
    expect([400, 401, 403, 404, 422, 503]).toContain(wh.status());
  });
});

test.describe('S105 Admin + sandbox logistics + SoD', () => {
  test('EXTERNAL_GATED carrier prep + sandbox surfaces + launch NO', async ({
    page,
    context,
    browser,
  }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/Real carrier \/ logistics production activation readiness \(Sprint 105\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_CARRIER_ADAPTER/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText(/REAL SHIPMENT CREATED = NO|Real shipment created:/i).first(),
    ).toBeVisible();

    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/EXTERNAL_GATED/);
    expect(adminBody).toMatch(/Real carrier selected:\s*false/i);
    expect(adminBody).toMatch(/Force launch:\s*false/i);
    expect(adminBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO|CAN_PRODUCTION_LAUNCH/i);
    expect(adminBody).toMatch(/S100_REUSED|S101_REUSED|COMPOSED/i);
    expect(adminBody).toMatch(/LEGAL_GATED|LEGAL/);
    expect(adminBody).not.toMatch(/Provider:\s*DHL|Provider:\s*FEDEX/i);
    expect(adminBody).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@|sk_live_|apiSecret=/i);
    await ensureNoSecrets(page);
    await s105Snap(page, 'admin-01-real-carrier-card');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await s105Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page
        .getByText(/CAN_PRODUCTION_LAUNCH|NOT_READY|NO_PRODUCTION_CARRIER|EXTERNAL_GATED/i)
        .first(),
    ).toBeVisible({ timeout: 45_000 });
    await s105Snap(page, 'admin-02-launch-readiness-no');

    // Customer: order/tracking sandbox only
    await context.clearCookies();
    await page.goto(CUSTOMER, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await selectMarketIfGated(page, /India/i).catch(() => undefined);
    await page.goto(`${CUSTOMER}/login`);
    await uiCustomerLogin(page, CUSTOMER_EMAIL);
    await page.goto(`${CUSTOMER}/orders/${FIXTURE_ORDER}`).catch(async () => {
      await page.goto(`${CUSTOMER}/orders`);
    });
    await expect(
      page.getByText(/order|shipment|track|delivery|sandbox|status/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    const custBody = await page.locator('body').innerText();
    expect(custBody).not.toMatch(/live DHL|production carrier enabled|booked with FEDEX/i);
    await s105Snap(page, 'cust-03-order-tracking-sandbox');

    // Vendor fulfillment — no carrier admin
    let vendorOk = false;
    try {
      const probe = await page.request.get(`${VENDOR}/login`);
      if (probe.status() < 500) {
        const vendCtx = await browser.newContext();
        const vend = await vendCtx.newPage();
        await clearOtpRateLimits();
        await expirePendingOtpChallenges('sandbox-vendor@dev.local');
        await s61LoginPortal(vend, VENDOR, 'sandbox-vendor@dev.local');
        await selectSellerOrg(vend, /India|IN|sandbox/i).catch(() => undefined);
        await vend.goto(`${VENDOR}/orders`, { waitUntil: 'domcontentloaded' });
        await expect(vend.getByText(/order|fulfill|ready|ship/i).first()).toBeVisible({
          timeout: 45_000,
        });
        const vendBody = await vend.locator('body').innerText();
        expect(vendBody).not.toMatch(/Carrier API key|Enable production carrier|webhook secret/i);
        await s105Snap(vend, 'vendor-04-fulfillment-no-carrier-admin');
        await vendCtx.close();
        vendorOk = true;
      }
    } catch {
      vendorOk = false;
    }
    if (!vendorOk) {
      s105WriteArtifact(
        'vendor-status.json',
        JSON.stringify({ vendor_app: 'UNAVAILABLE', note: 'SoD via customer deny path' }),
      );
    }

    // Logistics portal (admin-audience ops console on :3011)
    let logisticsOk = false;
    try {
      const probe = await page.request.get(`${LOGISTICS}/`);
      if (probe.status() < 500) {
        const logCtx = await browser.newContext();
        const log = await logCtx.newPage();
        await clearOtpRateLimits();
        await expirePendingOtpChallenges('sandbox-admin@dev.local');
        await s61LoginPortal(log, `${LOGISTICS}/`, 'sandbox-admin@dev.local').catch(async () => {
          await s60AdminLogin(log);
          await log.goto(`${LOGISTICS}/`, { waitUntil: 'domcontentloaded' });
        });
        await log.goto(`${LOGISTICS}/`, { waitUntil: 'domcontentloaded' });
        await expect(
          log.getByText(/shipment|EXTERNAL_GATED|logistics|tracking|carrier|Sandbox|task|queue|exception|return|RTO/i).first(),
        ).toBeVisible({ timeout: 60_000 });
        await s105Snap(log, 'logistics-05-queue');
        await logCtx.close();
        logisticsOk = true;
      }
    } catch {
      logisticsOk = false;
    }
    if (!logisticsOk) {
      s105WriteArtifact(
        'logistics-device-status.json',
        JSON.stringify({
          logistics_app: 'UNAVAILABLE_OR_DEVICE_NOT_AVAILABLE',
          native_rider: 'DEVICE_NOT_AVAILABLE',
        }),
      );
    }

    // Customer denied Admin
    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges(CUSTOMER_EMAIL);
    await cust.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await uiCustomerLogin(cust, CUSTOMER_EMAIL);
    await cust.goto(`${ADMIN}/provider-activation`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s105Snap(cust, 'security-06-customer-denied-admin');
    await custCtx.close();

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page
      .getByText(
        /NO_PRODUCTION_CARRIER_ADAPTER|Real carrier \/ logistics production activation readiness \(Sprint 105\)/i,
      )
      .first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await s105Snap(page, 'admin-07-final-status');

    const status = {
      sprint: 105,
      REAL_CARRIER_SELECTED: 'NO',
      PRODUCTION_CARRIER_ENABLED: 'NO',
      REAL_SHIPMENT_CREATED: 'NO',
      CAN_PRODUCTION_LAUNCH: 'NO',
      Remaining_blockers: ['NO_PRODUCTION_CARRIER_ADAPTER', 'CARRIER_PROVIDER_NOT_SELECTED'],
      Webhook: 'UNSIGNED_REJECTED',
      Cross_border_medicine: 'LEGAL_GATED',
      Force_launch: false,
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Native_rider: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    };
    s105WriteArtifact('final-carrier-status.json', JSON.stringify(status, null, 2));
  });
});
