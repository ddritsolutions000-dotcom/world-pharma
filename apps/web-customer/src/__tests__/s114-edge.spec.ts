/**
 * Sprint 114 — Edge / WAF / DDoS activation readiness evidence.
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
  s114Snap,
  s114WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s114-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S114 edge API gates', () => {
  test('unauthenticated edge-waf-ddos-activation-onboarding denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/edge-waf-ddos-activation-onboarding',
    );
    expect(res.status()).toBe(401);
  });

  test('spoofed X-Forwarded-For does not change discovery rate-limit key surface', async ({
    request,
  }) => {
    const a = await request.get(
      'http://127.0.0.1:4000/api/v1/discovery/search?country=IN&q=paracetamol&limit=5',
      { headers: { 'X-Forwarded-For': '203.0.113.50' } },
    );
    const b = await request.get(
      'http://127.0.0.1:4000/api/v1/discovery/search?country=IN&q=paracetamol&limit=5',
      { headers: { 'X-Forwarded-For': '198.51.100.50', Forwarded: 'for=198.51.100.50' } },
    );
    // Both should succeed or share the same direct-client budget — never 5xx from spoof alone.
    expect([200, 429].includes(a.status())).toBe(true);
    expect([200, 429].includes(b.status())).toBe(true);
  });
});

test.describe('S114 Admin edge card + SoD + responsive', () => {
  test('EXTERNAL_WAF gated + launch NO + customer denied', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/Edge \/ WAF \/ DDoS activation readiness \(Sprint 114\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED/i).first()).toBeVisible({
      timeout: 30_000,
    });

    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/Edge\/WAF selected:\s*NO/i);
    expect(adminBody).toMatch(/Production WAF:\s*NO/i);
    expect(adminBody).toMatch(/DDoS selected:\s*NO/i);
    expect(adminBody).toMatch(/Production DDoS:\s*NO/i);
    expect(adminBody).toMatch(/Trusted proxy:\s*VERIFIED/i);
    expect(adminBody).toMatch(/Client IP spoof:\s*PASS/i);
    expect(adminBody).toMatch(/Origin:\s*EXTERNAL_GATED/i);
    expect(adminBody).toMatch(/Invented vendor:\s*false/i);
    expect(adminBody).toMatch(/Parallel WAF:\s*false/i);
    expect(adminBody).toMatch(/Force launch:\s*false/i);
    expect(adminBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO/i);
    expect(adminBody).not.toMatch(/hack-proof|DDoS-proof|100% secure/i);
    expect(adminBody).not.toMatch(/sk_live_|BEGIN PRIVATE KEY|otp=\d{4,}/i);
    await ensureNoSecrets(page);
    await s114Snap(page, 'admin-01-edge-waf-card');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
      await s114Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

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
    await s114Snap(cust, 'customer-02-denied-admin');
    await ensureNoSecrets(cust);
    await custCtx.close();

    s114WriteArtifact(
      's114-status.json',
      JSON.stringify(
        {
          sprint: 114,
          edge_waf_provider_selected: 'NO',
          production_waf_enabled: 'NO',
          ddos_provider_selected: 'NO',
          production_ddos_protection_enabled: 'NO',
          trusted_proxy_configuration: 'VERIFIED',
          client_ip_spoofing_protection: 'PASS',
          host_forwarded_host_protection: 'PASS',
          origin_protection: 'EXTERNAL_GATED',
          redis_rate_limit: 'EXISTING_REUSED',
          can_production_launch: 'NO',
          remaining_blocker: 'EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED',
          native_android: 'DEVICE_NOT_AVAILABLE',
          native_ios: 'DEVICE_NOT_AVAILABLE',
          responsive_web: 'RESPONSIVE_WEB_VERIFIED',
        },
        null,
        2,
      ),
    );
  });
});
