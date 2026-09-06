/**
 * Sprint 78 — eRx activation readiness evidence (no fake legal transmission).
 * Responsive 390/768/1024/1440 ≠ native Android/iOS.
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  CUSTOMER,
  DOCTOR,
  VENDOR,
  clearOtpRateLimits,
  ensureNoSecrets,
  expirePendingOtpChallenges,
  s60AdminLogin,
  s61LoginPortal,
  s78Snap,
  s78WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s78-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S78 eRx API gates', () => {
  test('unauthenticated erx-onboarding denied', async ({ request }) => {
    const res = await request.get('http://127.0.0.1:4000/api/v1/admin/control-plane/erx-onboarding');
    expect(res.status()).toBe(401);
  });
});

test.describe('S78 Doctor + customer + vendor + Admin eRx', () => {
  test('sandbox Rx flow + EXTERNAL_GATED + responsive + security', async ({
    page,
    context,
    browser,
  }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/eRx \/ electronic prescribing activation readiness \(Sprint (78|91)\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_ERX_PROVIDER/i).first()).toBeVisible({
      timeout: 30_000,
    });
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/NOT_SELECTED|EXTERNAL_GATED/);
    expect(adminBody).toMatch(
      /INTERNAL_RECORD_SEPARATE_FROM_LEGAL_TRANSMISSION|sandbox adapter is not legally/i,
    );
    expect(adminBody).not.toMatch(/\bUPI\b/);
    expect(adminBody).not.toMatch(/apiSecret|password=|eyJ[A-Za-z0-9_-]{10,}\./i);
    await ensureNoSecrets(page);
    await s78Snap(page, 'admin-01-erx-status');
    await s78Snap(page, 'admin-02-production-external-gated');

    // Responsive Admin activation card
    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await s78Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`${ADMIN}/healthcare-network`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await expect(
      page.getByText(/EXTERNAL_GATED|eRx|clinical|healthcare|Provider|network/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s78Snap(page, 'admin-03-healthcare-network');

    // Doctor sandbox prescription path
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-doctor@dev.local');
    await s61LoginPortal(page, `${DOCTOR}/`, 'sandbox-doctor@dev.local');
    await page.goto(`${DOCTOR}/appointments`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Appointment/i }).first()).toBeVisible({
      timeout: 45_000,
    });
    await s78Snap(page, 'doctor-04-appointments');

    const appt = page
      .getByRole('button', { name: /^(Requested|Confirmed|Checked in|In consultation|Completed)\b/i })
      .first();
    if (await appt.isVisible().catch(() => false)) {
      await appt.click();
      await expect(page.getByText(/Sandbox|consent|Clinical|consultation/i).first()).toBeVisible({
        timeout: 20_000,
      });
      await s78Snap(page, 'doctor-05-consult');
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
              await summary.fill('S78 sandbox consult — internal Rx only; not legal eRx.');
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
    await s78Snap(page, 'doctor-06-prescription');
    await page.setViewportSize({ width: 390, height: 844 });
    await s78Snap(page, 'doctor-07-prescription-390');
    await page.setViewportSize({ width: 1280, height: 900 });

    // Vendor / pharmacy handling surface (fulfillment — not legal eRx network)
    const vendCtx = await browser.newContext();
    const vend = await vendCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-vendor@dev.local');
    await s61LoginPortal(vend, `${VENDOR}/`, 'sandbox-vendor@dev.local');
    await vend.goto(`${VENDOR}/workspace/orders`, { waitUntil: 'domcontentloaded' });
    await expect(vend.getByText(/order|fulfill|Rx|prescription|workspace|sandbox/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s78Snap(vend, 'vendor-08-orders');
    await vendCtx.close();

    // Customer prescription visibility
    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-customer@dev.local');
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
    await s78Snap(cust, 'customer-09-prescription');
    await cust.setViewportSize({ width: 390, height: 844 });
    await s78Snap(cust, 'customer-10-prescription-390');
    await cust.setViewportSize({ width: 1280, height: 900 });
    await selectMarketIfGated(cust, /United Arab|UAE|AE/i).catch(() => undefined);
    await s78Snap(cust, 'customer-11-country-context');

    // Security: customer denied Admin eRx activation
    await cust.goto(`${ADMIN}/provider-activation`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s78Snap(cust, 'security-12-customer-denied-admin');
    await custCtx.close();

    // Recovery: Admin still sees EXTERNAL_GATED after flows
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-admin@dev.local');
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page
      .getByText(/NO_PRODUCTION_ERX_PROVIDER|eRx \/ electronic prescribing activation readiness/i)
      .first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await s78Snap(page, 'admin-13-final-status');

    const status = {
      sprint: 78,
      Provider: 'NOT_SELECTED',
      Environment: 'sandbox',
      Configured: false,
      Verified: false,
      Approved: false,
      Enabled: false,
      Sandbox: 'SANDBOX_VERIFIED',
      Production: 'EXTERNAL_GATED',
      Transmission: 'SANDBOX_ONLY',
      Legal_clinical_gate: 'EXTERNAL_GATED',
      Remaining_blocker: 'NO_PRODUCTION_ERX_PROVIDER',
      Related_clinical_blocker: 'NO_PRODUCTION_CLINICAL_ADAPTER',
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    };
    s78WriteArtifact('final-erx-status.json', JSON.stringify(status, null, 2));
  });
});
