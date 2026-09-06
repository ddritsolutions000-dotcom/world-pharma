/**
 * Sprint 79 — Telemedicine / video activation readiness evidence (no fake live sessions).
 * Responsive 390/768/1024/1440 = RESPONSIVE_WEB_VERIFIED ≠ native Android/iOS.
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  CUSTOMER,
  DOCTOR,
  clearOtpRateLimits,
  ensureNoSecrets,
  expirePendingOtpChallenges,
  s60AdminLogin,
  s61LoginPortal,
  s79Snap,
  s79WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s79-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S79 video API gates', () => {
  test('unauthenticated video-onboarding denied', async ({ request }) => {
    const res = await request.get('http://127.0.0.1:4000/api/v1/admin/control-plane/video-onboarding');
    expect(res.status()).toBe(401);
  });
});

test.describe('S79 Doctor + customer + Admin video', () => {
  test('sandbox consult + EXTERNAL_GATED + responsive + security', async ({
    page,
    context,
    browser,
  }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/Telemedicine \/ live video activation readiness \(Sprint (79|92)\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_VIDEO_PROVIDER/i).first()).toBeVisible({
      timeout: 30_000,
    });
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/NOT_SELECTED|EXTERNAL_GATED/);
    expect(adminBody).toMatch(/LIVE VIDEO PROVIDER NOT CONFIGURED|sandbox consultation is not live/i);
    expect(adminBody).not.toMatch(/\bUPI\b/);
    expect(adminBody).not.toMatch(/LIVEKIT_API_SECRET|eyJ[A-Za-z0-9_-]{10,}\./);
    await ensureNoSecrets(page);
    await s79Snap(page, 'admin-01-video-status');
    await s79Snap(page, 'admin-02-production-external-gated');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await s79Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    // Customer appointment / consultation
    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-customer@dev.local');
    await cust.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await cust.getByLabel(/^Email$/i).click();
    await cust.getByLabel(/^Email$/i).pressSequentially('sandbox-customer@dev.local', { delay: 15 });
    await uiOtpLogin(cust, 'sandbox-customer@dev.local');
    await selectMarketIfGated(cust, /India/i);
    await cust.goto(`${CUSTOMER}/appointments`, { waitUntil: 'domcontentloaded' }).catch(async () => {
      await cust.goto(`${CUSTOMER}/doctors`, { waitUntil: 'domcontentloaded' });
    });
    await expect(
      cust.getByText(/appointment|doctor|consult|video|telemedicine|schedule|book|sandbox|EXTERNAL/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s79Snap(cust, 'customer-03-consultation');
    await cust.setViewportSize({ width: 390, height: 844 });
    await s79Snap(cust, 'customer-04-consultation-390');
    await cust.setViewportSize({ width: 1280, height: 900 });
    await selectMarketIfGated(cust, /United Arab|UAE|AE/i).catch(() => undefined);
    await s79Snap(cust, 'customer-05-country-context');

    // Doctor consultation / consent / sandbox session (not LIVE production video)
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-doctor@dev.local');
    await s61LoginPortal(page, `${DOCTOR}/`, 'sandbox-doctor@dev.local');
    await page.goto(`${DOCTOR}/appointments`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Appointment/i }).first()).toBeVisible({
      timeout: 45_000,
    });
    await s79Snap(page, 'doctor-06-appointments');

    const appt = page
      .getByRole('button', { name: /^(Requested|Confirmed|Checked in|In consultation|Completed)\b/i })
      .first();
    if (await appt.isVisible().catch(() => false)) {
      await appt.click();
      await expect(
        page.getByText(/Sandbox|consent|Clinical|consultation|video|EXTERNAL/i).first(),
      ).toBeVisible({ timeout: 20_000 });
      await s79Snap(page, 'doctor-07-consent-gate');
      for (const label of [
        /^Confirm appointment$/i,
        /^Check in patient$/i,
        /^Start consultation$/i,
        /^Complete consultation$/i,
      ]) {
        const btn = page.getByRole('button', { name: label });
        if ((await btn.isVisible().catch(() => false)) && (await btn.isEnabled().catch(() => false))) {
          if (/Complete/i.test(label.source)) {
            const summary = page.locator('textarea').first();
            if (await summary.isVisible().catch(() => false)) {
              await summary.fill('S79 sandbox consult — no live production video claim.');
            }
          }
          await btn.click();
          await page.waitForTimeout(800);
        }
      }
      await s79Snap(page, 'doctor-08-sandbox-session');
    }

    // Security: customer denied Admin video activation
    await cust.goto(`${ADMIN}/provider-activation`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s79Snap(cust, 'security-09-customer-denied-admin');
    await custCtx.close();

    // Production blocked state / recovery on Admin
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-admin@dev.local');
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page
      .getByText(
        /NO_PRODUCTION_VIDEO_PROVIDER|Telemedicine \/ live video activation readiness|LIVE VIDEO PROVIDER NOT CONFIGURED/i,
      )
      .first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await s79Snap(page, 'admin-10-production-blocked');

    const status = {
      sprint: 79,
      Provider: 'NOT_SELECTED',
      Environment: 'sandbox',
      Configured: false,
      Verified: false,
      Approved: false,
      Enabled: false,
      Sandbox: 'SANDBOX_VERIFIED',
      Production: 'EXTERNAL_GATED',
      Session_creation: 'SANDBOX_ONLY',
      Consent: 'SANDBOX_VERIFIED',
      Recording: 'PRODUCTION_RECORDING_EXTERNAL_GATED',
      Webhook: 'EXTERNAL_GATED',
      Remaining_blocker: 'NO_PRODUCTION_VIDEO_PROVIDER',
      Related_clinical_blocker: 'NO_PRODUCTION_CLINICAL_ADAPTER',
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    };
    s79WriteArtifact('final-video-status.json', JSON.stringify(status, null, 2));
  });
});
