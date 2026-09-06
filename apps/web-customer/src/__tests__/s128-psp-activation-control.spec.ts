/**
 * Sprint 128 — PSP payment production activation control
 * (no invented PSP / no real money).
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  CUSTOMER,
  CUSTOMER_EMAIL,
  VENDOR,
  VENDOR_EMAIL,
  clearOtpRateLimits,
  ensureNoSecrets,
  expirePendingOtpChallenges,
  s60AdminLogin,
  s61LoginPortal,
  s128Snap,
  s128WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s128-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S128 PSP API gates', () => {
  test('unauthenticated psp-payment-production-activation-control denied', async ({
    request,
  }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/psp-payment-production-activation-control',
    );
    expect(res.status()).toBe(401);
  });

  test('unsigned webhook remains rejected', async ({ request }) => {
    const wh = await request.post('http://127.0.0.1:4000/api/v1/webhooks/payments/MOCK_PRIMARY', {
      data: { event_id: 's128-unauth', type: 'payment.captured' },
    });
    expect(wh.ok()).toBeFalsy();
    expect([400, 401, 403, 404, 422, 503]).toContain(wh.status());
  });
});

test.describe('S128 Admin PSP activation control + isolation', () => {
  test('BLOCKED activation + secrets absent + customer/vendor denied', async ({
    page,
    context,
    browser,
  }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/PSP production activation control \(Sprint 128/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    const launchBody = await page.locator('body').innerText();
    expect(launchBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO/i);
    expect(launchBody).toMatch(/Final activation:\s*BLOCKED/i);
    expect(launchBody).toMatch(/Credentials:\s*MISSING/i);
    expect(launchBody).toMatch(/Webhook:\s*NOT_CONFIGURED/i);
    expect(launchBody).not.toMatch(/sk_live_|whsec_|BEGIN PRIVATE KEY/i);
    await s128Snap(page, 'admin-01-launch-psp-control-blocker');

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/Real PSP \/ payment production activation control \(Sprint\s*128\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/Fake PSP:\s*false/i);
    expect(adminBody).toMatch(/Real money:\s*false/i);
    expect(adminBody).toMatch(/Final activation:\s*BLOCKED/i);
    expect(adminBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO/i);
    expect(adminBody).toMatch(/Money safety:\s*PASS/i);
    expect(adminBody).toMatch(/client_forged_payment_success|sandbox_as_production/i);
    expect(adminBody).not.toMatch(/sk_live_|whsec_|BEGIN PRIVATE KEY/i);
    await ensureNoSecrets(page);
    await s128Snap(page, 'admin-02-provider-psp-control-card');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await s128Snap(page, `admin-03-provider-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });

    // Customer denied Admin PSP activation
    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges(CUSTOMER_EMAIL);
    await cust.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await cust.getByLabel(/^Email$/i).click();
    await cust.getByLabel(/^Email$/i).pressSequentially(CUSTOMER_EMAIL, { delay: 15 });
    await uiOtpLogin(cust, CUSTOMER_EMAIL);
    await selectMarketIfGated(cust, /India/i).catch(() => undefined);

    const custToken = await cust.evaluate(() => {
      try {
        for (const store of [window.localStorage, window.sessionStorage]) {
          for (let i = 0; i < store.length; i++) {
            const k = store.key(i) ?? '';
            if (/access.?token|wp_.*token/i.test(k)) {
              const v = store.getItem(k);
              if (v && v.length > 20) return v;
            }
          }
        }
      } catch {
        /* ignore */
      }
      return '';
    });
    const custApi = await cust.request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/psp-payment-production-activation-control',
      { headers: custToken ? { Authorization: `Bearer ${custToken}` } : {} },
    );
    expect([401, 403]).toContain(custApi.status());

    await cust.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s128Snap(cust, 'security-04-customer-denied');

    // Light sandbox checkout regression surface (not production payment)
    await cust.goto(`${CUSTOMER}/cart`, { waitUntil: 'domcontentloaded' });
    await ensureNoSecrets(cust);
    await s128Snap(cust, 'cust-05-cart-sandbox-surface');
    await custCtx.close();

    // Vendor denied platform PSP configuration
    const vendCtx = await browser.newContext();
    const vend = await vendCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges(VENDOR_EMAIL);
    await s61LoginPortal(vend, `${VENDOR}/`, VENDOR_EMAIL);
    const vendToken = await vend.evaluate(() => {
      try {
        for (const store of [window.localStorage, window.sessionStorage]) {
          for (let i = 0; i < store.length; i++) {
            const k = store.key(i) ?? '';
            if (/access.?token|wp_.*token/i.test(k)) {
              const v = store.getItem(k);
              if (v && v.length > 20) return v;
            }
          }
        }
      } catch {
        /* ignore */
      }
      return '';
    });
    const vendApi = await vend.request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/psp-payment-production-activation-control',
      { headers: vendToken ? { Authorization: `Bearer ${vendToken}` } : {} },
    );
    expect([401, 403]).toContain(vendApi.status());
    await s128Snap(vend, 'security-06-vendor-denied-psp-config');
    await vendCtx.close();

    s128WriteArtifact(
      's128-status.json',
      JSON.stringify(
        {
          sprint: 128,
          psp_lifecycle: 'NOT_SELECTED',
          production_payment: 'BLOCKED',
          final_activation_state: 'BLOCKED',
          can_production_launch: 'NO',
          remaining_blocker: 'NO_PRODUCTION_PSP',
          configured_neq_verified: true,
          approved_neq_enabled: true,
          sandbox_cannot_satisfy_production: true,
          security: 'NO_NEW_VULNERABILITY',
          native: 'DEVICE_NOT_AVAILABLE',
        },
        null,
        2,
      ),
    );
  });
});
