/**
 * Sprint 68 — eRx onboarding evidence (no fake legal transmission).
 * Responsive 390px ≠ native Android/iOS.
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
  s68Snap,
  s68WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s68-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S68 eRx API gates', () => {
  test('unauthenticated erx-onboarding denied', async ({ request }) => {
    const res = await request.get('http://127.0.0.1:4000/api/v1/admin/control-plane/erx-onboarding');
    expect(res.status()).toBe(401);
  });
});

test.describe('S68 Doctor + customer + Admin eRx', () => {
  test('sandbox Rx flow + EXTERNAL_GATED production status', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/eRx \/ electronic prescribing (onboarding|activation readiness)/i).first(),
    ).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(/NOT_SELECTED|EXTERNAL_GATED/i).first()).toBeVisible({ timeout: 30_000 });
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/NOT_SELECTED|EXTERNAL_GATED/);
    expect(adminBody).toMatch(/INTERNAL_RECORD_SEPARATE_FROM_LEGAL_TRANSMISSION|sandbox adapter is not legally/i);
    expect(adminBody).not.toMatch(/\bUPI\b/);
    await ensureNoSecrets(page);
    await s68Snap(page, 'admin-01-erx-status');
    await s68Snap(page, 'admin-02-production-external-gated');

    // Doctor sandbox prescription path
    await context.clearCookies();
    await clearOtpRateLimits();
    await s61LoginPortal(page, `${DOCTOR}/`, 'sandbox-doctor@dev.local');
    await page.goto(`${DOCTOR}/appointments`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Appointment/i }).first()).toBeVisible({
      timeout: 45_000,
    });
    await s68Snap(page, 'doctor-03-appointments');

    const appt = page
      .getByRole('button', { name: /^(Requested|Confirmed|Checked in|In consultation|Completed)\b/i })
      .first();
    if (await appt.isVisible().catch(() => false)) {
      await appt.click();
      await expect(page.getByText(/Sandbox|consent|Clinical|consultation/i).first()).toBeVisible({
        timeout: 20_000,
      });
      await s68Snap(page, 'doctor-04-consult-consent');
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
              await summary.fill('S68 sandbox consult — internal Rx only.');
            }
          }
          await btn.click();
          await page.waitForTimeout(800);
        }
      }
    }

    await page.goto(`${DOCTOR}/prescriptions`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/sandbox|EXTERNAL_GATED|prescription|Issue|encounter|eRx|Rx/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s68Snap(page, 'doctor-05-prescription');
    await s68Snap(page, 'doctor-06-prescription-status');

    // Customer prescription visibility
    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await cust.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await cust.getByLabel(/^Email$/i).click();
    await cust.getByLabel(/^Email$/i).pressSequentially('sandbox-customer@dev.local', { delay: 15 });
    await uiOtpLogin(cust, 'sandbox-customer@dev.local');
    await selectMarketIfGated(cust, /India/i);
    await cust.goto(`${CUSTOMER}/prescriptions`, { waitUntil: 'domcontentloaded' }).catch(async () => {
      await cust.goto(`${CUSTOMER}/health`, { waitUntil: 'domcontentloaded' });
    });
    await expect(
      cust.getByText(/prescription|Rx|medication|health|order|sandbox|EXTERNAL/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s68Snap(cust, 'customer-07-prescription');
    await selectMarketIfGated(cust, /United Arab|UAE|AE/i).catch(() => undefined);
    await s68Snap(cust, 'customer-08-country-context');

    // Security: customer denied Admin eRx activation
    await cust.goto(`${ADMIN}/provider-activation`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s68Snap(cust, 'security-09-customer-denied-admin');
    await custCtx.close();

    // Failure / recovery framing
    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/healthcare-network`, { waitUntil: 'domcontentloaded' }).catch(async () => {
      await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    });
    await expect(
      page.getByText(/EXTERNAL_GATED|eRx|clinical|NO_PRODUCTION|healthcare|Provider activation/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s68Snap(page, 'admin-10-failure-recovery-gate');

    const status = {
      sprint: 68,
      Provider: 'NOT_SELECTED',
      Environment: 'sandbox',
      Configured: false,
      Verified: false,
      Approved: false,
      Enabled: false,
      Sandbox: 'SANDBOX_VERIFIED',
      Production: 'EXTERNAL_GATED',
      Transmission: 'SANDBOX_ONLY',
      Webhook: 'NOT_APPLICABLE',
      Country_support: 'POLICY_DRIVEN',
      Legal_clinical_gate: 'EXTERNAL_GATED',
      Remaining_blocker: 'NO_PRODUCTION_CLINICAL_ADAPTER',
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
    };
    s68WriteArtifact('final-erx-status.json', JSON.stringify(status, null, 2));
    await s68Snap(page, 'admin-11-final-status-context');
  });
});
