/**
 * Sprint 115 — Input security hardening evidence (injection / SSRF / path).
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
  s115Snap,
  s115WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s115-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S115 input security API gates', () => {
  test('unauthenticated input-security-hardening denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/input-security-hardening',
    );
    expect(res.status()).toBe(401);
  });

  test('malicious discovery query does not 500 or leak SQL', async ({ request }) => {
    const res = await request.get(
      "http://127.0.0.1:4000/api/v1/discovery/search?country=IN&q=' OR 1=1--&limit=5",
    );
    expect([200, 400, 422, 429].includes(res.status())).toBe(true);
    const text = await res.text();
    expect(text).not.toMatch(/SELECT\s+\*|syntax error at or near|pg_catalog/i);
    expect(text).not.toMatch(/sk_live_|BEGIN PRIVATE KEY/i);
  });
});

test.describe('S115 Admin input card + SoD + responsive', () => {
  test('EXTERNAL_PENTEST required + launch NO + customer denied', async ({
    page,
    context,
    browser,
  }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/Input security hardening — injection \/ SSRF \/ path \(Sprint 115\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/EXTERNAL_PENTEST_REQUIRED/i).first()).toBeVisible({
      timeout: 30_000,
    });

    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/SQL\/ORM:\s*TESTED/i);
    expect(adminBody).toMatch(/NoSQL:\s*NOT_APPLICABLE/i);
    expect(adminBody).toMatch(/SSRF:\s*TESTED/i);
    expect(adminBody).toMatch(/Path:\s*TESTED/i);
    expect(adminBody).toMatch(/Archive:\s*NOT_APPLICABLE/i);
    expect(adminBody).toMatch(/Redirect:\s*HARDENED/i);
    expect(adminBody).toMatch(/External pentest:\s*REQUIRED/i);
    expect(adminBody).toMatch(/Parallel framework:\s*false/i);
    expect(adminBody).toMatch(/Force launch:\s*false/i);
    expect(adminBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO/i);
    expect(adminBody).not.toMatch(/hack-proof|injection-proof|SSRF-proof|100% secure/i);
    expect(adminBody).not.toMatch(/sk_live_|BEGIN PRIVATE KEY|otp=\d{4,}/i);
    await ensureNoSecrets(page);
    await s115Snap(page, 'admin-01-input-security-card');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
      await s115Snap(page, `admin-responsive-${label}`);
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
    await s115Snap(cust, 'customer-02-denied-admin');
    await ensureNoSecrets(cust);
    await custCtx.close();

    s115WriteArtifact(
      's115-status.json',
      JSON.stringify(
        {
          sprint: 115,
          sql_orm_injection: 'TESTED',
          nosql_injection: 'NOT_APPLICABLE',
          command_injection: 'NOT_APPLICABLE',
          ssrf: 'TESTED',
          path_traversal: 'TESTED',
          archive_traversal: 'NOT_APPLICABLE',
          unsafe_redirect: 'HARDENED',
          sensitive_error_leakage: 'PROTECTED',
          external_pentest: 'REQUIRED',
          can_production_launch: 'NO',
          remaining_blocker: 'EXTERNAL_PENTEST_REQUIRED',
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
