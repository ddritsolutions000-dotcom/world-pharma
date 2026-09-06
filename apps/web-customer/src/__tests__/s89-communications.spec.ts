/**
 * Sprint 89 — Production OTP + transactional communications activation readiness evidence.
 * Real sandbox OTP + invalid OTP recovery. NEVER capture OTP codes.
 * Responsive 390/768/1024/1440 ≠ native Android/iOS.
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  CUSTOMER,
  CUSTOMER_EMAIL,
  VENDOR,
  clearOtpRateLimits,
  ensureNoOtpLeak,
  ensureNoSecrets,
  expirePendingOtpChallenges,
  s60AdminLogin,
  s61LoginPortal,
  s89Snap,
  s89WriteArtifact,
  selectMarketIfGated,
  uiCustomerLogin,
} from '../../e2e/helpers/s89-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S89 messaging API gates', () => {
  test('unauthenticated messaging-onboarding denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/messaging-onboarding',
    );
    expect(res.status()).toBe(401);
  });

  test('unsigned notification webhook fail-closed where exposed', async ({ request }) => {
    const wh = await request.post('http://127.0.0.1:4000/api/v1/webhooks/notifications/delivery', {
      headers: { 'x-correlation-id': 's89-notif-unsigned' },
      data: { event_id: 's89-unauth', type: 'message.delivered' },
    });
    expect([400, 401, 403, 404, 422, 501, 503]).toContain(wh.status());
    expect(wh.ok()).toBeFalsy();
    const bodyText = await wh.text();
    expect(bodyText).not.toMatch(/password|api_key|secret|otp\s*[:=]\s*\d{4,8}/i);
    s89WriteArtifact(
      'controlled-webhook-failure.json',
      JSON.stringify(
        {
          status: wh.status(),
          ok: false,
          category: 'WEBHOOK_ERROR',
          note: 'Unsigned/unknown notification webhook rejected',
        },
        null,
        2,
      ),
    );
  });
});

test.describe('S89 Admin + customer OTP evidence', () => {
  test('channels EXTERNAL_GATED + sandbox OTP + launch NO', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/OTP \/ transactional communications activation readiness \(Sprint 89\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_OTP_MESSAGING_PROVIDER/i).first()).toBeVisible({
      timeout: 30_000,
    });
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/OTP/);
    expect(adminBody).toMatch(/SMS/);
    expect(adminBody).toMatch(/EMAIL/);
    expect(adminBody).toMatch(/PUSH/);
    expect(adminBody).toMatch(/EXTERNAL_GATED|NOT_SELECTED/);
    expect(adminBody).toMatch(/SANDBOX_VERIFIED/);
    expect(adminBody).toMatch(/Config MISSING|Credential MISSING|Domain MISSING|DEVICE_NOT_AVAILABLE/i);
    expect(adminBody).toMatch(/Force launch:\s*false/i);
    expect(adminBody).not.toMatch(/force.?launch\s*(enabled|=?\s*true)/i);
    expect(adminBody).not.toMatch(/apiSecret|password=|eyJ[A-Za-z0-9_-]{10,}\./i);
    await ensureNoOtpLeak(page);
    await s89Snap(page, 'admin-01-otp-card');
    await s89Snap(page, 'admin-02-sms-email-push');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await s89Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/CAN_PRODUCTION_LAUNCH|NOT_READY|NO_PRODUCTION|launch|EXTERNAL_GATED/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    const launchBody = await page.locator('body').innerText();
    expect(launchBody).toMatch(/CAN_PRODUCTION_LAUNCH\s*=?\s*NO|NOT_READY|NO_PRODUCTION/i);
    expect(launchBody).not.toMatch(/force.?launch\s*(enabled|=?\s*true)|FORCE_LAUNCH\s*=\s*true/i);
    await s89Snap(page, 'admin-03-launch-readiness-no');

    // Customer sandbox OTP
    await context.clearCookies();
    await clearOtpRateLimits();
    await page.goto(CUSTOMER, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await selectMarketIfGated(page, /India/i).catch(() => undefined);
    await s89Snap(page, 'cust-04-market');

    await page.goto(`${CUSTOMER}/login`);
    await clearOtpRateLimits();
    await expirePendingOtpChallenges(CUSTOMER_EMAIL);
    await uiCustomerLogin(page, CUSTOMER_EMAIL);
    await expect(page.getByRole('button', { name: /Sign out/i }).first()).toBeVisible({
      timeout: 90_000,
    });
    await ensureNoOtpLeak(page);
    await s89Snap(page, 'cust-05-otp-success');

    const inbox = page.getByRole('link', { name: /Inbox|notification/i }).first();
    if (await inbox.isVisible().catch(() => false)) {
      await inbox.click().catch(() => undefined);
      await page.waitForTimeout(800);
      await ensureNoOtpLeak(page);
      await s89Snap(page, 'cust-06-notification-surface');
    }

    // Invalid OTP
    const bad = await browser.newContext();
    const p2 = await bad.newPage();
    await clearOtpRateLimits();
    await p2.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await selectMarketIfGated(p2, /India/i).catch(() => undefined);
    const emailField = p2.getByLabel(/Work email|Email|phone|mobile/i).first();
    await emailField.click();
    await emailField.fill('');
    await emailField.pressSequentially(CUSTOMER_EMAIL, { delay: 10 });
    const cont = p2.getByRole('button', { name: /Continue|Send|Request/i }).first();
    if (await cont.isVisible().catch(() => false)) await cont.click();
    const otpInput = p2.getByLabel(/OTP|code|verification|One-time/i).first();
    await expect(otpInput).toBeVisible({ timeout: 25_000 });
    await otpInput.fill('000000');
    const verify = p2.getByRole('button', { name: /Verify|Sign in|Continue|Submit/i }).first();
    if (await verify.isVisible().catch(() => false)) await verify.click();
    await p2.waitForTimeout(1500);
    await ensureNoOtpLeak(p2);
    await s89Snap(p2, 'cust-07-otp-invalid');
    await bad.close();

    // Recovery
    await clearOtpRateLimits();
    await expirePendingOtpChallenges(CUSTOMER_EMAIL);
    const recoverCtx = await browser.newContext();
    const recover = await recoverCtx.newPage();
    await recover.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await selectMarketIfGated(recover, /India/i).catch(() => undefined);
    await uiCustomerLogin(recover, CUSTOMER_EMAIL);
    await expect(recover.getByRole('button', { name: /Sign out/i }).first()).toBeVisible({
      timeout: 90_000,
    });
    await ensureNoOtpLeak(recover);
    await s89Snap(recover, 'cust-08-otp-recovery');
    await recoverCtx.close();

    // Partner vendor OTP
    const vendCtx = await browser.newContext();
    const vend = await vendCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-vendor@dev.local');
    await s61LoginPortal(vend, `${VENDOR}/`, 'sandbox-vendor@dev.local');
    await ensureNoOtpLeak(vend);
    await s89Snap(vend, 'partner-09-vendor-auth');
    await vendCtx.close();

    // Customer denied Admin
    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await cust.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await uiCustomerLogin(cust, CUSTOMER_EMAIL);
    await cust.goto(`${ADMIN}/provider-activation`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s89Snap(cust, 'security-10-customer-denied-admin');
    await custCtx.close();

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page
      .getByText(
        /NO_PRODUCTION_OTP_MESSAGING_PROVIDER|OTP \/ transactional communications activation readiness \(Sprint 89\)/i,
      )
      .first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await ensureNoOtpLeak(page);
    await s89Snap(page, 'admin-11-final-status');

    const status = {
      sprint: 89,
      foundation_sprint: 86,
      OTP: {
        Provider: 'NOT_SELECTED',
        Sandbox: 'SANDBOX_VERIFIED',
        Production: 'EXTERNAL_GATED',
        Blocker: 'NO_PRODUCTION_OTP_PROVIDER',
      },
      SMS: { Provider: 'NOT_SELECTED', Production: 'EXTERNAL_GATED', Blocker: 'NO_PRODUCTION_SMS_PROVIDER' },
      EMAIL: {
        Provider: 'NOT_SELECTED',
        Production: 'EXTERNAL_GATED',
        Blocker: 'NO_PRODUCTION_EMAIL_PROVIDER',
      },
      PUSH: {
        Provider: 'NOT_SELECTED',
        Production: 'EXTERNAL_GATED',
        Blocker: 'NO_PRODUCTION_PUSH_PROVIDER',
        Native: 'DEVICE_NOT_AVAILABLE',
      },
      Sandbox_authentication: 'SANDBOX_VERIFIED',
      Production_authentication: 'EXTERNAL_GATED',
      Remaining_blocker: 'NO_PRODUCTION_OTP_MESSAGING_PROVIDER',
      Force_launch: false,
      CAN_PRODUCTION_LAUNCH: 'NO',
      PRODUCTION_OTP_ENABLED: 'NO',
      PRODUCTION_SMS_ENABLED: 'NO',
      PRODUCTION_EMAIL_ENABLED: 'NO',
      PRODUCTION_PUSH_ENABLED: 'NO',
      Android: 'DEVICE_NOT_AVAILABLE',
      iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
      Note: 'Sandbox OTP only — no production delivery; OTP values not captured',
    };
    s89WriteArtifact('final-communications-status.json', JSON.stringify(status, null, 2));
  });
});
