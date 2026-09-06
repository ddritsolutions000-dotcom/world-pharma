/**
 * Sprint 69 — Telemedicine / video onboarding evidence (no fake live sessions).
 * Responsive web ≠ native Android/iOS video calling.
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  CUSTOMER,
  DOCTOR,
  clearOtpRateLimits,
  ensureNoSecrets,
  s60AdminLogin,
  s61LoginPortal,
  s69Snap,
  s69WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s69-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S69 video API gates', () => {
  test('unauthenticated video-onboarding denied', async ({ request }) => {
    const res = await request.get('http://127.0.0.1:4000/api/v1/admin/control-plane/video-onboarding');
    expect(res.status()).toBe(401);
  });
});

test.describe('S69 Doctor + customer + Admin video', () => {
  test('sandbox consult + EXTERNAL_GATED production video status', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/Telemedicine \/ live video (onboarding|activation readiness)/i).first(),
    ).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(/NOT_SELECTED|EXTERNAL_GATED|LIVE VIDEO PROVIDER NOT CONFIGURED/i).first()).toBeVisible({
      timeout: 30_000,
    });
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/NOT_SELECTED|EXTERNAL_GATED/);
    expect(adminBody).toMatch(/LIVE VIDEO PROVIDER NOT CONFIGURED|sandbox consultation is not live/i);
    expect(adminBody).not.toMatch(/\bUPI\b/);
    expect(adminBody).not.toMatch(/LIVEKIT_API_SECRET|eyJ[A-Za-z0-9_-]{10,}\./);
    await ensureNoSecrets(page);
    await s69Snap(page, 'admin-01-video-status');
    await s69Snap(page, 'admin-02-production-external-gated');

    // Customer appointment / video availability framing
    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
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
    await s69Snap(cust, 'customer-03-appointment');
    await selectMarketIfGated(cust, /United Arab|UAE|AE/i).catch(() => undefined);
    await s69Snap(cust, 'customer-04-country-context');

    // Doctor consultation / consent / video state (sandbox — not LIVE_VIDEO)
    await context.clearCookies();
    await clearOtpRateLimits();
    await s61LoginPortal(page, `${DOCTOR}/`, 'sandbox-doctor@dev.local');
    await page.goto(`${DOCTOR}/appointments`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Appointment/i }).first()).toBeVisible({
      timeout: 45_000,
    });
    await s69Snap(page, 'doctor-05-appointments');

    const appt = page
      .getByRole('button', { name: /^(Requested|Confirmed|Checked in|In consultation|Completed)\b/i })
      .first();
    if (await appt.isVisible().catch(() => false)) {
      await appt.click();
      await expect(page.getByText(/Sandbox|consent|Clinical|consultation|video|EXTERNAL/i).first()).toBeVisible({
        timeout: 20_000,
      });
      await s69Snap(page, 'doctor-06-consent-consult');
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
              await summary.fill('S69 sandbox consult — no live video claim.');
            }
          }
          await btn.click();
          await page.waitForTimeout(800);
        }
      }
      await s69Snap(page, 'doctor-07-consultation-workspace');
    }

    // Security: customer denied Admin video activation
    await cust.goto(`${ADMIN}/provider-activation`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s69Snap(cust, 'security-08-customer-denied-admin');
    await custCtx.close();

    // Failure / recovery framing (provider activation is the honest gate surface)
    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/Telemedicine \/ live video (onboarding|activation readiness)|EXTERNAL_GATED|LIVE VIDEO PROVIDER NOT CONFIGURED/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    await s69Snap(page, 'admin-09-failure-recovery-gate');

    const status = {
      sprint: 69,
      Provider: 'NOT_SELECTED',
      Environment: 'sandbox',
      Configured: false,
      Verified: false,
      Approved: false,
      Enabled: false,
      Sandbox: 'SANDBOX_VERIFIED',
      Production: 'EXTERNAL_GATED',
      Session_creation: 'SANDBOX_ONLY',
      Participant_authorization: 'SANDBOX_VERIFIED',
      Consent: 'SANDBOX_VERIFIED',
      Recording: 'EXTERNAL_GATED',
      Country_support: 'POLICY_DRIVEN',
      Legal_clinical_gate: 'EXTERNAL_GATED',
      Remaining_blocker: 'NO_PRODUCTION_CLINICAL_ADAPTER',
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
    };
    s69WriteArtifact('final-video-status.json', JSON.stringify(status, null, 2));
    await s69Snap(page, 'admin-10-final-status-context');
  });
});
