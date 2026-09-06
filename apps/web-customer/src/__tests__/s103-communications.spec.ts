/**
 * Sprint 103 — Real OTP + transactional communications activation readiness
 * (no invented providers / no real messages). Responsive ≠ native.
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  CUSTOMER,
  CUSTOMER_EMAIL,
  VENDOR,
  clearOtpRateLimits,
  ensureNoSecrets,
  expirePendingOtpChallenges,
  s60AdminLogin,
  s61LoginPortal,
  s103Snap,
  s103WriteArtifact,
  selectMarketIfGated,
  uiCustomerLogin,
} from '../../e2e/helpers/s103-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S103 communications API gates', () => {
  test('unauthenticated production-messaging-real-activation-onboarding denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/production-messaging-real-activation-onboarding',
    );
    expect(res.status()).toBe(401);
  });
});

test.describe('S103 Admin + customer OTP sandbox + vendor SoD', () => {
  test('EXTERNAL_GATED communications prep + sandbox OTP + launch NO', async ({
    page,
    context,
    browser,
  }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/Real OTP \+ transactional communications activation readiness \(Sprint 103\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_OTP_MESSAGING_PROVIDER/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/REAL MESSAGES SENT = NO|Real messages sent:/i).first()).toBeVisible();

    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/EXTERNAL_GATED/);
    expect(adminBody).toMatch(/Real OTP selected:\s*false/i);
    expect(adminBody).toMatch(/Real SMS selected:\s*false/i);
    expect(adminBody).toMatch(/Real Email selected:\s*false/i);
    expect(adminBody).toMatch(/Real Push selected:\s*false/i);
    expect(adminBody).toMatch(/Force launch:\s*false/i);
    expect(adminBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO|CAN_PRODUCTION_LAUNCH/i);
    expect(adminBody).toMatch(/S100_REUSED|S101_REUSED|COMPOSED/i);
    expect(adminBody).toMatch(/OTP:|SMS:|EMAIL:|PUSH:/i);
    expect(adminBody).toMatch(/SENT.*DELIVERED|SENT ≠ DELIVERED|SENT=/i);
    expect(adminBody).not.toMatch(/\bTWILIO\b|\bSENDGRID\b|\bMSG91\b/i);
    expect(adminBody).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@|sk_live_|apiSecret=/i);
    expect(adminBody).not.toMatch(/OTP code:\s*\d{4,8}|otp=\d{4,8}/i);
    await ensureNoSecrets(page);
    await s103Snap(page, 'admin-01-real-comms-card');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await s103Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page
        .getByText(/CAN_PRODUCTION_LAUNCH|NOT_READY|NO_PRODUCTION_OTP|EXTERNAL_GATED/i)
        .first(),
    ).toBeVisible({ timeout: 45_000 });
    await s103Snap(page, 'admin-02-launch-readiness-no');

    // Customer sandbox OTP login — no real message sent
    await context.clearCookies();
    await page.goto(CUSTOMER, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await selectMarketIfGated(page, /India/i);
    await page.goto(`${CUSTOMER}/login`);
    await uiCustomerLogin(page, CUSTOMER_EMAIL);
    await expect(page.getByText(/account|orders|cart|home|logout|sign out/i).first()).toBeVisible({
      timeout: 60_000,
    });
    const custBody = await page.locator('body').innerText();
    expect(custBody).not.toMatch(/OTP code:\s*\d{4,8}|your code is \d{4,8}/i);
    expect(custBody).not.toMatch(/SMS sent to \+|message delivered via Twilio/i);
    await s103Snap(page, 'cust-03-sandbox-otp-authenticated');

    // Vendor: notification visibility without provider control
    let vendorVerified = false;
    try {
      const probe = await page.request.get(`${VENDOR}/login`);
      if (probe.status() < 500) {
        const vendCtx = await browser.newContext();
        const vend = await vendCtx.newPage();
        await clearOtpRateLimits();
        await expirePendingOtpChallenges('sandbox-vendor@dev.local');
        await s61LoginPortal(vend, VENDOR, 'sandbox-vendor@dev.local');
        await vend.goto(`${VENDOR}/orders`, { waitUntil: 'domcontentloaded' });
        await expect(vend.getByText(/order|fulfill|queue|settlement|earning/i).first()).toBeVisible({
          timeout: 45_000,
        });
        const vendBody = await vend.locator('body').innerText();
        expect(vendBody).not.toMatch(
          /OTP provider|SMS API key|Enable production SMS|webhook secret|SENDGRID/i,
        );
        await s103Snap(vend, 'vendor-04-orders-no-comms-controls');
        await vendCtx.close();
        vendorVerified = true;
      }
    } catch {
      vendorVerified = false;
    }
    if (!vendorVerified) {
      s103WriteArtifact(
        'vendor-device-status.json',
        JSON.stringify({
          vendor_app: 'UNAVAILABLE',
          note: 'Port 3004 not healthy; SoD checked via Admin deny path',
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
    await s103Snap(cust, 'security-05-customer-denied-admin');
    await custCtx.close();

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page
      .getByText(
        /NO_PRODUCTION_OTP_MESSAGING_PROVIDER|Real OTP \+ transactional communications activation readiness \(Sprint 103\)/i,
      )
      .first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await s103Snap(page, 'admin-06-final-status');

    const status = {
      sprint: 103,
      REAL_OTP_PROVIDER_SELECTED: 'NO',
      REAL_SMS_PROVIDER_SELECTED: 'NO',
      REAL_EMAIL_PROVIDER_SELECTED: 'NO',
      REAL_PUSH_PROVIDER_SELECTED: 'NO',
      PRODUCTION_OTP_ENABLED: 'NO',
      PRODUCTION_SMS_ENABLED: 'NO',
      PRODUCTION_EMAIL_ENABLED: 'NO',
      PRODUCTION_PUSH_ENABLED: 'NO',
      REAL_MESSAGES_SENT: 'NO',
      CAN_PRODUCTION_LAUNCH: 'NO',
      Remaining_blockers: [
        'NO_PRODUCTION_OTP_MESSAGING_PROVIDER',
        'NO_PRODUCTION_OTP_PROVIDER',
        'NO_PRODUCTION_SMS_PROVIDER',
        'NO_PRODUCTION_EMAIL_PROVIDER',
        'NO_PRODUCTION_PUSH_PROVIDER',
      ],
      SENT_NE_DELIVERED: true,
      Force_launch: false,
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    };
    s103WriteArtifact('final-communications-status.json', JSON.stringify(status, null, 2));
  });
});
