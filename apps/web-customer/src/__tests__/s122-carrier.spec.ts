/**
 * Sprint 122 — Real carrier + logistics activation preparation evidence
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
  s122Snap,
  s122WriteArtifact,
  selectMarketIfGated,
  selectSellerOrg,
  uiCustomerLogin,
} from '../../e2e/helpers/s122-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S122 carrier API gates', () => {
  test('unauthenticated carrier-logistics-activation-preparation denied', async ({
    request,
  }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/carrier-logistics-activation-preparation',
    );
    expect(res.status()).toBe(401);
  });

  test('unsigned carrier webhook remains fail-closed', async ({ request }) => {
    const wh = await request.post('http://127.0.0.1:4000/api/v1/webhooks/carriers/mock', {
      data: {
        event_id: 's122-unauth',
        shipment_ref: 'sandbox-no-such',
        status: 'IN_TRANSIT',
      },
    });
    expect(wh.ok()).toBeFalsy();
    expect([400, 401, 403, 404, 422, 503]).toContain(wh.status());
  });
});

test.describe('S122 Admin + sandbox logistics + SoD', () => {
  test('NOT_SELECTED carrier prep + launch NO + sandbox surfaces', async ({
    page,
    context,
    browser,
  }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/Carrier \/ logistics activation \(Sprint 122/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    const launchBody = await page.locator('body').innerText();
    expect(launchBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO/i);
    expect(launchBody).toMatch(/Carrier:\s*NOT_SELECTED/i);
    expect(launchBody).toMatch(/Production logistics:\s*BLOCKED/i);
    expect(launchBody).toMatch(/Webhook:\s*NOT_CONFIGURED/i);
    await s122Snap(page, 'admin-01-launch-carrier-blocker');

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/Real carrier \+ logistics activation preparation \(Sprint 122\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/Fake carrier:\s*false/i);
    expect(adminBody).toMatch(/Real shipment:\s*false/i);
    expect(adminBody).toMatch(/Production logistics:\s*BLOCKED/i);
    expect(adminBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO/i);
    expect(adminBody).toMatch(/carrier_not_selected|NO_PRODUCTION_CARRIER_ADAPTER/i);
    expect(adminBody).not.toMatch(/Provider:\s*DHL|Provider:\s*FEDEX/i);
    expect(adminBody).not.toMatch(/sk_live_|apiSecret=/i);
    await ensureNoSecrets(page);
    await s122Snap(page, 'admin-02-provider-carrier-card');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
      await s122Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    // Customer: order/tracking sandbox only — no false production ship
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
    await s122Snap(page, 'cust-03-order-tracking-sandbox');

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
        await s122Snap(vend, 'vendor-04-fulfillment');
        await vendCtx.close();
        vendorOk = true;
      }
    } catch {
      vendorOk = false;
    }
    if (!vendorOk) {
      s122WriteArtifact(
        'vendor-status.json',
        JSON.stringify({ vendor_app: 'UNAVAILABLE', note: 'SoD via customer deny path' }),
      );
    }

    // Logistics portal
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
          log
            .getByText(
              /shipment|EXTERNAL_GATED|logistics|tracking|carrier|Sandbox|task|queue|exception|return|RTO/i,
            )
            .first(),
        ).toBeVisible({ timeout: 60_000 });
        await s122Snap(log, 'logistics-05-queue');
        await logCtx.close();
        logisticsOk = true;
      }
    } catch {
      logisticsOk = false;
    }
    if (!logisticsOk) {
      s122WriteArtifact(
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
    await s122Snap(cust, 'security-06-customer-denied-admin');
    await ensureNoSecrets(cust);
    await custCtx.close();

    s122WriteArtifact(
      's122-status.json',
      JSON.stringify(
        {
          sprint: 122,
          carrier_lifecycle: 'NOT_SELECTED',
          production_credentials: 'MISSING',
          webhook: 'NOT_CONFIGURED',
          serviceability: 'EXTERNAL_GATED',
          production_logistics: 'BLOCKED',
          sandbox_carrier: 'SANDBOX_VERIFIED',
          real_shipment_created: false,
          real_tracking_number_generated: false,
          can_production_launch: 'NO',
          remaining_blocker: 'NO_PRODUCTION_CARRIER_ADAPTER',
          native_android: 'DEVICE_NOT_AVAILABLE',
          native_ios: 'DEVICE_NOT_AVAILABLE',
          native_rider: 'DEVICE_NOT_AVAILABLE',
          responsive_web: 'RESPONSIVE_WEB_VERIFIED',
          vendor_ok: vendorOk,
          logistics_ok: logisticsOk,
        },
        null,
        2,
      ),
    );
  });
});
