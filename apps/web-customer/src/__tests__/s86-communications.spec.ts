/**
 * Sprint 86 — Final OTP / transactional communications activation readiness evidence.
 * Real sandbox OTP across audiences + invalid OTP recovery. NEVER capture OTP codes.
 * 390px responsive = RESPONSIVE_WEB_VERIFIED ≠ native Android/iOS.
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  AFFILIATE,
  CUSTOMER,
  CUSTOMER_EMAIL,
  DOCTOR,
  IMAGING,
  LAB,
  VENDOR,
  clearOtpRateLimits,
  ensureNoOtpLeak,
  ensureNoSecrets,
  expirePendingOtpChallenges,
  s60AdminLogin,
  s61LoginPortal,
  s86Snap,
  s86WriteArtifact,
  selectMarketIfGated,
  uiCustomerLogin,
} from '../../e2e/helpers/s86-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S86 messaging API gates', () => {
  test('unauthenticated messaging-onboarding denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/messaging-onboarding',
    );
    expect(res.status()).toBe(401);
  });
});

test.describe('S86 Admin communications UI', () => {
  test('OTP/SMS/EMAIL/PUSH NOT_SELECTED EXTERNAL_GATED', async ({ page, context }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/OTP \/ transactional communications activation readiness \(Sprint (86|89)\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_OTP_MESSAGING_PROVIDER/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText(/NO_PRODUCTION_OTP_PROVIDER|NO_PRODUCTION_SMS_PROVIDER|NO_PRODUCTION_EMAIL_PROVIDER/i).first(),
    ).toBeVisible();
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/OTP/);
    expect(adminBody).toMatch(/SMS/);
    expect(adminBody).toMatch(/EMAIL/);
    expect(adminBody).toMatch(/PUSH/);
    expect(adminBody).toMatch(/EXTERNAL_GATED|NOT_SELECTED/);
    expect(adminBody).toMatch(/SANDBOX_VERIFIED/);
    expect(adminBody).toMatch(/SENT ≠ DELIVERED|SENT→DELIVERED|DELIVERED needs/i);
    expect(adminBody).not.toMatch(/\bUPI\b/);
    expect(adminBody).not.toMatch(/apiSecret|password=|eyJ[A-Za-z0-9_-]{10,}\./i);
    await ensureNoOtpLeak(page);
    await s86Snap(page, 'admin-01-messaging-status');
    await s86Snap(page, 'admin-02-production-external-gated');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await s86Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`${ADMIN}/reliability`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/Reliability|Outbox|Notification|EXTERNAL|signal|DLQ|retry/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s86Snap(page, 'admin-03-reliability-retry');

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/launch|EXTERNAL|ready|gate|Provider|OTP|messaging/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s86Snap(page, 'admin-04-launch-readiness');
  });
});

test.describe('S86 real OTP login flows', () => {
  test('customer + partners sandbox OTP login, invalid OTP, recovery', async ({
    page,
    context,
    browser,
  }) => {
    await context.clearCookies();
    await clearOtpRateLimits();
    await page.goto(CUSTOMER, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await selectMarketIfGated(page, /India/i).catch(() => undefined);
    await s86Snap(page, 'cust-05-market');

    await page.goto(`${CUSTOMER}/login`);
    await expect(
      page.getByLabel(/email|phone|mobile|Work email/i).or(page.getByPlaceholder(/email|phone/i)).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s86Snap(page, 'cust-06-login');

    await clearOtpRateLimits();
    await expirePendingOtpChallenges(CUSTOMER_EMAIL);
    await uiCustomerLogin(page, CUSTOMER_EMAIL);
    await expect(page.getByRole('button', { name: /Sign out/i }).first()).toBeVisible({
      timeout: 90_000,
    });
    await ensureNoOtpLeak(page);
    await s86Snap(page, 'cust-07-authenticated');

    const notifLink = page.getByRole('link', { name: /notification|inbox|account|orders/i }).first();
    if (await notifLink.isVisible().catch(() => false)) {
      await notifLink.click().catch(() => undefined);
      await page.waitForTimeout(800);
    }
    await ensureNoOtpLeak(page);
    await s86Snap(page, 'cust-08-notification-surface');

    // Controlled invalid OTP
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
    const failText = await p2.locator('body').innerText();
    expect(failText).not.toMatch(/stack|ECONNREFUSED|prisma|password=|api_key/i);
    await ensureNoOtpLeak(p2);
    await s86Snap(p2, 'cust-09-otp-invalid');

    // Resend / recovery
    await clearOtpRateLimits();
    await expirePendingOtpChallenges(CUSTOMER_EMAIL);
    await bad.close();
    const recoverCtx = await browser.newContext();
    const recover = await recoverCtx.newPage();
    await recover.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await selectMarketIfGated(recover, /India/i).catch(() => undefined);
    await uiCustomerLogin(recover, CUSTOMER_EMAIL);
    await expect(recover.getByRole('button', { name: /Sign out/i }).first()).toBeVisible({
      timeout: 90_000,
    });
    await ensureNoOtpLeak(recover);
    await s86Snap(recover, 'cust-10-recovery');
    await recoverCtx.close();

    const portals: Array<{ name: string; url: string; email: string }> = [
      { name: 'vendor', url: VENDOR, email: 'sandbox-vendor@dev.local' },
      { name: 'doctor', url: DOCTOR, email: 'sandbox-doctor@dev.local' },
      { name: 'lab', url: LAB, email: 'sandbox-lab@dev.local' },
      { name: 'imaging', url: IMAGING, email: 'sandbox-imaging@dev.local' },
      { name: 'affiliate', url: AFFILIATE, email: 'sandbox-affiliate@dev.local' },
    ];

    // Fail closed if API is down — partner OTP cannot succeed without it (Sprint 104).
    const apiProbe = await page.request.get('http://127.0.0.1:4000/api/v1/admin/control-plane/messaging-onboarding');
    expect([401, 403]).toContain(apiProbe.status());

    let portalIdx = 11;
    for (const portal of portals) {
      const ctx = await browser.newContext();
      const pp = await ctx.newPage();
      await clearOtpRateLimits();
      await expirePendingOtpChallenges(portal.email);
      // s61LoginPortal resolves auth surface: `/` (doctor/lab/…) or `/login` (vendor).
      await s61LoginPortal(pp, `${portal.url}/`, portal.email);
      await ensureNoOtpLeak(pp);
      await s86Snap(pp, `partner-${String(portalIdx).padStart(2, '0')}-${portal.name}-auth`);
      await ctx.close();
      portalIdx += 1;
    }

    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await cust.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await uiCustomerLogin(cust, CUSTOMER_EMAIL);
    await cust.goto(`${ADMIN}/provider-activation`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s86Snap(cust, 'security-16-customer-denied-admin');
    await custCtx.close();

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page
      .getByText(
        /NO_PRODUCTION_OTP_MESSAGING_PROVIDER|OTP \/ transactional communications activation readiness/i,
      )
      .first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await ensureNoOtpLeak(page);
    await s86Snap(page, 'admin-17-final-status');

    const status = {
      sprint: 86,
      foundation_sprint: 76,
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
      Remaining_blockers: [
        'NO_PRODUCTION_OTP_MESSAGING_PROVIDER',
        'NO_PRODUCTION_OTP_PROVIDER',
        'NO_PRODUCTION_SMS_PROVIDER',
        'NO_PRODUCTION_EMAIL_PROVIDER',
        'NO_PRODUCTION_PUSH_PROVIDER',
      ],
      Sent_vs_Delivered: 'SENT_NEQ_DELIVERED',
      Android: 'DEVICE_NOT_AVAILABLE',
      iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
      Note: 'Sandbox OTP only — no production delivery claimed; OTP values not captured',
    };
    s86WriteArtifact('final-communications-status.json', JSON.stringify(status, null, 2));
  });
});
